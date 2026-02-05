-- Create audit log table for tracking admin actions
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL,
  action_type TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id UUID,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for efficient querying
CREATE INDEX idx_audit_logs_admin_id ON public.audit_logs(admin_id);
CREATE INDEX idx_audit_logs_created_at ON public.audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_action_type ON public.audit_logs(action_type);
CREATE INDEX idx_audit_logs_target_type ON public.audit_logs(target_type);

-- Enable RLS
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can view audit logs
CREATE POLICY "Admins can view all audit logs"
ON public.audit_logs
FOR SELECT
USING (has_role(auth.uid(), 'admin'));

-- Only system can insert audit logs (via functions)
CREATE POLICY "System can insert audit logs"
ON public.audit_logs
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

-- Helper function to log admin actions
CREATE OR REPLACE FUNCTION public.log_admin_action(
  p_action_type TEXT,
  p_target_type TEXT,
  p_target_id UUID,
  p_details JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_log_id UUID;
BEGIN
  INSERT INTO public.audit_logs (
    admin_id,
    action_type,
    target_type,
    target_id,
    details
  )
  VALUES (
    auth.uid(),
    p_action_type,
    p_target_type,
    p_target_id,
    p_details
  )
  RETURNING id INTO v_log_id;
  
  RETURN v_log_id;
END;
$$;

-- Update approve_deposit function to include audit logging
CREATE OR REPLACE FUNCTION public.approve_deposit(deposit_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_amount numeric;
  v_referral_code text;
  v_referrer_id uuid;
  v_level integer;
  v_commission numeric;
  referral_percentages numeric[] := ARRAY[0.10, 0.05, 0.03, 0.02, 0.01];
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can approve deposits';
  END IF;

  SELECT user_id, amount INTO v_user_id, v_amount
  FROM public.deposits
  WHERE id = deposit_id AND status = 'pending';

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Deposit not found or already processed';
  END IF;

  UPDATE public.deposits
  SET status = 'approved',
      approved_at = now(),
      approved_by = auth.uid(),
      updated_at = now()
  WHERE id = deposit_id;

  UPDATE public.profiles
  SET total_deposits = total_deposits + v_amount,
      total_investment = total_investment + v_amount,
      updated_at = now()
  WHERE id = v_user_id;

  INSERT INTO public.investments (user_id, amount, status, invested_at, matures_at, profit)
  VALUES (
    v_user_id,
    v_amount,
    'active',
    now(),
    now() + interval '120 hours',
    v_amount
  );

  FOR v_level, v_referrer_id IN
    SELECT r.level, r.referrer_id
    FROM public.referrals r
    WHERE r.referred_id = v_user_id
    ORDER BY r.level
  LOOP
    IF v_level <= 5 THEN
      v_commission := v_amount * referral_percentages[v_level];
      
      UPDATE public.profiles
      SET wallet_balance = wallet_balance + v_commission,
          total_referral_earnings = total_referral_earnings + v_commission,
          updated_at = now()
      WHERE id = v_referrer_id;
    END IF;
  END LOOP;

  -- Log the admin action
  PERFORM log_admin_action(
    'APPROVE_DEPOSIT',
    'deposit',
    deposit_id,
    jsonb_build_object(
      'user_id', v_user_id,
      'amount', v_amount
    )
  );
END;
$$;

-- Update reject_deposit function to include audit logging
CREATE OR REPLACE FUNCTION public.reject_deposit(deposit_id uuid, reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_amount numeric;
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can reject deposits';
  END IF;

  SELECT user_id, amount INTO v_user_id, v_amount
  FROM public.deposits
  WHERE id = deposit_id AND status = 'pending';

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Deposit not found or already processed';
  END IF;

  UPDATE public.deposits
  SET status = 'rejected',
      rejection_reason = reason,
      updated_at = now()
  WHERE id = deposit_id;
  
  -- Log the admin action
  PERFORM log_admin_action(
    'REJECT_DEPOSIT',
    'deposit',
    deposit_id,
    jsonb_build_object(
      'user_id', v_user_id,
      'amount', v_amount,
      'reason', reason
    )
  );
END;
$$;

-- Update approve_withdrawal function to include audit logging
CREATE OR REPLACE FUNCTION public.approve_withdrawal(withdrawal_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_amount numeric;
  v_wallet_address text;
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can approve withdrawals';
  END IF;

  SELECT user_id, amount, wallet_address INTO v_user_id, v_amount, v_wallet_address
  FROM public.withdrawals
  WHERE id = withdrawal_id AND status = 'pending';

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Withdrawal not found or already processed';
  END IF;

  IF (SELECT wallet_balance FROM public.profiles WHERE id = v_user_id) < v_amount THEN
    RAISE EXCEPTION 'Insufficient balance';
  END IF;

  UPDATE public.profiles
  SET wallet_balance = wallet_balance - v_amount,
      total_withdrawals = total_withdrawals + v_amount,
      updated_at = now()
  WHERE id = v_user_id;

  UPDATE public.withdrawals
  SET status = 'approved',
      processed_at = now(),
      processed_by = auth.uid(),
      updated_at = now()
  WHERE id = withdrawal_id;

  -- Log the admin action
  PERFORM log_admin_action(
    'APPROVE_WITHDRAWAL',
    'withdrawal',
    withdrawal_id,
    jsonb_build_object(
      'user_id', v_user_id,
      'amount', v_amount,
      'wallet_address', v_wallet_address
    )
  );
END;
$$;

-- Update reject_withdrawal function to include audit logging
CREATE OR REPLACE FUNCTION public.reject_withdrawal(withdrawal_id uuid, reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_amount numeric;
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can reject withdrawals';
  END IF;

  SELECT user_id, amount INTO v_user_id, v_amount
  FROM public.withdrawals
  WHERE id = withdrawal_id AND status = 'pending';

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Withdrawal not found or already processed';
  END IF;

  UPDATE public.withdrawals
  SET status = 'rejected',
      rejection_reason = reason,
      updated_at = now()
  WHERE id = withdrawal_id;
  
  -- Log the admin action
  PERFORM log_admin_action(
    'REJECT_WITHDRAWAL',
    'withdrawal',
    withdrawal_id,
    jsonb_build_object(
      'user_id', v_user_id,
      'amount', v_amount,
      'reason', reason
    )
  );
END;
$$;

-- Update mark_withdrawal_paid function to include audit logging
CREATE OR REPLACE FUNCTION public.mark_withdrawal_paid(withdrawal_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_amount numeric;
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can mark withdrawals as paid';
  END IF;

  SELECT user_id, amount INTO v_user_id, v_amount
  FROM public.withdrawals
  WHERE id = withdrawal_id AND status = 'approved';

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Withdrawal not found or not approved';
  END IF;

  UPDATE public.withdrawals
  SET status = 'paid',
      updated_at = now()
  WHERE id = withdrawal_id;

  -- Log the admin action
  PERFORM log_admin_action(
    'MARK_WITHDRAWAL_PAID',
    'withdrawal',
    withdrawal_id,
    jsonb_build_object(
      'user_id', v_user_id,
      'amount', v_amount
    )
  );
END;
$$;

-- Update delete_user_account function to include audit logging
CREATE OR REPLACE FUNCTION public.delete_user_account(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_email text;
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can delete users';
  END IF;

  IF target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot delete your own account';
  END IF;

  SELECT email INTO v_user_email FROM public.profiles WHERE id = target_user_id;

  -- Log the admin action before deletion
  PERFORM log_admin_action(
    'DELETE_USER',
    'user',
    target_user_id,
    jsonb_build_object(
      'email', v_user_email
    )
  );

  DELETE FROM auth.users WHERE id = target_user_id;
END;
$$;

-- Update add_manual_deposit function to include audit logging
CREATE OR REPLACE FUNCTION public.add_manual_deposit(target_user_id uuid, deposit_amount numeric, admin_notes text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_referral_code text;
  v_referrer_id uuid;
  v_level integer;
  v_commission numeric;
  referral_percentages numeric[] := ARRAY[0.10, 0.05, 0.03, 0.02, 0.01];
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can add manual deposits';
  END IF;

  INSERT INTO public.deposits (
    user_id, 
    amount, 
    status, 
    approved_at, 
    approved_by,
    admin_wallet_address,
    transaction_hash
  )
  VALUES (
    target_user_id,
    deposit_amount,
    'approved',
    now(),
    auth.uid(),
    'MANUAL_ADMIN_DEPOSIT',
    COALESCE(admin_notes, 'Manual deposit by admin')
  );

  UPDATE public.profiles
  SET total_deposits = total_deposits + deposit_amount,
      total_investment = total_investment + deposit_amount,
      updated_at = now()
  WHERE id = target_user_id;

  INSERT INTO public.investments (user_id, amount, status, invested_at, matures_at, profit)
  VALUES (
    target_user_id,
    deposit_amount,
    'active',
    now(),
    now() + interval '120 hours',
    deposit_amount
  );

  FOR v_level, v_referrer_id IN
    SELECT r.level, r.referrer_id
    FROM public.referrals r
    WHERE r.referred_id = target_user_id
    ORDER BY r.level
  LOOP
    IF v_level <= 5 THEN
      v_commission := deposit_amount * referral_percentages[v_level];
      
      UPDATE public.profiles
      SET wallet_balance = wallet_balance + v_commission,
          total_referral_earnings = total_referral_earnings + v_commission,
          updated_at = now()
      WHERE id = v_referrer_id;
    END IF;
  END LOOP;

  -- Log the admin action
  PERFORM log_admin_action(
    'ADD_MANUAL_DEPOSIT',
    'deposit',
    NULL,
    jsonb_build_object(
      'user_id', target_user_id,
      'amount', deposit_amount,
      'notes', admin_notes
    )
  );
END;
$$;