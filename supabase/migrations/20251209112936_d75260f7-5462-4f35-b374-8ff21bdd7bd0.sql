-- Add columns for password brute force protection
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS password_failed_attempts INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS password_locked_until TIMESTAMP WITH TIME ZONE;