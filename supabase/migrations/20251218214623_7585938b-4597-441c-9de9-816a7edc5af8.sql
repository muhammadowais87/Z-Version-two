-- Fix 1: Remove admin_wallet_address from the public-readable policy
-- Drop the old policy that exposes admin_wallet_address to all users
DROP POLICY IF EXISTS "Users can view public config, admins can view all" ON public.system_config;

-- Create a new policy that only lets admins see admin_wallet_address
-- The existing "Admins can read wallet address" policy already handles admin access
-- So we just need to ensure non-admins can't read it via any policy

-- Fix 2: Prevent password_hash from being returned to users
-- We need to either:
-- a) Move password_hash to a separate table, or
-- b) Use a view that excludes password_hash for user access
-- Option b is simpler and non-breaking

-- Create a secure view for user profile access that excludes sensitive fields
CREATE OR REPLACE VIEW public.user_profile_safe AS
SELECT 
  id,
  email,
  wallet_balance,
  cycle_wallet_balance,
  referral_balance,
  total_investment,
  total_profit,
  total_referral_earnings,
  total_deposits,
  total_withdrawals,
  telegram_id,
  telegram_username,
  telegram_first_name,
  telegram_last_name,
  telegram_photo_url,
  referral_code,
  referred_by_code,
  has_password,
  created_at,
  updated_at
  -- Explicitly excluding: password_hash, password_failed_attempts, password_locked_until
FROM public.profiles;

-- Grant access to the view
GRANT SELECT ON public.user_profile_safe TO authenticated;
GRANT SELECT ON public.user_profile_safe TO anon;