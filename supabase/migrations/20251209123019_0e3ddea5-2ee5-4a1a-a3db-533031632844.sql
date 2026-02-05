-- Drop the unused rate_limits table
-- This was only used by the deleted OTP email functions (send-otp-email, verify-otp)
DROP TABLE IF EXISTS public.rate_limits;