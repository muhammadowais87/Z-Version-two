-- Add RLS policy for admins to update any user trade progress
CREATE POLICY "Admins can update any trade progress"
ON public.user_trade_progress
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));