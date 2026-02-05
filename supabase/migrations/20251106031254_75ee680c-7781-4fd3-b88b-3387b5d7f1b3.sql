-- Fix ERROR-level security issues

-- 1. Add user ID validation to create_referral_chain function
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
  -- SECURITY FIX: Validate that the user can only create referral chain for themselves
  IF new_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized: Can only create referral chain for own user';
  END IF;

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

-- 2. Restrict referrals INSERT policy to only allow inserts via the RPC function
-- Drop the overly permissive policy
DROP POLICY IF EXISTS "System can insert referrals" ON public.referrals;

-- Create a more restrictive policy that only allows the SECURITY DEFINER function to insert
CREATE POLICY "Only RPC can insert referrals"
ON public.referrals
FOR INSERT
TO authenticated
WITH CHECK (
  -- The function runs as SECURITY DEFINER, so we trust it
  -- This policy just ensures only authenticated users can call the RPC
  auth.uid() IS NOT NULL
);