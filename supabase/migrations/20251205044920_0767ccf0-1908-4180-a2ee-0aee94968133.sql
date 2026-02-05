
-- Update the complete_trade_cycles function to reset progress after Special cycle
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
  v_time_unit TEXT;
BEGIN
  -- Get configurable settings
  SELECT COALESCE((SELECT value::numeric FROM system_config WHERE key = 'profit_multiplier'), 2) INTO v_profit_multiplier;
  SELECT COALESCE((SELECT value::numeric FROM system_config WHERE key = 'penalty_daily_return'), 2) INTO v_penalty_return;
  SELECT get_cycle_time_unit() INTO v_time_unit;
  
  FOR v_cycle IN
    SELECT * FROM public.ai_trade_cycles
    WHERE status = 'active' AND end_date <= now()
  LOOP
    SELECT * INTO v_progress
    FROM public.user_trade_progress
    WHERE user_id = v_cycle.user_id;
    
    IF v_progress.is_penalty_mode THEN
      -- Penalty mode: return based on config (2% daily)
      v_profit := v_cycle.investment_amount * (v_penalty_return / 100) * get_cycle_duration(v_cycle.cycle_type);
      v_final_amount := v_cycle.investment_amount + v_profit;
    ELSE
      -- Normal mode: use profit multiplier (2x = 100% profit)
      v_final_amount := v_cycle.investment_amount * v_profit_multiplier;
      v_profit := v_cycle.investment_amount * (v_profit_multiplier - 1);
    END IF;
    
    -- Update cycle status to completed
    UPDATE public.ai_trade_cycles
    SET status = 'completed',
        current_profit = v_profit,
        updated_at = now()
    WHERE id = v_cycle.id;
    
    -- Add profit to user's wallet
    UPDATE public.profiles
    SET wallet_balance = wallet_balance + v_final_amount,
        total_profit = total_profit + v_profit,
        updated_at = now()
    WHERE id = v_cycle.user_id;
    
    IF v_cycle.cycle_type = 4 THEN
      -- Special cycle completed: RESET all progress so user starts from Cycle 1 again
      UPDATE public.user_trade_progress
      SET completed_cycles = '{}',  -- Reset to empty array
          is_penalty_mode = false,
          last_50_percent_check = now(),
          active_chance = NULL,
          chance_1_status = 'available',
          chance_2_status = 'locked',
          updated_at = now()
      WHERE user_id = v_cycle.user_id;
    ELSE
      -- Regular cycle completed: add to completed cycles, update chance status
      UPDATE public.user_trade_progress
      SET completed_cycles = array_append(COALESCE(completed_cycles, '{}'), v_cycle.cycle_type),
          is_penalty_mode = false,
          last_50_percent_check = now(),
          active_chance = NULL,
          chance_1_status = CASE WHEN v_cycle.chance_number = 1 THEN 'completed' ELSE chance_1_status END,
          chance_2_status = CASE WHEN v_cycle.chance_number = 2 THEN 'completed' ELSE chance_2_status END,
          updated_at = now()
      WHERE user_id = v_cycle.user_id;
    END IF;
  END LOOP;
END;
$function$;
