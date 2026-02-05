
-- Create function to deactivate current chance and unlock next
CREATE OR REPLACE FUNCTION public.deactivate_chance(p_chance_number integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  
  SELECT * INTO v_progress FROM user_trade_progress WHERE user_id = v_user_id;
  
  IF v_progress IS NULL THEN
    RAISE EXCEPTION 'No trade progress found';
  END IF;
  
  -- Validate chance number
  IF p_chance_number NOT IN (1, 2) THEN
    RAISE EXCEPTION 'Invalid chance number';
  END IF;
  
  -- Check if there's an active cycle - if so, return funds to wallet
  SELECT * INTO v_active_cycle FROM ai_trade_cycles 
  WHERE user_id = v_user_id AND status = 'active' LIMIT 1;
  
  IF v_active_cycle IS NOT NULL THEN
    -- Calculate current value and return to wallet
    SELECT get_cycle_time_unit() INTO v_time_unit;
    SELECT COALESCE((SELECT value::numeric FROM system_config WHERE key = 'penalty_daily_return'), 1.5) INTO v_penalty_return;
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
    
    -- Mark cycle as broken (deactivated)
    UPDATE ai_trade_cycles
    SET status = 'broken',
        current_profit = v_current_value - v_active_cycle.investment_amount,
        updated_at = now()
    WHERE id = v_active_cycle.id;
    
    -- Return funds to wallet
    UPDATE profiles
    SET wallet_balance = wallet_balance + v_current_value,
        updated_at = now()
    WHERE id = v_user_id;
  END IF;
  
  -- Deactivate the specified chance
  IF p_chance_number = 1 THEN
    UPDATE user_trade_progress
    SET chance_1_status = 'disabled',
        chance_2_status = 'available',
        active_chance = NULL,
        completed_cycles = '{}',
        is_penalty_mode = false,
        penalty_chance = NULL,
        updated_at = now()
    WHERE user_id = v_user_id;
    
    RETURN jsonb_build_object(
      'success', true, 
      'deactivated_chance', 1, 
      'next_chance_unlocked', 2,
      'funds_returned', COALESCE(v_current_value, 0)
    );
  ELSE
    -- Deactivating Chance 2 - no more chances available
    UPDATE user_trade_progress
    SET chance_2_status = 'disabled',
        active_chance = NULL,
        completed_cycles = '{}',
        updated_at = now()
    WHERE user_id = v_user_id;
    
    RETURN jsonb_build_object(
      'success', true, 
      'deactivated_chance', 2, 
      'all_chances_used', true,
      'funds_returned', COALESCE(v_current_value, 0)
    );
  END IF;
END;
$function$;
