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
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if user is admin
    const { data: isAdmin, error: roleError } = await supabase.rpc('has_role', {
      _user_id: user.id,
      _role: 'admin'
    });

    if (roleError || !isAdmin) {
      return new Response(
        JSON.stringify({ error: 'Admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { cycle_id } = await req.json();

    if (!cycle_id) {
      return new Response(
        JSON.stringify({ error: 'Missing cycle_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Admin ${user.id} manually completing cycle ${cycle_id}`);

    // Get the cycle
    const { data: cycle, error: fetchError } = await supabase
      .from('ai_trade_cycles')
      .select('*')
      .eq('id', cycle_id)
      .eq('status', 'active')
      .single();

    if (fetchError || !cycle) {
      return new Response(
        JSON.stringify({ error: 'Cycle not found or already completed' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get user progress
    const { data: progress } = await supabase
      .from('user_trade_progress')
      .select('*')
      .eq('user_id', cycle.user_id)
      .single();

    // Calculate final amount
    let finalAmount: number;
    let profit: number;

    if (progress?.is_penalty_mode) {
      // 2% daily return
      const cycleDuration = cycle.cycle_type === 1 ? 25 : cycle.cycle_type === 2 ? 18 : 14;
      profit = cycle.investment_amount * 0.02 * cycleDuration;
      finalAmount = cycle.investment_amount + profit;
    } else {
      // Double the investment
      finalAmount = cycle.investment_amount * 2;
      profit = cycle.investment_amount;
    }

    // Update cycle
    const { error: updateError } = await supabase
      .from('ai_trade_cycles')
      .update({
        status: 'completed',
        current_profit: profit,
        updated_at: new Date().toISOString()
      })
      .eq('id', cycle_id);

    if (updateError) {
      console.error('Error updating cycle:', updateError);
      return new Response(
        JSON.stringify({ error: 'Failed to complete cycle' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Add to wallet
    const { error: walletError } = await supabase
      .from('profiles')
      .update({
        wallet_balance: supabase.rpc('increment', { x: finalAmount }),
        updated_at: new Date().toISOString()
      })
      .eq('id', cycle.user_id);

    if (walletError) {
      console.error('Error updating wallet:', walletError);
    }

    // Update user progress
    const completedCycles = progress?.completed_cycles || [];
    if (!completedCycles.includes(cycle.cycle_type)) {
      completedCycles.push(cycle.cycle_type);
    }

    const { error: progressError } = await supabase
      .from('user_trade_progress')
      .upsert({
        user_id: cycle.user_id,
        completed_cycles: completedCycles,
        is_penalty_mode: false,
        last_50_percent_check: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });

    if (progressError) {
      console.error('Error updating progress:', progressError);
    }

    // Log admin action
    await supabase.rpc('log_admin_action', {
      p_action_type: 'MANUAL_COMPLETE_CYCLE',
      p_target_type: 'cycle',
      p_target_id: cycle_id,
      p_details: {
        cycle_type: cycle.cycle_type,
        investment_amount: cycle.investment_amount,
        final_amount: finalAmount,
        profit: profit
      }
    });

    console.log(`Cycle ${cycle_id} manually completed by admin`);

    return new Response(
      JSON.stringify({ 
        success: true,
        message: 'Cycle completed successfully',
        final_amount: finalAmount,
        profit: profit
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in admin-complete-cycle:', error);
    return new Response(
      JSON.stringify({ error: 'An unexpected error occurred' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
