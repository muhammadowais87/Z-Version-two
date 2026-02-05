-- Add column to track additional investments with their deposit times
ALTER TABLE public.ai_trade_cycles 
ADD COLUMN IF NOT EXISTS additional_investments jsonb DEFAULT '[]'::jsonb;

-- Create function to add investment to active Cycle 1
CREATE OR REPLACE FUNCTION public.add_investment_to_cycle(p_cycle_id uuid, p_amount numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id UUID;
  v_cycle RECORD;
  v_wallet_balance NUMERIC;
  v_new_investment jsonb;
BEGIN
  v_user_id := auth.uid();
  
  -- Get the cycle
  SELECT * INTO v_cycle FROM ai_trade_cycles 
  WHERE id = p_cycle_id AND user_id = v_user_id AND status = 'active';
  
  IF v_cycle IS NULL THEN
    RAISE EXCEPTION 'Active cycle not found';
  END IF;
  
  -- Only allow for Cycle 1
  IF v_cycle.cycle_type != 1 THEN
    RAISE EXCEPTION 'Additional investments are only allowed in Cycle 1';
  END IF;
  
  -- Check wallet balance
  SELECT wallet_balance INTO v_wallet_balance FROM profiles WHERE id = v_user_id;
  
  IF v_wallet_balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient wallet balance';
  END IF;
  
  -- Validate amount
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;
  
  -- Deduct from wallet
  UPDATE profiles 
  SET wallet_balance = wallet_balance - p_amount,
      updated_at = now()
  WHERE id = v_user_id;
  
  -- Add to additional investments array
  v_new_investment := jsonb_build_object(
    'amount', p_amount,
    'added_at', now()
  );
  
  UPDATE ai_trade_cycles
  SET additional_investments = COALESCE(additional_investments, '[]'::jsonb) || v_new_investment,
      updated_at = now()
  WHERE id = p_cycle_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'amount_added', p_amount,
    'added_at', now()
  );
END;
$function$;