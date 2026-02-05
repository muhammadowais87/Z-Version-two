import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MYPAYVERSE_BASE_URL = "https://api.mypayverse.xyz";

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: { Authorization: req.headers.get("Authorization")! },
        },
      }
    );

    // Service role client for admin operations
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Get the authenticated user (must be admin)
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      console.error("Auth error:", authError);
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if user is admin
    const { data: adminRole } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!adminRole) {
      return new Response(
        JSON.stringify({ error: "Admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const customerId = Deno.env.get("MYPAYVERSE_CUSTOMER_ID");
    if (!customerId) {
      console.error("MYPAYVERSE_CUSTOMER_ID not configured");
      return new Response(
        JSON.stringify({ error: "Payment service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { withdrawal_id } = await req.json();
    
    if (!withdrawal_id) {
      return new Response(
        JSON.stringify({ error: "Withdrawal ID required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Processing withdrawal: ${withdrawal_id} by admin: ${user.id}`);

    // Get withdrawal details
    const { data: withdrawal, error: withdrawalError } = await supabaseAdmin
      .from("withdrawals")
      .select("*, profiles!withdrawals_user_id_fkey(email)")
      .eq("id", withdrawal_id)
      .eq("status", "pending")
      .single();

    if (withdrawalError || !withdrawal) {
      console.error("Withdrawal fetch error:", withdrawalError);
      return new Response(
        JSON.stringify({ error: "Withdrawal not found or already processed" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { user_id, amount: netAmount, wallet_address } = withdrawal;

    // The amount stored in DB is already the NET amount (after 15% tax was applied on frontend)
    // Calculate original amount for balance deduction: netAmount = originalAmount * 0.85
    const TAX_RATE = 0.15;
    const originalAmount = netAmount / (1 - TAX_RATE);
    const taxAmount = originalAmount - netAmount;

    console.log(`Withdrawal: Net $${netAmount.toFixed(2)}, Original $${originalAmount.toFixed(2)}, Tax $${taxAmount.toFixed(2)} (15%)`);

    // NOTE: Balance was already deducted when user submitted the withdrawal request
    // No need to check balance here - the withdrawal amount was already validated and deducted at submission time
    console.log(`Processing withdrawal for user ${user_id}: $${netAmount.toFixed(2)} (balance already deducted at submission)`);

    // Call MyPayVerse to send the NET amount (what user will receive)
    console.log(`Sending $${netAmount.toFixed(2)} to ${wallet_address} via MyPayVerse`);
    
    const mpvResponse = await fetch(`${MYPAYVERSE_BASE_URL}/api/v1/assetsTransaction/WithdrawAsset`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        userId: user_id,
        customerId: customerId,
        amount: netAmount,
        walletAddress: wallet_address,
      }),
    });

    const mpvResponseText = await mpvResponse.text();
    console.log("MyPayVerse raw response:", mpvResponseText);
    
    let mpvData: any;
    try {
      mpvData = JSON.parse(mpvResponseText);
    } catch (parseError) {
      console.error("Failed to parse MyPayVerse response:", parseError);
      return new Response(
        JSON.stringify({ error: "Invalid response from payment service", raw: mpvResponseText }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    console.log("MyPayVerse parsed response:", JSON.stringify(mpvData, null, 2));

    if (!mpvResponse.ok) {
      const errorMessage = mpvData.message || mpvData.responseMessage || "MyPayVerse withdrawal failed";
      console.error("MyPayVerse error:", errorMessage, "Full response:", mpvData);
      return new Response(
        JSON.stringify({ error: errorMessage, mpv_response: mpvData }),
        { status: mpvResponse.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    // Extract transaction hash from various possible response structures
    const txHash = mpvData.data?.transactionHash || 
                   mpvData.data?.txHash || 
                   mpvData.data?.hash ||
                   mpvData.transactionHash ||
                   mpvData.txHash ||
                   mpvData.result?.transactionHash ||
                   mpvData.result?.txHash ||
                   null;
    
    console.log(`Transaction hash extracted: ${txHash || 'NOT FOUND'}`);
    console.log("Full mpvData structure:", Object.keys(mpvData), mpvData.data ? Object.keys(mpvData.data) : 'no data key');

    // MyPayVerse withdrawal successful - now update database
    // NOTE: Balance was already deducted when user submitted the withdrawal request
    // No need to deduct again here

    // Update withdrawal status to 'paid' and save transaction hash
    const { error: updateWithdrawalError } = await supabaseAdmin
      .from("withdrawals")
      .update({
        status: "paid",
        processed_at: new Date().toISOString(),
        processed_by: user.id,
        transaction_hash: txHash,
        updated_at: new Date().toISOString(),
      })
      .eq("id", withdrawal_id);

    if (updateWithdrawalError) {
      console.error("Failed to update withdrawal status:", updateWithdrawalError);
    }

    // Log the admin action with full response data
    await supabaseAdmin.from("audit_logs").insert({
      admin_id: user.id,
      action_type: "APPROVE_WITHDRAWAL_MYPAYVERSE",
      target_type: "withdrawal",
      target_id: withdrawal_id,
      details: {
        user_id,
        original_amount: originalAmount,
        tax_amount: taxAmount,
        net_amount: netAmount,
        tax_rate: "15%",
        wallet_address,
        transaction_hash: txHash,
        note: "Balance was deducted when user submitted withdrawal request",
        mpv_transaction: mpvData.data || mpvData.result || mpvData,
        mpv_full_response: mpvData,
      },
    });

    console.log(`Successfully processed withdrawal ${withdrawal_id}: $${netAmount.toFixed(2)} sent to ${wallet_address}, txHash: ${txHash || 'N/A'}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Withdrawal processed and sent via MyPayVerse",
        transaction_hash: txHash,
        transaction: mpvData.data || mpvData.result || mpvData,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Process withdrawal error:", error);
    const errorMessage = error instanceof Error ? error.message : "Internal server error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
