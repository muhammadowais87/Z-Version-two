-- Add validation constraint for BEP20 wallet addresses on withdrawals table
ALTER TABLE public.withdrawals
ADD CONSTRAINT valid_bep20_wallet_address 
  CHECK (wallet_address ~ '^0x[a-fA-F0-9]{40}$');

-- Add validation constraint for BEP20 wallet addresses on deposits table
ALTER TABLE public.deposits
ADD CONSTRAINT valid_bep20_admin_wallet_address 
  CHECK (admin_wallet_address ~ '^0x[a-fA-F0-9]{40}$');