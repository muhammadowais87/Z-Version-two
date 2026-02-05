-- Function to reject deposits
CREATE OR REPLACE FUNCTION public.reject_deposit(deposit_id uuid, reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Verify admin role
  IF NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can reject deposits';
  END IF;

  -- Update deposit status to rejected
  UPDATE public.deposits
  SET status = 'rejected',
      rejection_reason = reason,
      updated_at = now()
  WHERE id = deposit_id AND status = 'pending';
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Deposit not found or already processed';
  END IF;
END;
$$;

-- Function to reject withdrawals
CREATE OR REPLACE FUNCTION public.reject_withdrawal(withdrawal_id uuid, reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Verify admin role
  IF NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can reject withdrawals';
  END IF;

  -- Update withdrawal status to rejected
  UPDATE public.withdrawals
  SET status = 'rejected',
      rejection_reason = reason,
      updated_at = now()
  WHERE id = withdrawal_id AND status = 'pending';
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Withdrawal not found or already processed';
  END IF;
END;
$$;

-- Function to manually add deposit to user (admin only)
CREATE OR REPLACE FUNCTION public.add_manual_deposit(
  target_user_id uuid,
  deposit_amount numeric,
  admin_notes text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_referral_code text;
  v_referrer_id uuid;
  v_level integer;
  v_commission numeric;
  referral_percentages numeric[] := ARRAY[0.10, 0.05, 0.03, 0.02, 0.01];
BEGIN
  -- Verify admin role
  IF NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can add manual deposits';
  END IF;

  -- Create approved deposit record
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

  -- Update user profile balances
  UPDATE public.profiles
  SET wallet_balance = wallet_balance + deposit_amount,
      total_deposits = total_deposits + deposit_amount,
      updated_at = now()
  WHERE id = target_user_id;

  -- Create investment automatically (120 hours = 5 days)
  INSERT INTO public.investments (user_id, amount, status, invested_at, matures_at, profit)
  VALUES (
    target_user_id,
    deposit_amount,
    'active',
    now(),
    now() + interval '120 hours',
    deposit_amount
  );

  -- Process referral commissions
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
END;
$$;

-- Function to delete user and all related data
CREATE OR REPLACE FUNCTION public.delete_user_account(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Verify admin role
  IF NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can delete users';
  END IF;

  -- Don't allow deleting yourself
  IF target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot delete your own account';
  END IF;

  -- Delete user data (cascade will handle related records)
  DELETE FROM auth.users WHERE id = target_user_id;
END;
$$;