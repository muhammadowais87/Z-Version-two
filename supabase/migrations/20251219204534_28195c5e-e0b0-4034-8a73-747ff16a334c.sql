-- Drop the duplicate trigger on deposits table
-- Keep only the profiles trigger since MyPayVerse auto-deposits update profiles.total_deposits directly
DROP TRIGGER IF EXISTS distribute_referral_commissions_on_deposit_trigger ON deposits;

-- Also drop the function if it's no longer needed
DROP FUNCTION IF EXISTS distribute_referral_commissions_on_deposit();