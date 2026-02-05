-- Update complete_current_chance to only allow Chance 1
CREATE OR REPLACE FUNCTION public.complete_current_chance()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id UUID;
  v_progress RECORD;
  v_active_cycle RECORD;
  v_current_value NUMERIC;
  v_time_passed NUMERIC;
  v_time_unit TEXT;
  v_penalty_return NUMERIC;
  v_cycle_duration INTEGER;
BEGIN
  v_user_id := auth.uid();
  
  SELECT * INTO v_progress FROM user_trade_progress WHERE user_id = v_user_id;
  
  IF v_progress IS NULL THEN
    RAISE EXCEPTION 'No trade progress found';
  END IF;
  
  -- Only allow completing Chance 1
  IF v_progress.chance_1_status NOT IN ('available', 'active') THEN
    RAISE EXCEPTION 'Complete Chance is only available for Chance 1';
  END IF;
  
  -- Check if Chance 2 is already completed or disabled
  IF v_progress.chance_2_status IN ('completed', 'disabled') THEN
    RAISE EXCEPTION 'Chance 2 is already completed or disabled';
  END IF;
  
  -- Check for active cycle
  SELECT * INTO v_active_cycle FROM ai_trade_cycles 
  WHERE user_id = v_user_id AND status = 'active' LIMIT 1;
  
  IF v_active_cycle IS NOT NULL THEN
    IF v_active_cycle.cycle_type != 4 THEN
      RAISE EXCEPTION 'Can only complete chance from Special Cycle. Complete cycles 1-3 first.';
    END IF;
    
    SELECT get_cycle_time_unit() INTO v_time_unit;
    SELECT COALESCE((SELECT value::numeric FROM system_config WHERE key = 'penalty_daily_return'), 2) INTO v_penalty_return;
    v_cycle_duration := get_cycle_duration(v_active_cycle.cycle_type);
    
    IF v_time_unit = 'seconds' THEN
      v_time_passed := EXTRACT(EPOCH FROM (now() - v_active_cycle.start_date));
    ELSE
      v_time_passed := EXTRACT(EPOCH FROM (now() - v_active_cycle.start_date)) / 86400;
    END IF;
    
    v_time_passed := LEAST(v_time_passed, v_cycle_duration);
    
    IF v_progress.is_penalty_mode THEN
      v_current_value := v_active_cycle.investment_amount * (1 + ((v_penalty_return / 100) * v_time_passed));
    ELSE
      v_current_value := v_active_cycle.investment_amount * (1 + (v_time_passed / v_cycle_duration));
    END IF;
    
    UPDATE ai_trade_cycles
    SET status = 'completed',
        current_profit = v_current_value - v_active_cycle.investment_amount,
        updated_at = now()
    WHERE id = v_active_cycle.id;
    
    -- Return to CYCLE wallet and update profit
    UPDATE profiles
    SET cycle_wallet_balance = cycle_wallet_balance + v_current_value,
        total_profit = total_profit + (v_current_value - v_active_cycle.investment_amount),
        updated_at = now()
    WHERE id = v_user_id;
  END IF;
  
  -- Complete Chance 1 and unlock Chance 2
  UPDATE user_trade_progress
  SET completed_cycles = '{}',
      chance_1_status = 'completed',
      chance_2_status = 'available',
      active_chance = NULL,
      is_penalty_mode = false,
      penalty_chance = NULL,
      updated_at = now()
  WHERE user_id = v_user_id;
  
  RETURN jsonb_build_object('success', true, 'completed_chance', 1, 'next_chance_unlocked', 2, 'funds_returned', COALESCE(v_current_value, 0));
END;
$$;