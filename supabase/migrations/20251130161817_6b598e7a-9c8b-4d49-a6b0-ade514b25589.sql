-- Create admin function to get cycle statistics
CREATE OR REPLACE FUNCTION public.get_admin_cycle_stats()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stats JSONB;
BEGIN
  SELECT jsonb_build_object(
    'total_active', (SELECT COUNT(*) FROM ai_trade_cycles WHERE status = 'active'),
    'total_completed', (SELECT COUNT(*) FROM ai_trade_cycles WHERE status = 'completed'),
    'total_broken', (SELECT COUNT(*) FROM ai_trade_cycles WHERE status = 'broken'),
    'total_invested', (SELECT COALESCE(SUM(investment_amount), 0) FROM ai_trade_cycles WHERE status = 'active'),
    'total_profit_paid', (SELECT COALESCE(SUM(current_profit), 0) FROM ai_trade_cycles WHERE status = 'completed'),
    'users_in_penalty', (SELECT COUNT(*) FROM user_trade_progress WHERE is_penalty_mode = true),
    'cycle_1_active', (SELECT COUNT(*) FROM ai_trade_cycles WHERE status = 'active' AND cycle_type = 1),
    'cycle_2_active', (SELECT COUNT(*) FROM ai_trade_cycles WHERE status = 'active' AND cycle_type = 2),
    'cycle_3_active', (SELECT COUNT(*) FROM ai_trade_cycles WHERE status = 'active' AND cycle_type = 3),
    'cycle_4_active', (SELECT COUNT(*) FROM ai_trade_cycles WHERE status = 'active' AND cycle_type = 4)
  ) INTO v_stats;
  
  RETURN v_stats;
END;
$$;