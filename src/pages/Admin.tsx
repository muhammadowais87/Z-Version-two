import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { Navigate } from "react-router-dom";
import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import BottomNav from "@/components/BottomNav";
import AuditLogs from "@/components/AuditLogs";
import EnhancedUserSearch from "@/components/admin/EnhancedUserSearch";
import CollectionsCard from "@/components/admin/CollectionsCard";
import { Users, DollarSign, TrendingUp, Shield, ShieldOff, CheckCircle, XCircle, Trash2, Plus, PieChart, RotateCcw, RefreshCw, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const Admin = () => {
  const { data: isAdmin, isLoading: isLoadingAdmin } = useIsAdmin();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Dialog states
  const [rejectDepositDialog, setRejectDepositDialog] = useState<{ open: boolean; depositId: string | null }>({ open: false, depositId: null });
  const [rejectWithdrawalDialog, setRejectWithdrawalDialog] = useState<{ open: boolean; withdrawalId: string | null }>({ open: false, withdrawalId: null });
  const [manualDepositDialog, setManualDepositDialog] = useState(false);
  const [deleteUserDialog, setDeleteUserDialog] = useState<{ open: boolean; userId: string | null; email: string | null }>({ open: false, userId: null, email: null });
  const [resetUserDialog, setResetUserDialog] = useState<{ open: boolean; userId: string | null; email: string | null }>({ open: false, userId: null, email: null });
  const [bulkResetDialog, setBulkResetDialog] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [deleteWithdrawalDialog, setDeleteWithdrawalDialog] = useState<{ open: boolean; withdrawalId: string | null; email: string | null; amount: number | null }>({ open: false, withdrawalId: null, email: null, amount: null });
  
  // Form states
  const [rejectReason, setRejectReason] = useState("");
  const [manualDepositUserId, setManualDepositUserId] = useState("");
  const [manualDepositAmount, setManualDepositAmount] = useState("");
  const [manualDepositNotes, setManualDepositNotes] = useState("");
  const [withdrawalSearchQuery, setWithdrawalSearchQuery] = useState("");
  const [userSearchQuery, setUserSearchQuery] = useState("");

  const { data: users, isLoading: isLoadingUsers } = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });

      if (profilesError) throw profilesError;

      // Fetch roles for all users
      const { data: roles, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id, role");

      if (rolesError) throw rolesError;

      // Combine profiles with their roles
      const usersWithRoles = profiles.map(profile => ({
        ...profile,
        isAdmin: roles?.some(r => r.user_id === profile.id && r.role === 'admin') || false
      }));

      return usersWithRoles;
    },
    enabled: isAdmin === true,
  });

  const assignAdminMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase
        .from("user_roles")
        .insert({ user_id: userId, role: "admin" });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      toast({
        title: "Success",
        description: "Admin role assigned successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const revokeAdminMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", userId)
        .eq("role", "admin");

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      toast({
        title: "Success",
        description: "Admin role revoked successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const { data: investments, isLoading: isLoadingInvestments } = useQuery({
    queryKey: ["admin-investments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("investments")
        .select(`
          *,
          profiles (email)
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: isAdmin === true,
  });

  const { data: deposits, isLoading: isLoadingDeposits } = useQuery({
    queryKey: ["admin-deposits"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("deposits")
        .select(`
          *,
          profiles!deposits_user_id_fkey (email)
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: isAdmin === true,
    refetchInterval: 5000,
    staleTime: 0,
  });

  const { data: withdrawals, isLoading: isLoadingWithdrawals } = useQuery({
    queryKey: ["admin-withdrawals"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("withdrawals")
        .select(`
          *,
          profiles!withdrawals_user_id_fkey (email)
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: isAdmin === true,
    refetchInterval: 5000,
    staleTime: 0,
  });

  const approveDepositMutation = useMutation({
    mutationFn: async (depositId: string) => {
      const { error } = await supabase.rpc("approve_deposit", {
        deposit_id: depositId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-deposits"] });
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      queryClient.invalidateQueries({ queryKey: ["admin-investments"] });
      toast({
        title: "Success",
        description: "Deposit approved and investment created",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const approveWithdrawalMutation = useMutation({
    mutationFn: async (withdrawalId: string) => {
      // Call the edge function that approves AND sends via MyPayVerse
      const { data, error } = await supabase.functions.invoke("process-withdrawal", {
        body: { withdrawal_id: withdrawalId },
      });
      
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["admin-withdrawals"] });
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      toast({
        title: "Withdrawal Sent",
        description: "Funds have been sent to user via MyPayVerse",
      });
    },
    onError: (error) => {
      toast({
        title: "Withdrawal Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const markWithdrawalPaidMutation = useMutation({
    mutationFn: async (withdrawalId: string) => {
      const { error } = await supabase.rpc("mark_withdrawal_paid", {
        withdrawal_id: withdrawalId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-withdrawals"] });
      toast({
        title: "Success",
        description: "Withdrawal marked as paid",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const rejectDepositMutation = useMutation({
    mutationFn: async ({ depositId, reason }: { depositId: string; reason: string }) => {
      const { error } = await supabase.rpc("reject_deposit", {
        deposit_id: depositId,
        reason,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-deposits"] });
      setRejectDepositDialog({ open: false, depositId: null });
      setRejectReason("");
      toast({
        title: "Success",
        description: "Deposit rejected",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const rejectWithdrawalMutation = useMutation({
    mutationFn: async ({ withdrawalId, reason }: { withdrawalId: string; reason: string }) => {
      const { error } = await supabase.rpc("reject_withdrawal", {
        withdrawal_id: withdrawalId,
        reason,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-withdrawals"] });
      setRejectWithdrawalDialog({ open: false, withdrawalId: null });
      setRejectReason("");
      toast({
        title: "Success",
        description: "Withdrawal rejected",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const manualDepositMutation = useMutation({
    mutationFn: async ({ userId, amount, notes }: { userId: string; amount: number; notes?: string }) => {
      const { error } = await supabase.rpc("add_manual_deposit", {
        target_user_id: userId,
        deposit_amount: amount,
        admin_notes: notes,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-deposits"] });
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      queryClient.invalidateQueries({ queryKey: ["admin-investments"] });
      setManualDepositDialog(false);
      setManualDepositUserId("");
      setManualDepositAmount("");
      setManualDepositNotes("");
      toast({
        title: "Success",
        description: "Manual deposit added successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.rpc("delete_user_account", {
        target_user_id: userId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      setDeleteUserDialog({ open: false, userId: null, email: null });
      toast({
        title: "Success",
        description: "User deleted successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const resetUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.rpc("reset_user_data", {
        p_target_user_id: userId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      queryClient.invalidateQueries({ queryKey: ["admin-deposits"] });
      queryClient.invalidateQueries({ queryKey: ["admin-withdrawals"] });
      queryClient.invalidateQueries({ queryKey: ["admin-investments"] });
      setResetUserDialog({ open: false, userId: null, email: null });
      toast({
        title: "Success",
        description: "User data has been reset successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const bulkResetMutation = useMutation({
    mutationFn: async (userIds: string[]) => {
      for (const userId of userIds) {
        const { error } = await supabase.rpc("reset_user_data", {
          p_target_user_id: userId,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      queryClient.invalidateQueries({ queryKey: ["admin-deposits"] });
      queryClient.invalidateQueries({ queryKey: ["admin-withdrawals"] });
      queryClient.invalidateQueries({ queryKey: ["admin-investments"] });
      setBulkResetDialog(false);
      setSelectedUsers([]);
      toast({
        title: "Success",
        description: `Selected users data has been reset successfully`,
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteWithdrawalMutation = useMutation({
    mutationFn: async (withdrawalId: string) => {
      const { error } = await supabase
        .from("withdrawals")
        .delete()
        .eq("id", withdrawalId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-withdrawals"] });
      setDeleteWithdrawalDialog({ open: false, withdrawalId: null, email: null, amount: null });
      toast({
        title: "Success",
        description: "Withdrawal record deleted successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const syncMyPayVerseMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("sync-mypayverse-deposits");
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["admin-deposits"] });
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      toast({
        title: "Sync Complete",
        description: `Synced ${data.totalDeposits} deposits totaling $${data.totalAmount.toFixed(2)}`,
      });
    },
    onError: (error) => {
      toast({
        title: "Sync Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const toggleUserSelection = (userId: string) => {
    setSelectedUsers(prev => 
      prev.includes(userId) 
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  const toggleAllUsers = () => {
    if (selectedUsers.length === users?.length) {
      setSelectedUsers([]);
    } else {
      setSelectedUsers(users?.map((u: any) => u.id) || []);
    }
  };

  const { data: stats } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: async () => {
      // Get total user count
      const { count: usersCount } = await supabase
        .from("profiles")
        .select("*", { count: "exact", head: true });

      // Get totals from profiles table (aggregated user data)
      const { data: profileStats } = await supabase
        .from("profiles")
        .select("total_investment, total_profit");

      const totalInvestments = profileStats?.reduce(
        (sum, profile) => sum + Number(profile.total_investment || 0),
        0
      ) || 0;

      const totalProfits = profileStats?.reduce(
        (sum, profile) => sum + Number(profile.total_profit || 0),
        0
      ) || 0;

      return {
        totalUsers: usersCount || 0,
        totalInvestments,
        totalProfits,
      };
    },
    enabled: isAdmin === true,
  });

  if (isLoadingAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <div className="container mx-auto p-4 space-y-6">
        <h1 className="text-3xl font-bold">Admin Dashboard</h1>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Users</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.totalUsers || 0}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Investments</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${stats?.totalInvestments.toFixed(2) || 0}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Profits</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${stats?.totalProfits.toFixed(2) || 0}</div>
            </CardContent>
          </Card>
        </div>

        {/* Enhanced User Search Card */}
        <EnhancedUserSearch users={users} isLoading={isLoadingUsers} />

        {/* Whale Trade Cycles Management */}
        <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-primary" />
              Whale Trade Cycle Management
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Monitor all active whale trade cycles, manually complete cycles, and manage user penalty status.
            </p>
            <Button 
              onClick={() => window.location.href = '/admin-cycles'}
              className="w-full"
            >
              Open Cycle Dashboard
            </Button>
          </CardContent>
        </Card>

        <Tabs defaultValue="collections" className="w-full">
          <TabsList className="grid w-full grid-cols-7">
            <TabsTrigger value="collections" className="flex items-center gap-1">
              <PieChart className="w-3 h-3" />
              Collections
            </TabsTrigger>
            <TabsTrigger value="sources" className="flex items-center gap-1">
              <DollarSign className="w-3 h-3" />
              Sources
            </TabsTrigger>
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="deposits">Deposits</TabsTrigger>
            <TabsTrigger value="withdrawals">Withdrawals</TabsTrigger>
            <TabsTrigger value="investments">Investments</TabsTrigger>
            <TabsTrigger value="audit">Audit</TabsTrigger>
          </TabsList>

          <TabsContent value="collections" className="space-y-4">
            <CollectionsCard />
          </TabsContent>

          <TabsContent value="sources" className="space-y-4">
            {(() => {
              const myPayVerseDeposits = deposits?.filter(d => d.admin_wallet_address === 'MyPayVerse' && d.status === 'approved') || [];
              const manualDeposits = deposits?.filter(d => d.admin_wallet_address !== 'MyPayVerse' && d.status === 'approved') || [];
              const myPayVerseTotal = myPayVerseDeposits.reduce((sum, d) => sum + Number(d.amount), 0);
              const manualTotal = manualDeposits.reduce((sum, d) => sum + Number(d.amount), 0);
              const totalDeposits = myPayVerseTotal + manualTotal;
              
              const myPayVersePending = deposits?.filter(d => d.admin_wallet_address === 'MyPayVerse' && d.status === 'pending') || [];
              const manualPending = deposits?.filter(d => d.admin_wallet_address !== 'MyPayVerse' && d.status === 'pending') || [];
              const myPayVersePendingTotal = myPayVersePending.reduce((sum, d) => sum + Number(d.amount), 0);
              const manualPendingTotal = manualPending.reduce((sum, d) => sum + Number(d.amount), 0);
              
              return (
                <div className="space-y-4">
                  {/* Sync Button */}
                  <div className="flex justify-end">
                    <Button 
                      onClick={() => syncMyPayVerseMutation.mutate()}
                      disabled={syncMyPayVerseMutation.isPending}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      {syncMyPayVerseMutation.isPending ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Syncing...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="w-4 h-4 mr-2" />
                          Sync MyPayVerse Deposits
                        </>
                      )}
                    </Button>
                  </div>

                  {/* Summary Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-500/20">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-blue-400">Total Approved Deposits</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold text-blue-300">${totalDeposits.toFixed(2)}</div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {myPayVerseDeposits.length + manualDeposits.length} deposits
                        </p>
                      </CardContent>
                    </Card>
                    
                    <Card className="bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/20">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-green-400">MyPayVerse (Auto-Sync)</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold text-green-300">${myPayVerseTotal.toFixed(2)}</div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {myPayVerseDeposits.length} deposits ({totalDeposits > 0 ? ((myPayVerseTotal / totalDeposits) * 100).toFixed(1) : 0}%)
                        </p>
                      </CardContent>
                    </Card>
                    
                    <Card className="bg-gradient-to-br from-purple-500/10 to-purple-600/5 border-purple-500/20">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-purple-400">Manual Deposits</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold text-purple-300">${manualTotal.toFixed(2)}</div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {manualDeposits.length} deposits ({totalDeposits > 0 ? ((manualTotal / totalDeposits) * 100).toFixed(1) : 0}%)
                        </p>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Pending Breakdown */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <DollarSign className="w-5 h-5 text-yellow-500" />
                        Pending Deposits by Source
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="p-4 rounded-lg bg-muted/50 border">
                          <div className="flex items-center gap-2 mb-2">
                            <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/30">
                              MyPayVerse
                            </Badge>
                            <span className="text-sm text-muted-foreground">Pending</span>
                          </div>
                          <div className="text-xl font-bold text-yellow-500">${myPayVersePendingTotal.toFixed(2)}</div>
                          <p className="text-xs text-muted-foreground">{myPayVersePending.length} requests</p>
                        </div>
                        
                        <div className="p-4 rounded-lg bg-muted/50 border">
                          <div className="flex items-center gap-2 mb-2">
                            <Badge variant="outline" className="bg-purple-500/10 text-purple-500 border-purple-500/30">
                              Manual
                            </Badge>
                            <span className="text-sm text-muted-foreground">Pending</span>
                          </div>
                          <div className="text-xl font-bold text-yellow-500">${manualPendingTotal.toFixed(2)}</div>
                          <p className="text-xs text-muted-foreground">{manualPending.length} requests</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Recent Deposits Table */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Recent Approved Deposits by Source</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Source</TableHead>
                            <TableHead>User</TableHead>
                            <TableHead>Amount</TableHead>
                            <TableHead>Date</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {[...myPayVerseDeposits, ...manualDeposits]
                            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                            .slice(0, 10)
                            .map((deposit: any) => (
                              <TableRow key={deposit.id}>
                                <TableCell>
                                  {deposit.admin_wallet_address === 'MyPayVerse' ? (
                                    <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/30">
                                      MyPayVerse
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline" className="bg-purple-500/10 text-purple-500 border-purple-500/30">
                                      Manual
                                    </Badge>
                                  )}
                                </TableCell>
                                <TableCell>{deposit.profiles?.email || 'N/A'}</TableCell>
                                <TableCell className="font-bold">${Number(deposit.amount).toFixed(2)}</TableCell>
                                <TableCell>{new Date(deposit.created_at).toLocaleDateString()}</TableCell>
                              </TableRow>
                            ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                </div>
              );
            })()}
          </TabsContent>

          <TabsContent value="users" className="space-y-4">
            <Card>
              <CardHeader className="flex flex-col gap-4">
                <div className="flex flex-row items-center justify-between">
                  <CardTitle>All Users</CardTitle>
                  <div className="flex gap-2">
                    {selectedUsers.length > 0 && (
                      <Button 
                        variant="destructive" 
                        onClick={() => setBulkResetDialog(true)}
                      >
                        <RotateCcw className="w-4 h-4 mr-2" />
                        Reset Selected ({selectedUsers.length})
                      </Button>
                    )}
                    <Button onClick={() => setManualDepositDialog(true)}>
                      <Plus className="w-4 h-4 mr-2" />
                      Add Manual Deposit
                    </Button>
                  </div>
                </div>
                <Input
                  placeholder="Search by email, user ID, referral code, or Telegram username..."
                  value={userSearchQuery}
                  onChange={(e) => setUserSearchQuery(e.target.value)}
                  className="max-w-md"
                />
              </CardHeader>
              <CardContent>
                {isLoadingUsers ? (
                  <div className="flex justify-center p-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">
                          <input
                            type="checkbox"
                            checked={selectedUsers.length === users?.length && users?.length > 0}
                            onChange={toggleAllUsers}
                            className="w-4 h-4 rounded border-border"
                          />
                        </TableHead>
                        <TableHead>User ID</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Referral Code</TableHead>
                        <TableHead>Wallet Balance</TableHead>
                        <TableHead>Total Investment</TableHead>
                        <TableHead>Total Profit</TableHead>
                        <TableHead>Referral Earnings</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {users?.filter((user: any) => {
                        if (!userSearchQuery.trim()) return true;
                        const query = userSearchQuery.toLowerCase();
                        return (
                          user.id.toLowerCase().includes(query) ||
                          user.email.toLowerCase().includes(query) ||
                          (user.referral_code && user.referral_code.toLowerCase().includes(query)) ||
                          (user.telegram_username && user.telegram_username.toLowerCase().includes(query))
                        );
                      }).map((user: any) => (
                        <TableRow key={user.id} className={selectedUsers.includes(user.id) ? "bg-primary/5" : ""}>
                          <TableCell>
                            <input
                              type="checkbox"
                              checked={selectedUsers.includes(user.id)}
                              onChange={() => toggleUserSelection(user.id)}
                              className="w-4 h-4 rounded border-border"
                            />
                          </TableCell>
                          <TableCell className="font-mono text-xs">{user.id}</TableCell>
                          <TableCell>{user.email}</TableCell>
                          <TableCell className="font-mono">{user.referral_code}</TableCell>
                          <TableCell>${Number(user.wallet_balance || 0).toFixed(2)}</TableCell>
                          <TableCell>${Number(user.total_investment || 0).toFixed(2)}</TableCell>
                          <TableCell>${Number(user.total_profit || 0).toFixed(2)}</TableCell>
                          <TableCell>${Number(user.total_referral_earnings || 0).toFixed(2)}</TableCell>
                          <TableCell>
                            {user.isAdmin ? (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">
                                <Shield className="w-3 h-3 mr-1" />
                                Admin
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground">
                                User
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              {user.isAdmin ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => revokeAdminMutation.mutate(user.id)}
                                  disabled={revokeAdminMutation.isPending}
                                >
                                  <ShieldOff className="w-4 h-4 mr-1" />
                                  Revoke Admin
                                </Button>
                              ) : (
                                <Button
                                  size="sm"
                                  onClick={() => assignAdminMutation.mutate(user.id)}
                                  disabled={assignAdminMutation.isPending}
                                >
                                  <Shield className="w-4 h-4 mr-1" />
                                  Make Admin
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setResetUserDialog({ open: true, userId: user.id, email: user.email })}
                                title="Reset User Data"
                              >
                                <RotateCcw className="w-4 h-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => setDeleteUserDialog({ open: true, userId: user.id, email: user.email })}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="deposits" className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Pending Deposits</CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    toast({ title: "Backfilling...", description: "Fetching wallet addresses from MyPayVerse" });
                    try {
                      const { data, error } = await supabase.functions.invoke("backfill-mypayverse-deposits");
                      if (error) throw error;
                      queryClient.invalidateQueries({ queryKey: ["admin-deposits"] });
                      toast({
                        title: "Backfill Complete",
                        description: `Updated ${data.updated} of ${data.total} deposits`,
                      });
                    } catch (err: any) {
                      toast({ title: "Error", description: err.message, variant: "destructive" });
                    }
                  }}
                >
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Backfill Wallet Addresses
                </Button>
              </CardHeader>
              <CardContent>
                {isLoadingDeposits ? (
                  <div className="flex justify-center p-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>User Email</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Source</TableHead>
                        <TableHead>Wallet Address</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {deposits?.filter(d => d.status === 'pending').map((deposit: any) => {
                        const isMyPayVerse =
                          deposit.transaction_hash?.startsWith('mypayverse_') ||
                          deposit.admin_wallet_address === 'MyPayVerse';

                        return (
                          <TableRow key={deposit.id}>
                            <TableCell>{deposit.profiles?.email}</TableCell>
                            <TableCell>${Number(deposit.amount).toFixed(2)}</TableCell>
                            <TableCell>
                              {isMyPayVerse ? (
                                <Badge className="bg-blue-500 hover:bg-blue-600 text-white">MyPayVerse</Badge>
                              ) : (
                                <Badge variant="secondary">Manual</Badge>
                              )}
                            </TableCell>
                            <TableCell className="font-mono text-xs">
                              {deposit.admin_wallet_address || '-'}
                            </TableCell>
                            <TableCell>
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                                {deposit.status}
                              </span>
                            </TableCell>
                            <TableCell>{new Date(deposit.created_at).toLocaleString()}</TableCell>
                            <TableCell>
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  onClick={() => approveDepositMutation.mutate(deposit.id)}
                                  disabled={approveDepositMutation.isPending}
                                >
                                  <CheckCircle className="w-4 h-4 mr-1" />
                                  Approve
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => setRejectDepositDialog({ open: true, depositId: deposit.id })}
                                >
                                  <XCircle className="w-4 h-4 mr-1" />
                                  Reject
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>All Deposits</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User Email</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Wallet Address</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {deposits?.map((deposit: any) => {
                      const isMyPayVerse =
                        deposit.transaction_hash?.startsWith('mypayverse_') ||
                        deposit.admin_wallet_address === 'MyPayVerse';

                      return (
                        <TableRow key={deposit.id}>
                          <TableCell>{deposit.profiles?.email}</TableCell>
                          <TableCell>${Number(deposit.amount).toFixed(2)}</TableCell>
                          <TableCell>
                            {isMyPayVerse ? (
                              <Badge className="bg-blue-500 hover:bg-blue-600 text-white">MyPayVerse</Badge>
                            ) : (
                              <Badge variant="secondary">Manual</Badge>
                            )}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {deposit.admin_wallet_address || '-'}
                          </TableCell>
                          <TableCell>
                            <span
                              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                deposit.status === 'approved'
                                  ? 'bg-green-100 text-green-800'
                                  : deposit.status === 'rejected'
                                  ? 'bg-red-100 text-red-800'
                                  : 'bg-yellow-100 text-yellow-800'
                              }`}
                            >
                              {deposit.status}
                            </span>
                          </TableCell>
                          <TableCell>{new Date(deposit.created_at).toLocaleString()}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="withdrawals" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Pending Withdrawals</CardTitle>
              </CardHeader>
              <CardContent>
                {isLoadingWithdrawals ? (
                  <div className="flex justify-center p-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>User Email</TableHead>
                        <TableHead>Net Amount</TableHead>
                        <TableHead>Tax</TableHead>
                        <TableHead>Original</TableHead>
                        <TableHead>Wallet Address</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {withdrawals?.filter(w => w.status === 'pending').map((withdrawal: any) => {
                        const netAmount = Number(withdrawal.amount);
                        const originalAmount = netAmount / 0.85;
                        const taxAmount = originalAmount - netAmount;
                        return (
                        <TableRow key={withdrawal.id}>
                          <TableCell>{withdrawal.profiles?.email}</TableCell>
                          <TableCell className="font-medium">${netAmount.toFixed(2)}</TableCell>
                          <TableCell className="text-amber-500">${taxAmount.toFixed(2)}</TableCell>
                          <TableCell className="text-muted-foreground">${originalAmount.toFixed(2)}</TableCell>
                          <TableCell className="font-mono text-xs">{withdrawal.wallet_address}</TableCell>
                          <TableCell>
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                              {withdrawal.status}
                            </span>
                          </TableCell>
                          <TableCell>{new Date(withdrawal.created_at).toLocaleString()}</TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                onClick={() => approveWithdrawalMutation.mutate(withdrawal.id)}
                                disabled={approveWithdrawalMutation.isPending}
                              >
                                {approveWithdrawalMutation.isPending ? (
                                  <>
                                    <span className="animate-spin mr-1">⏳</span>
                                    Processing...
                                  </>
                                ) : (
                                  <>
                                    <CheckCircle className="w-4 h-4 mr-1" />
                                    Approve
                                  </>
                                )}
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => setRejectWithdrawalDialog({ open: true, withdrawalId: withdrawal.id })}
                              >
                                <XCircle className="w-4 h-4 mr-1" />
                                Reject
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Approved Withdrawals (Need Payment)</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User Email</TableHead>
                      <TableHead>Net Amount</TableHead>
                      <TableHead>Tax</TableHead>
                      <TableHead>Original</TableHead>
                      <TableHead>Wallet Address</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {withdrawals?.filter(w => w.status === 'approved').map((withdrawal: any) => {
                      const netAmount = Number(withdrawal.amount);
                      const originalAmount = netAmount / 0.85;
                      const taxAmount = originalAmount - netAmount;
                      return (
                      <TableRow key={withdrawal.id}>
                        <TableCell>{withdrawal.profiles?.email}</TableCell>
                        <TableCell className="font-medium">${netAmount.toFixed(2)}</TableCell>
                        <TableCell className="text-amber-500">${taxAmount.toFixed(2)}</TableCell>
                        <TableCell className="text-muted-foreground">${originalAmount.toFixed(2)}</TableCell>
                        <TableCell className="font-mono text-xs">{withdrawal.wallet_address}</TableCell>
                        <TableCell>
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            {withdrawal.status}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => markWithdrawalPaidMutation.mutate(withdrawal.id)}
                            disabled={markWithdrawalPaidMutation.isPending}
                          >
                            Mark as Paid
                          </Button>
                        </TableCell>
                      </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>All Withdrawals</CardTitle>
                <div className="relative w-64">
                  <Input
                    placeholder="Search by email or wallet..."
                    value={withdrawalSearchQuery}
                    onChange={(e) => setWithdrawalSearchQuery(e.target.value)}
                    className="pl-3"
                  />
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User Email</TableHead>
                      <TableHead>Net Amount</TableHead>
                      <TableHead>Tax</TableHead>
                      <TableHead>Original</TableHead>
                      <TableHead>Wallet Address</TableHead>
                      <TableHead>Tx Hash</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="w-[80px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {withdrawals?.filter((w: any) => {
                      if (!withdrawalSearchQuery.trim()) return true;
                      const query = withdrawalSearchQuery.toLowerCase();
                      return (
                        w.profiles?.email?.toLowerCase().includes(query) ||
                        w.wallet_address?.toLowerCase().includes(query) ||
                        w.transaction_hash?.toLowerCase().includes(query)
                      );
                    }).map((withdrawal: any) => {
                      const netAmount = Number(withdrawal.amount);
                      const originalAmount = netAmount / 0.85;
                      const taxAmount = originalAmount - netAmount;
                      return (
                      <TableRow key={withdrawal.id}>
                        <TableCell>{withdrawal.profiles?.email}</TableCell>
                        <TableCell className="font-medium">${netAmount.toFixed(2)}</TableCell>
                        <TableCell className="text-amber-500">${taxAmount.toFixed(2)}</TableCell>
                        <TableCell className="text-muted-foreground">${originalAmount.toFixed(2)}</TableCell>
                        <TableCell className="font-mono text-xs">{withdrawal.wallet_address}</TableCell>
                        <TableCell className="font-mono text-xs">
                          {withdrawal.transaction_hash ? (
                            <a 
                              href={`https://bscscan.com/tx/${withdrawal.transaction_hash}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary hover:underline"
                              title={withdrawal.transaction_hash}
                            >
                              {withdrawal.transaction_hash.slice(0, 8)}...{withdrawal.transaction_hash.slice(-6)}
                            </a>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            withdrawal.status === 'paid' 
                              ? 'bg-green-100 text-green-800' 
                              : withdrawal.status === 'approved'
                              ? 'bg-blue-100 text-blue-800'
                              : withdrawal.status === 'rejected'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-yellow-100 text-yellow-800'
                          }`}>
                            {withdrawal.status}
                          </span>
                        </TableCell>
                        <TableCell>{new Date(withdrawal.created_at).toLocaleString()}</TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeleteWithdrawalDialog({ 
                              open: true, 
                              withdrawalId: withdrawal.id, 
                              email: withdrawal.profiles?.email,
                              amount: netAmount
                            })}
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="investments" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>All Investments</CardTitle>
              </CardHeader>
              <CardContent>
                {isLoadingInvestments ? (
                  <div className="flex justify-center p-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>User Email</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Profit</TableHead>
                        <TableHead>Invested At</TableHead>
                        <TableHead>Matures At</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {investments?.map((investment: any) => (
                        <TableRow key={investment.id}>
                          <TableCell>{investment.profiles?.email}</TableCell>
                          <TableCell>${Number(investment.amount).toFixed(2)}</TableCell>
                          <TableCell>
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              investment.status === 'completed' 
                                ? 'bg-green-100 text-green-800' 
                                : 'bg-yellow-100 text-yellow-800'
                            }`}>
                              {investment.status}
                            </span>
                          </TableCell>
                          <TableCell>${Number(investment.profit || 0).toFixed(2)}</TableCell>
                          <TableCell>{new Date(investment.invested_at).toLocaleString()}</TableCell>
                          <TableCell>{new Date(investment.matures_at).toLocaleString()}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="audit" className="space-y-4">
            <AuditLogs />
          </TabsContent>
        </Tabs>
      </div>

      {/* Reject Deposit Dialog */}
      <Dialog open={rejectDepositDialog.open} onOpenChange={(open) => setRejectDepositDialog({ open, depositId: null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Deposit</DialogTitle>
            <DialogDescription>
              Please provide a reason for rejecting this deposit.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="reject-reason">Rejection Reason</Label>
              <Textarea
                id="reject-reason"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Enter reason for rejection..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDepositDialog({ open: false, depositId: null })}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (rejectDepositDialog.depositId && rejectReason.trim()) {
                  rejectDepositMutation.mutate({
                    depositId: rejectDepositDialog.depositId,
                    reason: rejectReason,
                  });
                }
              }}
              disabled={!rejectReason.trim() || rejectDepositMutation.isPending}
            >
              Reject Deposit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Withdrawal Dialog */}
      <Dialog open={rejectWithdrawalDialog.open} onOpenChange={(open) => setRejectWithdrawalDialog({ open, withdrawalId: null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Withdrawal</DialogTitle>
            <DialogDescription>
              Please provide a reason for rejecting this withdrawal.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="reject-withdrawal-reason">Rejection Reason</Label>
              <Textarea
                id="reject-withdrawal-reason"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Enter reason for rejection..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectWithdrawalDialog({ open: false, withdrawalId: null })}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (rejectWithdrawalDialog.withdrawalId && rejectReason.trim()) {
                  rejectWithdrawalMutation.mutate({
                    withdrawalId: rejectWithdrawalDialog.withdrawalId,
                    reason: rejectReason,
                  });
                }
              }}
              disabled={!rejectReason.trim() || rejectWithdrawalMutation.isPending}
            >
              Reject Withdrawal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manual Deposit Dialog */}
      <Dialog open={manualDepositDialog} onOpenChange={setManualDepositDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Manual Deposit</DialogTitle>
            <DialogDescription>
              Manually add a deposit to a user's account. This will create an investment automatically.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="user-select">Select User</Label>
              <Select value={manualDepositUserId} onValueChange={setManualDepositUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a user" />
                </SelectTrigger>
                <SelectContent>
                  {users?.map((user: any) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.email} ({user.referral_code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="amount">Amount</Label>
              <Input
                id="amount"
                type="number"
                min="0"
                step="0.01"
                value={manualDepositAmount}
                onChange={(e) => setManualDepositAmount(e.target.value)}
                placeholder="Enter amount..."
              />
            </div>
            <div>
              <Label htmlFor="notes">Admin Notes (Optional)</Label>
              <Textarea
                id="notes"
                value={manualDepositNotes}
                onChange={(e) => setManualDepositNotes(e.target.value)}
                placeholder="Enter any notes about this deposit..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setManualDepositDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (manualDepositUserId && manualDepositAmount && parseFloat(manualDepositAmount) > 0) {
                  manualDepositMutation.mutate({
                    userId: manualDepositUserId,
                    amount: parseFloat(manualDepositAmount),
                    notes: manualDepositNotes || undefined,
                  });
                }
              }}
              disabled={!manualDepositUserId || !manualDepositAmount || parseFloat(manualDepositAmount) <= 0 || manualDepositMutation.isPending}
            >
              Add Deposit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete User Dialog */}
      <Dialog open={deleteUserDialog.open} onOpenChange={(open) => setDeleteUserDialog({ open, userId: null, email: null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete User</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete user {deleteUserDialog.email}? This action cannot be undone and will delete all user data including deposits, withdrawals, and investments.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteUserDialog({ open: false, userId: null, email: null })}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deleteUserDialog.userId) {
                  deleteUserMutation.mutate(deleteUserDialog.userId);
                }
              }}
              disabled={deleteUserMutation.isPending}
            >
              Delete User
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset User Dialog */}
      <Dialog open={resetUserDialog.open} onOpenChange={(open) => setResetUserDialog({ open, userId: null, email: null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset User Data</DialogTitle>
            <DialogDescription>
              Are you sure you want to reset all data for user <strong>{resetUserDialog.email}</strong>? This will:
              <ul className="list-disc list-inside mt-2 space-y-1 text-sm">
                <li>Reset all wallet balances to $0</li>
                <li>Delete all trade cycles and progress</li>
                <li>Delete all deposits and withdrawals</li>
                <li>Delete all investments</li>
                <li>Reset referral earnings (as referred user)</li>
              </ul>
              <p className="mt-2 text-destructive font-medium">This action cannot be undone!</p>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetUserDialog({ open: false, userId: null, email: null })}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (resetUserDialog.userId) {
                  resetUserMutation.mutate(resetUserDialog.userId);
                }
              }}
              disabled={resetUserMutation.isPending}
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              Reset User Data
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Reset Dialog */}
      <Dialog open={bulkResetDialog} onOpenChange={setBulkResetDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bulk Reset User Data</DialogTitle>
            <DialogDescription>
              Are you sure you want to reset data for <strong>{selectedUsers.length} selected user(s)</strong>? This will:
              <ul className="list-disc list-inside mt-2 space-y-1 text-sm">
                <li>Reset all wallet balances to $0</li>
                <li>Delete all trade cycles and progress</li>
                <li>Delete all deposits and withdrawals</li>
                <li>Delete all investments</li>
                <li>Reset referral earnings (as referred user)</li>
              </ul>
              <p className="mt-2 text-destructive font-medium">This action cannot be undone!</p>
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-40 overflow-y-auto border rounded p-2 text-xs">
            <p className="font-medium mb-1">Selected users:</p>
            {users?.filter((u: any) => selectedUsers.includes(u.id)).map((u: any) => (
              <div key={u.id} className="text-muted-foreground">{u.email}</div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkResetDialog(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => bulkResetMutation.mutate(selectedUsers)}
              disabled={bulkResetMutation.isPending}
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              {bulkResetMutation.isPending ? "Resetting..." : `Reset ${selectedUsers.length} User(s)`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Withdrawal Dialog */}
      <Dialog open={deleteWithdrawalDialog.open} onOpenChange={(open) => setDeleteWithdrawalDialog({ open, withdrawalId: null, email: null, amount: null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Withdrawal Record</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this withdrawal record?
              <div className="mt-3 p-3 bg-muted rounded-md text-sm">
                <p><strong>User:</strong> {deleteWithdrawalDialog.email}</p>
                <p><strong>Amount:</strong> ${deleteWithdrawalDialog.amount?.toFixed(2)}</p>
              </div>
              <p className="mt-2 text-destructive font-medium">This will only delete the record. If the withdrawal was already paid, no funds will be recovered.</p>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteWithdrawalDialog({ open: false, withdrawalId: null, email: null, amount: null })}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deleteWithdrawalDialog.withdrawalId) {
                  deleteWithdrawalMutation.mutate(deleteWithdrawalDialog.withdrawalId);
                }
              }}
              disabled={deleteWithdrawalMutation.isPending}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete Record
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <BottomNav />
    </div>
  );
};

export default Admin;
