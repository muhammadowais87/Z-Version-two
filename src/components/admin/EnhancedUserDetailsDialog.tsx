import { useState, useEffect } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { 
  User, Wallet, DollarSign, ArrowDownToLine, ArrowUpFromLine, 
  TrendingUp, Users, Edit, Save, X, Clock, CheckCircle, XCircle,
  Plus, Minus, AlertTriangle, RotateCcw, Zap, Copy, ExternalLink,
  ArrowUpRight, ArrowDownRight, Network, Trash2, ArrowLeftRight, RefreshCw
} from "lucide-react";

interface EnhancedUserDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: any;
  userData: {
    deposits: any[];
    withdrawals: any[];
    cycles: any[];
    progress: any;
    downline: any[];
    upline: any[];
    earningsHistory: any[];
    transfers: any[];
  } | null | undefined;
  isLoading: boolean;
  allUsers?: any[];
  onSelectUser?: (user: any) => void;
}

const EnhancedUserDetailsDialog = ({ 
  open, 
  onOpenChange, 
  user, 
  userData, 
  isLoading,
  allUsers,
  onSelectUser
}: EnhancedUserDetailsDialogProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [quickAction, setQuickAction] = useState<string | null>(null);
  const [quickAmount, setQuickAmount] = useState("");
  const [editingCycleId, setEditingCycleId] = useState<string | null>(null);
  const [editCycleAmount, setEditCycleAmount] = useState("");
  const [editForm, setEditForm] = useState({
    wallet_balance: "",
    cycle_wallet_balance: "",
    referral_balance: "",
    direct_earnings_balance: "",
    total_deposits: "",
    total_withdrawals: "",
    total_profit: "",
    total_referral_earnings: "",
    total_direct_earnings: "",
  });

  // Fetch MyPayVerse wallet address for this user
  const { data: mpvWalletData } = useQuery({
    queryKey: ["admin-mpv-wallet", user?.id],
    queryFn: async () => {
      // Look up the most recent deposit with a MyPayVerse transaction hash to find the wallet address
      const { data, error } = await supabase
        .from("deposits")
        .select("admin_wallet_address")
        .eq("user_id", user.id)
        .like("transaction_hash", "mypayverse_%")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (error) throw error;
      return data?.admin_wallet_address || null;
    },
    enabled: open && !!user?.id,
  });

  const updateUserMutation = useMutation({
    mutationFn: async (updates: Record<string, number>) => {
      const { error } = await supabase
        .from("profiles")
        .update(updates)
        .eq("id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      // Invalidate all admin-related queries to ensure UI updates everywhere
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      queryClient.invalidateQueries({ queryKey: ["admin-user-details-enhanced", user.id] });
      queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
      // Also invalidate user-facing queries in case admin is viewing their own data
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      queryClient.invalidateQueries({ queryKey: ["referrals"] });
      queryClient.invalidateQueries({ queryKey: ["referral-earnings-history"] });
      setIsEditing(false);
      setQuickAction(null);
      setQuickAmount("");
      toast({
        title: "Success",
        description: "User data updated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const togglePenaltyMutation = useMutation({
    mutationFn: async (isPenalty: boolean) => {
      const { error } = await supabase
        .from("user_trade_progress")
        .update({ is_penalty_mode: isPenalty, updated_at: new Date().toISOString() })
        .eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-user-details-enhanced", user.id] });
      toast({
        title: "Success",
        description: "Penalty mode toggled",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const resetProgressMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("user_trade_progress")
        .update({ 
          completed_cycles: [],
          is_penalty_mode: false,
          active_chance: null,
          chance_1_status: 'available',
          chance_2_status: 'locked',
          penalty_chance: null,
          updated_at: new Date().toISOString()
        })
        .eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-user-details-enhanced", user.id] });
      toast({
        title: "Success",
        description: "User progress has been reset",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Delete mutations for user history
  const deleteDepositMutation = useMutation({
    mutationFn: async (depositId: string) => {
      const { error } = await supabase.from("deposits").delete().eq("id", depositId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-user-details-enhanced", user.id] });
      queryClient.invalidateQueries({ queryKey: ["admin-deposits"] });
      toast({ title: "Success", description: "Deposit deleted" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteWithdrawalMutation = useMutation({
    mutationFn: async (withdrawalId: string) => {
      const { error } = await supabase.from("withdrawals").delete().eq("id", withdrawalId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-user-details-enhanced", user.id] });
      queryClient.invalidateQueries({ queryKey: ["admin-withdrawals"] });
      toast({ title: "Success", description: "Withdrawal deleted" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteCycleMutation = useMutation({
    mutationFn: async (cycleId: string) => {
      const { error } = await supabase.from("ai_trade_cycles").delete().eq("id", cycleId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-user-details-enhanced", user.id] });
      toast({ title: "Success", description: "Cycle deleted" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateCycleMutation = useMutation({
    mutationFn: async ({ cycleId, amount, clearAdditional }: { cycleId: string; amount: number; clearAdditional?: boolean }) => {
      const updates: any = { 
        investment_amount: amount,
        updated_at: new Date().toISOString()
      };
      if (clearAdditional) {
        updates.additional_investments = [];
      }
      const { error } = await supabase
        .from("ai_trade_cycles")
        .update(updates)
        .eq("id", cycleId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-user-details-enhanced", user.id] });
      setEditingCycleId(null);
      setEditCycleAmount("");
      toast({ title: "Success", description: "Cycle investment updated" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteEarningMutation = useMutation({
    mutationFn: async (earningId: string) => {
      const { error } = await supabase.from("referral_earnings_history").delete().eq("id", earningId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-user-details-enhanced", user.id] });
      toast({ title: "Success", description: "Earning record deleted" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteTransferMutation = useMutation({
    mutationFn: async (transferId: string) => {
      const { error } = await supabase.from("wallet_transfers").delete().eq("id", transferId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-user-details-enhanced", user.id] });
      toast({ title: "Success", description: "Transfer record deleted" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteAllUserHistoryMutation = useMutation({
    mutationFn: async (type: "deposits" | "withdrawals" | "cycles" | "earnings" | "transfers" | "all") => {
      if (type === "deposits" || type === "all") {
        await supabase.from("deposits").delete().eq("user_id", user.id);
      }
      if (type === "withdrawals" || type === "all") {
        await supabase.from("withdrawals").delete().eq("user_id", user.id);
      }
      if (type === "cycles" || type === "all") {
        await supabase.from("ai_trade_cycles").delete().eq("user_id", user.id);
      }
      if (type === "earnings" || type === "all") {
        await supabase.from("referral_earnings_history").delete().eq("referrer_id", user.id);
      }
      if (type === "transfers" || type === "all") {
        await supabase.from("wallet_transfers").delete().eq("user_id", user.id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-user-details-enhanced", user.id] });
      queryClient.invalidateQueries({ queryKey: ["admin-deposits"] });
      queryClient.invalidateQueries({ queryKey: ["admin-withdrawals"] });
      toast({ title: "Success", description: "History deleted" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied!", description: text });
  };

  const handleStartEdit = () => {
    setEditForm({
      wallet_balance: String(user?.wallet_balance || 0),
      cycle_wallet_balance: String(user?.cycle_wallet_balance || 0),
      referral_balance: String(user?.referral_balance || 0),
      direct_earnings_balance: String(user?.direct_earnings_balance || 0),
      total_deposits: String(user?.total_deposits || 0),
      total_withdrawals: String(user?.total_withdrawals || 0),
      total_profit: String(user?.total_profit || 0),
      total_referral_earnings: String(user?.total_referral_earnings || 0),
      total_direct_earnings: String(user?.total_direct_earnings || 0),
    });
    setIsEditing(true);
  };

  const handleSave = () => {
    updateUserMutation.mutate({
      wallet_balance: parseFloat(editForm.wallet_balance) || 0,
      cycle_wallet_balance: parseFloat(editForm.cycle_wallet_balance) || 0,
      referral_balance: parseFloat(editForm.referral_balance) || 0,
      direct_earnings_balance: parseFloat(editForm.direct_earnings_balance) || 0,
      total_deposits: parseFloat(editForm.total_deposits) || 0,
      total_withdrawals: parseFloat(editForm.total_withdrawals) || 0,
      total_profit: parseFloat(editForm.total_profit) || 0,
      total_referral_earnings: parseFloat(editForm.total_referral_earnings) || 0,
      total_direct_earnings: parseFloat(editForm.total_direct_earnings) || 0,
    });
  };

  const handleQuickAction = (action: string) => {
    const amount = parseFloat(quickAmount);
    if (isNaN(amount) || amount <= 0) {
      toast({ title: "Error", description: "Please enter a valid amount", variant: "destructive" });
      return;
    }

    let updates: Record<string, number> = {};
    const currentValue = (field: string) => Number(user?.[field] || 0);

    switch (action) {
      case "add_main":
        updates = { 
          wallet_balance: currentValue("wallet_balance") + amount,
          total_deposits: currentValue("total_deposits") + amount 
        };
        break;
      case "deduct_main":
        updates = { wallet_balance: Math.max(0, currentValue("wallet_balance") - amount) };
        break;
      case "add_cycle":
        updates = { cycle_wallet_balance: currentValue("cycle_wallet_balance") + amount };
        break;
      case "deduct_cycle":
        updates = { cycle_wallet_balance: Math.max(0, currentValue("cycle_wallet_balance") - amount) };
        break;
      case "add_team":
        updates = { 
          referral_balance: currentValue("referral_balance") + amount,
          total_referral_earnings: currentValue("total_referral_earnings") + amount
        };
        break;
      case "deduct_team":
        updates = { referral_balance: Math.max(0, currentValue("referral_balance") - amount) };
        break;
      case "add_direct":
        updates = { 
          direct_earnings_balance: currentValue("direct_earnings_balance") + amount,
          total_direct_earnings: currentValue("total_direct_earnings") + amount
        };
        break;
      case "deduct_direct":
        updates = { direct_earnings_balance: Math.max(0, currentValue("direct_earnings_balance") - amount) };
        break;
      case "add_deposits":
        updates = { total_deposits: currentValue("total_deposits") + amount };
        break;
      case "deduct_deposits":
        updates = { total_deposits: Math.max(0, currentValue("total_deposits") - amount) };
        break;
      case "add_withdrawals":
        updates = { total_withdrawals: currentValue("total_withdrawals") + amount };
        break;
      case "deduct_withdrawals":
        updates = { total_withdrawals: Math.max(0, currentValue("total_withdrawals") - amount) };
        break;
      case "add_total_direct":
        updates = { total_direct_earnings: currentValue("total_direct_earnings") + amount };
        break;
      case "deduct_total_direct":
        updates = { total_direct_earnings: Math.max(0, currentValue("total_direct_earnings") - amount) };
        break;
    }

    updateUserMutation.mutate(updates);
  };

  const navigateToUser = (userId: string) => {
    const targetUser = allUsers?.find(u => u.id === userId);
    if (targetUser && onSelectUser) {
      onSelectUser(targetUser);
    }
  };

  if (!user) return null;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "approved":
      case "completed":
      case "paid":
        return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">{status}</Badge>;
      case "pending":
      case "active":
        return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">{status}</Badge>;
      case "rejected":
      case "broken":
        return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">{status}</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <User className="w-5 h-5 text-primary" />
              User Details
              {user.isAdmin && <Badge className="ml-2">Admin</Badge>}
            </div>
            {!isEditing ? (
              <Button size="sm" variant="outline" onClick={handleStartEdit}>
                <Edit className="w-4 h-4 mr-1" />
                Edit
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setIsEditing(false)}>
                  <X className="w-4 h-4 mr-1" />
                  Cancel
                </Button>
                <Button size="sm" onClick={handleSave} disabled={updateUserMutation.isPending}>
                  <Save className="w-4 h-4 mr-1" />
                  Save
                </Button>
              </div>
            )}
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="h-[75vh]">
          <div className="space-y-4 pr-4">
            {/* User Info Header */}
            <Card>
              <CardContent className="pt-4">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div>
                    <Label className="text-muted-foreground text-xs">User ID</Label>
                    <div className="flex items-center gap-1">
                      <p className="font-mono text-sm break-all">{user.id.slice(0, 12)}...</p>
                      <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => copyToClipboard(user.id)}>
                        <Copy className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs">Email</Label>
                    <p className="text-sm">{user.email}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs">Telegram</Label>
                    <p className="text-sm">{user.telegram_username || user.telegram_first_name || "N/A"}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs">Referral Code</Label>
                    <div className="flex items-center gap-1">
                      <p className="font-mono text-sm font-bold text-primary">{user.referral_code}</p>
                      <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => copyToClipboard(user.referral_code)}>
                        <Copy className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs">Referred By</Label>
                    {user.referred_by_code ? (
                      <div className="flex items-center gap-1">
                        <p className="font-mono text-sm">{user.referred_by_code}</p>
                        <ArrowUpRight className="w-3 h-3 text-muted-foreground" />
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">Direct signup</p>
                    )}
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs">Joined</Label>
                    <p className="text-sm">{new Date(user.created_at).toLocaleDateString()}</p>
                  </div>
                  {/* MyPayVerse Wallet Address */}
                  <div className="col-span-2 md:col-span-3 border-t pt-3 mt-2">
                    <Label className="text-muted-foreground text-xs flex items-center gap-1">
                      <Wallet className="w-3 h-3" />
                      MyPayVerse Wallet Address
                    </Label>
                    {mpvWalletData ? (
                      <div className="flex items-center gap-1">
                        <p className="font-mono text-sm text-blue-400 break-all">{mpvWalletData}</p>
                        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => copyToClipboard(mpvWalletData)}>
                          <Copy className="w-3 h-3" />
                        </Button>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">No wallet found</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Quick Actions */}
            <Card className="border-primary/30 bg-primary/5">
              <CardHeader className="py-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Zap className="w-4 h-4 text-primary" />
                  Quick Actions
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                  <Button size="sm" variant="outline" className="text-green-400 border-green-400/30" onClick={() => setQuickAction("add_main")}>
                    <Plus className="w-3 h-3 mr-1" /> Main
                  </Button>
                  <Button size="sm" variant="outline" className="text-red-400 border-red-400/30" onClick={() => setQuickAction("deduct_main")}>
                    <Minus className="w-3 h-3 mr-1" /> Main
                  </Button>
                  <Button size="sm" variant="outline" className="text-green-400 border-green-400/30" onClick={() => setQuickAction("add_cycle")}>
                    <Plus className="w-3 h-3 mr-1" /> Cycle
                  </Button>
                  <Button size="sm" variant="outline" className="text-red-400 border-red-400/30" onClick={() => setQuickAction("deduct_cycle")}>
                    <Minus className="w-3 h-3 mr-1" /> Cycle
                  </Button>
                  <Button size="sm" variant="outline" className="text-green-400 border-green-400/30" onClick={() => setQuickAction("add_team")}>
                    <Plus className="w-3 h-3 mr-1" /> Team
                  </Button>
                  <Button size="sm" variant="outline" className="text-red-400 border-red-400/30" onClick={() => setQuickAction("deduct_team")}>
                    <Minus className="w-3 h-3 mr-1" /> Team
                  </Button>
                  <Button size="sm" variant="outline" className="text-green-400 border-green-400/30" onClick={() => setQuickAction("add_direct")}>
                    <Plus className="w-3 h-3 mr-1" /> Direct
                  </Button>
                  <Button size="sm" variant="outline" className="text-red-400 border-red-400/30" onClick={() => setQuickAction("deduct_direct")}>
                    <Minus className="w-3 h-3 mr-1" /> Direct
                  </Button>
                  <Button size="sm" variant="outline" className="text-cyan-400 border-cyan-400/30" onClick={() => setQuickAction("add_deposits")}>
                    <Plus className="w-3 h-3 mr-1" /> Deposits
                  </Button>
                  <Button size="sm" variant="outline" className="text-orange-400 border-orange-400/30" onClick={() => setQuickAction("deduct_deposits")}>
                    <Minus className="w-3 h-3 mr-1" /> Deposits
                  </Button>
                  <Button size="sm" variant="outline" className="text-pink-400 border-pink-400/30" onClick={() => setQuickAction("add_withdrawals")}>
                    <Plus className="w-3 h-3 mr-1" /> Withdrawals
                  </Button>
                  <Button size="sm" variant="outline" className="text-amber-400 border-amber-400/30" onClick={() => setQuickAction("deduct_withdrawals")}>
                    <Minus className="w-3 h-3 mr-1" /> Withdrawals
                  </Button>
                  <Button size="sm" variant="outline" className="text-emerald-400 border-emerald-400/30" onClick={() => setQuickAction("add_total_direct")}>
                    <Plus className="w-3 h-3 mr-1" /> Total Direct
                  </Button>
                  <Button size="sm" variant="outline" className="text-rose-400 border-rose-400/30" onClick={() => setQuickAction("deduct_total_direct")}>
                    <Minus className="w-3 h-3 mr-1" /> Total Direct
                  </Button>
                </div>

                {quickAction && (
                  <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
                    <Label className="text-xs whitespace-nowrap">{quickAction.replace(/_/g, " ").toUpperCase()}:</Label>
                    <Input
                      type="number"
                      placeholder="Amount"
                      value={quickAmount}
                      onChange={(e) => setQuickAmount(e.target.value)}
                      className="w-32"
                    />
                    <Button size="sm" onClick={() => handleQuickAction(quickAction)} disabled={updateUserMutation.isPending}>
                      Apply
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => { setQuickAction(null); setQuickAmount(""); }}>
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                )}

                {/* Progress Controls */}
                <div className="flex flex-wrap gap-2 pt-2 border-t">
                  <Button 
                    size="sm" 
                    variant={userData?.progress?.is_penalty_mode ? "destructive" : "outline"}
                    onClick={() => togglePenaltyMutation.mutate(!userData?.progress?.is_penalty_mode)}
                    disabled={togglePenaltyMutation.isPending}
                  >
                    <AlertTriangle className="w-3 h-3 mr-1" />
                    {userData?.progress?.is_penalty_mode ? "Disable Penalty" : "Enable Penalty"}
                  </Button>
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => resetProgressMutation.mutate()}
                    disabled={resetProgressMutation.isPending}
                  >
                    <RotateCcw className="w-3 h-3 mr-1" />
                    Reset Progress
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Balances */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {isEditing ? (
                <>
                  <div className="space-y-1">
                    <Label className="text-xs">Main Wallet</Label>
                    <Input
                      type="number"
                      value={editForm.wallet_balance}
                      onChange={(e) => setEditForm({ ...editForm, wallet_balance: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Cycle Wallet</Label>
                    <Input
                      type="number"
                      value={editForm.cycle_wallet_balance}
                      onChange={(e) => setEditForm({ ...editForm, cycle_wallet_balance: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Team Income</Label>
                    <Input
                      type="number"
                      value={editForm.referral_balance}
                      onChange={(e) => setEditForm({ ...editForm, referral_balance: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Direct Earnings</Label>
                    <Input
                      type="number"
                      value={editForm.direct_earnings_balance}
                      onChange={(e) => setEditForm({ ...editForm, direct_earnings_balance: e.target.value })}
                    />
                  </div>
                </>
              ) : (
                <>
                  <Card className="bg-gradient-to-br from-green-500/10 to-green-500/5 border-green-500/20">
                    <CardContent className="pt-4">
                      <div className="flex items-center gap-2">
                        <Wallet className="w-4 h-4 text-green-400" />
                        <span className="text-xs text-muted-foreground">Main Wallet</span>
                      </div>
                      <p className="text-xl font-bold text-green-400">${Number(user.wallet_balance || 0).toFixed(2)}</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-gradient-to-br from-purple-500/10 to-purple-500/5 border-purple-500/20">
                    <CardContent className="pt-4">
                      <div className="flex items-center gap-2">
                        <DollarSign className="w-4 h-4 text-purple-400" />
                        <span className="text-xs text-muted-foreground">Cycle Wallet</span>
                      </div>
                      <p className="text-xl font-bold text-purple-400">${Number(user.cycle_wallet_balance || 0).toFixed(2)}</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-gradient-to-br from-blue-500/10 to-blue-500/5 border-blue-500/20">
                    <CardContent className="pt-4">
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-blue-400" />
                        <span className="text-xs text-muted-foreground">Team Income</span>
                      </div>
                      <p className="text-xl font-bold text-blue-400">${Number(user.referral_balance || 0).toFixed(2)}</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
                    <CardContent className="pt-4">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-primary" />
                        <span className="text-xs text-muted-foreground">Direct Earnings</span>
                      </div>
                      <p className="text-xl font-bold text-primary">${Number(user.direct_earnings_balance || 0).toFixed(2)}</p>
                    </CardContent>
                  </Card>
                </>
              )}
            </div>

            {/* Stats Row */}
            {isEditing ? (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Total Deposits</Label>
                  <Input
                    type="number"
                    value={editForm.total_deposits}
                    onChange={(e) => setEditForm({ ...editForm, total_deposits: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Total Withdrawals</Label>
                  <Input
                    type="number"
                    value={editForm.total_withdrawals}
                    onChange={(e) => setEditForm({ ...editForm, total_withdrawals: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Total Profit</Label>
                  <Input
                    type="number"
                    value={editForm.total_profit}
                    onChange={(e) => setEditForm({ ...editForm, total_profit: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Total Referral Earnings</Label>
                  <Input
                    type="number"
                    value={editForm.total_referral_earnings}
                    onChange={(e) => setEditForm({ ...editForm, total_referral_earnings: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Total Direct Earnings</Label>
                  <Input
                    type="number"
                    value={editForm.total_direct_earnings}
                    onChange={(e) => setEditForm({ ...editForm, total_direct_earnings: e.target.value })}
                  />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-5 gap-2 text-center">
                <div className="p-2 rounded-lg bg-muted/30">
                  <p className="text-xs text-muted-foreground">Total Deposits</p>
                  <p className="font-bold">${Number(user.total_deposits || 0).toFixed(2)}</p>
                </div>
                <div className="p-2 rounded-lg bg-muted/30">
                  <p className="text-xs text-muted-foreground">Total Withdrawals</p>
                  <p className="font-bold">${Number(user.total_withdrawals || 0).toFixed(2)}</p>
                </div>
                <div className="p-2 rounded-lg bg-muted/30">
                  <p className="text-xs text-muted-foreground">Total Profit</p>
                  <p className="font-bold text-green-400">${Number(user.total_profit || 0).toFixed(2)}</p>
                </div>
                <div className="p-2 rounded-lg bg-muted/30">
                  <p className="text-xs text-muted-foreground">Total Referral</p>
                  <p className="font-bold text-blue-400">${Number(user.total_referral_earnings || 0).toFixed(2)}</p>
                </div>
                <div className="p-2 rounded-lg bg-muted/30">
                  <p className="text-xs text-muted-foreground">Reinvested</p>
                  <p className="font-bold text-orange-400">
                    ${userData?.cycles?.reduce((total: number, cycle: any) => {
                      const additionalInvestments = cycle.additional_investments || [];
                      const cycleReinvested = additionalInvestments.reduce((sum: number, inv: any) => sum + (inv.amount || 0), 0);
                      return total + cycleReinvested;
                    }, 0).toFixed(2) || '0.00'}
                  </p>
                </div>
              </div>
            )}

            {/* Reinvestment Breakdown Section */}
            {userData?.cycles && (
              <Card className="border-purple-500/30 bg-purple-500/5">
                <CardHeader className="py-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <RefreshCw className="w-4 h-4 text-purple-400" />
                    Reinvestment Breakdown
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div className="p-3 rounded-lg bg-muted/30 border border-orange-500/20">
                      <p className="text-xs text-muted-foreground mb-1">From Cycle Wallet</p>
                      <p className="font-bold text-orange-400 text-lg">
                        ${userData.cycles.reduce((total: number, cycle: any) => {
                          const additionalInvestments = cycle.additional_investments || [];
                          const fromCycle = additionalInvestments
                            .filter((inv: any) => !inv.source || inv.source !== 'team_income')
                            .reduce((sum: number, inv: any) => sum + (inv.amount || 0), 0);
                          return total + fromCycle;
                        }, 0).toFixed(2)}
                      </p>
                    </div>
                    <div className="p-3 rounded-lg bg-muted/30 border border-blue-500/20">
                      <p className="text-xs text-muted-foreground mb-1">From Team Income</p>
                      <p className="font-bold text-blue-400 text-lg">
                        ${userData.cycles.reduce((total: number, cycle: any) => {
                          const additionalInvestments = cycle.additional_investments || [];
                          const fromTeam = additionalInvestments
                            .filter((inv: any) => inv.source === 'team_income')
                            .reduce((sum: number, inv: any) => sum + (inv.amount || 0), 0);
                          return total + fromTeam;
                        }, 0).toFixed(2)}
                      </p>
                    </div>
                    <div className="p-3 rounded-lg bg-muted/30 border border-purple-500/20">
                      <p className="text-xs text-muted-foreground mb-1">Total Reinvested</p>
                      <p className="font-bold text-purple-400 text-lg">
                        ${userData.cycles.reduce((total: number, cycle: any) => {
                          const additionalInvestments = cycle.additional_investments || [];
                          const cycleReinvested = additionalInvestments.reduce((sum: number, inv: any) => sum + (inv.amount || 0), 0);
                          return total + cycleReinvested;
                        }, 0).toFixed(2)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {isLoading ? (
              <div className="flex justify-center p-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : userData && (
              <Tabs defaultValue="network" className="w-full">
                <TabsList className="grid w-full grid-cols-6">
                  <TabsTrigger value="network" className="flex items-center gap-1">
                    <Network className="w-3 h-3" />
                    Network
                  </TabsTrigger>
                  <TabsTrigger value="cycles">Cycles ({userData.cycles.length})</TabsTrigger>
                  <TabsTrigger value="deposits">Deposits ({userData.deposits.length})</TabsTrigger>
                  <TabsTrigger value="withdrawals">Withdrawals ({userData.withdrawals.length})</TabsTrigger>
                  <TabsTrigger value="transfers" className="flex items-center gap-1">
                    <ArrowLeftRight className="w-3 h-3" />
                    Transfers ({userData.transfers?.length || 0})
                  </TabsTrigger>
                  <TabsTrigger value="earnings">Earnings</TabsTrigger>
                </TabsList>

                <TabsContent value="network" className="space-y-4">
                  {/* Upline */}
                  <Card>
                    <CardHeader className="py-3">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <ArrowUpRight className="w-4 h-4 text-blue-400" />
                        Upline (Referrers) - {userData.upline.length} levels
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {userData.upline.length > 0 ? (
                        <div className="space-y-2">
                          {userData.upline.map((upline: any) => (
                            <div
                              key={upline.profile?.id}
                              className="flex items-center justify-between p-2 rounded-lg bg-blue-500/10 border border-blue-500/20 cursor-pointer hover:bg-blue-500/20"
                              onClick={() => upline.profile?.id && navigateToUser(upline.profile.id)}
                            >
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="text-blue-400">L{upline.level}</Badge>
                                <div>
                                  <p className="text-sm font-medium">{upline.profile?.telegram_username || upline.profile?.email}</p>
                                  <p className="text-xs text-muted-foreground font-mono">{upline.profile?.referral_code}</p>
                                </div>
                              </div>
                              <ExternalLink className="w-4 h-4 text-muted-foreground" />
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-center text-muted-foreground py-2">Direct signup - no upline</p>
                      )}
                    </CardContent>
                  </Card>

                  {/* Downline */}
                  <Card>
                    <CardHeader className="py-3">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <ArrowDownRight className="w-4 h-4 text-green-400" />
                        Downline (Referrals) - {userData.downline.length} users
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {userData.downline.length > 0 ? (
                        <div className="space-y-2 max-h-60 overflow-y-auto">
                          {userData.downline.map((down: any) => (
                            <div
                              key={down.id}
                              className="flex items-center justify-between p-2 rounded-lg bg-green-500/10 border border-green-500/20 cursor-pointer hover:bg-green-500/20"
                              onClick={() => down.profile?.id && navigateToUser(down.profile.id)}
                            >
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="text-green-400">L{down.level}</Badge>
                                <div>
                                  <p className="text-sm font-medium">{down.profile?.telegram_username || down.profile?.email}</p>
                                  <p className="text-xs text-muted-foreground font-mono">{down.profile?.referral_code}</p>
                                </div>
                              </div>
                              <div className="text-right">
                                <p className="text-sm font-medium">${Number(down.profile?.total_deposits || 0).toFixed(0)}</p>
                                <p className="text-xs text-muted-foreground">deposits</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-center text-muted-foreground py-2">No referrals yet</p>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="cycles" className="space-y-2">
                  {userData.cycles.length > 0 && (
                    <div className="flex justify-end mb-2">
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => deleteAllUserHistoryMutation.mutate("cycles")}
                        disabled={deleteAllUserHistoryMutation.isPending}
                      >
                        <Trash2 className="w-3 h-3 mr-1" />
                        Delete All Cycles
                      </Button>
                    </div>
                  )}
                  {userData.progress && (
                    <Card className="bg-muted/30">
                      <CardContent className="pt-4">
                        <div className="grid grid-cols-3 gap-2 text-sm">
                          <div>
                            <span className="text-muted-foreground">Active Chance:</span>{" "}
                            <Badge>{userData.progress.active_chance || "None"}</Badge>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Chance 1:</span>{" "}
                            {getStatusBadge(userData.progress.chance_1_status)}
                          </div>
                          <div>
                            <span className="text-muted-foreground">Chance 2:</span>{" "}
                            {getStatusBadge(userData.progress.chance_2_status)}
                          </div>
                          <div>
                            <span className="text-muted-foreground">Penalty Mode:</span>{" "}
                            <Badge variant={userData.progress.is_penalty_mode ? "destructive" : "secondary"}>
                              {userData.progress.is_penalty_mode ? "Yes" : "No"}
                            </Badge>
                          </div>
                          <div className="col-span-2">
                            <span className="text-muted-foreground">Completed Cycles:</span>{" "}
                            {userData.progress.completed_cycles?.join(", ") || "None"}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                  {userData.cycles.map((cycle: any) => (
                    <Card key={cycle.id} className="bg-card/50">
                      <CardContent className="py-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">
                              {cycle.cycle_type === 4 ? "Special" : `Cycle ${cycle.cycle_type}`}
                            </Badge>
                            {getStatusBadge(cycle.status)}
                            <Badge variant="outline" className="text-xs">Chance {cycle.chance_number || 1}</Badge>
                          </div>
                          <div className="flex items-center gap-2">
                            {editingCycleId === cycle.id ? (
                              <>
                                <Input
                                  type="number"
                                  value={editCycleAmount}
                                  onChange={(e) => setEditCycleAmount(e.target.value)}
                                  className="w-24 h-7 text-sm"
                                  placeholder="Amount"
                                />
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-6 w-6 text-green-500 hover:text-green-400"
                                  onClick={() => updateCycleMutation.mutate({ 
                                    cycleId: cycle.id, 
                                    amount: parseFloat(editCycleAmount) || 0,
                                    clearAdditional: true
                                  })}
                                  disabled={updateCycleMutation.isPending}
                                >
                                  <Save className="w-3 h-3" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-6 w-6"
                                  onClick={() => { setEditingCycleId(null); setEditCycleAmount(""); }}
                                >
                                  <X className="w-3 h-3" />
                                </Button>
                              </>
                            ) : (
                              <>
                                <span className="text-sm font-medium">${Number(cycle.investment_amount).toFixed(2)}</span>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-6 w-6 text-blue-400 hover:text-blue-300"
                                  onClick={() => { 
                                    setEditingCycleId(cycle.id); 
                                    setEditCycleAmount(String(cycle.investment_amount)); 
                                  }}
                                >
                                  <Edit className="w-3 h-3" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-6 w-6 text-destructive hover:text-destructive"
                                  onClick={() => deleteCycleMutation.mutate(cycle.id)}
                                  disabled={deleteCycleMutation.isPending}
                                >
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                        <div className="mt-2 text-xs text-muted-foreground">
                          <Clock className="w-3 h-3 inline mr-1" />
                          {new Date(cycle.start_date).toLocaleDateString()} → {new Date(cycle.end_date).toLocaleDateString()}
                          <span className="ml-2 text-green-400">Profit: ${Number(cycle.current_profit || 0).toFixed(2)}</span>
                        </div>
                        {cycle.additional_investments && Array.isArray(cycle.additional_investments) && cycle.additional_investments.length > 0 && (
                          <div className="mt-2 text-xs text-amber-400">
                            <Plus className="w-3 h-3 inline mr-1" />
                            Additional: ${cycle.additional_investments.reduce((sum: number, inv: any) => sum + Number(inv.amount || 0), 0).toFixed(2)} 
                            ({cycle.additional_investments.length} investments)
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                  {userData.cycles.length === 0 && (
                    <p className="text-center text-muted-foreground py-4">No cycles found</p>
                  )}
                </TabsContent>

                <TabsContent value="deposits" className="space-y-2">
                  {userData.deposits.length > 0 && (
                    <div className="flex justify-end mb-2">
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => deleteAllUserHistoryMutation.mutate("deposits")}
                        disabled={deleteAllUserHistoryMutation.isPending}
                      >
                        <Trash2 className="w-3 h-3 mr-1" />
                        Delete All Deposits
                      </Button>
                    </div>
                  )}
                  {userData.deposits.map((deposit: any) => (
                    <Card key={deposit.id} className="bg-card/50">
                      <CardContent className="py-3 flex items-center justify-between">
                        <div>
                          <span className="font-medium">${Number(deposit.amount).toFixed(2)}</span>
                          <p className="text-xs text-muted-foreground">
                            {new Date(deposit.created_at).toLocaleString()}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {getStatusBadge(deposit.status)}
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 text-destructive hover:text-destructive"
                            onClick={() => deleteDepositMutation.mutate(deposit.id)}
                            disabled={deleteDepositMutation.isPending}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                  {userData.deposits.length === 0 && (
                    <p className="text-center text-muted-foreground py-4">No deposits found</p>
                  )}
                </TabsContent>

                <TabsContent value="withdrawals" className="space-y-2">
                  {userData.withdrawals.length > 0 && (
                    <div className="flex justify-end mb-2">
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => deleteAllUserHistoryMutation.mutate("withdrawals")}
                        disabled={deleteAllUserHistoryMutation.isPending}
                      >
                        <Trash2 className="w-3 h-3 mr-1" />
                        Delete All Withdrawals
                      </Button>
                    </div>
                  )}
                  {userData.withdrawals.map((withdrawal: any) => {
                    // Net amount is stored in DB (after 15% tax)
                    const netAmount = Number(withdrawal.amount);
                    const originalAmount = netAmount / 0.85; // Reverse calculate original
                    const taxAmount = originalAmount - netAmount;
                    
                    return (
                      <Card key={withdrawal.id} className="bg-card/50">
                        <CardContent className="py-3 flex items-center justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium">${netAmount.toFixed(2)}</span>
                              <span className="text-xs text-muted-foreground">(net)</span>
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-xs text-amber-500">Tax: ${taxAmount.toFixed(2)}</span>
                              <span className="text-xs text-muted-foreground">|</span>
                              <span className="text-xs text-muted-foreground">Original: ${originalAmount.toFixed(2)}</span>
                            </div>
                            <p className="text-xs text-muted-foreground font-mono mt-1">
                              {withdrawal.wallet_address?.slice(0, 20)}...
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(withdrawal.created_at).toLocaleString()}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            {getStatusBadge(withdrawal.status)}
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6 text-destructive hover:text-destructive"
                              onClick={() => deleteWithdrawalMutation.mutate(withdrawal.id)}
                              disabled={deleteWithdrawalMutation.isPending}
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                  {userData.withdrawals.length === 0 && (
                    <p className="text-center text-muted-foreground py-4">No withdrawals found</p>
                  )}
                </TabsContent>

                <TabsContent value="transfers" className="space-y-2">
                  {userData.transfers && userData.transfers.length > 0 && (
                    <>
                      {/* Daily Summary */}
                      <Card className="bg-gradient-to-br from-blue-500/10 to-blue-500/5 border-blue-500/20 mb-3">
                        <CardHeader className="py-2">
                          <CardTitle className="text-sm flex items-center gap-2">
                            <TrendingUp className="w-4 h-4 text-blue-400" />
                            Daily Transfer Summary
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="py-2">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-center">
                            {(() => {
                              const dailySummary: Record<string, number> = {};
                              userData.transfers.forEach((t: any) => {
                                const date = new Date(t.created_at).toLocaleDateString();
                                dailySummary[date] = (dailySummary[date] || 0) + Number(t.amount);
                              });
                              const sortedDays = Object.entries(dailySummary).slice(0, 4);
                              return sortedDays.map(([date, total]) => (
                                <div key={date} className="p-2 rounded-lg bg-muted/30">
                                  <p className="text-xs text-muted-foreground">{date}</p>
                                  <p className="font-bold text-blue-400">${total.toFixed(2)}</p>
                                </div>
                              ));
                            })()}
                          </div>
                        </CardContent>
                      </Card>
                      <div className="flex justify-end mb-2">
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => deleteAllUserHistoryMutation.mutate("transfers")}
                          disabled={deleteAllUserHistoryMutation.isPending}
                        >
                          <Trash2 className="w-3 h-3 mr-1" />
                          Delete All Transfers
                        </Button>
                      </div>
                    </>
                  )}
                  {userData.transfers && userData.transfers.map((transfer: any) => (
                    <Card key={transfer.id} className="bg-card/50">
                      <CardContent className="py-3 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <ArrowLeftRight className="w-4 h-4 text-blue-400" />
                          <div>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="capitalize">{transfer.from_wallet}</Badge>
                              <span className="text-xs">→</span>
                              <Badge variant="outline" className="capitalize">{transfer.to_wallet}</Badge>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                              {new Date(transfer.created_at).toLocaleString()}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-primary">${Number(transfer.amount).toFixed(2)}</span>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 text-destructive hover:text-destructive"
                            onClick={() => deleteTransferMutation.mutate(transfer.id)}
                            disabled={deleteTransferMutation.isPending}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                  {(!userData.transfers || userData.transfers.length === 0) && (
                    <p className="text-center text-muted-foreground py-4">No transfers found</p>
                  )}
                </TabsContent>

                <TabsContent value="earnings" className="space-y-2">
                  {userData.earningsHistory.length > 0 && (
                    <div className="flex justify-end mb-2">
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => deleteAllUserHistoryMutation.mutate("earnings")}
                        disabled={deleteAllUserHistoryMutation.isPending}
                      >
                        <Trash2 className="w-3 h-3 mr-1" />
                        Delete All Earnings
                      </Button>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-2 mb-4">
                    <Card className="bg-blue-500/10 border-blue-500/20">
                      <CardContent className="py-3 text-center">
                        <p className="text-xs text-muted-foreground">Total Team Earnings</p>
                        <p className="text-lg font-bold text-blue-400">${Number(user.total_referral_earnings || 0).toFixed(2)}</p>
                      </CardContent>
                    </Card>
                    <Card className="bg-primary/10 border-primary/20">
                      <CardContent className="py-3 text-center">
                        <p className="text-xs text-muted-foreground">Total Direct Earnings</p>
                        <p className="text-lg font-bold text-primary">${Number(user.total_direct_earnings || 0).toFixed(2)}</p>
                      </CardContent>
                    </Card>
                  </div>
                  {userData.earningsHistory.map((earning: any) => (
                    <Card key={earning.id} className="bg-card/50">
                      <CardContent className="py-2 flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">L{earning.referral_level}</Badge>
                            <Badge className={earning.source_type === 'deposit' ? 'bg-green-500/20 text-green-400' : 'bg-blue-500/20 text-blue-400'}>
                              {earning.source_type}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            {earning.commission_percent}% of ${Number(earning.source_amount).toFixed(2)}
                          </p>
                          {earning.referred && (
                            <p className="text-xs text-primary mt-1">
                              From: {earning.referred.telegram_username || earning.referred.telegram_first_name || earning.referred.email?.split('@')[0] || 'Unknown'}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="text-right">
                            <p className="font-medium text-green-400">+${Number(earning.amount).toFixed(2)}</p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(earning.created_at).toLocaleDateString()}
                            </p>
                          </div>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 text-destructive hover:text-destructive"
                            onClick={() => deleteEarningMutation.mutate(earning.id)}
                            disabled={deleteEarningMutation.isPending}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                  {userData.earningsHistory.length === 0 && (
                    <p className="text-center text-muted-foreground py-4">No earnings history</p>
                  )}
                </TabsContent>
              </Tabs>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

export default EnhancedUserDetailsDialog;
