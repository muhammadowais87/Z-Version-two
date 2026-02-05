-- Update RLS policy to allow reading telegram_bot_username
DROP POLICY IF EXISTS "Public can read telegram_bot_username" ON public.system_config;
CREATE POLICY "Public can read telegram_bot_username" 
ON public.system_config 
FOR SELECT 
USING (key = 'telegram_bot_username');