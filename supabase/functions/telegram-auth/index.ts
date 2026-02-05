import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.79.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
}

// Rate limiting store (in-memory, resets on function cold start)
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW_MS = 60000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 15; // 15 requests per minute per IP

function checkRateLimit(identifier: string): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const record = rateLimitStore.get(identifier);
  
  if (!record || now >= record.resetTime) {
    rateLimitStore.set(identifier, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true };
  }
  
  if (record.count >= RATE_LIMIT_MAX_REQUESTS) {
    const retryAfter = Math.ceil((record.resetTime - now) / 1000);
    return { allowed: false, retryAfter };
  }
  
  record.count++;
  return { allowed: true };
}

// Helper to create HMAC-SHA256
async function hmacSha256(key: Uint8Array, data: string): Promise<ArrayBuffer> {
  const keyBuffer = key.buffer.slice(key.byteOffset, key.byteOffset + key.byteLength) as ArrayBuffer;
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBuffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(data));
}

// Convert ArrayBuffer to hex string
function arrayBufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// Log security event
const logSecurityEvent = async (
  supabase: any,
  eventType: string,
  severity: string,
  userId: string | null,
  email: string | null,
  ipAddress: string | null,
  userAgent: string | null,
  details: Record<string, unknown>
) => {
  try {
    await supabase.rpc('log_security_event', {
      p_event_type: eventType,
      p_severity: severity,
      p_user_id: userId,
      p_email: email,
      p_ip_address: ipAddress,
      p_user_agent: userAgent,
      p_details: details
    });
  } catch (err) {
    console.error('Failed to log security event:', err);
  }
};

// Validate Telegram initData according to Telegram's specification
async function validateTelegramInitData(initData: string, botToken: string): Promise<{ valid: boolean; user?: TelegramUser; startParam?: string }> {
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    
    if (!hash) {
      console.log('No hash in initData');
      return { valid: false };
    }
    
    params.delete('hash');
    
    const dataCheckArray: string[] = [];
    const sortedKeys = Array.from(params.keys()).sort();
    
    for (const key of sortedKeys) {
      dataCheckArray.push(`${key}=${params.get(key)}`);
    }
    
    const dataCheckString = dataCheckArray.join('\n');
    
    const secretKey = await hmacSha256(
      new TextEncoder().encode('WebAppData'),
      botToken
    );
    
    const calculatedHashBuffer = await hmacSha256(new Uint8Array(secretKey), dataCheckString);
    const calculatedHash = arrayBufferToHex(calculatedHashBuffer);
    
    if (calculatedHash !== hash) {
      console.log('Hash mismatch');
      return { valid: false };
    }
    
    const authDate = parseInt(params.get('auth_date') || '0');
    const now = Math.floor(Date.now() / 1000);
    
    if (now - authDate > 86400) {
      console.log('Auth data expired');
      return { valid: false };
    }
    
    const userString = params.get('user');
    if (!userString) {
      console.log('No user in initData');
      return { valid: false };
    }
    
    const user = JSON.parse(userString) as TelegramUser;
    const startParam = params.get('start_param') || undefined;
    
    return { valid: true, user, startParam };
  } catch (error) {
    console.error('Error validating initData:', error);
    return { valid: false };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const clientIP = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 
                   req.headers.get('x-real-ip') || 
                   'unknown';
  const userAgent = req.headers.get('user-agent') || 'unknown';

  try {
    // Rate limiting based on IP
    const rateCheck = checkRateLimit(clientIP);
    if (!rateCheck.allowed) {
      console.log(`Rate limit exceeded for IP: ${clientIP}`);
      return new Response(
        JSON.stringify({ error: 'Too many requests. Please try again later.' }),
        { 
          status: 429, 
          headers: { 
            ...corsHeaders, 
            'Content-Type': 'application/json',
            'Retry-After': String(rateCheck.retryAfter || 60)
          } 
        }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
    
    if (!botToken) {
      console.error('TELEGRAM_BOT_TOKEN not configured');
      return new Response(
        JSON.stringify({ error: 'Telegram authentication unavailable' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const { initData, referralCode: manualReferralCode } = await req.json();
    
    if (!initData) {
      return new Response(
        JSON.stringify({ error: 'Missing initData' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log('Validating Telegram initData...');
    if (manualReferralCode) {
      console.log('Manual referral code provided:', manualReferralCode);
    }
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Check for suspicious activity
    const { data: suspiciousCheck } = await supabase.rpc('check_suspicious_activity', {
      p_ip_address: clientIP
    });

    if (suspiciousCheck?.is_suspicious) {
      await logSecurityEvent(supabase, 'suspicious_activity_blocked', 'warning', null, null, clientIP, userAgent, {
        action: 'telegram_auth',
        reasons: suspiciousCheck.reasons
      });
      
      return new Response(
        JSON.stringify({ error: 'Too many requests. Please try again later.' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Validate the initData
    const validation = await validateTelegramInitData(initData, botToken);
    
    if (!validation.valid || !validation.user) {
      console.log('Invalid initData');
      
      await logSecurityEvent(supabase, 'auth_failed', 'warning', null, null, clientIP, userAgent, {
        method: 'telegram',
        reason: 'invalid_init_data'
      });
      
      return new Response(
        JSON.stringify({ error: 'Invalid Telegram data' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const telegramUser = validation.user;
    // Use manual referral code if provided, otherwise use start_param
    const referralCode = manualReferralCode || validation.startParam;
    
    console.log(`Authenticated Telegram user: ${telegramUser.id}`);
    if (referralCode) {
      console.log(`Using referral code: ${referralCode}`);
    }
    
    // Create email from telegram ID (fake email for Supabase auth)
    const telegramEmail = `telegram_${telegramUser.id}@telegram.user`;
    
    // Check if user exists by looking up their profile via telegram_id
    // This is more reliable than listUsers which has pagination limits
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id, email')
      .eq('telegram_id', telegramUser.id)
      .maybeSingle();
    
    let user: { id: string; email: string } | null = null;
    
    if (existingProfile) {
      // User exists, get their auth record
      const { data: userRecord } = await supabase.auth.admin.getUserById(existingProfile.id);
      if (userRecord?.user) {
        user = { id: userRecord.user.id, email: userRecord.user.email || telegramEmail };
      }
    }
    
    if (!user) {
      // NEW USERS: Require referral code
      if (!referralCode) {
        console.log('New user without referral code - rejected');
        
        await logSecurityEvent(supabase, 'registration_blocked', 'info', null, telegramEmail, clientIP, userAgent, {
          method: 'telegram',
          telegram_id: telegramUser.id,
          reason: 'missing_referral_code'
        });
        
        return new Response(
          JSON.stringify({ 
            error: 'Referral code required',
            code: 'REFERRAL_REQUIRED',
            message: 'You need a referral link to join. Please ask a member to invite you.'
          }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      // Verify the referral code is valid
      const { data: isValidCode } = await supabase.rpc('verify_referral_code', { code: referralCode });
      
      if (!isValidCode) {
        console.log('Invalid referral code:', referralCode);
        
        await logSecurityEvent(supabase, 'registration_blocked', 'warning', null, telegramEmail, clientIP, userAgent, {
          method: 'telegram',
          telegram_id: telegramUser.id,
          reason: 'invalid_referral_code',
          referral_code: referralCode
        });
        
        return new Response(
          JSON.stringify({ 
            error: 'Invalid referral code',
            code: 'INVALID_REFERRAL',
            message: 'The referral code is invalid. Please use a valid referral link.'
          }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      // Create new user
      console.log('Creating new user for Telegram ID:', telegramUser.id);
      
      const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
        email: telegramEmail,
        email_confirm: true,
        user_metadata: {
          telegram_id: telegramUser.id,
          telegram_username: telegramUser.username,
          telegram_first_name: telegramUser.first_name,
          telegram_last_name: telegramUser.last_name,
          telegram_photo_url: telegramUser.photo_url,
          referred_by_code: referralCode || null
        }
      });
      
      if (createError) {
        console.error('Error creating user:', createError);
        
        await logSecurityEvent(supabase, 'registration_failed', 'error', null, telegramEmail, clientIP, userAgent, {
          method: 'telegram',
          telegram_id: telegramUser.id
        });
        
        return new Response(
          JSON.stringify({ error: 'Failed to create user account' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      user = newUser.user ? { id: newUser.user.id, email: newUser.user.email || telegramEmail } : null;
      
      // Log new registration
      await logSecurityEvent(supabase, 'registration_success', 'info', user?.id || null, telegramEmail, clientIP, userAgent, {
        method: 'telegram',
        telegram_id: telegramUser.id,
        has_referral: !!referralCode
      });
      
      // Update profile with Telegram data
      if (user) {
        await supabase
          .from('profiles')
          .update({
            telegram_id: telegramUser.id,
            telegram_username: telegramUser.username || null,
            telegram_first_name: telegramUser.first_name,
            telegram_last_name: telegramUser.last_name || null,
            telegram_photo_url: telegramUser.photo_url || null,
            referred_by_code: referralCode || null
          })
          .eq('id', user.id);
      }
    } else {
      // Update existing user's Telegram data
      console.log('Updating existing user:', user.id);
      
      await supabase
        .from('profiles')
        .update({
          telegram_id: telegramUser.id,
          telegram_username: telegramUser.username || null,
          telegram_first_name: telegramUser.first_name,
          telegram_last_name: telegramUser.last_name || null,
          telegram_photo_url: telegramUser.photo_url || null
        })
        .eq('id', user.id);
    }
    
    // Generate a fresh session token for the user using password-based approach
    // Use a random password for each session (not stored, just for immediate sign-in)
    const randomPassword = crypto.randomUUID() + crypto.randomUUID();
    
    // Update user's password to ensure we can sign them in
    const { error: updatePasswordError } = await supabase.auth.admin.updateUserById(user!.id, {
      password: randomPassword
    });
    
    if (updatePasswordError) {
      console.error('Error updating password:', updatePasswordError);
      
      await logSecurityEvent(supabase, 'login_failed', 'error', user?.id || null, telegramEmail, clientIP, userAgent, {
        method: 'telegram',
        reason: 'password_update_failed'
      });
      
      return new Response(
        JSON.stringify({ error: 'Failed to prepare session' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Now sign in with email/password to get a real session
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email: telegramEmail,
      password: randomPassword
    });
    
    if (signInError || !signInData.session) {
      console.error('Error signing in:', signInError);
      
      await logSecurityEvent(supabase, 'login_failed', 'error', user?.id || null, telegramEmail, clientIP, userAgent, {
        method: 'telegram',
        reason: 'sign_in_failed'
      });
      
      return new Response(
        JSON.stringify({ error: 'Failed to generate session' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log('Session generated successfully for user:', user?.id);
    
    // Log successful login
    await logSecurityEvent(supabase, 'login_success', 'info', user?.id || null, telegramEmail, clientIP, userAgent, {
      method: 'telegram',
      telegram_id: telegramUser.id
    });
    
    return new Response(
      JSON.stringify({ 
        success: true,
        session: signInData.session,
        user: {
          id: user?.id,
          telegram_id: telegramUser.id,
          first_name: telegramUser.first_name,
          last_name: telegramUser.last_name,
          username: telegramUser.username
        }
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in telegram-auth:', error);
    return new Response(
      JSON.stringify({ error: 'Authentication failed' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
