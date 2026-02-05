import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MINUTES = 15;

// Rate limiting store (in-memory, resets on function cold start)
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW_MS = 60000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 10; // 10 requests per minute per IP

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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Get client IP for rate limiting
  const clientIP = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 
                   req.headers.get('x-real-ip') || 
                   'unknown';

  // Check rate limit before processing request
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

  try {
    const { telegram_username, password } = await req.json();
    
    if (!telegram_username || !password) {
      return new Response(
        JSON.stringify({ error: 'Username and password are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const cleanUsername = telegram_username.replace('@', '').trim().toLowerCase();

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Find user by telegram username
    const { data: profile, error: findError } = await supabase
      .from('profiles')
      .select('id, password_hash, has_password, telegram_username, password_failed_attempts, password_locked_until')
      .eq('telegram_username', cleanUsername)
      .single();

    if (findError || !profile) {
      console.log(`User not found: @${cleanUsername}, IP: ${clientIP}`);
      return new Response(
        JSON.stringify({ error: 'Invalid username or password' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if account is locked
    if (profile.password_locked_until) {
      const lockedUntil = new Date(profile.password_locked_until);
      if (lockedUntil > new Date()) {
        const remainingMinutes = Math.ceil((lockedUntil.getTime() - Date.now()) / 60000);
        console.log(`Account locked for @${cleanUsername}, ${remainingMinutes} minutes remaining`);
        return new Response(
          JSON.stringify({ 
            error: 'ACCOUNT_LOCKED', 
            message: `Account is locked. Please try again in ${remainingMinutes} minutes.`,
            locked_until: profile.password_locked_until
          }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    if (!profile.has_password || !profile.password_hash) {
      return new Response(
        JSON.stringify({ error: 'NO_PASSWORD', message: 'Password not set. Please login with Telegram app first and set a password.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify password using bcrypt
    const passwordValid = await bcrypt.compare(password, profile.password_hash);

    if (!passwordValid) {
      // Increment failed attempts
      const failedAttempts = (profile.password_failed_attempts || 0) + 1;
      const updates: Record<string, unknown> = { 
        password_failed_attempts: failedAttempts,
        updated_at: new Date().toISOString()
      };
      
      // Lock account if max attempts exceeded
      if (failedAttempts >= MAX_FAILED_ATTEMPTS) {
        const lockUntil = new Date(Date.now() + LOCKOUT_DURATION_MINUTES * 60 * 1000);
        updates.password_locked_until = lockUntil.toISOString();
        console.log(`Account locked for @${cleanUsername} after ${failedAttempts} failed attempts, IP: ${clientIP}`);
      }
      
      await supabase
        .from('profiles')
        .update(updates)
        .eq('id', profile.id);

      const remainingAttempts = MAX_FAILED_ATTEMPTS - failedAttempts;
      console.log(`Invalid password for @${cleanUsername}, ${remainingAttempts} attempts remaining, IP: ${clientIP}`);
      
      return new Response(
        JSON.stringify({ 
          error: 'Invalid username or password',
          remaining_attempts: remainingAttempts > 0 ? remainingAttempts : 0
        }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Password verified - reset failed attempts
    await supabase
      .from('profiles')
      .update({ 
        password_failed_attempts: 0,
        password_locked_until: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', profile.id);

    // Generate magic link
    const email = `telegram_${profile.id.replace(/-/g, '')}@telegram.user`;
    
    // Get user's actual email from auth
    const { data: authUser } = await supabase.auth.admin.getUserById(profile.id);
    const userEmail = authUser?.user?.email || email;
    
    const { data: magicLink, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: userEmail,
      options: {
        redirectTo: `${req.headers.get('origin') || 'https://hyperliquidwhale.com'}/dashboard`,
      },
    });

    if (linkError || !magicLink) {
      console.error('Error generating magic link:', linkError);
      return new Response(
        JSON.stringify({ error: 'Failed to generate login session' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Password login successful for @${cleanUsername}, IP: ${clientIP}`);

    return new Response(
      JSON.stringify({ 
        success: true,
        auth_url: magicLink.properties?.action_link,
        user_id: profile.id,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    console.error('Error in login-with-password:', errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
