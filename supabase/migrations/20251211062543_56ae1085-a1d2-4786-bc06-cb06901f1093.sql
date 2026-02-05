-- Transfer team income (referral_balance) to cycle wallet
CREATE OR REPLACE FUNCTION public.transfer_team_income_to_cycle_wallet(p_amount numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id UUID;
  v_referral_balance NUMERIC;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;
  
  -- Get current referral balance
  SELECT referral_balance INTO v_referral_balance
  FROM profiles WHERE id = v_user_id;
  
  IF COALESCE(v_referral_balance, 0) < p_amount THEN
    RAISE EXCEPTION 'Insufficient team income balance';
  END IF;
  
  -- Transfer amount from referral_balance to cycle_wallet_balance
  UPDATE profiles
  SET referral_balance = COALESCE(referral_balance, 0) - p_amount,
      cycle_wallet_balance = cycle_wallet_balance + p_amount,
      updated_at = now()
  WHERE id = v_user_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'transferred', p_amount,
    'destination', 'cycle_wallet'
  );
END;
$$;

-- Transfer team income (referral_balance) to main wallet
CREATE OR REPLACE FUNCTION public.transfer_team_income_to_main_wallet(p_amount numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id UUID;
  v_referral_balance NUMERIC;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;
  
  -- Get current referral balance
  SELECT referral_balance INTO v_referral_balance
  FROM profiles WHERE id = v_user_id;
  
  IF COALESCE(v_referral_balance, 0) < p_amount THEN
    RAISE EXCEPTION 'Insufficient team income balance';
  END IF;
  
  -- Transfer amount from referral_balance to wallet_balance
  UPDATE profiles
  SET referral_balance = COALESCE(referral_balance, 0) - p_amount,
      wallet_balance = wallet_balance + p_amount,
      updated_at = now()
  WHERE id = v_user_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'transferred', p_amount,
    'destination', 'main_wallet'
  );
END;
$$;