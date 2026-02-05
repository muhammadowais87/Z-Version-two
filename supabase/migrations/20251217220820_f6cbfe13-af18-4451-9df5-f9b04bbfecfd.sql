-- Fix get_direct_depositors_count to work with MyPayVerse deposits
-- Check total_deposits in profiles instead of deposits table

CREATE OR REPLACE FUNCTION public.get_direct_depositors_count(p_user_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count INTEGER;
BEGIN
  -- Count direct referrals (level 1) who have made any deposit
  -- Check total_deposits > 0 in profiles (works with MyPayVerse auto-deposits)
  SELECT COUNT(DISTINCT r.referred_id) INTO v_count
  FROM referrals r
  INNER JOIN profiles p ON p.id = r.referred_id AND p.total_deposits > 0
  WHERE r.referrer_id = p_user_id AND r.level = 1;
  
  RETURN COALESCE(v_count, 0);
END;
$function$;

-- Restore level unlock requirement in referral commission distribution
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
  v_referrer_direct_depositors INTEGER;
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
  
  -- Loop through all referrers (up to 5 levels)
  FOR v_referral IN 
    SELECT r.referrer_id, r.level
    FROM referrals r
    WHERE r.referred_id = NEW.user_id
    ORDER BY r.level ASC
  LOOP
    -- Check if referrer has unlocked this level (requires X direct depositors for level X)
    v_referrer_direct_depositors := get_direct_depositors_count(v_referral.referrer_id);
    
    -- Level X requires X direct depositors to unlock
    IF v_referrer_direct_depositors < v_referral.level THEN
      CONTINUE; -- Skip this level, not unlocked
    END IF;
    
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