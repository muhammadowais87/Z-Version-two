
-- Add direct_earnings_balance column to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS direct_earnings_balance NUMERIC DEFAULT 0 NOT NULL;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS total_direct_earnings NUMERIC DEFAULT 0 NOT NULL;

-- Rename referral_balance to team_earnings_balance for clarity (keep old column for backward compatibility)
-- We'll use referral_balance for team earnings (cycle profit commissions)

-- Update deposit commission trigger to add to direct_earnings_balance
CREATE OR REPLACE FUNCTION public.distribute_referral_commissions_on_deposit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_referral RECORD;
  v_commission_percent NUMERIC;
  v_commission_amount NUMERIC;
  v_deposit_amount NUMERIC;
  v_referrer_direct_depositors INTEGER;
  v_max_commission NUMERIC;
BEGIN
  IF NEW.status != 'approved' OR OLD.status = 'approved' THEN
    RETURN NEW;
  END IF;
  
  v_deposit_amount := NEW.amount;
  
  -- Get max commission cap (default $30)
  SELECT COALESCE((SELECT value::numeric FROM system_config WHERE key = 'referral_max_deposit_commission'), 30) INTO v_max_commission;
  
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
    
    v_commission_amount := v_deposit_amount * (v_commission_percent / 100);
    
    -- Cap at $30
    IF v_commission_amount > v_max_commission THEN
      v_commission_amount := v_max_commission;
    END IF;
    
    IF v_commission_amount > 0 THEN
      -- Add to DIRECT earnings balance (not referral_balance)
      UPDATE profiles
      SET direct_earnings_balance = COALESCE(direct_earnings_balance, 0) + v_commission_amount,
          total_direct_earnings = COALESCE(total_direct_earnings, 0) + v_commission_amount,
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
$$;

-- Update deposit change commission trigger for direct earnings
CREATE OR REPLACE FUNCTION public.distribute_referral_commissions_on_deposit_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_referral RECORD;
  v_commission_percent NUMERIC;
  v_commission_amount NUMERIC;
  v_deposit_increase NUMERIC;
  v_referrer_direct_depositors INTEGER;
  v_max_commission NUMERIC;
BEGIN
  IF NEW.total_deposits <= OLD.total_deposits THEN
    RETURN NEW;
  END IF;
  
  v_deposit_increase := NEW.total_deposits - OLD.total_deposits;
  
  IF v_deposit_increase <= 0 THEN
    RETURN NEW;
  END IF;
  
  SELECT COALESCE((SELECT value::numeric FROM system_config WHERE key = 'referral_max_deposit_commission'), 30) INTO v_max_commission;
  
  FOR v_referral IN 
    SELECT r.referrer_id, r.level
    FROM referrals r
    WHERE r.referred_id = NEW.id
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
    
    v_commission_amount := v_deposit_increase * (v_commission_percent / 100);
    
    -- Cap at $30
    IF v_commission_amount > v_max_commission THEN
      v_commission_amount := v_max_commission;
    END IF;
    
    IF v_commission_amount > 0 THEN
      -- Add to DIRECT earnings balance
      UPDATE profiles
      SET direct_earnings_balance = COALESCE(direct_earnings_balance, 0) + v_commission_amount,
          total_direct_earnings = COALESCE(total_direct_earnings, 0) + v_commission_amount,
          updated_at = now()
      WHERE id = v_referral.referrer_id;
      
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
$$;

-- Update distribute_deposit_commissions RPC for direct earnings
CREATE OR REPLACE FUNCTION public.distribute_deposit_commissions(p_user_id uuid, p_amount numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_referral RECORD;
  v_commission_percent NUMERIC;
  v_commission_amount NUMERIC;
  v_referrer_direct_depositors INTEGER;
  v_max_commission NUMERIC;
BEGIN
  SELECT COALESCE((SELECT value::numeric FROM system_config WHERE key = 'referral_max_deposit_commission'), 30) INTO v_max_commission;

  FOR v_referral IN 
    SELECT r.referrer_id, r.level
    FROM referrals r
    WHERE r.referred_id = p_user_id
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
    
    v_commission_amount := p_amount * (v_commission_percent / 100);
    
    IF v_commission_amount > v_max_commission THEN
      v_commission_amount := v_max_commission;
    END IF;
    
    IF v_commission_amount > 0 THEN
      -- Add to DIRECT earnings balance
      UPDATE profiles
      SET direct_earnings_balance = COALESCE(direct_earnings_balance, 0) + v_commission_amount,
          total_direct_earnings = COALESCE(total_direct_earnings, 0) + v_commission_amount,
          updated_at = now()
      WHERE id = v_referral.referrer_id;
      
      INSERT INTO referral_earnings_history (
        referrer_id, referred_id, amount, commission_percent, 
        source_type, source_amount, referral_level
      ) VALUES (
        v_referral.referrer_id, p_user_id, v_commission_amount, 
        v_commission_percent, 'deposit', p_amount, v_referral.level
      );
    END IF;
  END LOOP;
END;
$$;

-- Cycle profit commissions stay in referral_balance (Team Earnings) - no change needed
-- The distribute_referral_commissions_on_profit trigger already uses referral_balance
