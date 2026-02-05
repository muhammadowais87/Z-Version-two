-- Add cycle_wallet_balance column to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS cycle_wallet_balance numeric NOT NULL DEFAULT 0;

-- Create function to transfer from main wallet to cycle wallet
CREATE OR REPLACE FUNCTION public.transfer_to_cycle_wallet(p_amount numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id UUID;
  v_wallet_balance NUMERIC;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;
  
  -- Get current wallet balance
  SELECT wallet_balance INTO v_wallet_balance
  FROM profiles WHERE id = v_user_id;
  
  IF v_wallet_balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient main wallet balance';
  END IF;
  
  -- Transfer amount
  UPDATE profiles
  SET wallet_balance = wallet_balance - p_amount,
      cycle_wallet_balance = cycle_wallet_balance + p_amount,
      updated_at = now()
  WHERE id = v_user_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'transferred', p_amount
  );
END;
$$;

-- Create function to transfer from cycle wallet back to main wallet
CREATE OR REPLACE FUNCTION public.transfer_to_main_wallet(p_amount numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id UUID;
  v_cycle_balance NUMERIC;
  v_active_cycles INTEGER;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;
  
  -- Check for active cycles - don't allow transfer if cycles are running
  SELECT COUNT(*) INTO v_active_cycles
  FROM ai_trade_cycles WHERE user_id = v_user_id AND status = 'active';
  
  IF v_active_cycles > 0 THEN
    RAISE EXCEPTION 'Cannot transfer while cycles are active';
  END IF;
  
  -- Get current cycle wallet balance
  SELECT cycle_wallet_balance INTO v_cycle_balance
  FROM profiles WHERE id = v_user_id;
  
  IF v_cycle_balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient cycle wallet balance';
  END IF;
  
  -- Transfer amount
  UPDATE profiles
  SET cycle_wallet_balance = cycle_wallet_balance - p_amount,
      wallet_balance = wallet_balance + p_amount,
      updated_at = now()
  WHERE id = v_user_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'transferred', p_amount
  );
END;
$$;

-- Update start_trade_cycle to use cycle_wallet_balance
CREATE OR REPLACE FUNCTION public.start_trade_cycle(p_cycle_type integer, p_amount numeric, p_chance_number integer DEFAULT 1)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id UUID;
  v_cycle_wallet_balance NUMERIC;
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
  
  -- Check CYCLE wallet balance (not main wallet)
  SELECT cycle_wallet_balance INTO v_cycle_wallet_balance
  FROM public.profiles
  WHERE id = v_user_id;
  
  IF v_cycle_wallet_balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient cycle wallet balance. Transfer funds from main wallet first.';
  END IF;
  
  v_cycle_duration := get_cycle_duration(p_cycle_type);
  v_time_unit := get_cycle_time_unit();
  
  IF v_time_unit = 'seconds' THEN
    v_end_date := now() + (v_cycle_duration || ' seconds')::INTERVAL;
  ELSE
    v_end_date := now() + (v_cycle_duration || ' days')::INTERVAL;
  END IF;
  
  -- Deduct from CYCLE wallet (not main wallet)
  UPDATE public.profiles
  SET cycle_wallet_balance = cycle_wallet_balance - p_amount,
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
$$;

-- Update add_investment_to_cycle to use cycle_wallet_balance
CREATE OR REPLACE FUNCTION public.add_investment_to_cycle(p_cycle_id uuid, p_amount numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id UUID;
  v_cycle RECORD;
  v_cycle_wallet_balance NUMERIC;
  v_new_investment jsonb;
BEGIN
  v_user_id := auth.uid();
  
  SELECT * INTO v_cycle FROM ai_trade_cycles 
  WHERE id = p_cycle_id AND user_id = v_user_id AND status = 'active';
  
  IF v_cycle IS NULL THEN
    RAISE EXCEPTION 'Active cycle not found';
  END IF;
  
  IF v_cycle.cycle_type != 1 THEN
    RAISE EXCEPTION 'Additional investments are only allowed in Cycle 1';
  END IF;
  
  -- Check CYCLE wallet balance
  SELECT cycle_wallet_balance INTO v_cycle_wallet_balance FROM profiles WHERE id = v_user_id;
  
  IF v_cycle_wallet_balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient cycle wallet balance';
  END IF;
  
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;
  
  -- Deduct from CYCLE wallet
  UPDATE profiles 
  SET cycle_wallet_balance = cycle_wallet_balance - p_amount,
      updated_at = now()
  WHERE id = v_user_id;
  
  v_new_investment := jsonb_build_object(
    'amount', p_amount,
    'added_at', now()
  );
  
  UPDATE ai_trade_cycles
  SET additional_investments = COALESCE(additional_investments, '[]'::jsonb) || v_new_investment,
      updated_at = now()
  WHERE id = p_cycle_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'amount_added', p_amount,
    'added_at', now()
  );
END;
$$;

-- Update withdraw_early_from_cycle to return to cycle wallet
CREATE OR REPLACE FUNCTION public.withdraw_early_from_cycle(p_cycle_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
  
  v_tax := v_current_value * (v_tax_rate / 100);
  v_final_amount := v_current_value - v_tax;
  
  IF v_cycle.cycle_type IN (1, 2, 3) THEN
    UPDATE public.user_trade_progress
    SET is_penalty_mode = true,
        penalty_chance = v_current_chance,
        updated_at = now()
    WHERE user_id = v_user_id;
    
    v_total_cycle_amount := v_cycle.investment_amount * 2;
    SELECT cycle_wallet_balance + v_final_amount INTO v_wallet_after FROM public.profiles WHERE id = v_user_id;
    
    IF v_wallet_after < (v_total_cycle_amount * 0.5) THEN
      v_unlock_next_chance := true;
    END IF;
  END IF;
  
  UPDATE public.ai_trade_cycles
  SET status = 'broken',
      current_profit = v_current_value - v_cycle.investment_amount,
      updated_at = now()
  WHERE id = p_cycle_id;
  
  -- Return to CYCLE wallet
  UPDATE public.profiles
  SET cycle_wallet_balance = cycle_wallet_balance + v_final_amount,
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
$$;

-- Update complete_trade_cycles to credit cycle wallet
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
BEGIN
  SELECT COALESCE((SELECT value::numeric FROM system_config WHERE key = 'profit_multiplier'), 2) INTO v_profit_multiplier;
  SELECT COALESCE((SELECT value::numeric FROM system_config WHERE key = 'penalty_daily_return'), 2) INTO v_penalty_return;
  SELECT get_cycle_time_unit() INTO v_time_unit;
  
  FOR v_cycle IN
    SELECT * FROM public.ai_trade_cycles
    WHERE status = 'active' AND end_date <= now()
  LOOP
    SELECT * INTO v_progress FROM public.user_trade_progress WHERE user_id = v_cycle.user_id;
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
      v_cycle.user_id, v_next_cycle_type, v_final_amount, v_next_end_date, v_cycle.chance_number, 'active'
    )
    RETURNING id INTO v_new_cycle_id;
    
    IF v_cycle.cycle_type = 4 THEN
      UPDATE public.user_trade_progress
      SET is_penalty_mode = false, last_50_percent_check = now(), updated_at = now()
      WHERE user_id = v_cycle.user_id;
    ELSE
      UPDATE public.user_trade_progress
      SET completed_cycles = array_append(COALESCE(completed_cycles, '{}'), v_cycle.cycle_type),
          is_penalty_mode = false, last_50_percent_check = now(), updated_at = now()
      WHERE user_id = v_cycle.user_id;
    END IF;
    
    UPDATE public.profiles
    SET total_profit = total_profit + v_profit, updated_at = now()
    WHERE id = v_cycle.user_id;
  END LOOP;
END;
$$;

-- Update complete_current_chance to return to cycle wallet
CREATE OR REPLACE FUNCTION public.complete_current_chance()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
  
  IF v_progress.penalty_chance = 2 THEN
    RAISE EXCEPTION 'Cannot complete chance. Penalty mode is permanent for Chance 2.';
  END IF;
  
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
    
    -- Return to CYCLE wallet and update profit
    UPDATE profiles
    SET cycle_wallet_balance = cycle_wallet_balance + v_current_value,
        total_profit = total_profit + (v_current_value - v_active_cycle.investment_amount),
        updated_at = now()
    WHERE id = v_user_id;
  END IF;
  
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
$$;

-- Update deactivate_chance to return to cycle wallet
CREATE OR REPLACE FUNCTION public.deactivate_chance(p_chance_number integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
    
    -- Return to CYCLE wallet
    UPDATE profiles
    SET cycle_wallet_balance = cycle_wallet_balance + v_current_value,
        updated_at = now()
    WHERE id = v_user_id;
  END IF;
  
  IF p_chance_number = 1 THEN
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
      'funds_returned', COALESCE(v_current_value, 0)
    );
  ELSE
    UPDATE user_trade_progress
    SET chance_2_status = 'disabled',
        active_chance = NULL,
        completed_cycles = '{}',
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
$$;