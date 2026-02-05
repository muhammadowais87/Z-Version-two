-- Fix the SECURITY DEFINER view issue by dropping and recreating with SECURITY INVOKER
DROP VIEW IF EXISTS public.user_profile_safe;

CREATE VIEW public.user_profile_safe 
WITH (security_invoker = true) AS
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
FROM public.profiles;

-- Grant access to the view
GRANT SELECT ON public.user_profile_safe TO authenticated;
GRANT SELECT ON public.user_profile_safe TO anon;