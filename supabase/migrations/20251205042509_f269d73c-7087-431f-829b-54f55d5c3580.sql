-- Drop the existing permissive INSERT policy on referrals
DROP POLICY IF EXISTS "Only RPC can insert referrals" ON public.referrals;

-- Create a restrictive INSERT policy that denies all direct inserts
-- Referrals should only be created via SECURITY DEFINER functions (auto_create_referral_chain trigger, create_referral_chain function)
CREATE POLICY "Deny direct referral inserts" 
ON public.referrals 
FOR INSERT 
WITH CHECK (false);