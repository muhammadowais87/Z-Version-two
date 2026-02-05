-- Security-definer RPC to fetch a user's downline with safe profile fields
CREATE OR REPLACE FUNCTION public.get_my_downline()
RETURNS TABLE (
  referral_id uuid,
  referrer_id uuid,
  referred_id uuid,
  level integer,
  created_at timestamptz,
  telegram_first_name text,
  telegram_last_name text,
  email text,
  total_deposits numeric,
  total_profit numeric,
  wallet_balance numeric,
  referred_by_code text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    r.id as referral_id,
    r.referrer_id,
    r.referred_id,
    r.level,
    r.created_at,
    p.telegram_first_name,
    p.telegram_last_name,
    p.email,
    p.total_deposits,
    p.total_profit,
    p.wallet_balance,
    p.referred_by_code
  FROM public.referrals r
  JOIN public.profiles p ON p.id = r.referred_id
  WHERE r.referrer_id = auth.uid()
  ORDER BY r.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.get_my_downline() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_downline() TO authenticated;