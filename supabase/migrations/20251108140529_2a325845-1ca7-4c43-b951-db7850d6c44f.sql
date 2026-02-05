-- Re-enable RLS and add proper policies for infrastructure tables
-- These tables should have RLS enabled with policies that prevent direct client access

-- Re-enable RLS on infrastructure tables
ALTER TABLE public.otp_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

-- Add restrictive policies for otp_verifications (no direct client access)
-- Edge functions will use service role key which bypasses these policies
CREATE POLICY "No direct client access to otp_verifications"
ON public.otp_verifications
FOR ALL
USING (false)
WITH CHECK (false);

-- Add restrictive policies for rate_limits (no direct client access)
-- Edge functions will use service role key which bypasses these policies
CREATE POLICY "No direct client access to rate_limits"
ON public.rate_limits
FOR ALL
USING (false)
WITH CHECK (false);