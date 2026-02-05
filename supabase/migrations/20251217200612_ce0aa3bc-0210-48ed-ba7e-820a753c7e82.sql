-- Create wallet_transfers table to track internal wallet transfers
CREATE TABLE public.wallet_transfers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  amount NUMERIC NOT NULL,
  from_wallet TEXT NOT NULL, -- 'main', 'cycle', 'team'
  to_wallet TEXT NOT NULL, -- 'main', 'cycle'
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.wallet_transfers ENABLE ROW LEVEL SECURITY;

-- Users can view their own transfers
CREATE POLICY "Users can view own transfers"
ON public.wallet_transfers
FOR SELECT
USING (auth.uid() = user_id);

-- Only system can insert (via functions)
CREATE POLICY "System can insert transfers"
ON public.wallet_transfers
FOR INSERT
WITH CHECK (false);

-- Create index for faster queries
CREATE INDEX idx_wallet_transfers_user_id ON public.wallet_transfers(user_id);
CREATE INDEX idx_wallet_transfers_created_at ON public.wallet_transfers(created_at DESC);