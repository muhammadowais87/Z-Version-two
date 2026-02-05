-- Add database-level email validation as defense-in-depth
-- This constraint ensures email format is validated at the database layer
-- even though Supabase Auth already validates emails during signup

ALTER TABLE public.profiles
ADD CONSTRAINT valid_email_format 
CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$');