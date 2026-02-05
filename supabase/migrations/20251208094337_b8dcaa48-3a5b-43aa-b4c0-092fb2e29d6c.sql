-- Create security_events table for monitoring
CREATE TABLE public.security_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info',
  user_id UUID NULL,
  email TEXT NULL,
  ip_address TEXT NULL,
  user_agent TEXT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for efficient querying
CREATE INDEX idx_security_events_created_at ON public.security_events(created_at DESC);
CREATE INDEX idx_security_events_event_type ON public.security_events(event_type);
CREATE INDEX idx_security_events_severity ON public.security_events(severity);
CREATE INDEX idx_security_events_user_id ON public.security_events(user_id);
CREATE INDEX idx_security_events_ip_address ON public.security_events(ip_address);

-- Enable RLS
ALTER TABLE public.security_events ENABLE ROW LEVEL SECURITY;

-- Only admins can view security events
CREATE POLICY "Admins can view all security events"
ON public.security_events
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Block direct client inserts (only service role can insert)
CREATE POLICY "Only service role can insert security events"
ON public.security_events
FOR INSERT
WITH CHECK (false);

-- Create function to log security events (SECURITY DEFINER for service role access)
CREATE OR REPLACE FUNCTION public.log_security_event(
  p_event_type TEXT,
  p_severity TEXT DEFAULT 'info',
  p_user_id UUID DEFAULT NULL,
  p_email TEXT DEFAULT NULL,
  p_ip_address TEXT DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL,
  p_details JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_id UUID;
BEGIN
  INSERT INTO public.security_events (
    event_type, severity, user_id, email, ip_address, user_agent, details
  ) VALUES (
    p_event_type, p_severity, p_user_id, p_email, p_ip_address, p_user_agent, p_details
  )
  RETURNING id INTO v_event_id;
  
  RETURN v_event_id;
END;
$$;

-- Create function to detect suspicious activity patterns
CREATE OR REPLACE FUNCTION public.check_suspicious_activity(
  p_ip_address TEXT,
  p_email TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_failed_logins_1h INTEGER;
  v_failed_otps_1h INTEGER;
  v_unique_emails_from_ip INTEGER;
  v_is_suspicious BOOLEAN := false;
  v_reasons TEXT[] := '{}';
BEGIN
  -- Count failed login attempts from this IP in last hour
  SELECT COUNT(*) INTO v_failed_logins_1h
  FROM security_events
  WHERE ip_address = p_ip_address
    AND event_type IN ('login_failed', 'otp_failed', 'auth_failed')
    AND created_at > now() - interval '1 hour';
  
  -- Count failed OTP attempts from this IP in last hour
  SELECT COUNT(*) INTO v_failed_otps_1h
  FROM security_events
  WHERE ip_address = p_ip_address
    AND event_type = 'otp_failed'
    AND created_at > now() - interval '1 hour';
  
  -- Count unique emails attempted from this IP in last hour
  SELECT COUNT(DISTINCT email) INTO v_unique_emails_from_ip
  FROM security_events
  WHERE ip_address = p_ip_address
    AND email IS NOT NULL
    AND created_at > now() - interval '1 hour';
  
  -- Check thresholds
  IF v_failed_logins_1h >= 10 THEN
    v_is_suspicious := true;
    v_reasons := array_append(v_reasons, 'High failed login attempts: ' || v_failed_logins_1h);
  END IF;
  
  IF v_failed_otps_1h >= 5 THEN
    v_is_suspicious := true;
    v_reasons := array_append(v_reasons, 'High failed OTP attempts: ' || v_failed_otps_1h);
  END IF;
  
  IF v_unique_emails_from_ip >= 5 THEN
    v_is_suspicious := true;
    v_reasons := array_append(v_reasons, 'Multiple email attempts from same IP: ' || v_unique_emails_from_ip);
  END IF;
  
  RETURN jsonb_build_object(
    'is_suspicious', v_is_suspicious,
    'failed_logins_1h', v_failed_logins_1h,
    'failed_otps_1h', v_failed_otps_1h,
    'unique_emails_from_ip', v_unique_emails_from_ip,
    'reasons', v_reasons
  );
END;
$$;

-- Create function to get security dashboard stats for admins
CREATE OR REPLACE FUNCTION public.get_security_stats()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stats JSONB;
BEGIN
  -- Only allow admins
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  
  SELECT jsonb_build_object(
    'total_events_24h', (SELECT COUNT(*) FROM security_events WHERE created_at > now() - interval '24 hours'),
    'failed_logins_24h', (SELECT COUNT(*) FROM security_events WHERE event_type IN ('login_failed', 'auth_failed') AND created_at > now() - interval '24 hours'),
    'failed_otps_24h', (SELECT COUNT(*) FROM security_events WHERE event_type = 'otp_failed' AND created_at > now() - interval '24 hours'),
    'account_lockouts_24h', (SELECT COUNT(*) FROM security_events WHERE event_type = 'account_locked' AND created_at > now() - interval '24 hours'),
    'suspicious_ips_24h', (SELECT COUNT(DISTINCT ip_address) FROM security_events WHERE severity = 'warning' AND created_at > now() - interval '24 hours'),
    'successful_logins_24h', (SELECT COUNT(*) FROM security_events WHERE event_type = 'login_success' AND created_at > now() - interval '24 hours'),
    'recent_events', (
      SELECT COALESCE(jsonb_agg(row_to_json(e.*) ORDER BY e.created_at DESC), '[]'::jsonb)
      FROM (
        SELECT id, event_type, severity, email, ip_address, details, created_at
        FROM security_events
        WHERE created_at > now() - interval '24 hours'
        ORDER BY created_at DESC
        LIMIT 50
      ) e
    )
  ) INTO v_stats;
  
  RETURN v_stats;
END;
$$;