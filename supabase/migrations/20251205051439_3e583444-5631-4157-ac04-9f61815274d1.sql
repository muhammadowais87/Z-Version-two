
-- Update can_start_cycle to lock completed cycles (only next cycle available, Special repeats)
CREATE OR REPLACE FUNCTION public.can_start_cycle(p_user_id uuid, p_cycle_type integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_active_cycles INTEGER;
  v_completed_cycles INTEGER[];
BEGIN
  -- Check if user has any active cycle
  SELECT COUNT(*) INTO v_active_cycles
  FROM public.ai_trade_cycles
  WHERE user_id = p_user_id AND status = 'active';
  
  IF v_active_cycles > 0 THEN
    RETURN false;
  END IF;
  
  -- Get completed cycles
  SELECT COALESCE(completed_cycles, '{}') INTO v_completed_cycles
  FROM public.user_trade_progress
  WHERE user_id = p_user_id;
  
  -- Cycle 1: Only available if NOT completed yet
  IF p_cycle_type = 1 THEN
    RETURN NOT (1 = ANY(v_completed_cycles));
  END IF;
  
  -- Cycle 2: Only available if Cycle 1 completed AND Cycle 2 NOT completed
  IF p_cycle_type = 2 THEN
    RETURN (1 = ANY(v_completed_cycles)) AND NOT (2 = ANY(v_completed_cycles));
  END IF;
  
  -- Cycle 3: Only available if Cycle 2 completed AND Cycle 3 NOT completed
  IF p_cycle_type = 3 THEN
    RETURN (2 = ANY(v_completed_cycles)) AND NOT (3 = ANY(v_completed_cycles));
  END IF;
  
  -- Special cycle (4): Available after all 3 completed, CAN REPEAT
  IF p_cycle_type = 4 THEN
    RETURN (1 = ANY(v_completed_cycles)) AND (2 = ANY(v_completed_cycles)) AND (3 = ANY(v_completed_cycles));
  END IF;
  
  RETURN false;
END;
$function$;
