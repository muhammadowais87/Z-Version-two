-- Create table for Telegram OTP verifications
CREATE TABLE public.telegram_otp_verifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  telegram_username TEXT NOT NULL,
  otp_hash TEXT NOT NULL,
  pending_otp TEXT,
  referral_code TEXT,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  verified BOOLEAN DEFAULT false,
  failed_attempts INTEGER DEFAULT 0,
  locked_until TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for efficient lookups
CREATE INDEX idx_telegram_otp_username ON public.telegram_otp_verifications(telegram_username, created_at DESC);
CREATE INDEX idx_telegram_otp_pending ON public.telegram_otp_verifications(telegram_username, pending_otp) WHERE pending_otp IS NOT NULL;

-- Enable RLS
ALTER TABLE public.telegram_otp_verifications ENABLE ROW LEVEL SECURITY;

-- Only service role can access (via edge functions)
CREATE POLICY "No direct client access to telegram_otp_verifications" 
ON public.telegram_otp_verifications 
FOR ALL 
USING (false)
WITH CHECK (false);