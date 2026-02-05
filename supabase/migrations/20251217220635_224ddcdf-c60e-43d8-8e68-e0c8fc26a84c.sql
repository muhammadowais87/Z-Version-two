-- Update the distribute_referral_commissions_on_profit trigger to always distribute commissions
-- Remove the level unlock requirement and keep the $30 cap

CREATE OR REPLACE FUNCTION public.distribute_referral_commissions_on_profit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_referral RECORD;
  v_commission_percent NUMERIC;
  v_commission_amount NUMERIC;
  v_max_commission NUMERIC;
  v_profit_amount NUMERIC;
BEGIN
  -- Only process when cycle is being completed
  IF NEW.status != 'completed' OR OLD.status = 'completed' THEN
    RETURN NEW;
  END IF;
  
  v_profit_amount := NEW.current_profit;
  
  IF v_profit_amount <= 0 THEN
    RETURN NEW;
  END IF;
  
  -- Get max commission cap (default $30)
  SELECT COALESCE((SELECT value::numeric FROM system_config WHERE key = 'referral_max_profit_commission'), 30) INTO v_max_commission;
  
  -- Loop through all referrers (up to 5 levels) - NO LEVEL UNLOCK CHECK
  FOR v_referral IN 
    SELECT r.referrer_id, r.level
    FROM referrals r
    WHERE r.referred_id = NEW.user_id
    ORDER BY r.level ASC
  LOOP
    -- Get commission percentage for this level
    CASE v_referral.level
      WHEN 1 THEN 
        SELECT COALESCE((SELECT value::numeric FROM system_config WHERE key = 'referral_level_1_percent'), 10) INTO v_commission_percent;
      WHEN 2 THEN 
        SELECT COALESCE((SELECT value::numeric FROM system_config WHERE key = 'referral_level_2_percent'), 4) INTO v_commission_percent;
      WHEN 3 THEN 
        SELECT COALESCE((SELECT value::numeric FROM system_config WHERE key = 'referral_level_3_percent'), 2) INTO v_commission_percent;
      WHEN 4 THEN 
        SELECT COALESCE((SELECT value::numeric FROM system_config WHERE key = 'referral_level_4_percent'), 1) INTO v_commission_percent;
      WHEN 5 THEN 
        SELECT COALESCE((SELECT value::numeric FROM system_config WHERE key = 'referral_level_5_percent'), 1) INTO v_commission_percent;
      ELSE
        v_commission_percent := 0;
    END CASE;
    
    -- Calculate commission amount
    v_commission_amount := v_profit_amount * (v_commission_percent / 100);
    
    -- Apply $30 cap - if commission > max, set it to max
    IF v_commission_amount > v_max_commission THEN
      v_commission_amount := v_max_commission;
    END IF;
    
    IF v_commission_amount > 0 THEN
      -- Add commission to referrer's referral_balance
      UPDATE profiles
      SET referral_balance = COALESCE(referral_balance, 0) + v_commission_amount,
          total_referral_earnings = COALESCE(total_referral_earnings, 0) + v_commission_amount,
          updated_at = now()
      WHERE id = v_referral.referrer_id;
      
      -- Log the earnings in history
      INSERT INTO referral_earnings_history (
        referrer_id, referred_id, amount, commission_percent, 
        source_type, source_amount, referral_level
      ) VALUES (
        v_referral.referrer_id, NEW.user_id, v_commission_amount, 
        v_commission_percent, 'profit', v_profit_amount, v_referral.level
      );
    END IF;
  END LOOP;
  
  RETURN NEW;
END;
$function$;