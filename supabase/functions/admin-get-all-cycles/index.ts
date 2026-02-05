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
    
    // Get user from auth header
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get the user's token to verify admin status
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
      console.error('Admin check failed:', roleError);
      return new Response(
        JSON.stringify({ error: 'Admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { status } = await req.json().catch(() => ({ status: 'all' }));

    console.log(`Admin ${user.id} fetching cycles with status: ${status}`);

    // Build query based on status filter
    let query = supabase
      .from('ai_trade_cycles')
      .select('*')
      .order('created_at', { ascending: false });

    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    const { data: cycles, error: cyclesError } = await query;

    if (cyclesError) {
      console.error('Error fetching cycles:', cyclesError);
      return new Response(
        JSON.stringify({ error: cyclesError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get unique user IDs from cycles
    const userIds = [...new Set(cycles?.map(c => c.user_id) || [])];
    
    // Fetch profiles for these users
    let profilesMap: Record<string, any> = {};
    if (userIds.length > 0) {
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, email, wallet_balance, referral_code')
        .in('id', userIds);
      
      if (!profilesError && profiles) {
        profiles.forEach(p => {
          profilesMap[p.id] = p;
        });
      }
    }

    // Combine cycles with profile data
    const cyclesWithProfiles = cycles?.map(cycle => ({
      ...cycle,
      profiles: profilesMap[cycle.user_id] || null
    })) || [];

    // Get system statistics
    const { data: stats, error: statsError } = await supabase.rpc('get_admin_cycle_stats');
    
    if (statsError) {
      console.error('Error fetching stats:', statsError);
    }

    console.log(`Retrieved ${cyclesWithProfiles.length} cycles`);

    return new Response(
      JSON.stringify({ 
        success: true,
        cycles: cyclesWithProfiles,
        stats: stats || {}
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in admin-get-all-cycles:', error);
    return new Response(
      JSON.stringify({ error: 'An unexpected error occurred' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});