
-- Update approve_withdrawal function to handle both wallet_balance and referral_balance
CREATE OR REPLACE FUNCTION public.approve_withdrawal(withdrawal_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid;
  v_amount numeric;
  v_wallet_address text;
  v_wallet_balance numeric;
  v_referral_balance numeric;
  v_total_available numeric;
  v_deduct_from_wallet numeric;
  v_deduct_from_referral numeric;
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

  -- Get both balances
  SELECT wallet_balance, COALESCE(referral_balance, 0) 
  INTO v_wallet_balance, v_referral_balance
  FROM public.profiles WHERE id = v_user_id;
  
  v_total_available := v_wallet_balance + v_referral_balance;

  IF v_total_available < v_amount THEN
    RAISE EXCEPTION 'Insufficient balance';
  END IF;

  -- Deduct from referral_balance first (team income), then wallet_balance
  IF v_referral_balance >= v_amount THEN
    -- All from referral balance
    v_deduct_from_referral := v_amount;
    v_deduct_from_wallet := 0;
  ELSE
    -- Use all referral balance, rest from wallet
    v_deduct_from_referral := v_referral_balance;
    v_deduct_from_wallet := v_amount - v_referral_balance;
  END IF;

  UPDATE public.profiles
  SET wallet_balance = wallet_balance - v_deduct_from_wallet,
      referral_balance = COALESCE(referral_balance, 0) - v_deduct_from_referral,
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
      'wallet_address', v_wallet_address,
      'from_wallet', v_deduct_from_wallet,
      'from_referral', v_deduct_from_referral
    )
  );
END;
$$;

-- Update withdrawal insert policy to check combined balance
DROP POLICY IF EXISTS "Users can create own withdrawals" ON withdrawals;
CREATE POLICY "Users can create own withdrawals"
  ON public.withdrawals
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id 
    AND amount <= (
      SELECT (wallet_balance + COALESCE(referral_balance, 0))
      FROM profiles
      WHERE id = auth.uid()
    )
  );
