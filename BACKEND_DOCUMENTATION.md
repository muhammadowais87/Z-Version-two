# Backend Documentation - Whale Investment Platform

## Overview
This document contains all backend code and configuration for the Whale Investment Platform, built on Supabase.

---

## Database Schema

### Tables

#### profiles
User profile and wallet information
```sql
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id),
  email text NOT NULL,
  referral_code text NOT NULL UNIQUE,
  referred_by_code text,
  wallet_balance numeric DEFAULT 0 NOT NULL,
  total_deposits numeric DEFAULT 0 NOT NULL,
  total_withdrawals numeric DEFAULT 0 NOT NULL,
  total_investment numeric DEFAULT 0,
  total_profit numeric DEFAULT 0,
  total_referral_earnings numeric DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
```

#### user_roles
Role management system
```sql
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL DEFAULT 'user',
  created_at timestamptz DEFAULT now(),
  UNIQUE (user_id, role)
);
```

#### deposits
User deposit records
```sql
CREATE TYPE deposit_status AS ENUM ('pending', 'approved', 'rejected');

CREATE TABLE public.deposits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  amount numeric NOT NULL,
  admin_wallet_address text NOT NULL,
  transaction_hash text,
  status deposit_status DEFAULT 'pending' NOT NULL,
  approved_at timestamptz,
  approved_by uuid,
  rejection_reason text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);
```

#### withdrawals
User withdrawal requests
```sql
CREATE TYPE withdrawal_status AS ENUM ('pending', 'approved', 'rejected', 'paid');

CREATE TABLE public.withdrawals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  amount numeric NOT NULL,
  wallet_address text NOT NULL,
  status withdrawal_status DEFAULT 'pending' NOT NULL,
  processed_at timestamptz,
  processed_by uuid,
  rejection_reason text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);
```

#### investments
Active investment tracking
```sql
CREATE TABLE public.investments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  amount numeric NOT NULL,
  profit numeric DEFAULT 0,
  status text DEFAULT 'active' NOT NULL,
  invested_at timestamptz DEFAULT now() NOT NULL,
  matures_at timestamptz DEFAULT (now() + interval '120 hours') NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);
```

#### referrals
Multi-level referral tracking (5 levels)
```sql
CREATE TABLE public.referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid NOT NULL,
  referred_id uuid NOT NULL,
  level integer NOT NULL,
  created_at timestamptz DEFAULT now()
);
```

#### audit_logs
Admin action logging
```sql
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL,
  action_type text NOT NULL,
  target_type text NOT NULL,
  target_id uuid,
  details jsonb DEFAULT '{}' NOT NULL,
  ip_address text,
  user_agent text,
  created_at timestamptz DEFAULT now() NOT NULL
);
```

#### system_config
System-wide configuration
```sql
CREATE TABLE public.system_config (
  key text PRIMARY KEY,
  value text NOT NULL,
  description text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
```

#### otp_verifications
OTP email verification
```sql
CREATE TABLE public.otp_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  otp_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  verified boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);
```

#### rate_limits
Rate limiting for OTP requests
```sql
CREATE TABLE public.rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  request_count integer DEFAULT 1,
  window_start timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
```

---

## Database Functions

### 1. generate_referral_code()
Generates unique referral codes
```sql
CREATE OR REPLACE FUNCTION public.generate_referral_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  new_code text;
  code_exists boolean;
BEGIN
  LOOP
    new_code := 'WHALE' || upper(substring(md5(random()::text) from 1 for 4));
    SELECT EXISTS(SELECT 1 FROM public.profiles WHERE referral_code = new_code) INTO code_exists;
    EXIT WHEN NOT code_exists;
  END LOOP;
  RETURN new_code;
END;
$$;
```

### 2. handle_new_user()
Trigger function for new user registration
```sql
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
```

### 3. auto_create_referral_chain()
Automatically creates 5-level referral chain
```sql
CREATE OR REPLACE FUNCTION public.auto_create_referral_chain()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  current_referrer_id uuid;
  current_level integer := 1;
BEGIN
  IF NEW.referred_by_code IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT id INTO current_referrer_id
  FROM public.profiles
  WHERE referral_code = NEW.referred_by_code;
  
  IF current_referrer_id IS NULL THEN
    RETURN NEW;
  END IF;
  
  WHILE current_level <= 5 AND current_referrer_id IS NOT NULL LOOP
    INSERT INTO public.referrals (referrer_id, referred_id, level)
    VALUES (current_referrer_id, NEW.id, current_level);
    
    SELECT p.id INTO current_referrer_id
    FROM public.profiles p
    WHERE p.referral_code = (
      SELECT referred_by_code
      FROM public.profiles
      WHERE id = current_referrer_id
    );
    
    current_level := current_level + 1;
  END LOOP;
  
  RETURN NEW;
END;
$$;
```

### 4. has_role(_user_id uuid, _role app_role)
Security definer function to check user roles
```sql
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;
```

### 5. approve_deposit(deposit_id uuid)
Admin function to approve deposits and distribute commissions
```sql
CREATE OR REPLACE FUNCTION public.approve_deposit(deposit_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid;
  v_amount numeric;
  v_referrer_id uuid;
  v_level integer;
  v_commission numeric;
  referral_percentages numeric[] := ARRAY[0.10, 0.05, 0.03, 0.02, 0.01];
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can approve deposits';
  END IF;

  SELECT user_id, amount INTO v_user_id, v_amount
  FROM public.deposits
  WHERE id = deposit_id AND status = 'pending';

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Deposit not found or already processed';
  END IF;

  -- Update deposit status
  UPDATE public.deposits
  SET status = 'approved',
      approved_at = now(),
      approved_by = auth.uid(),
      updated_at = now()
  WHERE id = deposit_id;

  -- Update user profile
  UPDATE public.profiles
  SET total_deposits = total_deposits + v_amount,
      total_investment = total_investment + v_amount,
      updated_at = now()
  WHERE id = v_user_id;

  -- Create investment (120 hours = 5 days, 100% profit)
  INSERT INTO public.investments (user_id, amount, status, invested_at, matures_at, profit)
  VALUES (
    v_user_id,
    v_amount,
    'active',
    now(),
    now() + interval '120 hours',
    v_amount
  );

  -- Distribute referral commissions (5 levels: 10%, 5%, 3%, 2%, 1%)
  FOR v_level, v_referrer_id IN
    SELECT r.level, r.referrer_id
    FROM public.referrals r
    WHERE r.referred_id = v_user_id
    ORDER BY r.level
  LOOP
    IF v_level <= 5 THEN
      v_commission := v_amount * referral_percentages[v_level];
      
      UPDATE public.profiles
      SET wallet_balance = wallet_balance + v_commission,
          total_referral_earnings = total_referral_earnings + v_commission,
          updated_at = now()
      WHERE id = v_referrer_id;
    END IF;
  END LOOP;

  -- Log admin action
  PERFORM log_admin_action(
    'APPROVE_DEPOSIT',
    'deposit',
    deposit_id,
    jsonb_build_object(
      'user_id', v_user_id,
      'amount', v_amount
    )
  );
END;
$$;
```

### 6. reject_deposit(deposit_id uuid, reason text)
Admin function to reject deposits
```sql
CREATE OR REPLACE FUNCTION public.reject_deposit(deposit_id uuid, reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid;
  v_amount numeric;
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can reject deposits';
  END IF;

  SELECT user_id, amount INTO v_user_id, v_amount
  FROM public.deposits
  WHERE id = deposit_id AND status = 'pending';

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Deposit not found or already processed';
  END IF;

  UPDATE public.deposits
  SET status = 'rejected',
      rejection_reason = reason,
      updated_at = now()
  WHERE id = deposit_id;
  
  PERFORM log_admin_action(
    'REJECT_DEPOSIT',
    'deposit',
    deposit_id,
    jsonb_build_object(
      'user_id', v_user_id,
      'amount', v_amount,
      'reason', reason
    )
  );
END;
$$;
```

### 7. approve_withdrawal(withdrawal_id uuid)
Admin function to approve withdrawals
```sql
CREATE OR REPLACE FUNCTION public.approve_withdrawal(withdrawal_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid;
  v_amount numeric;
  v_wallet_address text;
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can approve withdrawals';
  END IF;

  SELECT user_id, amount, wallet_address INTO v_user_id, v_amount, v_wallet_address
  FROM public.withdrawals
  WHERE id = withdrawal_id AND status = 'pending';

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Withdrawal not found or already processed';
  END IF;

  IF (SELECT wallet_balance FROM public.profiles WHERE id = v_user_id) < v_amount THEN
    RAISE EXCEPTION 'Insufficient balance';
  END IF;

  UPDATE public.profiles
  SET wallet_balance = wallet_balance - v_amount,
      total_withdrawals = total_withdrawals + v_amount,
      updated_at = now()
  WHERE id = v_user_id;

  UPDATE public.withdrawals
  SET status = 'approved',
      processed_at = now(),
      processed_by = auth.uid(),
      updated_at = now()
  WHERE id = withdrawal_id;

  PERFORM log_admin_action(
    'APPROVE_WITHDRAWAL',
    'withdrawal',
    withdrawal_id,
    jsonb_build_object(
      'user_id', v_user_id,
      'amount', v_amount,
      'wallet_address', v_wallet_address
    )
  );
END;
$$;
```

### 8. reject_withdrawal(withdrawal_id uuid, reason text)
Admin function to reject withdrawals
```sql
CREATE OR REPLACE FUNCTION public.reject_withdrawal(withdrawal_id uuid, reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid;
  v_amount numeric;
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can reject withdrawals';
  END IF;

  SELECT user_id, amount INTO v_user_id, v_amount
  FROM public.withdrawals
  WHERE id = withdrawal_id AND status = 'pending';

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Withdrawal not found or already processed';
  END IF;

  UPDATE public.withdrawals
  SET status = 'rejected',
      rejection_reason = reason,
      updated_at = now()
  WHERE id = withdrawal_id;
  
  PERFORM log_admin_action(
    'REJECT_WITHDRAWAL',
    'withdrawal',
    withdrawal_id,
    jsonb_build_object(
      'user_id', v_user_id,
      'amount', v_amount,
      'reason', reason
    )
  );
END;
$$;
```

### 9. mark_withdrawal_paid(withdrawal_id uuid)
Admin function to mark withdrawal as paid
```sql
CREATE OR REPLACE FUNCTION public.mark_withdrawal_paid(withdrawal_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid;
  v_amount numeric;
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can mark withdrawals as paid';
  END IF;

  SELECT user_id, amount INTO v_user_id, v_amount
  FROM public.withdrawals
  WHERE id = withdrawal_id AND status = 'approved';

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Withdrawal not found or not approved';
  END IF;

  UPDATE public.withdrawals
  SET status = 'paid',
      updated_at = now()
  WHERE id = withdrawal_id;

  PERFORM log_admin_action(
    'MARK_WITHDRAWAL_PAID',
    'withdrawal',
    withdrawal_id,
    jsonb_build_object(
      'user_id', v_user_id,
      'amount', v_amount
    )
  );
END;
$$;
```

### 10. add_manual_deposit(target_user_id uuid, deposit_amount numeric, admin_notes text)
Admin function to add manual deposits
```sql
CREATE OR REPLACE FUNCTION public.add_manual_deposit(
  target_user_id uuid, 
  deposit_amount numeric, 
  admin_notes text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_referrer_id uuid;
  v_level integer;
  v_commission numeric;
  referral_percentages numeric[] := ARRAY[0.10, 0.05, 0.03, 0.02, 0.01];
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can add manual deposits';
  END IF;

  INSERT INTO public.deposits (
    user_id, 
    amount, 
    status, 
    approved_at, 
    approved_by,
    admin_wallet_address,
    transaction_hash
  )
  VALUES (
    target_user_id,
    deposit_amount,
    'approved',
    now(),
    auth.uid(),
    'MANUAL_ADMIN_DEPOSIT',
    COALESCE(admin_notes, 'Manual deposit by admin')
  );

  UPDATE public.profiles
  SET total_deposits = total_deposits + deposit_amount,
      total_investment = total_investment + deposit_amount,
      updated_at = now()
  WHERE id = target_user_id;

  INSERT INTO public.investments (user_id, amount, status, invested_at, matures_at, profit)
  VALUES (
    target_user_id,
    deposit_amount,
    'active',
    now(),
    now() + interval '120 hours',
    deposit_amount
  );

  FOR v_level, v_referrer_id IN
    SELECT r.level, r.referrer_id
    FROM public.referrals r
    WHERE r.referred_id = target_user_id
    ORDER BY r.level
  LOOP
    IF v_level <= 5 THEN
      v_commission := deposit_amount * referral_percentages[v_level];
      
      UPDATE public.profiles
      SET wallet_balance = wallet_balance + v_commission,
          total_referral_earnings = total_referral_earnings + v_commission,
          updated_at = now()
      WHERE id = v_referrer_id;
    END IF;
  END LOOP;

  PERFORM log_admin_action(
    'ADD_MANUAL_DEPOSIT',
    'deposit',
    NULL,
    jsonb_build_object(
      'user_id', target_user_id,
      'amount', deposit_amount,
      'notes', admin_notes
    )
  );
END;
$$;
```

### 11. delete_user_account(target_user_id uuid)
Admin function to delete user accounts
```sql
CREATE OR REPLACE FUNCTION public.delete_user_account(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_email text;
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can delete users';
  END IF;

  IF target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot delete your own account';
  END IF;

  SELECT email INTO v_user_email FROM public.profiles WHERE id = target_user_id;

  PERFORM log_admin_action(
    'DELETE_USER',
    'user',
    target_user_id,
    jsonb_build_object(
      'email', v_user_email
    )
  );

  DELETE FROM auth.users WHERE id = target_user_id;
END;
$$;
```

### 12. complete_matured_investments()
Cron function to complete matured investments
```sql
CREATE OR REPLACE FUNCTION public.complete_matured_investments()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Update profiles with matured investment returns
  UPDATE public.profiles p
  SET 
    wallet_balance = wallet_balance + COALESCE((
      SELECT SUM(amount + profit) 
      FROM public.investments 
      WHERE user_id = p.id 
        AND status = 'active' 
        AND matures_at <= now()
    ), 0),
    total_profit = total_profit + COALESCE((
      SELECT SUM(profit) 
      FROM public.investments 
      WHERE user_id = p.id 
        AND status = 'active' 
        AND matures_at <= now()
    ), 0),
    updated_at = now()
  WHERE id IN (
    SELECT DISTINCT user_id 
    FROM public.investments 
    WHERE status = 'active' AND matures_at <= now()
  );
  
  -- Mark investments as completed
  UPDATE public.investments
  SET 
    status = 'completed',
    updated_at = now()
  WHERE status = 'active' 
    AND matures_at <= now();
END;
$$;
```

### 13. log_admin_action(p_action_type text, p_target_type text, p_target_id uuid, p_details jsonb)
Utility function to log admin actions
```sql
CREATE OR REPLACE FUNCTION public.log_admin_action(
  p_action_type text, 
  p_target_type text, 
  p_target_id uuid, 
  p_details jsonb DEFAULT '{}'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_log_id UUID;
BEGIN
  INSERT INTO public.audit_logs (
    admin_id,
    action_type,
    target_type,
    target_id,
    details
  )
  VALUES (
    auth.uid(),
    p_action_type,
    p_target_type,
    p_target_id,
    p_details
  )
  RETURNING id INTO v_log_id;
  
  RETURN v_log_id;
END;
$$;
```

### 14. verify_referral_code(code text)
Utility function to verify referral codes
```sql
CREATE OR REPLACE FUNCTION public.verify_referral_code(code text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS(SELECT 1 FROM profiles WHERE referral_code = code);
$$;
```

### 15. update_updated_at_column()
Trigger function for automatic timestamp updates
```sql
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
```

---

## Edge Functions

### 1. complete-investments
**Path:** `supabase/functions/complete-investments/index.ts`
**Purpose:** Cron job to complete matured investments
**Authentication:** Requires CRON_SECRET bearer token

```typescript
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Security: Verify request is authenticated with CRON_SECRET
  const authHeader = req.headers.get('authorization');
  const expectedAuth = `Bearer ${Deno.env.get('CRON_SECRET')}`;
  
  if (!authHeader || authHeader !== expectedAuth) {
    console.error('Unauthorized access attempt to complete-investments');
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { 
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('Running investment completion check...');

    // Call the database function to complete matured investments
    const { error } = await supabase.rpc('complete_matured_investments');

    if (error) {
      console.error('Error completing investments:', error);
      throw error;
    }

    console.log('Investment completion check completed successfully');

    return new Response(
      JSON.stringify({ success: true, message: 'Investment check completed' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in complete-investments function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
```

### 2. send-otp-email
**Path:** `supabase/functions/send-otp-email/index.ts`
**Purpose:** Send OTP verification emails using Resend
**Authentication:** Public endpoint (no JWT required)

```typescript
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface OTPEmailRequest {
  email: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { email }: OTPEmailRequest = await req.json();

    // Validate email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return new Response(
        JSON.stringify({ error: 'Invalid email address' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Rate limiting check
    const { data: rateLimit } = await supabase
      .from('rate_limits')
      .select('*')
      .eq('email', email)
      .single();

    if (rateLimit) {
      const windowStart = new Date(rateLimit.window_start);
      const now = new Date();
      const timeDiff = (now.getTime() - windowStart.getTime()) / 1000 / 60; // minutes

      if (timeDiff < 60) {
        if (rateLimit.request_count >= 5) {
          return new Response(
            JSON.stringify({ error: 'Too many requests. Please try again later.' }),
            { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        await supabase
          .from('rate_limits')
          .update({ 
            request_count: rateLimit.request_count + 1,
            updated_at: new Date().toISOString()
          })
          .eq('email', email);
      } else {
        await supabase
          .from('rate_limits')
          .update({ 
            request_count: 1,
            window_start: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('email', email);
      }
    } else {
      await supabase
        .from('rate_limits')
        .insert({ 
          email,
          request_count: 1,
          window_start: new Date().toISOString()
        });
    }

    // Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Hash OTP
    const encoder = new TextEncoder();
    const data = encoder.encode(otp);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const otpHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    // Store OTP hash
    await supabase
      .from('otp_verifications')
      .delete()
      .eq('email', email);

    await supabase
      .from('otp_verifications')
      .insert({
        email,
        otp_hash: otpHash,
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString()
      });

    // Send email via Resend
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: 'Whale Investment <onboarding@resend.dev>',
        to: [email],
        subject: 'Your Login OTP',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #333;">Your Login OTP</h2>
            <p style="font-size: 16px; color: #666;">Your one-time password is:</p>
            <div style="background-color: #f4f4f4; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 8px; margin: 20px 0;">
              ${otp}
            </div>
            <p style="font-size: 14px; color: #999;">This code will expire in 10 minutes.</p>
          </div>
        `,
      }),
    });

    if (res.ok) {
      return new Response(
        JSON.stringify({ success: true, message: 'OTP sent successfully' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      const error = await res.text();
      throw new Error(`Failed to send email: ${error}`);
    }
  } catch (error) {
    console.error('Error in send-otp-email function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
};

serve(handler);
```

### 3. verify-otp
**Path:** `supabase/functions/verify-otp/index.ts`
**Purpose:** Verify OTP codes for email authentication
**Authentication:** Public endpoint (no JWT required)

```typescript
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface VerifyOTPRequest {
  email: string;
  otp: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { email, otp }: VerifyOTPRequest = await req.json();

    if (!email || !otp) {
      return new Response(
        JSON.stringify({ error: 'Email and OTP are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Hash provided OTP
    const encoder = new TextEncoder();
    const data = encoder.encode(otp);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const providedHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    // Get stored OTP
    const { data: verification, error: fetchError } = await supabase
      .from('otp_verifications')
      .select('*')
      .eq('email', email)
      .eq('verified', false)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (fetchError || !verification) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired OTP' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check expiration
    const expiresAt = new Date(verification.expires_at);
    const now = new Date();
    if (now > expiresAt) {
      return new Response(
        JSON.stringify({ error: 'OTP has expired' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify OTP hash
    if (providedHash !== verification.otp_hash) {
      return new Response(
        JSON.stringify({ error: 'Invalid OTP' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Mark as verified
    await supabase
      .from('otp_verifications')
      .update({ verified: true })
      .eq('id', verification.id);

    return new Response(
      JSON.stringify({ success: true, message: 'OTP verified successfully' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in verify-otp function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
};

serve(handler);
```

---

## Row-Level Security (RLS) Policies

### profiles table
```sql
-- Users can view own profile
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

-- Users can update own profile
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- Users can insert own profile
CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Admins can view all profiles
CREATE POLICY "Admins can view all profiles" ON public.profiles
  FOR SELECT USING (has_role(auth.uid(), 'admin'));
```

### deposits table
```sql
-- Users can view own deposits
CREATE POLICY "Users can view own deposits" ON public.deposits
  FOR SELECT USING (auth.uid() = user_id);

-- Users can create own deposits
CREATE POLICY "Users can create own deposits" ON public.deposits
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Admins can view all deposits
CREATE POLICY "Admins can view all deposits" ON public.deposits
  FOR SELECT USING (has_role(auth.uid(), 'admin'));

-- Admins can update deposits
CREATE POLICY "Admins can update deposits" ON public.deposits
  FOR UPDATE USING (has_role(auth.uid(), 'admin'));
```

### withdrawals table
```sql
-- Users can view own withdrawals
CREATE POLICY "Users can view own withdrawals" ON public.withdrawals
  FOR SELECT USING (auth.uid() = user_id);

-- Users can create own withdrawals
CREATE POLICY "Users can create own withdrawals" ON public.withdrawals
  FOR INSERT WITH CHECK (
    auth.uid() = user_id AND 
    amount <= (SELECT wallet_balance FROM profiles WHERE id = auth.uid())
  );

-- Admins can view all withdrawals
CREATE POLICY "Admins can view all withdrawals" ON public.withdrawals
  FOR SELECT USING (has_role(auth.uid(), 'admin'));

-- Admins can update withdrawals
CREATE POLICY "Admins can update withdrawals" ON public.withdrawals
  FOR UPDATE USING (has_role(auth.uid(), 'admin'));
```

### investments table
```sql
-- Users can view own investments
CREATE POLICY "Users can view own investments" ON public.investments
  FOR SELECT USING (auth.uid() = user_id);

-- Users can create own investments
CREATE POLICY "Users can create own investments" ON public.investments
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can update own investments
CREATE POLICY "Users can update own investments" ON public.investments
  FOR UPDATE USING (auth.uid() = user_id);

-- Admins can view all investments
CREATE POLICY "Admins can view all investments" ON public.investments
  FOR SELECT USING (has_role(auth.uid(), 'admin'));
```

### referrals table
```sql
-- Users can view their referrals
CREATE POLICY "Users can view their referrals" ON public.referrals
  FOR SELECT USING (
    auth.uid() = referrer_id OR auth.uid() = referred_id
  );

-- Only RPC can insert referrals
CREATE POLICY "Only RPC can insert referrals" ON public.referrals
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Admins can view all referrals
CREATE POLICY "Admins can view all referrals" ON public.referrals
  FOR SELECT USING (has_role(auth.uid(), 'admin'));
```

### user_roles table
```sql
-- Users can view own roles
CREATE POLICY "Users can view own roles" ON public.user_roles
  FOR SELECT USING (
    auth.uid() = user_id OR has_role(auth.uid(), 'admin')
  );

-- Admins can manage roles
CREATE POLICY "Admins can manage roles" ON public.user_roles
  FOR ALL USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));
```

### audit_logs table
```sql
-- Admins can view all audit logs
CREATE POLICY "Admins can view all audit logs" ON public.audit_logs
  FOR SELECT USING (has_role(auth.uid(), 'admin'));

-- System can insert audit logs
CREATE POLICY "System can insert audit logs" ON public.audit_logs
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
```

### system_config table
```sql
-- Authenticated users can view config
CREATE POLICY "Authenticated users can view config" ON public.system_config
  FOR SELECT USING (true);

-- Admins can insert config
CREATE POLICY "Admins can insert config" ON public.system_config
  FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'));

-- Admins can update config
CREATE POLICY "Admins can update config" ON public.system_config
  FOR UPDATE 
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));
```

### otp_verifications table
```sql
-- No direct client access
CREATE POLICY "No direct client access to otp_verifications" ON public.otp_verifications
  FOR ALL USING (false) WITH CHECK (false);
```

### rate_limits table
```sql
-- No direct client access
CREATE POLICY "No direct client access to rate_limits" ON public.rate_limits
  FOR ALL USING (false) WITH CHECK (false);
```

---

## Business Logic Summary

### Investment System
- Deposits are approved by admins
- Each approved deposit creates an active investment
- Investments mature in 120 hours (5 days)
- Profit is 100% of deposit amount
- Matured investments automatically credit user wallets via cron job

### Referral Commission Structure
- **Level 1:** 10% commission
- **Level 2:** 5% commission  
- **Level 3:** 3% commission
- **Level 4:** 2% commission
- **Level 5:** 1% commission

### Withdrawal Process
1. User requests withdrawal
2. Admin reviews and approves/rejects
3. If approved, amount is deducted from wallet
4. Admin marks as "paid" after manual transfer

### Admin Actions
All admin actions are logged in audit_logs table with:
- Action type
- Target type and ID
- Relevant details (amounts, addresses, etc.)
- Timestamp and admin ID

---

## Environment Variables Required

```bash
# Supabase (auto-configured)
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
VITE_SUPABASE_PROJECT_ID
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_DB_URL

# Edge Function Secrets
CRON_SECRET        # For complete-investments cron job
RESEND_API_KEY     # For sending OTP emails
```

---

## Cron Job Configuration

The `complete-investments` edge function should be called periodically (e.g., every hour) to automatically complete matured investments. Configure this in your Supabase dashboard or external cron service with:

```bash
Authorization: Bearer {CRON_SECRET}
URL: https://{project-id}.supabase.co/functions/v1/complete-investments
Method: POST
```

---

## API Integration Guide

### Client-side Supabase calls (from React)
```typescript
import { supabase } from "@/integrations/supabase/client";

// Example: Create deposit
const { data, error } = await supabase
  .from('deposits')
  .insert({
    user_id: user.id,
    amount: 100,
    admin_wallet_address: 'wallet_address',
    transaction_hash: 'tx_hash'
  });

// Example: Call admin function
const { error } = await supabase.rpc('approve_deposit', {
  deposit_id: 'uuid-here'
});
```

### Edge Function calls (from React)
```typescript
import { supabase } from "@/integrations/supabase/client";

// Send OTP
const { data, error } = await supabase.functions.invoke('send-otp-email', {
  body: { email: 'user@example.com' }
});

// Verify OTP
const { data, error } = await supabase.functions.invoke('verify-otp', {
  body: { email: 'user@example.com', otp: '123456' }
});
```

---

## Security Considerations

1. **Authentication**: All user actions require authentication via Supabase Auth
2. **Authorization**: Admin functions check role using `has_role()` security definer function
3. **RLS Policies**: All tables have RLS enabled with appropriate policies
4. **Rate Limiting**: OTP requests are rate-limited (5 per hour per email)
5. **OTP Security**: OTPs are hashed using SHA-256 before storage
6. **Audit Trail**: All admin actions are logged in audit_logs table
7. **Input Validation**: Email validation and amount checks in place
8. **Cascade Deletes**: User deletion cascades to related records

---

## Common Admin Tasks

### Approve a Deposit
```sql
SELECT approve_deposit('deposit-uuid');
```

### Reject a Deposit
```sql
SELECT reject_deposit('deposit-uuid', 'Reason for rejection');
```

### Add Manual Deposit
```sql
SELECT add_manual_deposit('user-uuid', 1000, 'Bonus credit');
```

### Approve Withdrawal
```sql
SELECT approve_withdrawal('withdrawal-uuid');
```

### Mark Withdrawal as Paid
```sql
SELECT mark_withdrawal_paid('withdrawal-uuid');
```

### Make User Admin
```sql
INSERT INTO user_roles (user_id, role) 
VALUES ('user-uuid', 'admin');
```

---

**Last Updated:** 2025
**Platform:** Supabase (PostgreSQL + Edge Functions)
**Authentication:** Supabase Auth with OTP email verification
