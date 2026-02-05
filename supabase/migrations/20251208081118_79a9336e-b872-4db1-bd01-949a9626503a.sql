
-- Update withdraw_early_from_cycle to track which chance triggered penalty
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
  v_tax NUMERIC := 0;
  v_tax_rate NUMERIC;
  v_final_amount NUMERIC;
  v_progress RECORD;
  v_wallet_after NUMERIC;
  v_total_cycle_amount NUMERIC;
  v_unlock_next_chance BOOLEAN := false;
  v_current_chance INTEGER;
  v_time_unit TEXT;
  v_penalty_return NUMERIC;
BEGIN
  v_user_id := auth.uid();
  
  SELECT COALESCE((SELECT value::numeric FROM system_config WHERE key = 'early_withdrawal_tax'), 18) INTO v_tax_rate;
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
  
  IF v_cycle.cycle_type IN (1, 2, 3) THEN
    v_tax := v_current_value * (v_tax_rate / 100);
    v_final_amount := v_current_value - v_tax;
    
    -- Set penalty mode and track which chance triggered it
    UPDATE public.user_trade_progress
    SET is_penalty_mode = true,
        penalty_chance = v_current_chance,
        updated_at = now()
    WHERE user_id = v_user_id;
    
    v_total_cycle_amount := v_cycle.investment_amount * 2;
    SELECT wallet_balance + v_final_amount INTO v_wallet_after FROM public.profiles WHERE id = v_user_id;
    
    IF v_wallet_after < (v_total_cycle_amount * 0.5) THEN
      v_unlock_next_chance := true;
    END IF;
  ELSE
    v_final_amount := v_current_value;
  END IF;
  
  UPDATE public.ai_trade_cycles
  SET status = 'broken',
      current_profit = v_current_value - v_cycle.investment_amount,
      updated_at = now()
  WHERE id = p_cycle_id;
  
  UPDATE public.profiles
  SET wallet_balance = wallet_balance + v_final_amount,
      updated_at = now()
  WHERE id = v_user_id;
  
  IF v_cycle.cycle_type = 4 THEN
    UPDATE public.user_trade_progress
    SET active_chance = NULL,
        updated_at = now()
    WHERE user_id = v_user_id;
  ELSIF v_unlock_next_chance THEN
    IF v_current_chance = 1 THEN
      UPDATE public.user_trade_progress
      SET active_chance = NULL,
          chance_1_status = 'disabled',
          chance_2_status = 'available',
          updated_at = now()
      WHERE user_id = v_user_id;
    ELSE
      UPDATE public.user_trade_progress
      SET active_chance = NULL,
          chance_2_status = 'disabled',
          updated_at = now()
      WHERE user_id = v_user_id;
    END IF;
  ELSE
    UPDATE public.user_trade_progress
    SET active_chance = NULL,
        updated_at = now()
    WHERE user_id = v_user_id;
  END IF;
  
  RETURN jsonb_build_object(
    'withdrawn_amount', v_final_amount,
    'tax_applied', v_tax,
    'penalty_mode_activated', v_cycle.cycle_type IN (1, 2, 3),
    'next_chance_unlocked', v_unlock_next_chance,
    'penalty_chance', v_current_chance
  );
END;
$function$;

-- Update complete_current_chance to only work for Chance 1 penalty
CREATE OR REPLACE FUNCTION public.complete_current_chance()
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
  
  SELECT * INTO v_progress FROM user_trade_progress WHERE user_id = v_user_id;
  
  IF v_progress IS NULL THEN
    RAISE EXCEPTION 'No trade progress found';
  END IF;
  
  -- Block completion if penalty was triggered in Chance 2 (permanent penalty)
  IF v_progress.penalty_chance = 2 THEN
    RAISE EXCEPTION 'Cannot complete chance. Penalty mode is permanent for Chance 2.';
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
    
    UPDATE profiles
    SET wallet_balance = wallet_balance + v_current_value,
        total_profit = total_profit + (v_current_value - v_active_cycle.investment_amount),
        updated_at = now()
    WHERE id = v_user_id;
  END IF;
  
  -- Complete the current available chance and unlock next (only for Chance 1)
  IF v_progress.chance_1_status = 'available' OR v_progress.chance_1_status = 'active' THEN
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
  ELSIF v_progress.chance_2_status = 'available' OR v_progress.chance_2_status = 'active' THEN
    -- This should not be reachable if penalty_chance = 2, but double check
    IF v_progress.penalty_chance = 2 THEN
      RAISE EXCEPTION 'Cannot complete Chance 2 in permanent penalty mode.';
    END IF;
    
    UPDATE user_trade_progress
    SET completed_cycles = '{}',
        chance_2_status = 'completed',
        active_chance = NULL,
        is_penalty_mode = false,
        penalty_chance = NULL,
        updated_at = now()
    WHERE user_id = v_user_id;
    
    RETURN jsonb_build_object('success', true, 'completed_chance', 2, 'all_chances_completed', true, 'funds_returned', COALESCE(v_current_value, 0));
  ELSE
    RAISE EXCEPTION 'No available chance to complete';
  END IF;
END;
$function$;
