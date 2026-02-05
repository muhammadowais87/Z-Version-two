
-- Create function to distribute referral commissions on deposits
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
  -- Only process when deposit is being approved
  IF NEW.status != 'approved' OR OLD.status = 'approved' THEN
    RETURN NEW;
  END IF;
  
  v_deposit_amount := NEW.amount;
  
  -- Loop through all referrers (up to 5 levels)
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
    
    -- Calculate commission amount based on deposit
    v_commission_amount := v_deposit_amount * (v_commission_percent / 100);
    
    IF v_commission_amount > 0 THEN
      -- Add commission to referrer's wallet and referral earnings
      UPDATE profiles
      SET wallet_balance = wallet_balance + v_commission_amount,
          total_referral_earnings = COALESCE(total_referral_earnings, 0) + v_commission_amount,
          updated_at = now()
      WHERE id = v_referral.referrer_id;
    END IF;
  END LOOP;
  
  RETURN NEW;
END;
$$;

-- Create trigger on deposits table for deposit-based referral commissions
DROP TRIGGER IF EXISTS distribute_referral_commissions_on_deposit_trigger ON deposits;
CREATE TRIGGER distribute_referral_commissions_on_deposit_trigger
  AFTER UPDATE ON deposits
  FOR EACH ROW
  EXECUTE FUNCTION distribute_referral_commissions_on_deposit();
