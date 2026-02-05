-- Update get_cycle_duration to return seconds matching original day values
CREATE OR REPLACE FUNCTION public.get_cycle_duration(cycle_type integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- TESTING MODE: Returns seconds (matching original day values)
  CASE cycle_type
    WHEN 1 THEN RETURN 25;  -- 25 seconds (was 25 days)
    WHEN 2 THEN RETURN 18;  -- 18 seconds (was 18 days)
    WHEN 3 THEN RETURN 14;  -- 14 seconds (was 14 days)
    WHEN 4 THEN RETURN 14;  -- 14 seconds (was 14 days)
    ELSE RAISE EXCEPTION 'Invalid cycle type';
  END CASE;
END;
$function$;

-- Update start_trade_cycle to use seconds interval
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
  -- TESTING: Use seconds instead of days
  v_end_date := now() + (v_cycle_duration || ' seconds')::INTERVAL;
  
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