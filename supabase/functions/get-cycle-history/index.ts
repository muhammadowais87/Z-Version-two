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

    console.log(`Fetching cycle history for user ${user.id}`);

    // Get all completed and broken cycles
    const { data: cycles, error: cyclesError } = await supabase
      .from('ai_trade_cycles')
      .select('*')
      .eq('user_id', user.id)
      .in('status', ['completed', 'broken'])
      .order('created_at', { ascending: false });

    if (cyclesError) {
      console.error('Error fetching cycle history:', cyclesError);
      return new Response(
        JSON.stringify({ error: cyclesError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get user progress for penalty mode info
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

    // Calculate statistics
    const completed = cycles?.filter(c => c.status === 'completed') || [];
    const broken = cycles?.filter(c => c.status === 'broken') || [];
    
    const totalProfit = cycles?.reduce((sum, c) => sum + (c.current_profit || 0), 0) || 0;
    
    // Calculate total tax (18% on broken cycles 1, 2, 3)
    const totalTax = broken.reduce((sum, c) => {
      if (c.cycle_type === 4) return sum; // No tax on special cycle
      const currentValue = c.investment_amount + c.current_profit;
      return sum + (currentValue * 0.18);
    }, 0);

    const stats = {
      total_profit: totalProfit,
      total_tax: totalTax,
      completed_count: completed.length,
      broken_count: broken.length,
    };

    console.log('Cycle history retrieved successfully');

    return new Response(
      JSON.stringify({ 
        success: true,
        cycles: cycles || [],
        progress: progress || { 
          completed_cycles: [], 
          is_penalty_mode: false 
        },
        stats,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in get-cycle-history function:', error);
    return new Response(
      JSON.stringify({ error: 'An unexpected error occurred. Please try again later.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
