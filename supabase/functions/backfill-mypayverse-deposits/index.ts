import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MYPAYVERSE_BASE_URL = "https://api.mypayverse.xyz";

serve(async (req) => {
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

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Verify the caller is an admin
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check admin role
    const { data: roleData } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .single();

    if (!roleData) {
      return new Response(
        JSON.stringify({ error: "Admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const customerId = Deno.env.get("MYPAYVERSE_CUSTOMER_ID");
    if (!customerId) {
      return new Response(
        JSON.stringify({ error: "MYPAYVERSE_CUSTOMER_ID not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get all deposits that need backfilling (admin_wallet_address = 'MyPayVerse')
    const { data: depositsToBackfill, error: depositsError } = await supabaseAdmin
      .from("deposits")
      .select("id, user_id")
      .eq("admin_wallet_address", "MyPayVerse");

    if (depositsError) {
      console.error("Error fetching deposits:", depositsError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch deposits" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!depositsToBackfill || depositsToBackfill.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No deposits to backfill", updated: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get unique user IDs
    const uniqueUserIds = [...new Set(depositsToBackfill.map((d) => d.user_id))];
    console.log(`Found ${depositsToBackfill.length} deposits to backfill for ${uniqueUserIds.length} users`);

    let updatedCount = 0;
    const errors: string[] = [];

    // For each unique user, fetch their MyPayVerse wallet and update their deposits
    for (const userId of uniqueUserIds) {
      try {
        // Fetch wallet from MyPayVerse
        const response = await fetch(
          `${MYPAYVERSE_BASE_URL}/api/v1/customers/wallet/details?userId=${userId}&customerId=${customerId}`,
          {
            method: "GET",
            headers: { "Content-Type": "application/json" },
          }
        );

        if (!response.ok) {
          console.log(`No wallet found for user ${userId}, skipping`);
          continue;
        }

        const data = await response.json();
        const walletData = data.result?.wallet || data.data;

        if (!walletData) {
          console.log(`No wallet data for user ${userId}, skipping`);
          continue;
        }

        const walletAddress =
          walletData.walletAddress || walletData.wallet_address || walletData.address;

        if (!walletAddress) {
          console.log(`No wallet address found for user ${userId}, skipping`);
          continue;
        }

        // Update all deposits for this user
        const userDepositIds = depositsToBackfill
          .filter((d) => d.user_id === userId)
          .map((d) => d.id);

        const { error: updateError, count } = await supabaseAdmin
          .from("deposits")
          .update({ admin_wallet_address: walletAddress })
          .in("id", userDepositIds);

        if (updateError) {
          console.error(`Failed to update deposits for user ${userId}:`, updateError);
          errors.push(`User ${userId}: ${updateError.message}`);
        } else {
          updatedCount += userDepositIds.length;
          console.log(`Updated ${userDepositIds.length} deposits for user ${userId} with wallet ${walletAddress}`);
        }
      } catch (err) {
        console.error(`Error processing user ${userId}:`, err);
        errors.push(`User ${userId}: ${err instanceof Error ? err.message : "Unknown error"}`);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Backfill complete`,
        total: depositsToBackfill.length,
        updated: updatedCount,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Backfill error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
