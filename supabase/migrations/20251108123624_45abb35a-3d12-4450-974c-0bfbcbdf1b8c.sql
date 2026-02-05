-- Create system_config table for application configuration
CREATE TABLE IF NOT EXISTS public.system_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.system_config ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read configuration
CREATE POLICY "Authenticated users can view config"
ON public.system_config
FOR SELECT
TO authenticated
USING (true);

-- Only admins can update configuration
CREATE POLICY "Admins can update config"
ON public.system_config
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));

-- Only admins can insert configuration
CREATE POLICY "Admins can insert config"
ON public.system_config
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'));

-- Add trigger for updated_at
CREATE TRIGGER update_system_config_updated_at
  BEFORE UPDATE ON public.system_config
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Insert the admin wallet address (using proper BEP20 format)
INSERT INTO public.system_config (key, value, description)
VALUES (
  'admin_wallet_address',
  '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb7',
  'Admin USDT BEP20 wallet address for deposits'
) ON CONFLICT (key) DO NOTHING;