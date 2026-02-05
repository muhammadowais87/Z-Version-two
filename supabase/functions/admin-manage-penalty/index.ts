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

    const { target_user_id, enable_penalty } = await req.json();

    if (!target_user_id || enable_penalty === undefined) {
      return new Response(
        JSON.stringify({ error: 'Missing target_user_id or enable_penalty' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Admin ${user.id} ${enable_penalty ? 'enabling' : 'disabling'} penalty mode for user ${target_user_id}`);

    // Update or create user progress
    const { error: updateError } = await supabase
      .from('user_trade_progress')
      .upsert({
        user_id: target_user_id,
        is_penalty_mode: enable_penalty,
        updated_at: new Date().toISOString()
      });

    if (updateError) {
      console.error('Error updating penalty mode:', updateError);
      return new Response(
        JSON.stringify({ error: updateError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Log admin action
    await supabase.rpc('log_admin_action', {
      p_action_type: enable_penalty ? 'ENABLE_PENALTY_MODE' : 'DISABLE_PENALTY_MODE',
      p_target_type: 'user',
      p_target_id: target_user_id,
      p_details: {
        penalty_mode: enable_penalty
      }
    });

    console.log(`Penalty mode ${enable_penalty ? 'enabled' : 'disabled'} for user ${target_user_id}`);

    return new Response(
      JSON.stringify({ 
        success: true,
        message: `Penalty mode ${enable_penalty ? 'enabled' : 'disabled'} successfully`
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in admin-manage-penalty:', error);
    return new Response(
      JSON.stringify({ error: 'An unexpected error occurred' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
