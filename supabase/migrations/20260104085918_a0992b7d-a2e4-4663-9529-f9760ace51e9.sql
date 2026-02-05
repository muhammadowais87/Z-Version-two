
-- Add CHECK constraints to prevent negative balances
-- This is a defense-in-depth measure to ensure balances can never go negative

ALTER TABLE profiles
ADD CONSTRAINT wallet_balance_non_negative CHECK (wallet_balance >= 0);

ALTER TABLE profiles
ADD CONSTRAINT cycle_wallet_balance_non_negative CHECK (cycle_wallet_balance >= 0);

ALTER TABLE profiles
ADD CONSTRAINT referral_balance_non_negative CHECK (COALESCE(referral_balance, 0) >= 0);

ALTER TABLE profiles
ADD CONSTRAINT direct_earnings_balance_non_negative CHECK (COALESCE(direct_earnings_balance, 0) >= 0);
