-- Update the handle_new_user function to accept referral code from user metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, referral_code, referred_by_code)
  VALUES (
    NEW.id,
    NEW.email,
    generate_referral_code(),
    NEW.raw_user_meta_data->>'referred_by_code'
  );
  RETURN NEW;
END;
$$;