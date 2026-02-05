import BottomNav from "@/components/BottomNav";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Wallet as WalletIcon, ArrowDownToLine, ArrowUpFromLine, Copy, TrendingUp, AlertTriangle, Users, ArrowRight, RefreshCw, Loader2, CheckCircle2, History, Clock, XCircle, DollarSign } from "lucide-react";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import { isAddress, getAddress } from "ethers";
import { useMyPayVerseWallet } from "@/hooks/useMyPayVerseWallet";
const Wallet = () => {
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawAddress, setWithdrawAddress] = useState("");
  const [transferAmount, setTransferAmount] = useState("");
  const [transferDirection, setTransferDirection] = useState<"to-cycle" | "to-main">("to-cycle");
  const [teamIncomeAmount, setTeamIncomeAmount] = useState("");
  const [teamIncomeDestination, setTeamIncomeDestination] = useState<"to-cycle" | "to-main">("to-main");
  const [directEarningsAmount, setDirectEarningsAmount] = useState("");
  const [directEarningsDestination, setDirectEarningsDestination] = useState<"to-cycle" | "to-main">("to-main");
  const [userId, setUserId] = useState<string | null>(null);
  const {
    toast
  } = useToast();
  const queryClient = useQueryClient();
  useEffect(() => {
    supabase.auth.getUser().then(({
      data: {
        user
      }
    }) => {
      setUserId(user?.id || null);
    });
  }, []);
  const {
    data: profile
  } = useQuery({
    queryKey: ["profile", userId],
    queryFn: async () => {
      if (!userId) return null;
      const {
        data,
        error
      } = await supabase.from("profiles").select("*").eq("id", userId).single();
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
    refetchInterval: 2000 // Auto-refresh every 2 seconds
  });
  const {
    data: hasActiveCycles
  } = useQuery({
    queryKey: ["hasActiveCycles", userId],
    queryFn: async () => {
      if (!userId) return false;
      const {
        count,
        error
      } = await supabase.from("ai_trade_cycles").select("*", {
        count: "exact",
        head: true
      }).eq("user_id", userId).eq("status", "active");
      if (error) throw error;
      return (count || 0) > 0;
    },
    enabled: !!userId,
    refetchInterval: 2000
  });
  const {
    data: deposits
  } = useQuery({
    queryKey: ["deposits", userId],
    queryFn: async () => {
      if (!userId) return [];
      const {
        data,
        error
      } = await supabase.from("deposits").select("*").eq("user_id", userId).order("created_at", {
        ascending: false
      });
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
    refetchInterval: 2000
  });
  const {
    data: withdrawals
  } = useQuery({
    queryKey: ["withdrawals", userId],
    queryFn: async () => {
      if (!userId) return [];
      const {
        data,
        error
      } = await supabase.from("withdrawals").select("*").eq("user_id", userId).order("created_at", {
        ascending: false
      });
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
    refetchInterval: 2000
  });

  // MyPayVerse wallet integration (auto-creates wallet)
  const {
    wallet: myPayVerseWallet,
    transactions: myPayVerseTransactions,
    isLoadingWallet: isLoadingMyPayVerseWallet,
    isLoadingTransactions: isLoadingMyPayVerseTransactions,
    refetchWallet: refetchMyPayVerseWallet
  } = useMyPayVerseWallet(userId);
  const walletBalance = profile?.wallet_balance || 0;
  const withdrawAmountNum = parseFloat(withdrawAmount) || 0;
  const withdrawMutation = useMutation({
    mutationFn: async ({
      amount,
      walletAddress
    }: {
      amount: number;
      walletAddress: string;
    }) => {
      if (!userId) throw new Error("Not authenticated");
      
      // Calculate net amount after 15% tax - store NET amount in database
      const taxRate = 0.15;
      const netAmount = amount * (1 - taxRate);
      
      // Check available balance (wallet + referral)
      const totalAvailable = (profile?.wallet_balance || 0) + (profile?.referral_balance || 0);
      if (totalAvailable < amount) {
        throw new Error("Insufficient balance");
      }
      
      // Deduct from user's balance immediately when they apply for withdrawal
      let remainingToDeduct = amount;
      const walletDeduction = Math.min(profile?.wallet_balance || 0, remainingToDeduct);
      remainingToDeduct -= walletDeduction;
      const referralDeduction = remainingToDeduct;
      
      const { error: updateError } = await supabase
        .from("profiles")
        .update({
          wallet_balance: (profile?.wallet_balance || 0) - walletDeduction,
          referral_balance: (profile?.referral_balance || 0) - referralDeduction,
          total_withdrawals: (profile?.total_withdrawals || 0) + amount,
          updated_at: new Date().toISOString()
        })
        .eq("id", userId);
      
      if (updateError) throw updateError;
      
      // Insert withdrawal record with NET amount
      const { error } = await supabase.from("withdrawals").insert({
        user_id: userId,
        amount: netAmount, // Store NET amount (what user will receive)
        wallet_address: walletAddress,
        status: "pending"
      });
      if (error) throw error;
      return { originalAmount: amount, netAmount };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: ["withdrawals", userId]
      });
      queryClient.invalidateQueries({
        queryKey: ["profile", userId]
      });
      toast({
        title: "Withdrawal Requested",
        description: `You will receive $${data.netAmount.toFixed(2)} after 15% tax. Processing time: 24 hours.`
      });
      setWithdrawAmount("");
      setWithdrawAddress("");
    },
    onError: error => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    }
  });
  const transferMutation = useMutation({
    mutationFn: async ({
      amount,
      direction
    }: {
      amount: number;
      direction: "to-cycle" | "to-main";
    }) => {
      if (!userId) throw new Error("Not authenticated");
      const functionName = direction === "to-cycle" ? "transfer_to_cycle_wallet" : "transfer_to_main_wallet";
      const {
        data,
        error
      } = await supabase.rpc(functionName, {
        p_amount: amount
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["profile", userId]
      });
      toast({
        title: "Transfer Successful",
        description: `$${variables.amount.toFixed(2)} transferred to ${variables.direction === "to-cycle" ? "Cycle Wallet" : "Main Wallet"}`
      });
      setTransferAmount("");
    },
    onError: error => {
      toast({
        title: "Transfer Failed",
        description: error.message,
        variant: "destructive"
      });
    }
  });
  const teamIncomeTransferMutation = useMutation({
    mutationFn: async ({
      amount,
      destination
    }: {
      amount: number;
      destination: "to-cycle" | "to-main";
    }) => {
      if (!userId) throw new Error("Not authenticated");
      const functionName = destination === "to-cycle" ? "transfer_team_income_to_cycle_wallet" : "transfer_team_income_to_main_wallet";
      const {
        data,
        error
      } = await supabase.rpc(functionName, {
        p_amount: amount
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["profile", userId]
      });
      toast({
        title: "Transfer Successful",
        description: `$${variables.amount.toFixed(2)} transferred from Team Income to ${variables.destination === "to-cycle" ? "Cycle Wallet" : "Main Wallet"}`
      });
      setTeamIncomeAmount("");
    },
    onError: error => {
      toast({
        title: "Transfer Failed",
        description: error.message,
        variant: "destructive"
      });
    }
  });
  const directEarningsTransferMutation = useMutation({
    mutationFn: async ({
      amount,
      destination
    }: {
      amount: number;
      destination: "to-cycle" | "to-main";
    }) => {
      if (!userId) throw new Error("Not authenticated");
      const functionName = destination === "to-cycle" ? "transfer_direct_earnings_to_cycle_wallet" : "transfer_direct_earnings_to_main_wallet";
      const {
        data,
        error
      } = await supabase.rpc(functionName as any, {
        p_amount: amount
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["profile", userId]
      });
      toast({
        title: "Transfer Successful",
        description: `$${variables.amount.toFixed(2)} transferred from Direct Earnings to ${variables.destination === "to-cycle" ? "Cycle Wallet" : "Main Wallet"}`
      });
      setDirectEarningsAmount("");
    },
    onError: error => {
      toast({
        title: "Transfer Failed",
        description: error.message,
        variant: "destructive"
      });
    }
  });
  const handleWithdraw = () => {
    const amount = parseFloat(withdrawAmount);
    if (isNaN(amount) || amount < 10) {
      toast({
        title: "Invalid Amount",
        description: "Minimum withdrawal is $10",
        variant: "destructive"
      });
      return;
    }
    if (!withdrawAddress || withdrawAddress.length < 20) {
      toast({
        title: "Invalid Address",
        description: "Please enter a valid BEP20 USDT wallet address",
        variant: "destructive"
      });
      return;
    }
    if (!isAddress(withdrawAddress)) {
      toast({
        title: "Invalid Address Format",
        description: "Please enter a valid BEP20 address (must start with 0x and be 42 characters long)",
        variant: "destructive"
      });
      return;
    }
    const checksummedAddress = getAddress(withdrawAddress);
    const totalAvailable = (profile?.wallet_balance || 0) + (profile?.referral_balance || 0);
    if (amount > totalAvailable) {
      toast({
        title: "Insufficient Balance",
        description: "You don't have enough balance for this withdrawal",
        variant: "destructive"
      });
      return;
    }
    withdrawMutation.mutate({
      amount,
      walletAddress: checksummedAddress
    });
  };
  const handleTransfer = () => {
    const amount = parseFloat(transferAmount);
    if (isNaN(amount) || amount <= 0) {
      toast({
        title: "Invalid Amount",
        description: "Please enter a valid amount",
        variant: "destructive"
      });
      return;
    }
    const sourceBalance = transferDirection === "to-cycle" ? profile?.wallet_balance || 0 : profile?.cycle_wallet_balance || 0;
    if (amount > sourceBalance) {
      toast({
        title: "Insufficient Balance",
        description: `Not enough balance in ${transferDirection === "to-cycle" ? "Main" : "Cycle"} Wallet`,
        variant: "destructive"
      });
      return;
    }
    // Removed active cycle restriction - users can now transfer from cycle wallet anytime
    transferMutation.mutate({
      amount,
      direction: transferDirection
    });
  };
  const handleTeamIncomeTransfer = () => {
    const amount = parseFloat(teamIncomeAmount);
    if (isNaN(amount) || amount <= 0) {
      toast({
        title: "Invalid Amount",
        description: "Please enter a valid amount",
        variant: "destructive"
      });
      return;
    }
    if (amount > (profile?.referral_balance || 0)) {
      toast({
        title: "Insufficient Balance",
        description: "Not enough Team Income balance",
        variant: "destructive"
      });
      return;
    }
    teamIncomeTransferMutation.mutate({
      amount,
      destination: teamIncomeDestination
    });
  };
  const handleDirectEarningsTransfer = () => {
    const amount = parseFloat(directEarningsAmount);
    if (isNaN(amount) || amount <= 0) {
      toast({
        title: "Invalid Amount",
        description: "Please enter a valid amount",
        variant: "destructive"
      });
      return;
    }
    const directBalance = (profile as any)?.direct_earnings_balance || 0;
    if (amount > directBalance) {
      toast({
        title: "Insufficient Balance",
        description: "Not enough Direct Earnings balance",
        variant: "destructive"
      });
      return;
    }
    directEarningsTransferMutation.mutate({
      amount,
      destination: directEarningsDestination
    });
  };
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied!",
      description: "Address copied to clipboard"
    });
  };
  const totalWithdrawable = (profile?.wallet_balance || 0) + (profile?.referral_balance || 0);
  return <div className="min-h-screen bg-background pb-20">
      {/* Header with dual wallets */}
      <div className="bg-gradient-to-b from-primary to-primary/80 text-primary-foreground p-6 rounded-b-3xl shadow-lg">
        <div className="flex items-center gap-3 mb-4">
          <WalletIcon className="w-6 h-6" />
          <h1 className="text-2xl font-bold">Wallet</h1>
        </div>
        
        {/* Main Wallet */}
        <div className="bg-primary-foreground/10 rounded-xl p-4 mb-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium opacity-90">Main Wallet</p>
            <span className="text-xs bg-primary-foreground/20 px-2 py-0.5 rounded">Deposit & Withdraw</span>
          </div>
          <p className="text-3xl font-bold">${Number(profile?.wallet_balance || 0).toFixed(2)}</p>
          <p className="text-xs opacity-70 mt-1">Available for withdrawal</p>
        </div>

        {/* Cycle Wallet */}
        <div className="bg-gradient-to-r from-amber-500/20 to-orange-500/20 rounded-xl p-4 border border-amber-400/30">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium opacity-90 flex items-center gap-1">
              <TrendingUp className="w-4 h-4" /> Cycle Wallet
            </p>
            <span className="text-xs bg-amber-400/30 px-2 py-0.5 rounded">Trading</span>
          </div>
          <p className="text-3xl font-bold">${Number(profile?.cycle_wallet_balance || 0).toFixed(2)}</p>
          <p className="text-xs opacity-70 mt-1">Available for cycle investment</p>
        </div>

        {/* Direct Earnings */}
        {((profile as any)?.direct_earnings_balance || 0) > 0 && <div className="bg-green-500/10 rounded-xl p-3 mt-3 border border-green-400/30">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-green-400" />
                <span className="text-sm">Direct Earnings</span>
              </div>
              <span className="font-bold text-green-400">${Number((profile as any)?.direct_earnings_balance || 0).toFixed(2)}</span>
            </div>
            <p className="text-xs opacity-70 mt-1">From referral deposits</p>
          </div>}

        {/* Team Income */}
        {(profile?.referral_balance || 0) > 0 && <div className="bg-primary-foreground/10 rounded-xl p-3 mt-3 border border-primary-foreground/20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4" />
                <span className="text-sm">Team Income</span>
              </div>
              <span className="font-bold">${Number(profile?.referral_balance || 0).toFixed(2)}</span>
            </div>
            <p className="text-xs opacity-70 mt-1">From cycle profit commissions</p>
          </div>}
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
        {/* Transfer Card */}
        <Card className="p-4 bg-gradient-to-br from-primary/5 to-amber-500/5 border-primary/20">
          <div className="flex items-center gap-2 mb-4">
            <RefreshCw className="w-5 h-5 text-primary" />
            <h3 className="font-semibold text-foreground">Transfer Between Wallets</h3>
          </div>
          
          <div className="flex items-center gap-3 mb-4">
            <Button variant={transferDirection === "to-cycle" ? "default" : "outline"} size="sm" onClick={() => setTransferDirection("to-cycle")} className="flex-1">
              Main → Cycle
            </Button>
            <Button variant={transferDirection === "to-main" ? "default" : "outline"} size="sm" onClick={() => setTransferDirection("to-main")} className="flex-1">
              Cycle → Main
            </Button>
          </div>

          {hasActiveCycles && transferDirection === "to-main" && <Alert className="mb-3 border-amber-500/50 bg-amber-500/10">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <AlertDescription className="text-xs text-amber-600">
                Cannot transfer from Cycle Wallet while cycles are active
              </AlertDescription>
            </Alert>}

          <div className="flex items-center gap-2 mb-3">
            <div className="flex-1 text-center p-2 bg-muted rounded-lg">
              <p className="text-xs text-muted-foreground">From</p>
              <p className="font-semibold text-sm">
                {transferDirection === "to-cycle" ? "Main" : "Cycle"}
              </p>
              <p className="text-xs text-muted-foreground">
                ${Number(transferDirection === "to-cycle" ? profile?.wallet_balance : profile?.cycle_wallet_balance || 0).toFixed(2)}
              </p>
            </div>
            <ArrowRight className="w-5 h-5 text-primary" />
            <div className="flex-1 text-center p-2 bg-muted rounded-lg">
              <p className="text-xs text-muted-foreground">To</p>
              <p className="font-semibold text-sm">
                {transferDirection === "to-cycle" ? "Cycle" : "Main"}
              </p>
              <p className="text-xs text-muted-foreground">
                ${Number(transferDirection === "to-cycle" ? profile?.cycle_wallet_balance : profile?.wallet_balance || 0).toFixed(2)}
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <Input type="number" placeholder="Amount" value={transferAmount} onChange={e => setTransferAmount(e.target.value)} min="0" />
            <Button onClick={handleTransfer} disabled={transferMutation.isPending || transferDirection === "to-main" && hasActiveCycles}>
              {transferMutation.isPending ? "..." : "Transfer"}
            </Button>
          </div>
        </Card>

        {/* Team Income Transfer Card */}
        <Card className="p-4 bg-gradient-to-br from-amber-500/5 to-orange-500/5 border-amber-500/20">
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-5 h-5 text-amber-500" />
            <h3 className="font-semibold text-foreground">Transfer Team Income</h3>
          </div>
          
          <div className="bg-amber-500/10 p-3 rounded-lg mb-4">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Available Team Income:</span>
              <span className="font-bold text-amber-600">${Number(profile?.referral_balance || 0).toFixed(2)}</span>
            </div>
          </div>

          {(profile?.referral_balance || 0) > 0 ? <>
              <div className="flex items-center gap-3 mb-4">
                <Button variant={teamIncomeDestination === "to-main" ? "default" : "outline"} size="sm" onClick={() => setTeamIncomeDestination("to-main")} className="flex-1">
                  To Main (Withdraw)
                </Button>
                <Button variant={teamIncomeDestination === "to-cycle" ? "default" : "outline"} size="sm" onClick={() => setTeamIncomeDestination("to-cycle")} className="flex-1">
                  To Cycle (Trade)
                </Button>
              </div>

              <div className="flex items-center gap-2 mb-3">
                <div className="flex-1 text-center p-2 bg-muted rounded-lg">
                  <p className="text-xs text-muted-foreground">From</p>
                  <p className="font-semibold text-sm text-amber-600">Team Income</p>
                  <p className="text-xs text-muted-foreground">
                    ${Number(profile?.referral_balance || 0).toFixed(2)}
                  </p>
                </div>
                <ArrowRight className="w-5 h-5 text-amber-500" />
                <div className="flex-1 text-center p-2 bg-muted rounded-lg">
                  <p className="text-xs text-muted-foreground">To</p>
                  <p className="font-semibold text-sm">
                    {teamIncomeDestination === "to-cycle" ? "Cycle Wallet" : "Main Wallet"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    ${Number(teamIncomeDestination === "to-cycle" ? profile?.cycle_wallet_balance : profile?.wallet_balance || 0).toFixed(2)}
                  </p>
                </div>
              </div>

              <div className="flex gap-2">
                <Input type="number" placeholder="Amount" value={teamIncomeAmount} onChange={e => setTeamIncomeAmount(e.target.value)} min="0" />
                <Button onClick={handleTeamIncomeTransfer} disabled={teamIncomeTransferMutation.isPending} className="bg-amber-600 hover:bg-amber-700">
                  {teamIncomeTransferMutation.isPending ? "..." : "Transfer"}
                </Button>
              </div>

              <p className="text-xs text-muted-foreground mt-3">
                {teamIncomeDestination === "to-main" ? "Transfer to Main Wallet for withdrawal" : "Transfer to Cycle Wallet to invest in trading cycles"}
              </p>
            </> : <div className="text-center py-4">
              <p className="text-sm text-muted-foreground">No team income available yet.</p>
              <p className="text-xs text-muted-foreground mt-1">Invite friends to earn referral commissions!</p>
            </div>}
        </Card>

        {/* Direct Earnings Transfer Card */}
        <Card className="p-4 bg-gradient-to-br from-green-500/5 to-emerald-500/5 border-green-500/20">
          <div className="flex items-center gap-2 mb-4">
            <DollarSign className="w-5 h-5 text-green-500" />
            <h3 className="font-semibold text-foreground">Transfer Direct Earnings</h3>
          </div>
          
          <div className="bg-green-500/10 p-3 rounded-lg mb-4">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Available Direct Earnings:</span>
              <span className="font-bold text-green-500">${Number((profile as any)?.direct_earnings_balance || 0).toFixed(2)}</span>
            </div>
          </div>

          {((profile as any)?.direct_earnings_balance || 0) > 0 ? <>
              <div className="flex items-center gap-3 mb-4">
                <Button variant={directEarningsDestination === "to-main" ? "default" : "outline"} size="sm" onClick={() => setDirectEarningsDestination("to-main")} className="flex-1">
                  To Main (Withdraw)
                </Button>
                <Button variant={directEarningsDestination === "to-cycle" ? "default" : "outline"} size="sm" onClick={() => setDirectEarningsDestination("to-cycle")} className="flex-1">
                  To Cycle (Trade)
                </Button>
              </div>

              <div className="flex items-center gap-2 mb-3">
                <div className="flex-1 text-center p-2 bg-muted rounded-lg">
                  <p className="text-xs text-muted-foreground">From</p>
                  <p className="font-semibold text-sm text-green-500">Direct Earnings</p>
                  <p className="text-xs text-muted-foreground">
                    ${Number((profile as any)?.direct_earnings_balance || 0).toFixed(2)}
                  </p>
                </div>
                <ArrowRight className="w-5 h-5 text-green-500" />
                <div className="flex-1 text-center p-2 bg-muted rounded-lg">
                  <p className="text-xs text-muted-foreground">To</p>
                  <p className="font-semibold text-sm">
                    {directEarningsDestination === "to-cycle" ? "Cycle Wallet" : "Main Wallet"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    ${Number(directEarningsDestination === "to-cycle" ? profile?.cycle_wallet_balance : profile?.wallet_balance || 0).toFixed(2)}
                  </p>
                </div>
              </div>

              <div className="flex gap-2">
                <Input type="number" placeholder="Amount" value={directEarningsAmount} onChange={e => setDirectEarningsAmount(e.target.value)} min="0" />
                <Button onClick={handleDirectEarningsTransfer} disabled={directEarningsTransferMutation.isPending} className="bg-green-600 hover:bg-green-700">
                  {directEarningsTransferMutation.isPending ? "..." : "Transfer"}
                </Button>
              </div>

              <p className="text-xs text-muted-foreground mt-3">
                {directEarningsDestination === "to-main" ? "Transfer to Main Wallet for withdrawal" : "Transfer to Cycle Wallet to invest in trading cycles"}
              </p>
            </> : <div className="text-center py-4">
              <p className="text-sm text-muted-foreground">No direct earnings available yet.</p>
              <p className="text-xs text-muted-foreground mt-1">Earn when your referrals make deposits!</p>
            </div>}
        </Card>
        <div className="grid grid-cols-2 gap-3">
          <Card className="p-4 text-center">
            <ArrowDownToLine className="w-5 h-5 text-success mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">Total Deposits</p>
            <p className="text-lg font-bold text-foreground">${Number(profile?.total_deposits || 0).toFixed(2)}</p>
          </Card>
          <Card className="p-4 text-center">
            <ArrowUpFromLine className="w-5 h-5 text-primary mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">Total Withdrawals</p>
            <p className="text-lg font-bold text-foreground">${Number(profile?.total_withdrawals || 0).toFixed(2)}</p>
          </Card>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Card className="p-4 text-center bg-gradient-to-br from-success/10 to-success/5 border-success/20">
            <TrendingUp className="w-5 h-5 text-success mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">Cycle Profit</p>
            <p className="text-lg font-bold text-success">${Number(profile?.total_profit || 0).toFixed(2)}</p>
          </Card>
          <Card className="p-4 text-center bg-gradient-to-br from-green-500/10 to-green-500/5 border-green-500/20">
            <DollarSign className="w-5 h-5 text-green-500 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">Direct Earnings</p>
            <p className="text-lg font-bold text-green-500">${Number((profile as any)?.total_direct_earnings || 0).toFixed(2)}</p>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-3">
          <Card className="p-4 text-center bg-gradient-to-br from-amber-500/10 to-amber-500/5 border-amber-500/20">
            <Users className="w-5 h-5 text-amber-500 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">Team Income (Cycle Commissions)</p>
            <p className="text-lg font-bold text-amber-500">${Number(profile?.total_referral_earnings || 0).toFixed(2)}</p>
          </Card>
        </div>

        <Tabs defaultValue="deposit" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="deposit">Deposit</TabsTrigger>
            <TabsTrigger value="withdraw">Withdraw</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>

          <TabsContent value="deposit" className="space-y-4 mt-4">
            {/* MyPayVerse Auto-Deposit Wallet */}
            <Card className="p-6 space-y-4 bg-gradient-to-br from-success/5 to-success/10 border-success/30">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-success" />
                <h3 className="font-semibold text-foreground">Your Deposit Wallet</h3>
              </div>
              
              <Alert className="border-success/50 bg-success/10">
                <AlertDescription className="text-xs">
                  <strong>Instant deposits!</strong> Send USDT to your personal wallet address below. Deposits are automatically credited to your account.
                </AlertDescription>
              </Alert>

              {isLoadingMyPayVerseWallet ? <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-success" />
                  <span className="ml-2 text-sm text-muted-foreground">Loading wallet...</span>
                </div> : myPayVerseWallet ? <div className="bg-muted p-4 rounded-lg space-y-4">
                  <Label className="text-sm">Your Personal Deposit Address (BEP20)</Label>
                  
                  <div className="flex justify-center p-4 bg-white rounded-lg">
                    <QRCodeSVG value={myPayVerseWallet.address} size={200} level="H" includeMargin={true} />
                  </div>
                  <p className="text-xs text-center text-muted-foreground">
                    Scan QR code to deposit directly
                  </p>
                  
                  <div className="flex items-center gap-2">
                    <Input value={myPayVerseWallet.address} readOnly className="font-mono text-xs" />
                    <Button size="icon" variant="outline" onClick={() => copyToClipboard(myPayVerseWallet.address)}>
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-success/10 p-2 rounded">
                      <span className="text-muted-foreground">Balance:</span>
                      <span className="font-bold text-success ml-1">${myPayVerseWallet.balance.toFixed(2)}</span>
                    </div>
                    <div className="bg-muted p-2 rounded">
                      <span className="text-muted-foreground">Total Deposits:</span>
                      <span className="font-bold ml-1">${myPayVerseWallet.totalDeposit.toFixed(2)}</span>
                    </div>
                  </div>

                  <Button variant="outline" className="w-full" onClick={() => refetchMyPayVerseWallet()}>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Refresh Balance
                  </Button>
                </div> : <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-success" />
                  <span className="ml-2 text-sm text-muted-foreground">Creating your wallet...</span>
                </div>}

              <div className="bg-muted/50 p-4 rounded-lg space-y-2 border border-success/20">
                <h4 className="font-semibold text-sm text-success">How to Deposit:</h4>
                <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                  <li>Copy your personal wallet address above</li>
                  <li>Send USDT (BEP20 network only) to this address</li>
                  <li>Deposits are automatically credited within minutes</li>
                  <li>Transfer to Cycle Wallet to start trading</li>
                </ol>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="withdraw" className="space-y-4 mt-4">
            <Card className="p-6 space-y-4">
              <h3 className="font-semibold text-foreground">Withdraw USDT (BEP20)</h3>

              <Alert className="border-amber-500/50 bg-amber-500/10">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                <AlertDescription className="text-xs text-amber-600">
                  A <strong>15% CRYPTO TAX</strong> is applied to all withdrawals.
                </AlertDescription>
              </Alert>

              <Alert className="border-primary/50 bg-primary/5">
                <AlertDescription className="text-xs">
                  Withdrawals come from <strong>Main Wallet</strong> + <strong>Team Income</strong>. Transfer from Cycle Wallet first if needed.
                </AlertDescription>
              </Alert>

              <div className="bg-muted/50 p-4 rounded-lg">
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-muted-foreground">Main Wallet:</span>
                  <span className="font-medium">${Number(profile?.wallet_balance || 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-muted-foreground">Team Income:</span>
                  <span className="font-medium">${Number(profile?.referral_balance || 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm font-bold border-t pt-2">
                  <span>Total Withdrawable:</span>
                  <span className="text-primary">${totalWithdrawable.toFixed(2)}</span>
                </div>
              </div>


              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="withdraw-amount">Withdrawal Amount (USDT)</Label>
                  <Input id="withdraw-amount" type="number" placeholder="Min: $10" value={withdrawAmount} onChange={e => setWithdrawAmount(e.target.value)} min="10" />
                  <div className="bg-muted p-3 rounded-lg space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Withdrawal Amount:</span>
                      <span>${withdrawAmountNum.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-destructive">
                      <span>15%CRYPTO TAX:</span>
                      <span>-${(withdrawAmountNum * 0.15).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between font-bold border-t pt-1 text-success">
                      <span>You'll Receive:</span>
                      <span>${(withdrawAmountNum * 0.85).toFixed(2)}</span>
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="withdraw-address">Your BEP20 Wallet Address</Label>
                  <Input id="withdraw-address" placeholder="0x..." value={withdrawAddress} onChange={e => setWithdrawAddress(e.target.value)} />
                </div>
                <Button onClick={handleWithdraw} className="w-full" disabled={withdrawMutation.isPending}>
                  <ArrowUpFromLine className="w-4 h-4 mr-2" />
                  {withdrawMutation.isPending ? "Processing..." : "Request Withdrawal"}
                </Button>
              </div>

              <div className="bg-muted/50 p-4 rounded-lg space-y-2 border border-border">
                <h4 className="font-semibold text-sm">Withdrawal Info:</h4>
                <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
                  <li>Minimum withdrawal: $10</li>
                  <li>15% crypto tax applied</li>
                  <li>Processing time: 24 hours</li>
                  <li>BEP20 network only</li>
                </ul>
              </div>
            </Card>

            <Card className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-foreground">Recent Withdrawals</h3>
              </div>
              <div className="space-y-3">
                {withdrawals && withdrawals.length > 0 ? withdrawals.slice(0, 5).map(withdrawal => <div key={withdrawal.id} className="flex items-center justify-between pb-3 border-b border-border last:border-0">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-primary/10 rounded-lg">
                          <ArrowUpFromLine className="w-4 h-4 text-primary" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground">Withdrawal</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(withdrawal.created_at).toLocaleDateString()}
                          </p>
                          <p className={`text-xs font-medium capitalize ${withdrawal.status === 'approved' ? 'text-success' : withdrawal.status === 'rejected' ? 'text-destructive' : 'text-muted-foreground'}`}>
                            Status: {withdrawal.status}
                          </p>
                        </div>
                      </div>
                      <p className="font-semibold text-primary">-${Number(withdrawal.amount).toFixed(2)}</p>
                    </div>) : <p className="text-sm text-muted-foreground text-center py-4">No withdrawals yet</p>}
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="history" className="space-y-4 mt-4">
            {/* Transaction History */}
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-4">
                <History className="w-5 h-5 text-primary" />
                <h3 className="font-semibold text-foreground">Transaction History</h3>
              </div>

              {/* MyPayVerse Transactions */}
              {myPayVerseTransactions && myPayVerseTransactions.length > 0 && <div className="mb-6">
                  <h4 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-success" />
                    Auto-Deposit Transactions
                  </h4>
                  <div className="space-y-2">
                    {myPayVerseTransactions.map(tx => <div key={tx._id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-lg ${tx.type === 'deposit' ? 'bg-success/10' : 'bg-primary/10'}`}>
                            {tx.type === 'deposit' ? <ArrowDownToLine className="w-4 h-4 text-success" /> : <ArrowUpFromLine className="w-4 h-4 text-primary" />}
                          </div>
                          <div>
                            <p className="text-sm font-medium capitalize">{tx.type}</p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(tx.createdAt).toLocaleDateString()} {new Date(tx.createdAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className={`font-semibold ${tx.type === 'deposit' ? 'text-success' : 'text-primary'}`}>
                            {tx.type === 'deposit' ? '+' : '-'}${Number(tx.amount).toFixed(2)}
                          </p>
                          <p className={`text-xs capitalize ${tx.status === 'completed' ? 'text-success' : tx.status === 'pending' ? 'text-amber-500' : 'text-destructive'}`}>
                            {tx.status}
                          </p>
                        </div>
                      </div>)}
                  </div>
                </div>}

              {/* Deposits History */}
              <div className="mb-6">
                <h4 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                  <ArrowDownToLine className="w-4 h-4 text-success" />
                  Deposits
                </h4>
                <div className="space-y-2">
                  {deposits && deposits.length > 0 ? deposits.map(deposit => <div key={deposit.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-lg ${deposit.status === 'approved' ? 'bg-success/10' : deposit.status === 'rejected' ? 'bg-destructive/10' : 'bg-amber-500/10'}`}>
                            {deposit.status === 'approved' ? <CheckCircle2 className="w-4 h-4 text-success" /> : deposit.status === 'rejected' ? <XCircle className="w-4 h-4 text-destructive" /> : <Clock className="w-4 h-4 text-amber-500" />}
                          </div>
                          <div>
                            <p className="text-sm font-medium">Deposit</p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(deposit.created_at).toLocaleDateString()} {new Date(deposit.created_at).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                            </p>
                            {deposit.transaction_hash && <p className="text-xs text-muted-foreground font-mono truncate max-w-[150px]">
                                TX: {deposit.transaction_hash.slice(0, 10)}...
                              </p>}
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-success">+${Number(deposit.amount).toFixed(2)}</p>
                          <p className={`text-xs capitalize ${deposit.status === 'approved' ? 'text-success' : deposit.status === 'rejected' ? 'text-destructive' : 'text-amber-500'}`}>
                            {deposit.status}
                          </p>
                        </div>
                      </div>) : <p className="text-sm text-muted-foreground text-center py-4">No deposits yet</p>}
                </div>
              </div>

              {/* Withdrawals History */}
              <div>
                <h4 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                  <ArrowUpFromLine className="w-4 h-4 text-primary" />
                  Withdrawals
                </h4>
                <div className="space-y-2">
                  {withdrawals && withdrawals.length > 0 ? withdrawals.map(withdrawal => <div key={withdrawal.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-lg ${withdrawal.status === 'approved' || withdrawal.status === 'paid' ? 'bg-success/10' : withdrawal.status === 'rejected' ? 'bg-destructive/10' : 'bg-amber-500/10'}`}>
                            {withdrawal.status === 'approved' || withdrawal.status === 'paid' ? <CheckCircle2 className="w-4 h-4 text-success" /> : withdrawal.status === 'rejected' ? <XCircle className="w-4 h-4 text-destructive" /> : <Clock className="w-4 h-4 text-amber-500" />}
                          </div>
                          <div>
                            <p className="text-sm font-medium">Withdrawal</p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(withdrawal.created_at).toLocaleDateString()} {new Date(withdrawal.created_at).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                            </p>
                            <p className="text-xs text-muted-foreground font-mono truncate max-w-[150px]">
                              To: {withdrawal.wallet_address.slice(0, 8)}...{withdrawal.wallet_address.slice(-6)}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-primary">-${Number(withdrawal.amount).toFixed(2)}</p>
                          <p className={`text-xs capitalize ${withdrawal.status === 'approved' || withdrawal.status === 'paid' ? 'text-success' : withdrawal.status === 'rejected' ? 'text-destructive' : 'text-amber-500'}`}>
                            {withdrawal.status}
                          </p>
                          {withdrawal.rejection_reason && <p className="text-xs text-destructive truncate max-w-[120px]">
                              {withdrawal.rejection_reason}
                            </p>}
                        </div>
                      </div>) : <p className="text-sm text-muted-foreground text-center py-4">No withdrawals yet</p>}
                </div>
              </div>

              {/* Empty state */}
              {(!deposits || deposits.length === 0) && (!withdrawals || withdrawals.length === 0) && (!myPayVerseTransactions || myPayVerseTransactions.length === 0) && <div className="text-center py-8">
                  <History className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">No transactions yet</p>
                  <p className="text-xs text-muted-foreground mt-1">Your deposit and withdrawal history will appear here</p>
                </div>}
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <BottomNav />
    </div>;
};
export default Wallet;