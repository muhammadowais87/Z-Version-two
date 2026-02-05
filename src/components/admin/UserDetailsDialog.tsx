import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
  Plus, Minus, AlertTriangle, RotateCcw, Zap
} from "lucide-react";

interface UserDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: any;
  userData: {
    deposits: any[];
    withdrawals: any[];
    cycles: any[];
    progress: any;
    referrals: any[];
  } | null | undefined;
  isLoading: boolean;
}

const UserDetailsDialog = ({ open, onOpenChange, user, userData, isLoading }: UserDetailsDialogProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [quickAction, setQuickAction] = useState<string | null>(null);
  const [quickAmount, setQuickAmount] = useState("");
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
  const [editingTelegramUsername, setEditingTelegramUsername] = useState(false);
  const [telegramUsernameValue, setTelegramUsernameValue] = useState("");

  const updateUserMutation = useMutation({
    mutationFn: async (updates: Record<string, number>) => {
      const { error } = await supabase
        .from("profiles")
        .update(updates)
        .eq("id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      queryClient.invalidateQueries({ queryKey: ["admin-user-details", user.id] });
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
      queryClient.invalidateQueries({ queryKey: ["admin-user-details", user.id] });
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
      queryClient.invalidateQueries({ queryKey: ["admin-user-details", user.id] });
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

  const updateTelegramUsernameMutation = useMutation({
    mutationFn: async (newUsername: string) => {
      const { error } = await supabase
        .from("profiles")
        .update({ telegram_username: newUsername, updated_at: new Date().toISOString() })
        .eq("id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      queryClient.invalidateQueries({ queryKey: ["admin-user-details", user.id] });
      setEditingTelegramUsername(false);
      toast({
        title: "Success",
        description: "Telegram username updated successfully",
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
    }

    updateUserMutation.mutate(updates);
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
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <User className="w-5 h-5 text-primary" />
              User Details
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

        <ScrollArea className="h-[70vh]">
          <div className="space-y-4 pr-4">
            {/* User Info Header */}
            <Card>
              <CardContent className="pt-4">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div>
                    <Label className="text-muted-foreground text-xs">User ID</Label>
                    <p className="font-mono text-sm break-all">{user.id}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs">Email</Label>
                    <p className="text-sm">{user.email}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs">Telegram Username</Label>
                    {editingTelegramUsername ? (
                      <div className="flex items-center gap-1 mt-1">
                        <Input
                          value={telegramUsernameValue}
                          onChange={(e) => setTelegramUsernameValue(e.target.value)}
                          placeholder="Enter username"
                          className="h-7 text-sm"
                        />
                        <Button 
                          size="sm" 
                          className="h-7 px-2"
                          onClick={() => updateTelegramUsernameMutation.mutate(telegramUsernameValue)}
                          disabled={updateTelegramUsernameMutation.isPending}
                        >
                          <Save className="w-3 h-3" />
                        </Button>
                        <Button 
                          size="sm" 
                          variant="ghost" 
                          className="h-7 px-2"
                          onClick={() => setEditingTelegramUsername(false)}
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1">
                        <p className="text-sm">{user.telegram_username || "Not set"}</p>
                        <Button 
                          size="sm" 
                          variant="ghost" 
                          className="h-6 px-1"
                          onClick={() => {
                            setTelegramUsernameValue(user.telegram_username || "");
                            setEditingTelegramUsername(true);
                          }}
                        >
                          <Edit className="w-3 h-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs">Referral Code</Label>
                    <p className="font-mono text-sm">{user.referral_code}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs">Referred By</Label>
                    <p className="font-mono text-sm">{user.referred_by_code || "None"}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs">Joined</Label>
                    <p className="text-sm">{new Date(user.created_at).toLocaleString()}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs">Role</Label>
                    <Badge variant={user.isAdmin ? "default" : "secondary"}>
                      {user.isAdmin ? "Admin" : "User"}
                    </Badge>
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
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <Button size="sm" variant="outline" className="text-green-400 border-green-400/30" onClick={() => setQuickAction("add_main")}>
                    <Plus className="w-3 h-3 mr-1" /> Main Wallet
                  </Button>
                  <Button size="sm" variant="outline" className="text-red-400 border-red-400/30" onClick={() => setQuickAction("deduct_main")}>
                    <Minus className="w-3 h-3 mr-1" /> Main Wallet
                  </Button>
                  <Button size="sm" variant="outline" className="text-green-400 border-green-400/30" onClick={() => setQuickAction("add_cycle")}>
                    <Plus className="w-3 h-3 mr-1" /> Cycle Wallet
                  </Button>
                  <Button size="sm" variant="outline" className="text-red-400 border-red-400/30" onClick={() => setQuickAction("deduct_cycle")}>
                    <Minus className="w-3 h-3 mr-1" /> Cycle Wallet
                  </Button>
                  <Button size="sm" variant="outline" className="text-green-400 border-green-400/30" onClick={() => setQuickAction("add_team")}>
                    <Plus className="w-3 h-3 mr-1" /> Team Income
                  </Button>
                  <Button size="sm" variant="outline" className="text-red-400 border-red-400/30" onClick={() => setQuickAction("deduct_team")}>
                    <Minus className="w-3 h-3 mr-1" /> Team Income
                  </Button>
                  <Button size="sm" variant="outline" className="text-green-400 border-green-400/30" onClick={() => setQuickAction("add_direct")}>
                    <Plus className="w-3 h-3 mr-1" /> Direct Earnings
                  </Button>
                  <Button size="sm" variant="outline" className="text-red-400 border-red-400/30" onClick={() => setQuickAction("deduct_direct")}>
                    <Minus className="w-3 h-3 mr-1" /> Direct Earnings
                  </Button>
                </div>

                {quickAction && (
                  <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
                    <Label className="text-xs whitespace-nowrap">{quickAction.replace("_", " ").toUpperCase()}:</Label>
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

            {isLoading ? (
              <div className="flex justify-center p-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : userData && (
              <Tabs defaultValue="cycles" className="w-full">
                <TabsList className="grid w-full grid-cols-4">
                  <TabsTrigger value="cycles">Cycles ({userData.cycles.length})</TabsTrigger>
                  <TabsTrigger value="deposits">Deposits ({userData.deposits.length})</TabsTrigger>
                  <TabsTrigger value="withdrawals">Withdrawals ({userData.withdrawals.length})</TabsTrigger>
                  <TabsTrigger value="referrals">Referrals ({userData.referrals.length})</TabsTrigger>
                </TabsList>

                <TabsContent value="cycles" className="space-y-2">
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
                          <div>
                            <Badge variant="outline" className="mr-2">
                              {cycle.cycle_type === 4 ? "Special" : `Cycle ${cycle.cycle_type}`}
                            </Badge>
                            {getStatusBadge(cycle.status)}
                          </div>
                          <span className="text-sm font-medium">${Number(cycle.investment_amount).toFixed(2)}</span>
                        </div>
                        <div className="mt-2 text-xs text-muted-foreground">
                          <Clock className="w-3 h-3 inline mr-1" />
                          {new Date(cycle.start_date).toLocaleDateString()} → {new Date(cycle.end_date).toLocaleDateString()}
                          <span className="ml-2">Profit: ${Number(cycle.current_profit || 0).toFixed(2)}</span>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                  {userData.cycles.length === 0 && (
                    <p className="text-center text-muted-foreground py-4">No cycles found</p>
                  )}
                </TabsContent>

                <TabsContent value="deposits" className="space-y-2">
                  {userData.deposits.map((deposit: any) => (
                    <Card key={deposit.id} className="bg-card/50">
                      <CardContent className="py-3 flex items-center justify-between">
                        <div>
                          <span className="font-medium">${Number(deposit.amount).toFixed(2)}</span>
                          <p className="text-xs text-muted-foreground">
                            {new Date(deposit.created_at).toLocaleString()}
                          </p>
                        </div>
                        {getStatusBadge(deposit.status)}
                      </CardContent>
                    </Card>
                  ))}
                  {userData.deposits.length === 0 && (
                    <p className="text-center text-muted-foreground py-4">No deposits found</p>
                  )}
                </TabsContent>

                <TabsContent value="withdrawals" className="space-y-2">
                  {userData.withdrawals.map((withdrawal: any) => (
                    <Card key={withdrawal.id} className="bg-card/50">
                      <CardContent className="py-3 flex items-center justify-between">
                        <div>
                          <span className="font-medium">${Number(withdrawal.amount).toFixed(2)}</span>
                          <p className="text-xs text-muted-foreground font-mono">
                            {withdrawal.wallet_address?.slice(0, 10)}...
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(withdrawal.created_at).toLocaleString()}
                          </p>
                        </div>
                        {getStatusBadge(withdrawal.status)}
                      </CardContent>
                    </Card>
                  ))}
                  {userData.withdrawals.length === 0 && (
                    <p className="text-center text-muted-foreground py-4">No withdrawals found</p>
                  )}
                </TabsContent>

                <TabsContent value="referrals" className="space-y-2">
                  {userData.referrals.map((referral: any) => (
                    <Card key={referral.id} className="bg-card/50">
                      <CardContent className="py-3 flex items-center justify-between">
                        <div>
                          <span className="font-mono text-xs">{referral.referred_id}</span>
                          <p className="text-xs text-muted-foreground">
                            {new Date(referral.created_at).toLocaleString()}
                          </p>
                        </div>
                        <Badge>Level {referral.level}</Badge>
                      </CardContent>
                    </Card>
                  ))}
                  {userData.referrals.length === 0 && (
                    <p className="text-center text-muted-foreground py-4">No referrals found</p>
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

export default UserDetailsDialog;
