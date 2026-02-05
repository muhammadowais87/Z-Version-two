-- Update the system_config RLS policy to require authentication for admin_wallet_address
-- First, drop the existing policy if it exists
DROP POLICY IF EXISTS "Public can read admin wallet and rate limit config" ON public.system_config;
DROP POLICY IF EXISTS "Public can read specific config values" ON public.system_config;
DROP POLICY IF EXISTS "Anyone can view cycle config" ON public.system_config;

-- Create a policy that allows public read for non-sensitive config only
CREATE POLICY "Public can read non-sensitive config" 
ON public.system_config 
FOR SELECT 
USING (
  key IN (
    'cycle_1_duration', 
    'cycle_2_duration', 
    'cycle_3_duration', 
    'cycle_4_duration',
    'cycle_time_unit',
    'profit_multiplier',
    'early_withdrawal_tax',
    'penalty_daily_return'
  )
);

-- Create a separate policy for authenticated users to access wallet address
CREATE POLICY "Authenticated users can read wallet address" 
ON public.system_config 
FOR SELECT 
TO authenticated
USING (key = 'admin_wallet_address');