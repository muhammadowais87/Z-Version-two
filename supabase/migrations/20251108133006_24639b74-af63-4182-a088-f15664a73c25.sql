-- Drop the existing constraint that requires valid BEP20 address
ALTER TABLE public.deposits 
DROP CONSTRAINT IF EXISTS valid_bep20_admin_wallet_address;

-- Add a new constraint that allows manual deposits or valid BEP20 addresses
ALTER TABLE public.deposits
ADD CONSTRAINT valid_bep20_or_manual_deposit 
CHECK (
  admin_wallet_address = 'MANUAL_ADMIN_DEPOSIT' OR
  admin_wallet_address ~* '^0x[a-fA-F0-9]{40}$'
);