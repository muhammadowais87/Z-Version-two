-- Fix deactivate_chance to RESET penalty mode when moving to Chance 2
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
  
  IF p_chance_number NOT IN (1, 2) THEN
    RAISE EXCEPTION 'Invalid chance number';
  END IF;
  
  SELECT * INTO v_active_cycle FROM ai_trade_cycles 
  WHERE user_id = v_user_id AND status = 'active' LIMIT 1;
  
  IF v_active_cycle IS NOT NULL THEN
    SELECT get_cycle_time_unit() INTO v_time_unit;
    SELECT COALESCE((SELECT value::numeric FROM system_config WHERE key = 'penalty_daily_return'), 1.5) INTO v_penalty_return;
    v_cycle_duration := get_cycle_duration(v_active_cycle.cycle_type);
    
    IF v_time_unit = 'seconds' THEN
      v_time_passed := EXTRACT(EPOCH FROM (now() - v_active_cycle.start_date));
    ELSIF v_time_unit = 'minutes' THEN
      v_time_passed := EXTRACT(EPOCH FROM (now() - v_active_cycle.start_date)) / 60;
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
    SET status = 'broken',
        current_profit = v_current_value - v_active_cycle.investment_amount,
        updated_at = now()
    WHERE id = v_active_cycle.id;
    
    UPDATE profiles
    SET cycle_wallet_balance = cycle_wallet_balance + v_current_value,
        updated_at = now()
    WHERE id = v_user_id;
  END IF;
  
  IF p_chance_number = 1 THEN
    -- RESET penalty mode when moving to Chance 2 (fresh start)
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
      'funds_returned', COALESCE(v_current_value, 0),
      'penalty_mode_reset', true
    );
  ELSE
    UPDATE user_trade_progress
    SET chance_2_status = 'disabled',
        active_chance = NULL,
        completed_cycles = '{}',
        is_penalty_mode = false,
        penalty_chance = NULL,
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

-- Also fix withdraw_early_from_cycle to reset penalty when unlocking next chance
CREATE OR REPLACE FUNCTION public.withdraw_early_from_cycle(p_cycle_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id UUID;
  v_cycle RECORD;
  v_time_passed NUMERIC;
  v_current_value NUMERIC;
  v_progress RECORD;
  v_wallet_after NUMERIC;
  v_total_cycle_amount NUMERIC;
  v_unlock_next_chance BOOLEAN := false;
  v_current_chance INTEGER;
  v_time_unit TEXT;
  v_penalty_return NUMERIC;
BEGIN
  v_user_id := auth.uid();
  
  SELECT COALESCE((SELECT value::numeric FROM system_config WHERE key = 'penalty_daily_return'), 2) INTO v_penalty_return;
  SELECT get_cycle_time_unit() INTO v_time_unit;
  
  SELECT * INTO v_cycle
  FROM public.ai_trade_cycles
  WHERE id = p_cycle_id AND user_id = v_user_id AND status = 'active';
  
  IF v_cycle IS NULL THEN
    RAISE EXCEPTION 'Cycle not found or already completed';
  END IF;
  
  IF v_time_unit = 'seconds' THEN
    v_time_passed := EXTRACT(EPOCH FROM (now() - v_cycle.start_date));
  ELSIF v_time_unit = 'minutes' THEN
    v_time_passed := EXTRACT(EPOCH FROM (now() - v_cycle.start_date)) / 60;
  ELSE
    v_time_passed := EXTRACT(EPOCH FROM (now() - v_cycle.start_date)) / 86400;
  END IF;
  
  SELECT * INTO v_progress
  FROM public.user_trade_progress
  WHERE user_id = v_user_id;
  
  v_current_chance := v_cycle.chance_number;
  
  IF v_progress.is_penalty_mode THEN
    v_current_value := v_cycle.investment_amount * (1 + ((v_penalty_return / 100) * v_time_passed));
  ELSE
    v_current_value := v_cycle.investment_amount * (1 + (v_time_passed / get_cycle_duration(v_cycle.cycle_type)));
  END IF;
  
  -- Check if this will unlock next chance (50% rule)
  IF v_cycle.cycle_type IN (1, 2, 3) THEN
    v_total_cycle_amount := v_cycle.investment_amount * 2;
    SELECT cycle_wallet_balance + v_current_value INTO v_wallet_after FROM public.profiles WHERE id = v_user_id;
    
    IF v_wallet_after < (v_total_cycle_amount * 0.5) THEN
      v_unlock_next_chance := true;
    END IF;
  END IF;
  
  UPDATE public.ai_trade_cycles
  SET status = 'broken',
      current_profit = v_current_value - v_cycle.investment_amount,
      updated_at = now()
  WHERE id = p_cycle_id;
  
  UPDATE public.profiles
  SET cycle_wallet_balance = cycle_wallet_balance + v_current_value,
      updated_at = now()
  WHERE id = v_user_id;
  
  IF v_cycle.cycle_type = 4 THEN
    -- Special cycle - no penalty mode
    UPDATE public.user_trade_progress
    SET active_chance = NULL,
        updated_at = now()
    WHERE user_id = v_user_id;
  ELSIF v_unlock_next_chance THEN
    -- Unlocking next chance - RESET penalty mode (fresh start on new chance)
    IF v_current_chance = 1 THEN
      UPDATE public.user_trade_progress
      SET active_chance = NULL,
          chance_1_status = 'disabled',
          chance_2_status = 'available',
          is_penalty_mode = false,
          penalty_chance = NULL,
          updated_at = now()
      WHERE user_id = v_user_id;
    ELSE
      UPDATE public.user_trade_progress
      SET active_chance = NULL,
          chance_2_status = 'disabled',
          is_penalty_mode = false,
          penalty_chance = NULL,
          updated_at = now()
      WHERE user_id = v_user_id;
    END IF;
  ELSE
    -- Staying on same chance - activate penalty mode
    IF v_cycle.cycle_type IN (1, 2, 3) THEN
      UPDATE public.user_trade_progress
      SET active_chance = NULL,
          is_penalty_mode = true,
          penalty_chance = v_current_chance,
          updated_at = now()
      WHERE user_id = v_user_id;
    ELSE
      UPDATE public.user_trade_progress
      SET active_chance = NULL,
          updated_at = now()
      WHERE user_id = v_user_id;
    END IF;
  END IF;
  
  RETURN jsonb_build_object(
    'withdrawn_amount', v_current_value,
    'tax_applied', 0,
    'penalty_mode_activated', v_cycle.cycle_type IN (1, 2, 3) AND NOT v_unlock_next_chance,
    'next_chance_unlocked', v_unlock_next_chance,
    'penalty_chance', CASE WHEN v_unlock_next_chance THEN NULL ELSE v_current_chance END
  );
END;
$function$;