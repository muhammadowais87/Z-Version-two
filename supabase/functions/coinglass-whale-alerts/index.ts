import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const COINGLASS_API_URL = 'https://open-api-v3.coinglass.com/api/hyperliquid/whale-alert';
const MONITORED_WALLET = '0x5b5d51203a0f9079f8aeb098a6523a13f298c060';

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get('COINGLASS_API_KEY');
    
    if (!apiKey) {
      console.error('COINGLASS_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Fetching whale alerts from Coinglass...');
    
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
    console.log('Coinglass alerts response received, code:', data.code);

    if (data.code !== '0') {
      console.error('Coinglass API returned error code:', data.code, data.msg);
      return new Response(
        JSON.stringify({ error: data.msg || 'API error' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Filter for the specific monitored wallet
    const allAlerts = data.data || [];
    const monitoredAlerts = allAlerts.filter(
      (alert: any) => alert.user?.toLowerCase() === MONITORED_WALLET.toLowerCase()
    );

    // Also return recent alerts for context (last 50)
    const recentAlerts = allAlerts.slice(0, 50);

    console.log(`Found ${monitoredAlerts.length} alerts for monitored wallet, ${recentAlerts.length} recent alerts`);

    return new Response(
      JSON.stringify({
        success: true,
        monitored_wallet: MONITORED_WALLET,
        monitored_alerts: monitoredAlerts,
        recent_alerts: recentAlerts,
        total_alerts: allAlerts.length,
        fetched_at: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    console.error('Error fetching whale alerts:', errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
