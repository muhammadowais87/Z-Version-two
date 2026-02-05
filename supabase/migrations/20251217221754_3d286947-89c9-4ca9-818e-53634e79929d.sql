-- Fix reset_user_data to handle referral earnings impact
-- Also add row-level locking to prevent race conditions in critical financial operations

-- 1. Update reset_user_data to also clean up referral earnings WHERE user was the referrer
CREATE OR REPLACE FUNCTION public.reset_user_data(p_target_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_admin_id UUID;
BEGIN
  v_admin_id := auth.uid();
  
  -- Verify admin role
  IF NOT has_role(v_admin_id, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Unauthorized: Admin role required';
  END IF;
  
  -- Reset profile balances and stats
  UPDATE profiles
  SET wallet_balance = 0,
      cycle_wallet_balance = 0,
      referral_balance = 0,
      total_investment = 0,
      total_profit = 0,
      total_referral_earnings = 0,
      total_deposits = 0,
      total_withdrawals = 0,
      updated_at = now()
  WHERE id = p_target_user_id;
  
  -- Delete all AI trade cycles for the user
  DELETE FROM ai_trade_cycles WHERE user_id = p_target_user_id;
  
  -- Reset user trade progress
  DELETE FROM user_trade_progress WHERE user_id = p_target_user_id;
  
  -- Re-create fresh trade progress
  INSERT INTO user_trade_progress (user_id, completed_cycles, is_penalty_mode, active_chance, chance_1_status, chance_2_status)
  VALUES (p_target_user_id, '{}', false, NULL, 'available', 'locked');
  
  -- Delete investments
  DELETE FROM investments WHERE user_id = p_target_user_id;
  
  -- Delete deposits
  DELETE FROM deposits WHERE user_id = p_target_user_id;
  
  -- Delete withdrawals
  DELETE FROM withdrawals WHERE user_id = p_target_user_id;
  
  -- Delete referral earnings history (where user is the referred - earnings paid to others)
  DELETE FROM referral_earnings_history WHERE referred_id = p_target_user_id;
  
  -- Delete referral earnings history (where user is the referrer - earnings user received)
  DELETE FROM referral_earnings_history WHERE referrer_id = p_target_user_id;
  
  -- Delete wallet transfers
  DELETE FROM wallet_transfers WHERE user_id = p_target_user_id;
  
  -- Log admin action
  PERFORM log_admin_action(
    'reset_user_data',
    'user',
    p_target_user_id,
    jsonb_build_object('reset_by', v_admin_id, 'reset_at', now())
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'user_id', p_target_user_id,
    'message', 'User data has been reset successfully'
  );
END;
$function$;

-- 2. Add row-level locking to transfer functions to prevent race conditions

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
  
  -- Lock the row to prevent race conditions
  SELECT wallet_balance INTO v_wallet_balance
  FROM profiles WHERE id = v_user_id
  FOR UPDATE;
  
  IF v_wallet_balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient main wallet balance';
  END IF;
  
  UPDATE profiles
  SET wallet_balance = wallet_balance - p_amount,
      cycle_wallet_balance = cycle_wallet_balance + p_amount,
      updated_at = now()
  WHERE id = v_user_id;
  
  INSERT INTO wallet_transfers (user_id, amount, from_wallet, to_wallet)
  VALUES (v_user_id, p_amount, 'main', 'cycle');
  
  RETURN jsonb_build_object(
    'success', true,
    'transferred', p_amount
  );
END;
$function$;

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
  
  -- Lock the row to prevent race conditions
  SELECT cycle_wallet_balance INTO v_cycle_balance
  FROM profiles WHERE id = v_user_id
  FOR UPDATE;
  
  IF v_cycle_balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient cycle wallet balance';
  END IF;
  
  UPDATE profiles
  SET cycle_wallet_balance = cycle_wallet_balance - p_amount,
      wallet_balance = wallet_balance + p_amount,
      updated_at = now()
  WHERE id = v_user_id;
  
  INSERT INTO wallet_transfers (user_id, amount, from_wallet, to_wallet)
  VALUES (v_user_id, p_amount, 'cycle', 'main');
  
  RETURN jsonb_build_object(
    'success', true,
    'transferred', p_amount
  );
END;
$function$;

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
  
  -- Lock the row to prevent race conditions
  SELECT referral_balance INTO v_referral_balance
  FROM profiles WHERE id = v_user_id
  FOR UPDATE;
  
  IF COALESCE(v_referral_balance, 0) < p_amount THEN
    RAISE EXCEPTION 'Insufficient team income balance';
  END IF;
  
  UPDATE profiles
  SET referral_balance = COALESCE(referral_balance, 0) - p_amount,
      cycle_wallet_balance = cycle_wallet_balance + p_amount,
      updated_at = now()
  WHERE id = v_user_id;
  
  INSERT INTO wallet_transfers (user_id, amount, from_wallet, to_wallet)
  VALUES (v_user_id, p_amount, 'team', 'cycle');
  
  RETURN jsonb_build_object(
    'success', true,
    'transferred', p_amount,
    'destination', 'cycle_wallet'
  );
END;
$function$;

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
  
  -- Lock the row to prevent race conditions
  SELECT referral_balance INTO v_referral_balance
  FROM profiles WHERE id = v_user_id
  FOR UPDATE;
  
  IF COALESCE(v_referral_balance, 0) < p_amount THEN
    RAISE EXCEPTION 'Insufficient team income balance';
  END IF;
  
  UPDATE profiles
  SET referral_balance = COALESCE(referral_balance, 0) - p_amount,
      wallet_balance = wallet_balance + p_amount,
      updated_at = now()
  WHERE id = v_user_id;
  
  INSERT INTO wallet_transfers (user_id, amount, from_wallet, to_wallet)
  VALUES (v_user_id, p_amount, 'team', 'main');
  
  RETURN jsonb_build_object(
    'success', true,
    'transferred', p_amount,
    'destination', 'main_wallet'
  );
END;
$function$;