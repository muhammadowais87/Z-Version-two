-- Create enum for deposit status
CREATE TYPE public.deposit_status AS ENUM ('pending', 'approved', 'rejected');

-- Create enum for withdrawal status
CREATE TYPE public.withdrawal_status AS ENUM ('pending', 'approved', 'rejected', 'paid');

-- Create deposits table
CREATE TABLE public.deposits (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount numeric NOT NULL CHECK (amount >= 10),
  transaction_hash text,
  admin_wallet_address text NOT NULL,
  status deposit_status NOT NULL DEFAULT 'pending',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  approved_at timestamp with time zone,
  approved_by uuid REFERENCES public.profiles(id),
  rejection_reason text
);

-- Create withdrawals table
CREATE TABLE public.withdrawals (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount numeric NOT NULL CHECK (amount >= 10),
  wallet_address text NOT NULL,
  status withdrawal_status NOT NULL DEFAULT 'pending',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  processed_at timestamp with time zone,
  processed_by uuid REFERENCES public.profiles(id),
  rejection_reason text
);

-- Add wallet balance and tracking columns to profiles
ALTER TABLE public.profiles
ADD COLUMN wallet_balance numeric DEFAULT 0 NOT NULL,
ADD COLUMN total_deposits numeric DEFAULT 0 NOT NULL,
ADD COLUMN total_withdrawals numeric DEFAULT 0 NOT NULL;

-- Enable RLS on deposits
ALTER TABLE public.deposits ENABLE ROW LEVEL SECURITY;

-- RLS policies for deposits
CREATE POLICY "Users can view own deposits"
  ON public.deposits FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own deposits"
  ON public.deposits FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all deposits"
  ON public.deposits FOR SELECT
  USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update deposits"
  ON public.deposits FOR UPDATE
  USING (has_role(auth.uid(), 'admin'));

-- Enable RLS on withdrawals
ALTER TABLE public.withdrawals ENABLE ROW LEVEL SECURITY;

-- RLS policies for withdrawals
CREATE POLICY "Users can view own withdrawals"
  ON public.withdrawals FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own withdrawals"
  ON public.withdrawals FOR INSERT
  WITH CHECK (auth.uid() = user_id AND amount <= (SELECT wallet_balance FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Admins can view all withdrawals"
  ON public.withdrawals FOR SELECT
  USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update withdrawals"
  ON public.withdrawals FOR UPDATE
  USING (has_role(auth.uid(), 'admin'));

-- Create function to handle deposit approval
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
  referral_percentages numeric[] := ARRAY[0.10, 0.05, 0.03, 0.02, 0.01]; -- 10%, 5%, 3%, 2%, 1%
BEGIN
  -- Verify admin role
  IF NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can approve deposits';
  END IF;

  -- Get deposit details
  SELECT user_id, amount INTO v_user_id, v_amount
  FROM public.deposits
  WHERE id = deposit_id AND status = 'pending';

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Deposit not found or already processed';
  END IF;

  -- Update deposit status
  UPDATE public.deposits
  SET status = 'approved',
      approved_at = now(),
      approved_by = auth.uid(),
      updated_at = now()
  WHERE id = deposit_id;

  -- Update user profile balances
  UPDATE public.profiles
  SET wallet_balance = wallet_balance + v_amount,
      total_deposits = total_deposits + v_amount,
      updated_at = now()
  WHERE id = v_user_id;

  -- Create investment automatically (120 hours = 5 days)
  INSERT INTO public.investments (user_id, amount, status, invested_at, matures_at, profit)
  VALUES (
    v_user_id,
    v_amount,
    'active',
    now(),
    now() + interval '120 hours',
    v_amount -- 100% profit after 120 hours
  );

  -- Process referral commissions
  FOR v_level, v_referrer_id IN
    SELECT r.level, r.referrer_id
    FROM public.referrals r
    WHERE r.referred_id = v_user_id
    ORDER BY r.level
  LOOP
    IF v_level <= 5 THEN
      v_commission := v_amount * referral_percentages[v_level];
      
      -- Add commission to referrer's wallet and referral earnings
      UPDATE public.profiles
      SET wallet_balance = wallet_balance + v_commission,
          total_referral_earnings = total_referral_earnings + v_commission,
          updated_at = now()
      WHERE id = v_referrer_id;
    END IF;
  END LOOP;
END;
$$;

-- Create function to handle withdrawal approval
CREATE OR REPLACE FUNCTION public.approve_withdrawal(withdrawal_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_amount numeric;
BEGIN
  -- Verify admin role
  IF NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can approve withdrawals';
  END IF;

  -- Get withdrawal details
  SELECT user_id, amount INTO v_user_id, v_amount
  FROM public.withdrawals
  WHERE id = withdrawal_id AND status = 'pending';

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Withdrawal not found or already processed';
  END IF;

  -- Check if user has sufficient balance
  IF (SELECT wallet_balance FROM public.profiles WHERE id = v_user_id) < v_amount THEN
    RAISE EXCEPTION 'Insufficient balance';
  END IF;

  -- Deduct from wallet balance
  UPDATE public.profiles
  SET wallet_balance = wallet_balance - v_amount,
      total_withdrawals = total_withdrawals + v_amount,
      updated_at = now()
  WHERE id = v_user_id;

  -- Update withdrawal status
  UPDATE public.withdrawals
  SET status = 'approved',
      processed_at = now(),
      processed_by = auth.uid(),
      updated_at = now()
  WHERE id = withdrawal_id;
END;
$$;

-- Create function to mark withdrawal as paid
CREATE OR REPLACE FUNCTION public.mark_withdrawal_paid(withdrawal_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify admin role
  IF NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can mark withdrawals as paid';
  END IF;

  -- Update withdrawal status to paid
  UPDATE public.withdrawals
  SET status = 'paid',
      updated_at = now()
  WHERE id = withdrawal_id AND status = 'approved';
END;
$$;

-- Create indexes for better performance
CREATE INDEX idx_deposits_user_id ON public.deposits(user_id);
CREATE INDEX idx_deposits_status ON public.deposits(status);
CREATE INDEX idx_withdrawals_user_id ON public.withdrawals(user_id);
CREATE INDEX idx_withdrawals_status ON public.withdrawals(status);

-- Add trigger for updated_at on deposits
CREATE TRIGGER update_deposits_updated_at
  BEFORE UPDATE ON public.deposits
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Add trigger for updated_at on withdrawals
CREATE TRIGGER update_withdrawals_updated_at
  BEFORE UPDATE ON public.withdrawals
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();