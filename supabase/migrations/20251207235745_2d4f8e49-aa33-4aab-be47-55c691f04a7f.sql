CREATE OR REPLACE FUNCTION public.complete_trade_cycles()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cycle RECORD;
  v_final_amount NUMERIC;
  v_profit NUMERIC;
  v_progress RECORD;
  v_profit_multiplier NUMERIC;
  v_penalty_return NUMERIC;
  v_next_cycle_type INTEGER;
  v_cycle_duration INTEGER;
  v_time_unit TEXT;
  v_next_end_date TIMESTAMP WITH TIME ZONE;
  v_new_cycle_id UUID;
BEGIN
  SELECT COALESCE((SELECT value::numeric FROM system_config WHERE key = 'profit_multiplier'), 2) INTO v_profit_multiplier;
  SELECT COALESCE((SELECT value::numeric FROM system_config WHERE key = 'penalty_daily_return'), 2) INTO v_penalty_return;
  SELECT get_cycle_time_unit() INTO v_time_unit;
  
  FOR v_cycle IN
    SELECT * FROM public.ai_trade_cycles
    WHERE status = 'active' AND end_date <= now()
  LOOP
    SELECT * INTO v_progress FROM public.user_trade_progress WHERE user_id = v_cycle.user_id;
    
    -- Calculate final amount based on penalty mode
    IF v_progress.is_penalty_mode THEN
      v_profit := v_cycle.investment_amount * (v_penalty_return / 100) * get_cycle_duration(v_cycle.cycle_type);
      v_final_amount := v_cycle.investment_amount + v_profit;
    ELSE
      v_final_amount := v_cycle.investment_amount * v_profit_multiplier;
      v_profit := v_cycle.investment_amount * (v_profit_multiplier - 1);
    END IF;
    
    -- Mark current cycle as completed
    UPDATE public.ai_trade_cycles
    SET status = 'completed', current_profit = v_profit, updated_at = now()
    WHERE id = v_cycle.id;
    
    -- Determine next cycle type
    IF v_cycle.cycle_type = 1 THEN
      v_next_cycle_type := 2;
    ELSIF v_cycle.cycle_type = 2 THEN
      v_next_cycle_type := 3;
    ELSIF v_cycle.cycle_type = 3 THEN
      v_next_cycle_type := 4; -- Special cycle
    ELSE
      v_next_cycle_type := 4; -- Special repeats
    END IF;
    
    -- Calculate next cycle end date
    v_cycle_duration := get_cycle_duration(v_next_cycle_type);
    IF v_time_unit = 'seconds' THEN
      v_next_end_date := now() + (v_cycle_duration || ' seconds')::INTERVAL;
    ELSE
      v_next_end_date := now() + (v_cycle_duration || ' days')::INTERVAL;
    END IF;
    
    -- Auto-start next cycle with the final amount (doubled investment)
    INSERT INTO public.ai_trade_cycles (
      user_id,
      cycle_type,
      investment_amount,
      end_date,
      chance_number,
      status
    )
    VALUES (
      v_cycle.user_id,
      v_next_cycle_type,
      v_final_amount,
      v_next_end_date,
      v_cycle.chance_number,
      'active'
    )
    RETURNING id INTO v_new_cycle_id;
    
    -- Update user progress - add completed cycle, keep active chance
    IF v_cycle.cycle_type = 4 THEN
      -- Special cycle completed - keep cycles unlocked, penalty mode cleared
      UPDATE public.user_trade_progress
      SET is_penalty_mode = false,
          last_50_percent_check = now(),
          updated_at = now()
      WHERE user_id = v_cycle.user_id;
    ELSE
      -- Regular cycle: add to completed cycles
      UPDATE public.user_trade_progress
      SET completed_cycles = array_append(COALESCE(completed_cycles, '{}'), v_cycle.cycle_type),
          is_penalty_mode = false,
          last_50_percent_check = now(),
          updated_at = now()
      WHERE user_id = v_cycle.user_id;
    END IF;
    
    -- Update profile - add profit only (investment stays in cycle)
    UPDATE public.profiles
    SET total_profit = total_profit + v_profit,
        updated_at = now()
    WHERE id = v_cycle.user_id;
    
    RAISE NOTICE 'Cycle % completed for user %. Auto-started cycle % with amount %', 
      v_cycle.cycle_type, v_cycle.user_id, v_next_cycle_type, v_final_amount;
  END LOOP;
END;
$function$;