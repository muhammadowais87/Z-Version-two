-- Fix 1: Replace public profile access with secure referral verification function
CREATE OR REPLACE FUNCTION public.verify_referral_code(code text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS(SELECT 1 FROM profiles WHERE referral_code = code);
$$;

-- Remove the overly permissive policy that exposes all user data
DROP POLICY IF EXISTS "Anyone can verify referral codes exist" ON public.profiles;

-- Fix 2: Restrict complete_matured_investments to service role only
REVOKE EXECUTE ON FUNCTION public.complete_matured_investments() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.complete_matured_investments() FROM anon;
REVOKE EXECUTE ON FUNCTION public.complete_matured_investments() FROM public;