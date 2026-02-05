-- Update early withdrawal function to remove tax
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
  v_progress RECORD;
  v_wallet_after NUMERIC;
  v_total_cycle_amount NUMERIC;
  v_unlock_next_chance BOOLEAN := false;
  v_current_chance INTEGER;
  v_time_unit TEXT;
  v_penalty_return NUMERIC;
BEGIN
  v_user_id := auth.uid();
  
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
  ELSIF v_time_unit = 'minutes' THEN
    v_time_passed := EXTRACT(EPOCH FROM (now() - v_cycle.start_date)) / 60;
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
  
  -- No tax applied on early withdrawal anymore
  
  IF v_cycle.cycle_type IN (1, 2, 3) THEN
    UPDATE public.user_trade_progress
    SET is_penalty_mode = true,
        penalty_chance = v_current_chance,
        updated_at = now()
    WHERE user_id = v_user_id;
    
    v_total_cycle_amount := v_cycle.investment_amount * 2;
    SELECT cycle_wallet_balance + v_current_value INTO v_wallet_after FROM public.profiles WHERE id = v_user_id;
    
    IF v_wallet_after < (v_total_cycle_amount * 0.5) THEN
      v_unlock_next_chance := true;
    END IF;
  END IF;
  
  UPDATE public.ai_trade_cycles
  SET status = 'broken',
      current_profit = v_current_value - v_cycle.investment_amount,
      updated_at = now()
  WHERE id = p_cycle_id;
  
  UPDATE public.profiles
  SET cycle_wallet_balance = cycle_wallet_balance + v_current_value,
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
    'withdrawn_amount', v_current_value,
    'tax_applied', 0,
    'penalty_mode_activated', v_cycle.cycle_type IN (1, 2, 3),
    'next_chance_unlocked', v_unlock_next_chance,
    'penalty_chance', v_current_chance
  );
END;
$function$;

-- Update withdrawal RLS policy to apply 15% tax
DROP POLICY IF EXISTS "Users can create own withdrawals" ON withdrawals;

CREATE POLICY "Users can create own withdrawals" 
ON withdrawals 
FOR INSERT 
WITH CHECK (
  (auth.uid() = user_id) AND 
  (amount <= (
    SELECT (profiles.wallet_balance + COALESCE(profiles.referral_balance, (0)::numeric))
    FROM profiles
    WHERE (profiles.id = auth.uid())
  ))
);

-- Update system config to set withdrawal tax to 15%
UPDATE system_config SET value = '15' WHERE key = 'early_withdrawal_tax';

-- If doesn't exist, insert it as withdrawal_tax
INSERT INTO system_config (key, value, description)
VALUES ('withdrawal_tax', '15', 'Tax percentage applied on withdrawals')
ON CONFLICT (key) DO UPDATE SET value = '15';