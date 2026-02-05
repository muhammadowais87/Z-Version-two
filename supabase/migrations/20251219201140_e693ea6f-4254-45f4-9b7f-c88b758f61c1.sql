
-- Add transfer functions for direct earnings
CREATE OR REPLACE FUNCTION public.transfer_direct_earnings_to_main_wallet(p_amount numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_direct_balance NUMERIC;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;
  
  SELECT COALESCE(direct_earnings_balance, 0) INTO v_direct_balance
  FROM profiles WHERE id = v_user_id
  FOR UPDATE;
  
  IF v_direct_balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient direct earnings balance';
  END IF;
  
  UPDATE profiles
  SET direct_earnings_balance = COALESCE(direct_earnings_balance, 0) - p_amount,
      wallet_balance = wallet_balance + p_amount,
      updated_at = now()
  WHERE id = v_user_id;
  
  INSERT INTO wallet_transfers (user_id, amount, from_wallet, to_wallet)
  VALUES (v_user_id, p_amount, 'direct', 'main');
  
  RETURN jsonb_build_object(
    'success', true,
    'transferred', p_amount,
    'destination', 'main_wallet'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.transfer_direct_earnings_to_cycle_wallet(p_amount numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_direct_balance NUMERIC;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;
  
  SELECT COALESCE(direct_earnings_balance, 0) INTO v_direct_balance
  FROM profiles WHERE id = v_user_id
  FOR UPDATE;
  
  IF v_direct_balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient direct earnings balance';
  END IF;
  
  UPDATE profiles
  SET direct_earnings_balance = COALESCE(direct_earnings_balance, 0) - p_amount,
      cycle_wallet_balance = cycle_wallet_balance + p_amount,
      updated_at = now()
  WHERE id = v_user_id;
  
  INSERT INTO wallet_transfers (user_id, amount, from_wallet, to_wallet)
  VALUES (v_user_id, p_amount, 'direct', 'cycle');
  
  RETURN jsonb_build_object(
    'success', true,
    'transferred', p_amount,
    'destination', 'cycle_wallet'
  );
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.transfer_direct_earnings_to_main_wallet(numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_direct_earnings_to_cycle_wallet(numeric) TO authenticated;
