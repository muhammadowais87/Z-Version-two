
-- Create a function to check 50% wallet balance rule after withdrawal
CREATE OR REPLACE FUNCTION public.check_wallet_balance_after_withdrawal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_progress RECORD;
  v_wallet_balance NUMERIC;
  v_remaining_balance NUMERIC;
  v_has_completed_special BOOLEAN;
  v_active_special_cycle RECORD;
BEGIN
  -- Only check when withdrawal is being approved
  IF NEW.status != 'approved' OR OLD.status = 'approved' THEN
    RETURN NEW;
  END IF;
  
  -- Get user's current wallet balance
  SELECT wallet_balance INTO v_wallet_balance
  FROM profiles WHERE id = NEW.user_id;
  
  -- Calculate remaining balance after withdrawal
  v_remaining_balance := v_wallet_balance - NEW.amount;
  
  -- Get user's trade progress
  SELECT * INTO v_progress
  FROM user_trade_progress WHERE user_id = NEW.user_id;
  
  IF v_progress IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Check if user has completed all cycles (1, 2, 3) - meaning they're on Special cycle level
  v_has_completed_special := (1 = ANY(v_progress.completed_cycles)) 
                            AND (2 = ANY(v_progress.completed_cycles)) 
                            AND (3 = ANY(v_progress.completed_cycles));
  
  -- Also check for active Special cycle
  SELECT * INTO v_active_special_cycle
  FROM ai_trade_cycles
  WHERE user_id = NEW.user_id AND status = 'active' AND cycle_type = 4
  LIMIT 1;
  
  -- If user is at Special cycle level or has active Special cycle
  IF v_has_completed_special OR v_active_special_cycle IS NOT NULL THEN
    -- Check if remaining balance is less than 50% of original balance
    IF v_remaining_balance < (v_wallet_balance * 0.5) THEN
      -- Deactivate current chance based on which chance is active/available
      IF v_progress.chance_1_status IN ('available', 'active') AND v_progress.chance_2_status != 'completed' THEN
        -- Deactivate Chance 1, unlock Chance 2
        UPDATE user_trade_progress
        SET chance_1_status = 'disabled',
            chance_2_status = 'available',
            active_chance = NULL,
            completed_cycles = '{}',
            is_penalty_mode = false,
            penalty_chance = NULL,
            updated_at = now()
        WHERE user_id = NEW.user_id;
        
        -- If there's an active Special cycle, mark it as broken
        IF v_active_special_cycle IS NOT NULL THEN
          UPDATE ai_trade_cycles
          SET status = 'broken',
              updated_at = now()
          WHERE id = v_active_special_cycle.id;
        END IF;
        
      ELSIF v_progress.chance_2_status IN ('available', 'active') THEN
        -- Deactivate Chance 2, lock both chances permanently
        UPDATE user_trade_progress
        SET chance_2_status = 'disabled',
            active_chance = NULL,
            completed_cycles = '{}',
            is_penalty_mode = false,
            penalty_chance = NULL,
            updated_at = now()
        WHERE user_id = NEW.user_id;
        
        -- If there's an active Special cycle, mark it as broken
        IF v_active_special_cycle IS NOT NULL THEN
          UPDATE ai_trade_cycles
          SET status = 'broken',
              updated_at = now()
          WHERE id = v_active_special_cycle.id;
        END IF;
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger on withdrawals table
DROP TRIGGER IF EXISTS check_wallet_balance_trigger ON withdrawals;
CREATE TRIGGER check_wallet_balance_trigger
  BEFORE UPDATE ON withdrawals
  FOR EACH ROW
  EXECUTE FUNCTION check_wallet_balance_after_withdrawal();
