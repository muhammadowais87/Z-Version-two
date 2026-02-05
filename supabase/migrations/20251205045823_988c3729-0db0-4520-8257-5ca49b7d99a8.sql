
-- Update complete_trade_cycles: Special cycle repeats, doesn't auto-complete chance
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
BEGIN
  SELECT COALESCE((SELECT value::numeric FROM system_config WHERE key = 'profit_multiplier'), 2) INTO v_profit_multiplier;
  SELECT COALESCE((SELECT value::numeric FROM system_config WHERE key = 'penalty_daily_return'), 2) INTO v_penalty_return;
  
  FOR v_cycle IN
    SELECT * FROM public.ai_trade_cycles
    WHERE status = 'active' AND end_date <= now()
  LOOP
    SELECT * INTO v_progress FROM public.user_trade_progress WHERE user_id = v_cycle.user_id;
    
    IF v_progress.is_penalty_mode THEN
      v_profit := v_cycle.investment_amount * (v_penalty_return / 100) * get_cycle_duration(v_cycle.cycle_type);
      v_final_amount := v_cycle.investment_amount + v_profit;
    ELSE
      v_final_amount := v_cycle.investment_amount * v_profit_multiplier;
      v_profit := v_cycle.investment_amount * (v_profit_multiplier - 1);
    END IF;
    
    UPDATE public.ai_trade_cycles
    SET status = 'completed', current_profit = v_profit, updated_at = now()
    WHERE id = v_cycle.id;
    
    UPDATE public.profiles
    SET wallet_balance = wallet_balance + v_final_amount,
        total_profit = total_profit + v_profit,
        updated_at = now()
    WHERE id = v_cycle.user_id;
    
    IF v_cycle.cycle_type = 4 THEN
      -- Special cycle: Keep all cycles unlocked (1,2,3 in completed), chance stays available
      -- User can repeat Special or choose to complete chance manually
      UPDATE public.user_trade_progress
      SET is_penalty_mode = false,
          last_50_percent_check = now(),
          active_chance = NULL,
          -- Keep chance available so user can repeat Special or complete it
          chance_1_status = CASE WHEN v_cycle.chance_number = 1 THEN 'available' ELSE chance_1_status END,
          chance_2_status = CASE WHEN v_cycle.chance_number = 2 THEN 'available' ELSE chance_2_status END,
          updated_at = now()
      WHERE user_id = v_cycle.user_id;
    ELSE
      -- Regular cycle: add to completed, keep chance available
      UPDATE public.user_trade_progress
      SET completed_cycles = array_append(COALESCE(completed_cycles, '{}'), v_cycle.cycle_type),
          is_penalty_mode = false,
          last_50_percent_check = now(),
          active_chance = NULL,
          chance_1_status = CASE WHEN v_cycle.chance_number = 1 THEN 'available' ELSE chance_1_status END,
          chance_2_status = CASE WHEN v_cycle.chance_number = 2 THEN 'available' ELSE chance_2_status END,
          updated_at = now()
      WHERE user_id = v_cycle.user_id;
    END IF;
  END LOOP;
END;
$function$;

-- Create function to manually complete a chance (called when user wants to finish their chance)
CREATE OR REPLACE FUNCTION public.complete_current_chance()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id UUID;
  v_progress RECORD;
  v_has_active_cycle BOOLEAN;
BEGIN
  v_user_id := auth.uid();
  
  -- Check for active cycle
  SELECT EXISTS(SELECT 1 FROM ai_trade_cycles WHERE user_id = v_user_id AND status = 'active') INTO v_has_active_cycle;
  IF v_has_active_cycle THEN
    RAISE EXCEPTION 'Cannot complete chance while a cycle is active';
  END IF;
  
  SELECT * INTO v_progress FROM user_trade_progress WHERE user_id = v_user_id;
  
  IF v_progress IS NULL THEN
    RAISE EXCEPTION 'No trade progress found';
  END IF;
  
  -- Check if user has completed all cycles including Special (1,2,3 must be in completed_cycles)
  IF NOT (1 = ANY(v_progress.completed_cycles) AND 2 = ANY(v_progress.completed_cycles) AND 3 = ANY(v_progress.completed_cycles)) THEN
    RAISE EXCEPTION 'Must complete all cycles through Special before completing chance';
  END IF;
  
  -- Complete the current available chance and unlock next
  IF v_progress.chance_1_status = 'available' THEN
    UPDATE user_trade_progress
    SET completed_cycles = '{}',
        chance_1_status = 'completed',
        chance_2_status = 'available',
        updated_at = now()
    WHERE user_id = v_user_id;
    
    RETURN jsonb_build_object('success', true, 'completed_chance', 1, 'next_chance_unlocked', 2);
  ELSIF v_progress.chance_2_status = 'available' THEN
    UPDATE user_trade_progress
    SET completed_cycles = '{}',
        chance_2_status = 'completed',
        updated_at = now()
    WHERE user_id = v_user_id;
    
    RETURN jsonb_build_object('success', true, 'completed_chance', 2, 'all_chances_completed', true);
  ELSE
    RAISE EXCEPTION 'No available chance to complete';
  END IF;
END;
$function$;
