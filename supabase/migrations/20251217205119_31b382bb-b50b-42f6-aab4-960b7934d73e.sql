-- Fix 1: Remove overly permissive profiles policy that allows any authenticated user to read ALL profiles
-- This policy bypasses the proper "Users can view own profile" restriction
DROP POLICY IF EXISTS "Require authentication for profiles" ON public.profiles;

-- Fix 2: Restrict admin wallet address access to admins only
-- Regular users use MyPayVerse for deposits, so they don't need direct access to admin wallet
DROP POLICY IF EXISTS "Authenticated users can read wallet address" ON public.system_config;

-- Create admin-only policy for wallet address
CREATE POLICY "Admins can read wallet address" 
ON public.system_config 
FOR SELECT 
TO authenticated
USING (key = 'admin_wallet_address' AND has_role(auth.uid(), 'admin'::app_role));