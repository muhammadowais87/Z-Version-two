
-- Fix: Remove $30 cap from deposit commissions (cap only applies to profit commissions)
CREATE OR REPLACE FUNCTION public.distribute_referral_commissions_on_deposit_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_referral RECORD;
  v_commission_percent NUMERIC;
  v_commission_amount NUMERIC;
  v_deposit_increase NUMERIC;
  v_referrer_direct_depositors INTEGER;
BEGIN
  -- Only process when total_deposits increases
  IF NEW.total_deposits <= OLD.total_deposits THEN
    RETURN NEW;
  END IF;
  
  v_deposit_increase := NEW.total_deposits - OLD.total_deposits;
  
  IF v_deposit_increase <= 0 THEN
    RETURN NEW;
  END IF;
  
  -- Loop through all referrers (up to 5 levels)
  FOR v_referral IN 
    SELECT r.referrer_id, r.level
    FROM referrals r
    WHERE r.referred_id = NEW.id
    ORDER BY r.level ASC
  LOOP
    -- Check if referrer has unlocked this level
    v_referrer_direct_depositors := get_direct_depositors_count(v_referral.referrer_id);
    
    IF v_referrer_direct_depositors < v_referral.level THEN
      CONTINUE;
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
    
    -- Calculate commission - NO CAP for deposit commissions
    v_commission_amount := v_deposit_increase * (v_commission_percent / 100);
    
    IF v_commission_amount > 0 THEN
      -- Add commission to referrer's referral_balance
      UPDATE profiles
      SET referral_balance = COALESCE(referral_balance, 0) + v_commission_amount,
          total_referral_earnings = COALESCE(total_referral_earnings, 0) + v_commission_amount,
          updated_at = now()
      WHERE id = v_referral.referrer_id;
      
      -- Log the earnings
      INSERT INTO referral_earnings_history (
        referrer_id, referred_id, amount, commission_percent, 
        source_type, source_amount, referral_level
      ) VALUES (
        v_referral.referrer_id, NEW.id, v_commission_amount, 
        v_commission_percent, 'deposit', v_deposit_increase, v_referral.level
      );
    END IF;
  END LOOP;
  
  RETURN NEW;
END;
$function$;

-- Also fix the deposit trigger function (for manual deposits)
CREATE OR REPLACE FUNCTION public.distribute_referral_commissions_on_deposit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_referral RECORD;
  v_commission_percent NUMERIC;
  v_commission_amount NUMERIC;
  v_deposit_amount NUMERIC;
  v_referrer_direct_depositors INTEGER;
BEGIN
  IF NEW.status != 'approved' OR OLD.status = 'approved' THEN
    RETURN NEW;
  END IF;
  
  v_deposit_amount := NEW.amount;
  
  FOR v_referral IN 
    SELECT r.referrer_id, r.level
    FROM referrals r
    WHERE r.referred_id = NEW.user_id
    ORDER BY r.level ASC
  LOOP
    v_referrer_direct_depositors := get_direct_depositors_count(v_referral.referrer_id);
    
    IF v_referrer_direct_depositors < v_referral.level THEN
      CONTINUE;
    END IF;
    
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
    
    -- NO CAP for deposit commissions
    v_commission_amount := v_deposit_amount * (v_commission_percent / 100);
    
    IF v_commission_amount > 0 THEN
      UPDATE profiles
      SET referral_balance = COALESCE(referral_balance, 0) + v_commission_amount,
          total_referral_earnings = COALESCE(total_referral_earnings, 0) + v_commission_amount,
          updated_at = now()
      WHERE id = v_referral.referrer_id;
      
      INSERT INTO referral_earnings_history (
        referrer_id, referred_id, amount, commission_percent, 
        source_type, source_amount, referral_level
      ) VALUES (
        v_referral.referrer_id, NEW.user_id, v_commission_amount, 
        v_commission_percent, 'deposit', v_deposit_amount, v_referral.level
      );
    END IF;
  END LOOP;
  
  RETURN NEW;
END;
$function$;
