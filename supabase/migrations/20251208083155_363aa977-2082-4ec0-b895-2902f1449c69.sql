
-- Remove the deposit-based referral trigger
DROP TRIGGER IF EXISTS distribute_referral_commissions_trigger ON deposits;

-- Create function to distribute referral commissions on cycle profit
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
  v_profit_amount NUMERIC;
BEGIN
  -- Only process when cycle is being completed
  IF NEW.status != 'completed' OR OLD.status = 'completed' THEN
    RETURN NEW;
  END IF;
  
  -- Get the profit amount
  v_profit_amount := NEW.current_profit;
  
  -- Only distribute if there's actual profit
  IF v_profit_amount <= 0 THEN
    RETURN NEW;
  END IF;
  
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
    
    -- Calculate commission amount based on PROFIT
    v_commission_amount := v_profit_amount * (v_commission_percent / 100);
    
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

-- Create trigger on ai_trade_cycles table for profit-based referral commissions
DROP TRIGGER IF EXISTS distribute_referral_commissions_on_profit_trigger ON ai_trade_cycles;
CREATE TRIGGER distribute_referral_commissions_on_profit_trigger
  AFTER UPDATE ON ai_trade_cycles
  FOR EACH ROW
  EXECUTE FUNCTION distribute_referral_commissions_on_profit();
