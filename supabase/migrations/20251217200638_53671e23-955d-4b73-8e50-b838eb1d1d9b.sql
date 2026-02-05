-- Update transfer_to_cycle_wallet to log transfer
CREATE OR REPLACE FUNCTION public.transfer_to_cycle_wallet(p_amount numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id UUID;
  v_wallet_balance NUMERIC;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;
  
  SELECT wallet_balance INTO v_wallet_balance
  FROM profiles WHERE id = v_user_id;
  
  IF v_wallet_balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient main wallet balance';
  END IF;
  
  UPDATE profiles
  SET wallet_balance = wallet_balance - p_amount,
      cycle_wallet_balance = cycle_wallet_balance + p_amount,
      updated_at = now()
  WHERE id = v_user_id;
  
  -- Log the transfer
  INSERT INTO wallet_transfers (user_id, amount, from_wallet, to_wallet)
  VALUES (v_user_id, p_amount, 'main', 'cycle');
  
  RETURN jsonb_build_object(
    'success', true,
    'transferred', p_amount
  );
END;
$function$;

-- Update transfer_to_main_wallet to log transfer
CREATE OR REPLACE FUNCTION public.transfer_to_main_wallet(p_amount numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id UUID;
  v_cycle_balance NUMERIC;
  v_active_cycles INTEGER;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;
  
  SELECT COUNT(*) INTO v_active_cycles
  FROM ai_trade_cycles WHERE user_id = v_user_id AND status = 'active';
  
  IF v_active_cycles > 0 THEN
    RAISE EXCEPTION 'Cannot transfer while cycles are active';
  END IF;
  
  SELECT cycle_wallet_balance INTO v_cycle_balance
  FROM profiles WHERE id = v_user_id;
  
  IF v_cycle_balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient cycle wallet balance';
  END IF;
  
  UPDATE profiles
  SET cycle_wallet_balance = cycle_wallet_balance - p_amount,
      wallet_balance = wallet_balance + p_amount,
      updated_at = now()
  WHERE id = v_user_id;
  
  -- Log the transfer
  INSERT INTO wallet_transfers (user_id, amount, from_wallet, to_wallet)
  VALUES (v_user_id, p_amount, 'cycle', 'main');
  
  RETURN jsonb_build_object(
    'success', true,
    'transferred', p_amount
  );
END;
$function$;

-- Update transfer_team_income_to_cycle_wallet to log transfer
CREATE OR REPLACE FUNCTION public.transfer_team_income_to_cycle_wallet(p_amount numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  
  SELECT referral_balance INTO v_referral_balance
  FROM profiles WHERE id = v_user_id;
  
  IF COALESCE(v_referral_balance, 0) < p_amount THEN
    RAISE EXCEPTION 'Insufficient team income balance';
  END IF;
  
  UPDATE profiles
  SET referral_balance = COALESCE(referral_balance, 0) - p_amount,
      cycle_wallet_balance = cycle_wallet_balance + p_amount,
      updated_at = now()
  WHERE id = v_user_id;
  
  -- Log the transfer
  INSERT INTO wallet_transfers (user_id, amount, from_wallet, to_wallet)
  VALUES (v_user_id, p_amount, 'team', 'cycle');
  
  RETURN jsonb_build_object(
    'success', true,
    'transferred', p_amount,
    'destination', 'cycle_wallet'
  );
END;
$function$;

-- Update transfer_team_income_to_main_wallet to log transfer
CREATE OR REPLACE FUNCTION public.transfer_team_income_to_main_wallet(p_amount numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  
  SELECT referral_balance INTO v_referral_balance
  FROM profiles WHERE id = v_user_id;
  
  IF COALESCE(v_referral_balance, 0) < p_amount THEN
    RAISE EXCEPTION 'Insufficient team income balance';
  END IF;
  
  UPDATE profiles
  SET referral_balance = COALESCE(referral_balance, 0) - p_amount,
      wallet_balance = wallet_balance + p_amount,
      updated_at = now()
  WHERE id = v_user_id;
  
  -- Log the transfer
  INSERT INTO wallet_transfers (user_id, amount, from_wallet, to_wallet)
  VALUES (v_user_id, p_amount, 'team', 'main');
  
  RETURN jsonb_build_object(
    'success', true,
    'transferred', p_amount,
    'destination', 'main_wallet'
  );
END;
$function$;