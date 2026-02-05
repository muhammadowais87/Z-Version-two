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

    // Verify admin
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      console.error("Auth error:", authError);
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if user is admin
    const { data: isAdmin } = await supabaseAdmin.rpc("has_role", {
      _user_id: user.id,
      _role: "admin",
    });

    if (!isAdmin) {
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

    console.log("Starting MyPayVerse sync for all users...");

    // Get all users
    const { data: users, error: usersError } = await supabaseAdmin
      .from("profiles")
      .select("id, email, wallet_balance, total_deposits");

    if (usersError) {
      console.error("Failed to fetch users:", usersError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch users" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Found ${users?.length || 0} users to sync`);

    let totalSynced = 0;
    let totalAmount = 0;
    const errors: string[] = [];
    const syncedUsers: { userId: string; email: string; amount: number; deposits: number }[] = [];

    for (const userProfile of users || []) {
      try {
        // Get wallet for this user
        const walletResponse = await fetch(
          `${MYPAYVERSE_BASE_URL}/api/v1/customers/wallet/details?userId=${userProfile.id}&customerId=${customerId}`,
          {
            method: "GET",
            headers: { "Content-Type": "application/json" },
          }
        );

        if (!walletResponse.ok) {
          if (walletResponse.status !== 404) {
            console.log(`User ${userProfile.email}: No wallet or error fetching`);
          }
          continue;
        }

        const walletData = await walletResponse.json();
        const wallet = walletData.result?.wallet || walletData.data;

        if (!wallet?.address) {
          continue;
        }

        const mpvWalletAddress = wallet.address;
        console.log(`Syncing user ${userProfile.email} with wallet ${mpvWalletAddress}`);

        // Fetch transactions
        const txResponse = await fetch(
          `${MYPAYVERSE_BASE_URL}/api/v1/customers/wallet/transactions?walletAddress=${mpvWalletAddress}&customerId=${customerId}`,
          {
            method: "GET",
            headers: { "Content-Type": "application/json" },
          }
        );

        if (!txResponse.ok) {
          console.log(`Failed to fetch transactions for ${userProfile.email}`);
          continue;
        }

        const txData = await txResponse.json();
        const transactions = txData.result?.transactions || txData.result || txData.data || [];

        // Filter completed deposits
        const completedDeposits = Array.isArray(transactions)
          ? transactions.filter((tx: any) =>
              tx.transacionType === "DEPOSIT" &&
              tx.transacionStatus === "COMPLETED"
            )
          : [];

        if (completedDeposits.length === 0) {
          continue;
        }

        // Get existing synced deposits
        const { data: existingDeposits } = await supabaseAdmin
          .from("deposits")
          .select("transaction_hash")
          .eq("user_id", userProfile.id)
          .eq("admin_wallet_address", "MyPayVerse");

        const syncedTxIds = new Set(
          existingDeposits?.map(d => d.transaction_hash?.replace("mypayverse_", "")) || []
        );

        let userNewDeposits = 0;
        let userNewAmount = 0;

        for (const tx of completedDeposits) {
          const txId = tx._id || tx.transactionId || `${tx.createdAt}_${tx.amount}`;

          if (!syncedTxIds.has(txId)) {
            const depositAmount = parseFloat(tx.amount) || 0;

            if (depositAmount > 0) {
              console.log(`New deposit for ${userProfile.email}: $${depositAmount}`);

              const { error: depositError } = await supabaseAdmin.from("deposits")
                .insert({
                  user_id: userProfile.id,
                  amount: depositAmount,
                  status: "approved",
                  admin_wallet_address: "MyPayVerse",
                  transaction_hash: `mypayverse_${txId}`,
                  approved_at: tx.createdAt || new Date().toISOString(),
                });

              if (!depositError) {
                userNewDeposits++;
                userNewAmount += depositAmount;
              } else {
                console.error(`Failed to create deposit for ${userProfile.email}:`, depositError);
              }
            }
          }
        }

        // Update profile if new deposits
        if (userNewAmount > 0) {
          const { error: updateError } = await supabaseAdmin
            .from("profiles")
            .update({
              wallet_balance: (userProfile.wallet_balance || 0) + userNewAmount,
              total_deposits: (userProfile.total_deposits || 0) + userNewAmount,
              updated_at: new Date().toISOString(),
            })
            .eq("id", userProfile.id);

          if (!updateError) {
            totalSynced += userNewDeposits;
            totalAmount += userNewAmount;
            syncedUsers.push({
              userId: userProfile.id,
              email: userProfile.email,
              amount: userNewAmount,
              deposits: userNewDeposits,
            });
            console.log(`Credited $${userNewAmount} (${userNewDeposits} deposits) to ${userProfile.email}`);
          } else {
            errors.push(`Failed to credit ${userProfile.email}: ${updateError.message}`);
          }
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : "Unknown error";
        console.error(`Error syncing user ${userProfile.email}:`, errorMsg);
        errors.push(`${userProfile.email}: ${errorMsg}`);
      }
    }

    console.log(`Sync complete: ${totalSynced} deposits, $${totalAmount} total`);

    return new Response(
      JSON.stringify({
        success: true,
        totalDeposits: totalSynced,
        totalAmount,
        syncedUsers,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Sync error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
