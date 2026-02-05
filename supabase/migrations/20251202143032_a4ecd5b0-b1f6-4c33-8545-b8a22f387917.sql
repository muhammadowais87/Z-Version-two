-- Drop the existing overly permissive SELECT policy
DROP POLICY IF EXISTS "Authenticated users can view config" ON public.system_config;

-- Create a new restrictive policy that only allows:
-- 1. Admins to read all config
-- 2. Regular users to read only specific public keys
CREATE POLICY "Users can view public config, admins can view all" 
ON public.system_config 
FOR SELECT 
USING (
  has_role(auth.uid(), 'admin'::app_role) 
  OR key IN ('admin_wallet_address', 'telegram_bot_username')
);