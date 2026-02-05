-- Allow admins to delete deposits
CREATE POLICY "Admins can delete deposits"
ON public.deposits
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Allow admins to delete withdrawals
CREATE POLICY "Admins can delete withdrawals"
ON public.withdrawals
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Allow admins to delete ai_trade_cycles
CREATE POLICY "Admins can delete trade cycles"
ON public.ai_trade_cycles
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Allow admins to delete referral_earnings_history
CREATE POLICY "Admins can delete referral earnings"
ON public.referral_earnings_history
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Allow admins to delete wallet_transfers
CREATE POLICY "Admins can delete wallet transfers"
ON public.wallet_transfers
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));