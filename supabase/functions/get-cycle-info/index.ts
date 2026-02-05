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
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    
    // Get user from auth header
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: {
        headers: { authorization: authHeader },
      },
    });

    // Verify user is authenticated
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Fetching cycle info for user ${user.id}`);

    // Get active cycle
    const { data: activeCycle, error: cycleError } = await supabase
      .from('ai_trade_cycles')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .maybeSingle();

    if (cycleError) {
      console.error('Error fetching active cycle:', cycleError);
      return new Response(
        JSON.stringify({ error: cycleError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get user progress
    const { data: progress, error: progressError } = await supabase
      .from('user_trade_progress')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (progressError) {
      console.error('Error fetching user progress:', progressError);
      return new Response(
        JSON.stringify({ error: progressError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get wallet balance
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('wallet_balance')
      .eq('id', user.id)
      .single();

    if (profileError) {
      console.error('Error fetching profile:', profileError);
      return new Response(
        JSON.stringify({ error: profileError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Calculate which cycles are unlocked
    const completedCycles = progress?.completed_cycles || [];
    const unlockedCycles = {
      1: true, // Always unlocked
      2: completedCycles.includes(1),
      3: completedCycles.includes(1) && completedCycles.includes(2),
      4: completedCycles.includes(1) && completedCycles.includes(2) && completedCycles.includes(3),
    };

    console.log('Cycle info retrieved successfully');

    return new Response(
      JSON.stringify({ 
        success: true,
        active_cycle: activeCycle,
        progress: progress || { 
          completed_cycles: [], 
          is_penalty_mode: false,
          last_50_percent_check: null 
        },
        wallet_balance: profile.wallet_balance,
        unlocked_cycles: unlockedCycles,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in get-cycle-info function:', error);
    return new Response(
      JSON.stringify({ error: 'An unexpected error occurred. Please try again later.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
