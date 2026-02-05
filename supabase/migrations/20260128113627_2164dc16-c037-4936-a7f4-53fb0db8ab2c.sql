-- Add transaction_hash column to withdrawals table
ALTER TABLE public.withdrawals
ADD COLUMN IF NOT EXISTS transaction_hash text;