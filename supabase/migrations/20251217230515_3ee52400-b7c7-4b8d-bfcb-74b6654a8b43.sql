
-- Create trigger to distribute referral commissions when cycles complete (including penalty mode)
CREATE TRIGGER distribute_profit_commissions_trigger
  AFTER UPDATE ON public.ai_trade_cycles
  FOR EACH ROW
  EXECUTE FUNCTION public.distribute_referral_commissions_on_profit();
