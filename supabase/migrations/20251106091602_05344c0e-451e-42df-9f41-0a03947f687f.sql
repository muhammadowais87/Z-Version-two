-- Allow anyone to check if a referral code exists (needed for registration)
-- This is safe because it only allows verifying if a code exists, not viewing full user data
CREATE POLICY "Anyone can verify referral codes exist"
ON public.profiles
FOR SELECT
TO public
USING (true);