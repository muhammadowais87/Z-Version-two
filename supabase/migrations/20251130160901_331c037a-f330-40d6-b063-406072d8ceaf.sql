-- Create AI trade cycles table
CREATE TABLE public.ai_trade_cycles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  cycle_type INTEGER NOT NULL CHECK (cycle_type IN (1, 2, 3, 4)),
  investment_amount NUMERIC NOT NULL CHECK (investment_amount > 0),
  start_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  end_date TIMESTAMP WITH TIME ZONE NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'broken')),
  current_profit NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create user trade progress table to track completed cycles and penalties
CREATE TABLE public.user_trade_progress (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  completed_cycles INTEGER[] NOT NULL DEFAULT '{}',
  is_penalty_mode BOOLEAN NOT NULL DEFAULT false,
  last_50_percent_check TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ai_trade_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_trade_progress ENABLE ROW LEVEL SECURITY;

-- RLS policies for ai_trade_cycles
CREATE POLICY "Users can view own trade cycles"
ON public.ai_trade_cycles FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own trade cycles"
ON public.ai_trade_cycles FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own trade cycles"
ON public.ai_trade_cycles FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all trade cycles"
ON public.ai_trade_cycles FOR SELECT
USING (has_role(auth.uid(), 'admin'));

-- RLS policies for user_trade_progress
CREATE POLICY "Users can view own trade progress"
ON public.user_trade_progress FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own trade progress"
ON public.user_trade_progress FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own trade progress"
ON public.user_trade_progress FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all trade progress"
ON public.user_trade_progress FOR SELECT
USING (has_role(auth.uid(), 'admin'));

-- Trigger to update updated_at
CREATE TRIGGER update_ai_trade_cycles_updated_at
BEFORE UPDATE ON public.ai_trade_cycles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_user_trade_progress_updated_at
BEFORE UPDATE ON public.user_trade_progress
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Function to get cycle duration in days
CREATE OR REPLACE FUNCTION public.get_cycle_duration(cycle_type INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  CASE cycle_type
    WHEN 1 THEN RETURN 25;
    WHEN 2 THEN RETURN 18;
    WHEN 3 THEN RETURN 14;
    WHEN 4 THEN RETURN 14; -- Special cycle
    ELSE RAISE EXCEPTION 'Invalid cycle type';
  END CASE;
END;
$$;

-- Function to check if user can start a cycle
CREATE OR REPLACE FUNCTION public.can_start_cycle(p_user_id UUID, p_cycle_type INTEGER)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  
  -- Cycle 1 is always available
  IF p_cycle_type = 1 THEN
    RETURN true;
  END IF;
  
  -- Get completed cycles
  SELECT COALESCE(completed_cycles, '{}') INTO v_completed_cycles
  FROM public.user_trade_progress
  WHERE user_id = p_user_id;
  
  -- Check unlock conditions
  IF p_cycle_type = 2 THEN
    RETURN 1 = ANY(v_completed_cycles);
  ELSIF p_cycle_type = 3 THEN
    RETURN 1 = ANY(v_completed_cycles) AND 2 = ANY(v_completed_cycles);
  ELSIF p_cycle_type = 4 THEN
    -- Special cycle requires all 3 main cycles
    RETURN 1 = ANY(v_completed_cycles) AND 2 = ANY(v_completed_cycles) AND 3 = ANY(v_completed_cycles);
  END IF;
  
  RETURN false;
END;
$$;

-- Function to start a trade cycle
CREATE OR REPLACE FUNCTION public.start_trade_cycle(p_cycle_type INTEGER, p_amount NUMERIC)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_wallet_balance NUMERIC;
  v_cycle_duration INTEGER;
  v_end_date TIMESTAMP WITH TIME ZONE;
  v_cycle_id UUID;
BEGIN
  v_user_id := auth.uid();
  
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
  
  -- Create cycle
  INSERT INTO public.ai_trade_cycles (
    user_id,
    cycle_type,
    investment_amount,
    end_date
  )
  VALUES (
    v_user_id,
    p_cycle_type,
    p_amount,
    v_end_date
  )
  RETURNING id INTO v_cycle_id;
  
  -- Initialize user progress if not exists
  INSERT INTO public.user_trade_progress (user_id)
  VALUES (v_user_id)
  ON CONFLICT (user_id) DO NOTHING;
  
  RETURN v_cycle_id;
END;
$$;

-- Function to complete a trade cycle (called by cron or manually)
CREATE OR REPLACE FUNCTION public.complete_trade_cycles()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
      -- 2% daily return
      v_profit := v_cycle.investment_amount * 0.02 * get_cycle_duration(v_cycle.cycle_type);
      v_final_amount := v_cycle.investment_amount + v_profit;
    ELSE
      -- Double the investment
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
    
    -- Update user progress
    UPDATE public.user_trade_progress
    SET completed_cycles = array_append(
          COALESCE(completed_cycles, '{}'),
          v_cycle.cycle_type
        ),
        is_penalty_mode = false,
        last_50_percent_check = now(),
        updated_at = now()
    WHERE user_id = v_cycle.user_id;
  END LOOP;
END;
$$;

-- Function to withdraw early from a cycle
CREATE OR REPLACE FUNCTION public.withdraw_early_from_cycle(p_cycle_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_cycle RECORD;
  v_days_passed NUMERIC;
  v_current_value NUMERIC;
  v_tax NUMERIC := 0;
  v_final_amount NUMERIC;
  v_progress RECORD;
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
  
  -- Calculate current value based on penalty mode
  IF v_progress.is_penalty_mode THEN
    -- 2% daily return
    v_current_value := v_cycle.investment_amount * (1 + (0.02 * v_days_passed));
  ELSE
    -- Linear growth to 2x
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
  ELSE
    -- Special cycle: no tax, just restart
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
  
  RETURN jsonb_build_object(
    'withdrawn_amount', v_final_amount,
    'tax_applied', v_tax,
    'penalty_mode_activated', v_cycle.cycle_type IN (1, 2, 3)
  );
END;
$$;