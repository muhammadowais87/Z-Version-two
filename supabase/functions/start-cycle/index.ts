import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.79.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    console.log('Start-cycle function invoked');
    
    // Get JWT token from auth header
    const authHeader = req.headers.get('authorization');
    console.log('Auth header present:', !!authHeader);
    
    if (!authHeader) {
      console.log('No authorization header provided');
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Extract the JWT token
    const token = authHeader.replace('Bearer ', '');
    
    // Create admin client to verify user
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    
    // Verify user with the token
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
    console.log('User check result:', { userId: user?.id, hasError: !!userError });
    
    if (userError || !user) {
      console.log('Authentication failed');
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { cycle_type, amount, chance_number = 1 } = await req.json();
    console.log('Request body:', { cycle_type, amount, chance_number });

    // Validate input
    if (!cycle_type || !amount) {
      return new Response(
        JSON.stringify({ error: 'Missing cycle_type or amount' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate amount - must be positive, finite, and within limits
    if (!Number.isFinite(amount) || isNaN(amount) || amount <= 0) {
      return new Response(
        JSON.stringify({ error: 'Amount must be a valid positive number' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Maximum investment limit to prevent overflow/abuse
    const MAX_INVESTMENT = 1000000; // $1M limit
    if (amount > MAX_INVESTMENT) {
      return new Response(
        JSON.stringify({ error: `Amount exceeds maximum limit of ${MAX_INVESTMENT}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate decimal precision (max 2 decimal places)
    if (Math.round(amount * 100) / 100 !== amount) {
      return new Response(
        JSON.stringify({ error: 'Amount must have at most 2 decimal places' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (![1, 2, 3, 4].includes(cycle_type)) {
      return new Response(
        JSON.stringify({ error: 'Invalid cycle type. Must be 1, 2, 3, or 4' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (![1, 2].includes(chance_number)) {
      return new Response(
        JSON.stringify({ error: 'Invalid chance number. Must be 1 or 2' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Starting cycle ${cycle_type} for user ${user.id} with amount ${amount} on chance ${chance_number}`);

    // Create a client with the user's token to preserve auth.uid() context
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: { Authorization: authHeader },
      },
    });

    // Call the database function to start the cycle with chance number
    const { data: cycleId, error: cycleError } = await supabase.rpc('start_trade_cycle', {
      p_cycle_type: cycle_type,
      p_amount: amount,
      p_chance_number: chance_number
    });

    if (cycleError) {
      console.error('Error starting cycle:', cycleError);
      return new Response(
        JSON.stringify({ error: 'Failed to start cycle' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Cycle started successfully with ID: ${cycleId}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        cycle_id: cycleId,
        message: 'Cycle started successfully' 
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in start-cycle function:', error);
    return new Response(
      JSON.stringify({ error: 'An unexpected error occurred' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
