
-- Create a user-callable function to complete their own matured cycles
CREATE OR REPLACE FUNCTION public.complete_user_matured_cycles()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id UUID;
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
  v_additional_investment JSONB;
  v_additional_profit NUMERIC := 0;
  v_additional_total NUMERIC := 0;
  v_remaining_time NUMERIC;
  v_completed_count INTEGER := 0;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  
  SELECT COALESCE((SELECT value::numeric FROM system_config WHERE key = 'profit_multiplier'), 2) INTO v_profit_multiplier;
  SELECT COALESCE((SELECT value::numeric FROM system_config WHERE key = 'penalty_daily_return'), 2) INTO v_penalty_return;
  SELECT get_cycle_time_unit() INTO v_time_unit;
  
  FOR v_cycle IN
    SELECT * FROM public.ai_trade_cycles
    WHERE user_id = v_user_id AND status = 'active' AND end_date <= now()
  LOOP
    SELECT * INTO v_progress FROM public.user_trade_progress WHERE user_id = v_user_id;
    v_cycle_duration := get_cycle_duration(v_cycle.cycle_type);
    
    v_additional_profit := 0;
    v_additional_total := 0;
    
    IF v_progress.is_penalty_mode THEN
      v_profit := v_cycle.investment_amount * (v_penalty_return / 100) * v_cycle_duration;
      v_final_amount := v_cycle.investment_amount + v_profit;
    ELSE
      v_final_amount := v_cycle.investment_amount * v_profit_multiplier;
      v_profit := v_cycle.investment_amount * (v_profit_multiplier - 1);
    END IF;
    
    IF v_cycle.cycle_type = 1 AND v_cycle.additional_investments IS NOT NULL AND jsonb_array_length(v_cycle.additional_investments) > 0 THEN
      FOR v_additional_investment IN 
        SELECT * FROM jsonb_array_elements(v_cycle.additional_investments)
      LOOP
        IF v_time_unit = 'seconds' THEN
          v_remaining_time := EXTRACT(EPOCH FROM (v_cycle.end_date - (v_additional_investment->>'added_at')::timestamptz));
        ELSE
          v_remaining_time := EXTRACT(EPOCH FROM (v_cycle.end_date - (v_additional_investment->>'added_at')::timestamptz)) / 86400;
        END IF;
        
        v_remaining_time := GREATEST(0, LEAST(v_remaining_time, v_cycle_duration));
        
        IF v_progress.is_penalty_mode THEN
          v_additional_profit := v_additional_profit + ((v_additional_investment->>'amount')::numeric * (v_penalty_return / 100) * v_remaining_time);
        ELSE
          v_additional_profit := v_additional_profit + ((v_additional_investment->>'amount')::numeric * (v_remaining_time / v_cycle_duration));
        END IF;
        
        v_additional_total := v_additional_total + (v_additional_investment->>'amount')::numeric;
      END LOOP;
      
      v_final_amount := v_final_amount + v_additional_total + v_additional_profit;
      v_profit := v_profit + v_additional_profit;
    END IF;
    
    UPDATE public.ai_trade_cycles
    SET status = 'completed', current_profit = v_profit, updated_at = now()
    WHERE id = v_cycle.id;
    
    IF v_cycle.cycle_type = 1 THEN
      v_next_cycle_type := 2;
    ELSIF v_cycle.cycle_type = 2 THEN
      v_next_cycle_type := 3;
    ELSIF v_cycle.cycle_type = 3 THEN
      v_next_cycle_type := 4;
    ELSE
      v_next_cycle_type := 4;
    END IF;
    
    v_cycle_duration := get_cycle_duration(v_next_cycle_type);
    IF v_time_unit = 'seconds' THEN
      v_next_end_date := now() + (v_cycle_duration || ' seconds')::INTERVAL;
    ELSE
      v_next_end_date := now() + (v_cycle_duration || ' days')::INTERVAL;
    END IF;
    
    INSERT INTO public.ai_trade_cycles (
      user_id, cycle_type, investment_amount, end_date, chance_number, status
    )
    VALUES (
      v_user_id, v_next_cycle_type, v_final_amount, v_next_end_date, v_cycle.chance_number, 'active'
    )
    RETURNING id INTO v_new_cycle_id;
    
    IF v_cycle.cycle_type = 4 THEN
      UPDATE public.user_trade_progress
      SET is_penalty_mode = false, last_50_percent_check = now(), updated_at = now()
      WHERE user_id = v_user_id;
    ELSE
      UPDATE public.user_trade_progress
      SET completed_cycles = array_append(COALESCE(completed_cycles, '{}'), v_cycle.cycle_type),
          is_penalty_mode = false, last_50_percent_check = now(), updated_at = now()
      WHERE user_id = v_user_id;
    END IF;
    
    UPDATE public.profiles
    SET total_profit = total_profit + v_profit, updated_at = now()
    WHERE id = v_user_id;
    
    v_completed_count := v_completed_count + 1;
  END LOOP;
  
  RETURN jsonb_build_object('completed_cycles', v_completed_count);
END;
$function$;
