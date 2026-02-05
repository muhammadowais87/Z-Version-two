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
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    
    // Get user from auth header
    const authHeader = req.headers.get('authorization');
    console.log('Auth header present:', !!authHeader);
    
    if (!authHeader) {
      console.error('No authorization header provided');
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create admin client to verify user
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    
    // Extract and verify the JWT token properly
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
    
    if (userError || !user) {
      console.error('Invalid JWT token:', userError?.message);
      return new Response(
        JSON.stringify({ error: 'Invalid authorization token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = user.id;
    console.log('User ID from verified token:', userId);

    const { cycle_id } = await req.json();
    console.log(`Processing early withdrawal for cycle ${cycle_id} by user ${userId}`);

    // Validate input
    if (!cycle_id) {
      return new Response(
        JSON.stringify({ error: 'Missing cycle_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create a client with the user's token to preserve auth.uid() context
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: { Authorization: authHeader },
      },
    });

    // Call the database function to withdraw early
    const { data: withdrawalResult, error: withdrawError } = await supabase.rpc('withdraw_early_from_cycle', {
      p_cycle_id: cycle_id
    });

    if (withdrawError) {
      console.error('Error withdrawing from cycle:', withdrawError);
      return new Response(
        JSON.stringify({ error: 'Failed to process withdrawal' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Withdrawal successful');

    return new Response(
      JSON.stringify({ 
        success: true,
        withdrawn_amount: withdrawalResult.withdrawn_amount,
        tax_applied: withdrawalResult.tax_applied,
        penalty_mode_activated: withdrawalResult.penalty_mode_activated,
        next_chance_unlocked: withdrawalResult.next_chance_unlocked,
        message: 'Withdrawal completed successfully'
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in withdraw-cycle function:', error);
    return new Response(
      JSON.stringify({ error: 'An unexpected error occurred' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
