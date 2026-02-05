-- Create profiles table to store user data
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  referral_code text UNIQUE NOT NULL,
  referred_by_code text,
  total_investment numeric DEFAULT 0,
  total_profit numeric DEFAULT 0,
  total_referral_earnings numeric DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create referrals table to track the referral tree
CREATE TABLE IF NOT EXISTS public.referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  referred_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  level integer NOT NULL CHECK (level >= 1 AND level <= 5),
  created_at timestamptz DEFAULT now(),
  UNIQUE(referrer_id, referred_id)
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

-- RLS Policies for profiles
CREATE POLICY "Users can view all profiles"
  ON public.profiles FOR SELECT
  USING (true);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- RLS Policies for referrals
CREATE POLICY "Users can view their referrals"
  ON public.referrals FOR SELECT
  USING (auth.uid() = referrer_id OR auth.uid() = referred_id);

CREATE POLICY "System can insert referrals"
  ON public.referrals FOR INSERT
  WITH CHECK (true);

-- Function to generate unique referral code
CREATE OR REPLACE FUNCTION public.generate_referral_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_code text;
  code_exists boolean;
BEGIN
  LOOP
    -- Generate a random 8-character code with letters and numbers
    new_code := 'WHALE' || upper(substring(md5(random()::text) from 1 for 4));
    
    -- Check if code already exists
    SELECT EXISTS(SELECT 1 FROM public.profiles WHERE referral_code = new_code) INTO code_exists;
    
    -- Exit loop if code is unique
    EXIT WHEN NOT code_exists;
  END LOOP;
  
  RETURN new_code;
END;
$$;

-- Function to create referral chain
CREATE OR REPLACE FUNCTION public.create_referral_chain(
  new_user_id uuid,
  referrer_code text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  referrer_user_id uuid;
  current_referrer_id uuid;
  current_level integer := 1;
BEGIN
  -- Find the referrer by code
  SELECT id INTO referrer_user_id
  FROM public.profiles
  WHERE referral_code = referrer_code;
  
  -- If no referrer found, exit
  IF referrer_user_id IS NULL THEN
    RETURN;
  END IF;
  
  -- Update the new user's referred_by_code
  UPDATE public.profiles
  SET referred_by_code = referrer_code
  WHERE id = new_user_id;
  
  -- Create referral chain up to 5 levels
  current_referrer_id := referrer_user_id;
  
  WHILE current_level <= 5 AND current_referrer_id IS NOT NULL LOOP
    -- Insert referral record
    INSERT INTO public.referrals (referrer_id, referred_id, level)
    VALUES (current_referrer_id, new_user_id, current_level);
    
    -- Move up the chain
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

-- Trigger to auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, referral_code)
  VALUES (
    NEW.id,
    NEW.email,
    generate_referral_code()
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();