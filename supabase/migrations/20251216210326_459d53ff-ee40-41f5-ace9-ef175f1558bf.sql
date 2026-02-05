-- Fix: Add explicit policy to block anonymous access to profiles table
-- This adds defense in depth by explicitly blocking unauthenticated queries

-- First, drop any conflicting policy if exists (safe no-op if not exists)
DROP POLICY IF EXISTS "Require authentication for profiles" ON public.profiles;

-- Create policy requiring authentication for all SELECT operations
CREATE POLICY "Require authentication for profiles" 
ON public.profiles 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

-- Add database constraints to prevent negative balances
-- This addresses financial integrity concerns

-- Add check constraints for profiles table balances
ALTER TABLE public.profiles 
ADD CONSTRAINT profiles_wallet_balance_non_negative 
CHECK (wallet_balance >= 0);

ALTER TABLE public.profiles 
ADD CONSTRAINT profiles_cycle_wallet_balance_non_negative 
CHECK (cycle_wallet_balance >= 0);

ALTER TABLE public.profiles 
ADD CONSTRAINT profiles_referral_balance_non_negative 
CHECK (COALESCE(referral_balance, 0) >= 0);

ALTER TABLE public.profiles 
ADD CONSTRAINT profiles_total_deposits_non_negative 
CHECK (total_deposits >= 0);

ALTER TABLE public.profiles 
ADD CONSTRAINT profiles_total_withdrawals_non_negative 
CHECK (total_withdrawals >= 0);

-- Add check constraints for financial tables
ALTER TABLE public.deposits 
ADD CONSTRAINT deposits_amount_positive 
CHECK (amount > 0);

ALTER TABLE public.withdrawals 
ADD CONSTRAINT withdrawals_amount_positive 
CHECK (amount > 0);

ALTER TABLE public.investments 
ADD CONSTRAINT investments_amount_positive 
CHECK (amount > 0);

ALTER TABLE public.ai_trade_cycles 
ADD CONSTRAINT ai_trade_cycles_investment_amount_positive 
CHECK (investment_amount > 0);