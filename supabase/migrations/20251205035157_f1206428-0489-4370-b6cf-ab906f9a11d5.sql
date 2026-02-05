-- Insert default cycle system configuration
INSERT INTO public.system_config (key, value, description) VALUES
  ('cycle_time_unit', 'seconds', 'Time unit for cycle durations: seconds or days'),
  ('cycle_1_duration', '25', 'Duration for Cycle 1'),
  ('cycle_2_duration', '18', 'Duration for Cycle 2'),
  ('cycle_3_duration', '14', 'Duration for Cycle 3'),
  ('cycle_4_duration', '14', 'Duration for Special Cycle'),
  ('profit_multiplier', '2', 'Profit multiplier (2 = 100% profit, doubles investment)'),
  ('early_withdrawal_tax', '18', 'Tax percentage for early withdrawal on cycles 1-3'),
  ('penalty_daily_return', '2', 'Daily/per-second return percentage in penalty mode')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- Create function to get cycle duration with configurable settings
CREATE OR REPLACE FUNCTION public.get_cycle_duration(cycle_type integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_duration integer;
BEGIN
  CASE cycle_type
    WHEN 1 THEN SELECT value::integer INTO v_duration FROM system_config WHERE key = 'cycle_1_duration';
    WHEN 2 THEN SELECT value::integer INTO v_duration FROM system_config WHERE key = 'cycle_2_duration';
    WHEN 3 THEN SELECT value::integer INTO v_duration FROM system_config WHERE key = 'cycle_3_duration';
    WHEN 4 THEN SELECT value::integer INTO v_duration FROM system_config WHERE key = 'cycle_4_duration';
    ELSE RAISE EXCEPTION 'Invalid cycle type';
  END CASE;
  
  -- Default values if not found
  IF v_duration IS NULL THEN
    CASE cycle_type
      WHEN 1 THEN v_duration := 25;
      WHEN 2 THEN v_duration := 18;
      WHEN 3 THEN v_duration := 14;
      WHEN 4 THEN v_duration := 14;
    END CASE;
  END IF;
  
  RETURN v_duration;
END;
$function$;

-- Create function to get time unit setting
CREATE OR REPLACE FUNCTION public.get_cycle_time_unit()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT value FROM system_config WHERE key = 'cycle_time_unit'),
    'days'
  );
$function$;

-- Update start_trade_cycle to use configurable time unit
CREATE OR REPLACE FUNCTION public.start_trade_cycle(p_cycle_type integer, p_amount numeric, p_chance_number integer DEFAULT 1)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id UUID;
  v_wallet_balance NUMERIC;
  v_cycle_duration INTEGER;
  v_time_unit TEXT;
  v_end_date TIMESTAMP WITH TIME ZONE;
  v_cycle_id UUID;
  v_progress RECORD;
BEGIN
  v_user_id := auth.uid();
  
  SELECT * INTO v_progress FROM public.user_trade_progress WHERE user_id = v_user_id;
  
  IF v_progress IS NOT NULL THEN
    IF p_chance_number = 1 AND v_progress.chance_1_status NOT IN ('available', 'active') THEN
      RAISE EXCEPTION 'Chance 1 is not available';
    END IF;
    
    IF p_chance_number = 2 AND v_progress.chance_2_status NOT IN ('available', 'active') THEN
      RAISE EXCEPTION 'Chance 2 is not available';
    END IF;
  END IF;
  
  IF NOT can_start_cycle(v_user_id, p_cycle_type) THEN
    RAISE EXCEPTION 'Cannot start this cycle. Complete previous cycles first or finish active cycle.';
  END IF;
  
  SELECT wallet_balance INTO v_wallet_balance
  FROM public.profiles
  WHERE id = v_user_id;
  
  IF v_wallet_balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient wallet balance';
  END IF;
  
  v_cycle_duration := get_cycle_duration(p_cycle_type);
  v_time_unit := get_cycle_time_unit();
  
  -- Calculate end date based on time unit
  IF v_time_unit = 'seconds' THEN
    v_end_date := now() + (v_cycle_duration || ' seconds')::INTERVAL;
  ELSE
    v_end_date := now() + (v_cycle_duration || ' days')::INTERVAL;
  END IF;
  
  UPDATE public.profiles
  SET wallet_balance = wallet_balance - p_amount,
      updated_at = now()
  WHERE id = v_user_id;
  
  INSERT INTO public.ai_trade_cycles (
    user_id,
    cycle_type,
    investment_amount,
    end_date,
    chance_number
  )
  VALUES (
    v_user_id,
    p_cycle_type,
    p_amount,
    v_end_date,
    p_chance_number
  )
  RETURNING id INTO v_cycle_id;
  
  INSERT INTO public.user_trade_progress (user_id, active_chance, chance_1_status, chance_2_status)
  VALUES (
    v_user_id, 
    p_chance_number,
    CASE WHEN p_chance_number = 1 THEN 'active' ELSE 'available' END,
    CASE WHEN p_chance_number = 2 THEN 'active' ELSE 'locked' END
  )
  ON CONFLICT (user_id) DO UPDATE SET
    active_chance = p_chance_number,
    chance_1_status = CASE WHEN p_chance_number = 1 THEN 'active' ELSE user_trade_progress.chance_1_status END,
    chance_2_status = CASE WHEN p_chance_number = 2 THEN 'active' ELSE user_trade_progress.chance_2_status END,
    updated_at = now();
  
  RETURN v_cycle_id;
END;
$function$;

-- Update complete_trade_cycles to use configurable settings
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
      -- Penalty mode: return based on config
      v_profit := v_cycle.investment_amount * (v_penalty_return / 100) * get_cycle_duration(v_cycle.cycle_type);
      v_final_amount := v_cycle.investment_amount + v_profit;
    ELSE
      -- Normal mode: use profit multiplier
      v_final_amount := v_cycle.investment_amount * v_profit_multiplier;
      v_profit := v_cycle.investment_amount * (v_profit_multiplier - 1);
    END IF;
    
    UPDATE public.ai_trade_cycles
    SET status = 'completed',
        current_profit = v_profit,
        updated_at = now()
    WHERE id = v_cycle.id;
    
    UPDATE public.profiles
    SET wallet_balance = wallet_balance + v_final_amount,
        updated_at = now()
    WHERE id = v_cycle.user_id;
    
    IF v_cycle.cycle_type = 4 THEN
      UPDATE public.user_trade_progress
      SET completed_cycles = array_append(COALESCE(completed_cycles, '{}'), v_cycle.cycle_type),
          is_penalty_mode = false,
          last_50_percent_check = now(),
          active_chance = NULL,
          updated_at = now()
      WHERE user_id = v_cycle.user_id;
    ELSE
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

-- Update withdraw_early_from_cycle to use configurable tax
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
  
  -- Get configurable settings
  SELECT COALESCE((SELECT value::numeric FROM system_config WHERE key = 'early_withdrawal_tax'), 18) INTO v_tax_rate;
  SELECT COALESCE((SELECT value::numeric FROM system_config WHERE key = 'penalty_daily_return'), 2) INTO v_penalty_return;
  SELECT get_cycle_time_unit() INTO v_time_unit;
  
  SELECT * INTO v_cycle
  FROM public.ai_trade_cycles
  WHERE id = p_cycle_id AND user_id = v_user_id AND status = 'active';
  
  IF v_cycle IS NULL THEN
    RAISE EXCEPTION 'Cycle not found or already completed';
  END IF;
  
  -- Calculate time passed based on time unit
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
    
    UPDATE public.user_trade_progress
    SET is_penalty_mode = true,
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
    'next_chance_unlocked', v_unlock_next_chance
  );
END;
$function$;

-- Allow admins to read all config
DROP POLICY IF EXISTS "Users can view public config, admins can view all" ON public.system_config;
CREATE POLICY "Users can view public config, admins can view all" 
ON public.system_config 
FOR SELECT 
USING (has_role(auth.uid(), 'admin'::app_role) OR (key = ANY (ARRAY['admin_wallet_address'::text, 'telegram_bot_username'::text])));