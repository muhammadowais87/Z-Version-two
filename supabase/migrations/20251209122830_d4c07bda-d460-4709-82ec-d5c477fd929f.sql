-- Drop the unused OTP verification tables
-- These were used for the old email/Telegram OTP authentication system that has been removed

-- Drop otp_verifications table
DROP TABLE IF EXISTS public.otp_verifications;

-- Drop telegram_otp_verifications table
DROP TABLE IF EXISTS public.telegram_otp_verifications;