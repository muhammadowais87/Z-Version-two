-- Add chance tracking to user_trade_progress
ALTER TABLE public.user_trade_progress 
ADD COLUMN IF NOT EXISTS active_chance INTEGER DEFAULT NULL,
ADD COLUMN IF NOT EXISTS chance_1_status TEXT DEFAULT 'available',
ADD COLUMN IF NOT EXISTS chance_2_status TEXT DEFAULT 'locked';

-- Add chance number to ai_trade_cycles to track which chance the cycle belongs to
ALTER TABLE public.ai_trade_cycles
ADD COLUMN IF NOT EXISTS chance_number INTEGER DEFAULT 1;

-- Create function to get chance status for a user
CREATE OR REPLACE FUNCTION public.get_chance_status(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_progress RECORD;
  v_active_cycle RECORD;
BEGIN
  -- Get or create user progress
  INSERT INTO public.user_trade_progress (user_id, active_chance, chance_1_status, chance_2_status)
  VALUES (p_user_id, NULL, 'available', 'locked')
  ON CONFLICT (user_id) DO NOTHING;
  
  SELECT * INTO v_progress FROM public.user_trade_progress WHERE user_id = p_user_id;
  
  -- Check for active cycle
  SELECT * INTO v_active_cycle FROM public.ai_trade_cycles 
  WHERE user_id = p_user_id AND status = 'active' LIMIT 1;
  
  RETURN jsonb_build_object(
    'active_chance', v_progress.active_chance,
    'chance_1_status', v_progress.chance_1_status,
    'chance_2_status', v_progress.chance_2_status,
    'has_active_cycle', v_active_cycle IS NOT NULL,
    'active_cycle_type', v_active_cycle.cycle_type,
    'is_special_cycle', v_active_cycle.cycle_type = 4
  );
END;
$$;

-- Update start_trade_cycle to include chance number
CREATE OR REPLACE FUNCTION public.start_trade_cycle(p_cycle_type integer, p_amount numeric, p_chance_number integer DEFAULT 1)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id UUID;
  v_wallet_balance NUMERIC;
  v_cycle_duration INTEGER;
  v_end_date TIMESTAMP WITH TIME ZONE;
  v_cycle_id UUID;
  v_progress RECORD;
BEGIN
  v_user_id := auth.uid();
  
  -- Get user progress
  SELECT * INTO v_progress FROM public.user_trade_progress WHERE user_id = v_user_id;
  
  -- Validate chance availability
  IF p_chance_number = 1 AND v_progress.chance_1_status NOT IN ('available', 'active') THEN
    RAISE EXCEPTION 'Chance 1 is not available';
  END IF;
  
  IF p_chance_number = 2 AND v_progress.chance_2_status NOT IN ('available', 'active') THEN
    RAISE EXCEPTION 'Chance 2 is not available';
  END IF;
  
  IF NOT can_start_cycle(v_user_id, p_cycle_type) THEN
    RAISE EXCEPTION 'Cannot start this cycle. Complete previous cycles first or finish active cycle.';
  END IF;
  
  -- Check wallet balance
  SELECT wallet_balance INTO v_wallet_balance
  FROM public.profiles
  WHERE id = v_user_id;
  
  IF v_wallet_balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient wallet balance';
  END IF;
  
  -- Get cycle duration
  v_cycle_duration := get_cycle_duration(p_cycle_type);
  v_end_date := now() + (v_cycle_duration || ' days')::INTERVAL;
  
  -- Deduct from wallet
  UPDATE public.profiles
  SET wallet_balance = wallet_balance - p_amount,
      updated_at = now()
  WHERE id = v_user_id;
  
  -- Create cycle with chance number
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
  
  -- Update user progress with active chance
  UPDATE public.user_trade_progress
  SET active_chance = p_chance_number,
      chance_1_status = CASE WHEN p_chance_number = 1 THEN 'active' ELSE chance_1_status END,
      chance_2_status = CASE WHEN p_chance_number = 2 THEN 'active' ELSE chance_2_status END,
      updated_at = now()
  WHERE user_id = v_user_id;
  
  RETURN v_cycle_id;
END;
$$;

-- Update withdraw function to handle chance rules
CREATE OR REPLACE FUNCTION public.withdraw_early_from_cycle(p_cycle_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id UUID;
  v_cycle RECORD;
  v_days_passed NUMERIC;
  v_current_value NUMERIC;
  v_tax NUMERIC := 0;
  v_final_amount NUMERIC;
  v_progress RECORD;
  v_wallet_after NUMERIC;
  v_total_cycle_amount NUMERIC;
  v_unlock_next_chance BOOLEAN := false;
  v_current_chance INTEGER;
BEGIN
  v_user_id := auth.uid();
  
  -- Get cycle
  SELECT * INTO v_cycle
  FROM public.ai_trade_cycles
  WHERE id = p_cycle_id AND user_id = v_user_id AND status = 'active';
  
  IF v_cycle IS NULL THEN
    RAISE EXCEPTION 'Cycle not found or already completed';
  END IF;
  
  -- Calculate days passed
  v_days_passed := EXTRACT(EPOCH FROM (now() - v_cycle.start_date)) / 86400;
  
  -- Get user progress
  SELECT * INTO v_progress
  FROM public.user_trade_progress
  WHERE user_id = v_user_id;
  
  v_current_chance := v_cycle.chance_number;
  
  -- Calculate current value based on penalty mode
  IF v_progress.is_penalty_mode THEN
    v_current_value := v_cycle.investment_amount * (1 + (0.02 * v_days_passed));
  ELSE
    v_current_value := v_cycle.investment_amount * (1 + (v_days_passed / get_cycle_duration(v_cycle.cycle_type)));
  END IF;
  
  -- Apply tax for cycles 1, 2, 3 (not special cycle 4)
  IF v_cycle.cycle_type IN (1, 2, 3) THEN
    v_tax := v_current_value * 0.18;
    v_final_amount := v_current_value - v_tax;
    
    -- Set penalty mode
    UPDATE public.user_trade_progress
    SET is_penalty_mode = true,
        updated_at = now()
    WHERE user_id = v_user_id;
    
    -- Check if this triggers next chance unlock (withdrawn leaving less than 50%)
    v_total_cycle_amount := v_cycle.investment_amount * 2; -- Expected final amount
    SELECT wallet_balance + v_final_amount INTO v_wallet_after FROM public.profiles WHERE id = v_user_id;
    
    IF v_wallet_after < (v_total_cycle_amount * 0.5) THEN
      v_unlock_next_chance := true;
    END IF;
  ELSE
    -- Special cycle: no tax, just restart, chance stays active
    v_final_amount := v_current_value;
  END IF;
  
  -- Update cycle as broken
  UPDATE public.ai_trade_cycles
  SET status = 'broken',
      current_profit = v_current_value - v_cycle.investment_amount,
      updated_at = now()
  WHERE id = p_cycle_id;
  
  -- Add to wallet
  UPDATE public.profiles
  SET wallet_balance = wallet_balance + v_final_amount,
      updated_at = now()
  WHERE id = v_user_id;
  
  -- Update chance status based on rules
  IF v_cycle.cycle_type = 4 THEN
    -- Special cycle: chance remains active
    UPDATE public.user_trade_progress
    SET active_chance = NULL,
        updated_at = now()
    WHERE user_id = v_user_id;
  ELSIF v_unlock_next_chance THEN
    -- Unlock next chance, disable current
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
    -- Normal break without full withdrawal - chance stays active for retry
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
$$;

-- Update complete_trade_cycles to handle chance completion
CREATE OR REPLACE FUNCTION public.complete_trade_cycles()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_cycle RECORD;
  v_final_amount NUMERIC;
  v_profit NUMERIC;
  v_progress RECORD;
BEGIN
  FOR v_cycle IN
    SELECT * FROM public.ai_trade_cycles
    WHERE status = 'active' AND end_date <= now()
  LOOP
    -- Check if user is in penalty mode
    SELECT * INTO v_progress
    FROM public.user_trade_progress
    WHERE user_id = v_cycle.user_id;
    
    IF v_progress.is_penalty_mode THEN
      v_profit := v_cycle.investment_amount * 0.02 * get_cycle_duration(v_cycle.cycle_type);
      v_final_amount := v_cycle.investment_amount + v_profit;
    ELSE
      v_final_amount := v_cycle.investment_amount * 2;
      v_profit := v_cycle.investment_amount;
    END IF;
    
    -- Update cycle
    UPDATE public.ai_trade_cycles
    SET status = 'completed',
        current_profit = v_profit,
        updated_at = now()
    WHERE id = v_cycle.id;
    
    -- Add to wallet
    UPDATE public.profiles
    SET wallet_balance = wallet_balance + v_final_amount,
        updated_at = now()
    WHERE id = v_cycle.user_id;
    
    -- Update user progress and chance status
    IF v_cycle.cycle_type = 4 THEN
      -- Special cycle: chance stays active, cycle auto-restarts conceptually
      UPDATE public.user_trade_progress
      SET completed_cycles = array_append(COALESCE(completed_cycles, '{}'), v_cycle.cycle_type),
          is_penalty_mode = false,
          last_50_percent_check = now(),
          active_chance = NULL, -- Ready for next cycle on same chance
          updated_at = now()
      WHERE user_id = v_cycle.user_id;
    ELSE
      -- Normal cycle completion
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
$$;