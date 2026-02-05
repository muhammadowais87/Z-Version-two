-- Create a trigger function to automatically create referral chain when a profile is created
CREATE OR REPLACE FUNCTION public.auto_create_referral_chain()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  current_referrer_id uuid;
  current_level integer := 1;
BEGIN
  -- Only process if there's a referred_by_code
  IF NEW.referred_by_code IS NULL THEN
    RETURN NEW;
  END IF;

  -- Get the referrer's user_id from the referral code
  SELECT id INTO current_referrer_id
  FROM public.profiles
  WHERE referral_code = NEW.referred_by_code;
  
  -- If referrer not found, just return
  IF current_referrer_id IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Create up to 5 levels of referral chain
  WHILE current_level <= 5 AND current_referrer_id IS NOT NULL LOOP
    INSERT INTO public.referrals (referrer_id, referred_id, level)
    VALUES (current_referrer_id, NEW.id, current_level);
    
    -- Get the next level referrer
    SELECT p.id INTO current_referrer_id
    FROM public.profiles p
    WHERE p.referral_code = (
      SELECT referred_by_code
      FROM public.profiles
      WHERE id = current_referrer_id
    );
    
    current_level := current_level + 1;
  END LOOP;
  
  RETURN NEW;
END;
$$;

-- Create trigger to automatically create referral chain on profile insert
DROP TRIGGER IF EXISTS trigger_auto_create_referral_chain ON public.profiles;
CREATE TRIGGER trigger_auto_create_referral_chain
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_create_referral_chain();

-- Note: The old create_referral_chain function is kept for backward compatibility
-- but is no longer needed for new registrations