-- Function to add team income directly to an active cycle
CREATE OR REPLACE FUNCTION public.add_team_income_to_cycle(p_cycle_id uuid, p_amount numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id UUID;
  v_cycle RECORD;
  v_referral_balance NUMERIC;
  v_new_investment jsonb;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  
  -- Get the active cycle
  SELECT * INTO v_cycle FROM ai_trade_cycles 
  WHERE id = p_cycle_id AND user_id = v_user_id AND status = 'active';
  
  IF v_cycle IS NULL THEN
    RAISE EXCEPTION 'Active cycle not found';
  END IF;
  
  -- Check team income balance
  SELECT COALESCE(referral_balance, 0) INTO v_referral_balance 
  FROM profiles WHERE id = v_user_id;
  
  IF v_referral_balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient team income balance';
  END IF;
  
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;
  
  -- Deduct from team income (referral_balance)
  UPDATE profiles 
  SET referral_balance = COALESCE(referral_balance, 0) - p_amount,
      updated_at = now()
  WHERE id = v_user_id;
  
  -- Add to cycle's additional investments
  v_new_investment := jsonb_build_object(
    'amount', p_amount,
    'added_at', now(),
    'source', 'team_income'
  );
  
  UPDATE ai_trade_cycles
  SET additional_investments = COALESCE(additional_investments, '[]'::jsonb) || v_new_investment,
      updated_at = now()
  WHERE id = p_cycle_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'amount_added', p_amount,
    'added_at', now(),
    'source', 'team_income'
  );
END;
$function$;