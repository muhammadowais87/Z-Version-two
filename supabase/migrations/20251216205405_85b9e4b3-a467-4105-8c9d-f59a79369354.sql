-- Create function to reset user data
CREATE OR REPLACE FUNCTION public.reset_user_data(p_target_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id UUID;
BEGIN
  v_admin_id := auth.uid();
  
  -- Verify admin role
  IF NOT has_role(v_admin_id, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Unauthorized: Admin role required';
  END IF;
  
  -- Reset profile balances and stats
  UPDATE profiles
  SET wallet_balance = 0,
      cycle_wallet_balance = 0,
      referral_balance = 0,
      total_investment = 0,
      total_profit = 0,
      total_referral_earnings = 0,
      total_deposits = 0,
      total_withdrawals = 0,
      updated_at = now()
  WHERE id = p_target_user_id;
  
  -- Delete all AI trade cycles for the user
  DELETE FROM ai_trade_cycles WHERE user_id = p_target_user_id;
  
  -- Reset user trade progress
  DELETE FROM user_trade_progress WHERE user_id = p_target_user_id;
  
  -- Re-create fresh trade progress
  INSERT INTO user_trade_progress (user_id, completed_cycles, is_penalty_mode, active_chance, chance_1_status, chance_2_status)
  VALUES (p_target_user_id, '{}', false, NULL, 'available', 'locked');
  
  -- Delete investments
  DELETE FROM investments WHERE user_id = p_target_user_id;
  
  -- Delete deposits
  DELETE FROM deposits WHERE user_id = p_target_user_id;
  
  -- Delete withdrawals
  DELETE FROM withdrawals WHERE user_id = p_target_user_id;
  
  -- Delete referral earnings history (where user is the referred)
  DELETE FROM referral_earnings_history WHERE referred_id = p_target_user_id;
  
  -- Log admin action
  PERFORM log_admin_action(
    'reset_user_data',
    'user',
    p_target_user_id,
    jsonb_build_object('reset_by', v_admin_id, 'reset_at', now())
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'user_id', p_target_user_id,
    'message', 'User data has been reset successfully'
  );
END;
$$;