-- Function to resolve referral codes to display names (for showing "Referred by" labels)
CREATE OR REPLACE FUNCTION public.get_referrer_names_by_codes(p_codes text[])
RETURNS TABLE (
  referral_code text,
  display_name text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    p.referral_code,
    COALESCE(
      NULLIF(CONCAT_WS(' ', p.telegram_first_name, p.telegram_last_name), ''),
      CASE WHEN p.telegram_username IS NOT NULL THEN CONCAT('@', p.telegram_username) END,
      CASE 
        WHEN p.email LIKE 'telegram_%' THEN CONCAT('User ', SUBSTRING(REPLACE(SPLIT_PART(p.email, '@', 1), 'telegram_', '') FROM 1 FOR 8), '...')
        ELSE SPLIT_PART(p.email, '@', 1)
      END,
      'Unknown'
    ) as display_name
  FROM public.profiles p
  WHERE p.referral_code = ANY(p_codes);
$$;

REVOKE ALL ON FUNCTION public.get_referrer_names_by_codes(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_referrer_names_by_codes(text[]) TO authenticated;