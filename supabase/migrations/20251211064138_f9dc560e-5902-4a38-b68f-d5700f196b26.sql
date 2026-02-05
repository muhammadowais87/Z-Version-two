-- Function to count how many direct referrals have made at least one approved deposit
CREATE OR REPLACE FUNCTION public.get_direct_depositors_count(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(DISTINCT r.referred_id) INTO v_count
  FROM referrals r
  INNER JOIN deposits d ON d.user_id = r.referred_id AND d.status = 'approved'
  WHERE r.referrer_id = p_user_id AND r.level = 1;
  
  RETURN COALESCE(v_count, 0);
END;
$function$;

-- Function to get unlocked referral levels for a user
CREATE OR REPLACE FUNCTION public.get_unlocked_referral_levels(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_direct_depositors INTEGER;
BEGIN
  v_direct_depositors := get_direct_depositors_count(p_user_id);
  
  RETURN jsonb_build_object(
    'direct_depositors', v_direct_depositors,
    'level_1_unlocked', v_direct_depositors >= 1,
    'level_2_unlocked', v_direct_depositors >= 2,
    'level_3_unlocked', v_direct_depositors >= 3,
    'level_4_unlocked', v_direct_depositors >= 4,
    'level_5_unlocked', v_direct_depositors >= 5
  );
END;
$function$;

-- Update the deposit commission trigger to check level unlocks
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
    -- Check if this referrer has unlocked this level
    v_referrer_direct_depositors := get_direct_depositors_count(v_referral.referrer_id);
    
    -- Level X requires X direct depositors to unlock
    IF v_referrer_direct_depositors < v_referral.level THEN
      CONTINUE; -- Skip this level, not unlocked
    END IF;
    
    CASE v_referral.level
      WHEN 1 THEN 
        SELECT COALESCE((SELECT value::numeric FROM system_config WHERE key = 'referral_level_1_percent'), 10) INTO v_commission_percent;
      WHEN 2 THEN 
        SELECT COALESCE((SELECT value::numeric FROM system_config WHERE key = 'referral_level_2_percent'), 5) INTO v_commission_percent;
      WHEN 3 THEN 
        SELECT COALESCE((SELECT value::numeric FROM system_config WHERE key = 'referral_level_3_percent'), 3) INTO v_commission_percent;
      WHEN 4 THEN 
        SELECT COALESCE((SELECT value::numeric FROM system_config WHERE key = 'referral_level_4_percent'), 2) INTO v_commission_percent;
      WHEN 5 THEN 
        SELECT COALESCE((SELECT value::numeric FROM system_config WHERE key = 'referral_level_5_percent'), 1) INTO v_commission_percent;
      ELSE
        v_commission_percent := 0;
    END CASE;
    
    v_commission_amount := v_deposit_amount * (v_commission_percent / 100);
    
    IF v_commission_amount > 0 THEN
      UPDATE profiles
      SET referral_balance = COALESCE(referral_balance, 0) + v_commission_amount,
          total_referral_earnings = COALESCE(total_referral_earnings, 0) + v_commission_amount,
          updated_at = now()
      WHERE id = v_referral.referrer_id;
    END IF;
  END LOOP;
  
  RETURN NEW;
END;
$function$;

-- Update the profit commission trigger to check level unlocks
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
  IF NEW.status != 'completed' OR OLD.status = 'completed' THEN
    RETURN NEW;
  END IF;
  
  v_profit_amount := NEW.current_profit;
  
  IF v_profit_amount <= 0 THEN
    RETURN NEW;
  END IF;
  
  SELECT COALESCE((SELECT value::numeric FROM system_config WHERE key = 'referral_max_profit_commission'), 50) INTO v_max_commission;
  
  FOR v_referral IN 
    SELECT r.referrer_id, r.level
    FROM referrals r
    WHERE r.referred_id = NEW.user_id
    ORDER BY r.level ASC
  LOOP
    -- Check if this referrer has unlocked this level
    v_referrer_direct_depositors := get_direct_depositors_count(v_referral.referrer_id);
    
    -- Level X requires X direct depositors to unlock
    IF v_referrer_direct_depositors < v_referral.level THEN
      CONTINUE; -- Skip this level, not unlocked
    END IF;
    
    CASE v_referral.level
      WHEN 1 THEN 
        SELECT COALESCE((SELECT value::numeric FROM system_config WHERE key = 'referral_level_1_percent'), 10) INTO v_commission_percent;
      WHEN 2 THEN 
        SELECT COALESCE((SELECT value::numeric FROM system_config WHERE key = 'referral_level_2_percent'), 5) INTO v_commission_percent;
      WHEN 3 THEN 
        SELECT COALESCE((SELECT value::numeric FROM system_config WHERE key = 'referral_level_3_percent'), 3) INTO v_commission_percent;
      WHEN 4 THEN 
        SELECT COALESCE((SELECT value::numeric FROM system_config WHERE key = 'referral_level_4_percent'), 2) INTO v_commission_percent;
      WHEN 5 THEN 
        SELECT COALESCE((SELECT value::numeric FROM system_config WHERE key = 'referral_level_5_percent'), 1) INTO v_commission_percent;
      ELSE
        v_commission_percent := 0;
    END CASE;
    
    v_commission_amount := v_profit_amount * (v_commission_percent / 100);
    
    IF v_commission_amount > v_max_commission THEN
      v_commission_amount := v_max_commission;
    END IF;
    
    IF v_commission_amount > 0 THEN
      UPDATE profiles
      SET referral_balance = COALESCE(referral_balance, 0) + v_commission_amount,
          total_referral_earnings = COALESCE(total_referral_earnings, 0) + v_commission_amount,
          updated_at = now()
      WHERE id = v_referral.referrer_id;
    END IF;
  END LOOP;
  
  RETURN NEW;
END;
$function$;