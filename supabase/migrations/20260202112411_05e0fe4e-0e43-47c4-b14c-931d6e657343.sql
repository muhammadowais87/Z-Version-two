-- Update transfer_to_main_wallet function to remove active cycle restriction
CREATE OR REPLACE FUNCTION public.transfer_to_main_wallet(p_amount numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id UUID;
  v_cycle_balance NUMERIC;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;
  
  -- Lock the row to prevent race conditions
  SELECT cycle_wallet_balance INTO v_cycle_balance
  FROM profiles WHERE id = v_user_id
  FOR UPDATE;
  
  IF v_cycle_balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient cycle wallet balance';
  END IF;
  
  -- Transfer from cycle wallet to main wallet
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
    'transferred', p_amount,
    'from', 'cycle_wallet',
    'to', 'main_wallet'
  );
END;
$function$;