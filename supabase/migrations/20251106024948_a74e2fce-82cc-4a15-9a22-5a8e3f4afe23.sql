-- Fix security warnings by replacing functions properly

-- Replace generate_referral_code (no dependencies)
CREATE OR REPLACE FUNCTION public.generate_referral_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_code text;
  code_exists boolean;
BEGIN
  LOOP
    new_code := 'WHALE' || upper(substring(md5(random()::text) from 1 for 4));
    SELECT EXISTS(SELECT 1 FROM public.profiles WHERE referral_code = new_code) INTO code_exists;
    EXIT WHEN NOT code_exists;
  END LOOP;
  RETURN new_code;
END;
$$;

-- Replace create_referral_chain (no dependencies)
CREATE OR REPLACE FUNCTION public.create_referral_chain(
  new_user_id uuid,
  referrer_code text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  referrer_user_id uuid;
  current_referrer_id uuid;
  current_level integer := 1;
BEGIN
  SELECT id INTO referrer_user_id
  FROM public.profiles
  WHERE referral_code = referrer_code;
  
  IF referrer_user_id IS NULL THEN
    RETURN;
  END IF;
  
  UPDATE public.profiles
  SET referred_by_code = referrer_code
  WHERE id = new_user_id;
  
  current_referrer_id := referrer_user_id;
  
  WHILE current_level <= 5 AND current_referrer_id IS NOT NULL LOOP
    INSERT INTO public.referrals (referrer_id, referred_id, level)
    VALUES (current_referrer_id, new_user_id, current_level);
    
    SELECT p.id INTO current_referrer_id
    FROM public.profiles p
    WHERE p.referral_code = (
      SELECT referred_by_code
      FROM public.profiles
      WHERE id = current_referrer_id
    );
    
    current_level := current_level + 1;
  END LOOP;
END;
$$;

-- Drop trigger first, then replace function
DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Recreate trigger
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();