
-- Add referral_balance column to profiles (separate from wallet_balance)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS referral_balance numeric DEFAULT 0;

-- Update referral commission function for deposits - add to referral_balance instead of wallet_balance
CREATE OR REPLACE FUNCTION public.distribute_referral_commissions_on_deposit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_referral RECORD;
  v_commission_percent NUMERIC;
  v_commission_amount NUMERIC;
  v_deposit_amount NUMERIC;
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
      -- Add to referral_balance (not wallet_balance) - can only be withdrawn
      UPDATE profiles
      SET referral_balance = COALESCE(referral_balance, 0) + v_commission_amount,
          total_referral_earnings = COALESCE(total_referral_earnings, 0) + v_commission_amount,
          updated_at = now()
      WHERE id = v_referral.referrer_id;
    END IF;
  END LOOP;
  
  RETURN NEW;
END;
$$;

-- Update referral commission function for cycle profits - add to referral_balance
CREATE OR REPLACE FUNCTION public.distribute_referral_commissions_on_profit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_referral RECORD;
  v_commission_percent NUMERIC;
  v_commission_amount NUMERIC;
  v_max_commission NUMERIC;
  v_profit_amount NUMERIC;
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
      -- Add to referral_balance (not wallet_balance) - can only be withdrawn
      UPDATE profiles
      SET referral_balance = COALESCE(referral_balance, 0) + v_commission_amount,
          total_referral_earnings = COALESCE(total_referral_earnings, 0) + v_commission_amount,
          updated_at = now()
      WHERE id = v_referral.referrer_id;
    END IF;
  END LOOP;
  
  RETURN NEW;
END;
$$;
