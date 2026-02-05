import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const COINGLASS_API_URL = 'https://open-api-v3.coinglass.com/api/hyperliquid/whale-position';
const MONITORED_WALLET = '0x5b5d51203a0f9079f8aeb098a6523a13f298c060';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authenticate cron job requests
    const cronSecret = Deno.env.get('CRON_SECRET');
    const authHeader = req.headers.get('Authorization');
    
    if (!cronSecret || !authHeader || authHeader !== `Bearer ${cronSecret}`) {
      console.error('Unauthorized request to save-whale-pnl-snapshot');
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiKey = Deno.env.get('COINGLASS_API_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    if (!apiKey) {
      console.error('COINGLASS_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Fetching whale positions for PnL snapshot...');
    
    const response = await fetch(COINGLASS_API_URL, {
      method: 'GET',
      headers: {
        'CG-API-KEY': apiKey,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Coinglass API error:', response.status, errorText);
      return new Response(
        JSON.stringify({ error: `Coinglass API error: ${response.status}` }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    
    if (data.code !== '0') {
      console.error('Coinglass API returned error code:', data.code, data.msg);
      return new Response(
        JSON.stringify({ error: data.msg || 'API error' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Filter for the monitored wallet
    const allPositions = data.data || [];
    const monitoredPositions = allPositions.filter(
      (pos: any) => pos.user?.toLowerCase() === MONITORED_WALLET.toLowerCase()
    );

    // Calculate totals
    let totalPnl = 0;
    let totalPositionValue = 0;
    
    for (const pos of monitoredPositions) {
      totalPnl += pos.unrealizedPnL || pos.unrealized_pnl || 0;
      totalPositionValue += pos.positionValueUsd || pos.position_value_usd || 0;
    }

    console.log(`Saving PnL snapshot: ${monitoredPositions.length} positions, PnL: $${totalPnl}, Value: $${totalPositionValue}`);

    // Save to database using service role
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    const { error: insertError } = await supabase
      .from('whale_pnl_history')
      .insert({
        wallet_address: MONITORED_WALLET,
        total_pnl: totalPnl,
        total_position_value: totalPositionValue,
        position_count: monitoredPositions.length,
        snapshot_time: new Date().toISOString(),
      });

    if (insertError) {
      console.error('Error saving PnL snapshot:', insertError);
      return new Response(
        JSON.stringify({ error: 'Failed to save snapshot', details: insertError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        snapshot: {
          wallet: MONITORED_WALLET,
          total_pnl: totalPnl,
          total_position_value: totalPositionValue,
          position_count: monitoredPositions.length,
          saved_at: new Date().toISOString(),
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    console.error('Error saving whale PnL snapshot:', errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});