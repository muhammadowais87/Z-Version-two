
-- Remove duplicate trigger (keep only one)
DROP TRIGGER IF EXISTS distribute_profit_commissions_trigger ON ai_trade_cycles;

-- Delete duplicate records from referral_earnings_history
-- Keep only the first record for each set of duplicates (by keeping the one with MIN id)
DELETE FROM referral_earnings_history a
USING referral_earnings_history b
WHERE a.referrer_id = b.referrer_id
  AND a.referred_id = b.referred_id
  AND a.source_type = b.source_type
  AND a.source_amount = b.source_amount
  AND DATE_TRUNC('second', a.created_at) = DATE_TRUNC('second', b.created_at)
  AND a.id > b.id;
