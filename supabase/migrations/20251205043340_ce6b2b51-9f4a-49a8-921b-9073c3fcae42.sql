-- Drop the existing permissive INSERT policy on audit_logs
DROP POLICY IF EXISTS "System can insert audit logs" ON public.audit_logs;

-- Create a restrictive INSERT policy that denies all direct inserts
-- Audit logs should only be created via the SECURITY DEFINER function (log_admin_action)
CREATE POLICY "Only service role can insert audit logs" 
ON public.audit_logs 
FOR INSERT 
WITH CHECK (false);