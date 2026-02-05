-- Disable RLS on infrastructure tables that are only accessed by edge functions
-- These tables use service role keys which bypass RLS, so RLS policies are not needed

ALTER TABLE public.otp_verifications DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limits DISABLE ROW LEVEL SECURITY;