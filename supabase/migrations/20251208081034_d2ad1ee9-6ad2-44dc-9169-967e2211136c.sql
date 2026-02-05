
-- Add column to track if penalty is from Chance 2 (permanent)
ALTER TABLE public.user_trade_progress 
ADD COLUMN IF NOT EXISTS penalty_chance INTEGER DEFAULT NULL;

COMMENT ON COLUMN public.user_trade_progress.penalty_chance IS 'Which chance triggered penalty mode. If 2, penalty is permanent.';
