-- Add password hash column to profiles for username/password login
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS has_password BOOLEAN DEFAULT false;