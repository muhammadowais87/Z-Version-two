-- Create table to store PnL history snapshots for tracked whale wallet
CREATE TABLE public.whale_pnl_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  total_pnl NUMERIC NOT NULL DEFAULT 0,
  total_position_value NUMERIC NOT NULL DEFAULT 0,
  position_count INTEGER NOT NULL DEFAULT 0,
  snapshot_time TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for efficient querying by wallet and time
CREATE INDEX idx_whale_pnl_wallet_time ON public.whale_pnl_history(wallet_address, snapshot_time DESC);

-- Enable Row Level Security
ALTER TABLE public.whale_pnl_history ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read whale PnL history (public data)
CREATE POLICY "Whale PnL history is publicly readable" 
ON public.whale_pnl_history 
FOR SELECT 
USING (true);

-- Only service role can insert (via edge functions)
CREATE POLICY "Only service role can insert whale PnL history" 
ON public.whale_pnl_history 
FOR INSERT 
WITH CHECK (false);