import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  DollarSign, ArrowDownToLine, ArrowUpFromLine, 
  TrendingUp, Users, Wallet, Clock, CheckCircle, XCircle, Ban, RefreshCw
} from "lucide-react";

const CollectionsCard = () => {
  const { data: collections, isLoading } = useQuery({
    queryKey: ["admin-collections"],
    queryFn: async () => {
      // Fetch all aggregated data
      const [
        depositsRes,
        withdrawalsRes,
        cyclesRes,
        profilesRes,
        earningsHistoryRes,
      ] = await Promise.all([
        supabase.from("deposits").select("amount, status"),
        supabase.from("withdrawals").select("amount, status"),
        supabase.from("ai_trade_cycles").select("investment_amount, current_profit, status, additional_investments"),
        supabase.from("profiles").select("wallet_balance, referral_balance, total_referral_earnings, total_direct_earnings, direct_earnings_balance"),
        supabase.from("referral_earnings_history").select("amount, source_type"),
      ]);

      const deposits = depositsRes.data || [];
      const withdrawals = withdrawalsRes.data || [];
      const cycles = cyclesRes.data || [];
      const profiles = profilesRes.data || [];
      const earningsHistory = earningsHistoryRes.data || [];

      // Calculate deposit stats
      const depositStats = {
        total: deposits.reduce((sum, d) => sum + Number(d.amount), 0),
        approved: deposits.filter(d => d.status === "approved").reduce((sum, d) => sum + Number(d.amount), 0),
        pending: deposits.filter(d => d.status === "pending").reduce((sum, d) => sum + Number(d.amount), 0),
        rejected: deposits.filter(d => d.status === "rejected").reduce((sum, d) => sum + Number(d.amount), 0),
        count: {
          total: deposits.length,
          approved: deposits.filter(d => d.status === "approved").length,
          pending: deposits.filter(d => d.status === "pending").length,
          rejected: deposits.filter(d => d.status === "rejected").length,
        },
      };

      // Calculate withdrawal stats
      const withdrawalStats = {
        total: withdrawals.reduce((sum, w) => sum + Number(w.amount), 0),
        paid: withdrawals.filter(w => w.status === "paid").reduce((sum, w) => sum + Number(w.amount), 0),
        approved: withdrawals.filter(w => w.status === "approved").reduce((sum, w) => sum + Number(w.amount), 0),
        pending: withdrawals.filter(w => w.status === "pending").reduce((sum, w) => sum + Number(w.amount), 0),
        rejected: withdrawals.filter(w => w.status === "rejected").reduce((sum, w) => sum + Number(w.amount), 0),
        count: {
          total: withdrawals.length,
          paid: withdrawals.filter(w => w.status === "paid").length,
          approved: withdrawals.filter(w => w.status === "approved").length,
          pending: withdrawals.filter(w => w.status === "pending").length,
          rejected: withdrawals.filter(w => w.status === "rejected").length,
        },
      };

      // Calculate cycle stats including reinvestments
      const reinvestmentStats = {
        fromCycleWallet: 0,
        fromTeamIncome: 0,
        total: 0,
      };
      
      cycles.forEach((cycle: any) => {
        const additionalInvestments = cycle.additional_investments || [];
        additionalInvestments.forEach((inv: any) => {
          const amount = Number(inv.amount || 0);
          if (inv.source === 'team_income') {
            reinvestmentStats.fromTeamIncome += amount;
          } else {
            reinvestmentStats.fromCycleWallet += amount;
          }
          reinvestmentStats.total += amount;
        });
      });

      const cycleStats = {
        totalInvested: cycles.filter((c: any) => c.status === "active").reduce((sum: number, c: any) => sum + Number(c.investment_amount), 0),
        totalProfitGenerated: cycles.filter((c: any) => c.status === "completed").reduce((sum: number, c: any) => sum + Number(c.current_profit || 0), 0),
        active: cycles.filter((c: any) => c.status === "active").length,
        completed: cycles.filter((c: any) => c.status === "completed").length,
        broken: cycles.filter((c: any) => c.status === "broken").length,
        reinvestments: reinvestmentStats,
      };

      // Calculate referral/team stats
      const referralStats = {
        totalTeamIncome: profiles.reduce((sum: number, p: any) => sum + Number(p.referral_balance || 0), 0),
        totalReferralEarnings: profiles.reduce((sum: number, p: any) => sum + Number(p.total_referral_earnings || 0), 0),
        totalWalletBalance: profiles.reduce((sum: number, p: any) => sum + Number(p.wallet_balance || 0), 0),
        totalDirectEarnings: profiles.reduce((sum: number, p: any) => sum + Number(p.total_direct_earnings || 0), 0),
        totalDirectBalance: profiles.reduce((sum: number, p: any) => sum + Number(p.direct_earnings_balance || 0), 0),
      };

      // Earnings history breakdown
      const earningsBreakdown = {
        fromDeposits: earningsHistory.filter((e: any) => e.source_type === 'deposit').reduce((sum: number, e: any) => sum + Number(e.amount || 0), 0),
        fromProfits: earningsHistory.filter((e: any) => e.source_type === 'profit').reduce((sum: number, e: any) => sum + Number(e.amount || 0), 0),
        total: earningsHistory.reduce((sum: number, e: any) => sum + Number(e.amount || 0), 0),
      };

      // Net calculations
      const netStats = {
        netDeposits: depositStats.approved - withdrawalStats.paid,
        platformLiability: referralStats.totalWalletBalance + referralStats.totalTeamIncome,
      };

      return {
        deposits: depositStats,
        withdrawals: withdrawalStats,
        cycles: cycleStats,
        referrals: referralStats,
        earnings: earningsBreakdown,
        net: netStats,
      };
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex justify-center p-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Net Overview */}
      <Card className="bg-gradient-to-br from-primary/10 via-primary/5 to-background border-primary/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-primary" />
            Platform Overview
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-4 rounded-lg bg-green-500/10 border border-green-500/20">
              <p className="text-xs text-muted-foreground mb-1">Net Deposits</p>
              <p className="text-2xl font-bold text-green-400">
                ${collections?.net.netDeposits.toFixed(2)}
              </p>
              <p className="text-xs text-muted-foreground">Deposits - Paid Withdrawals</p>
            </div>
            <div className="text-center p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
              <p className="text-xs text-muted-foreground mb-1">Platform Liability</p>
              <p className="text-2xl font-bold text-blue-400">
                ${collections?.net.platformLiability.toFixed(2)}
              </p>
              <p className="text-xs text-muted-foreground">All User Balances</p>
            </div>
            <div className="text-center p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
              <p className="text-xs text-muted-foreground mb-1">Active Investments</p>
              <p className="text-2xl font-bold text-yellow-400">
                ${collections?.cycles.totalInvested.toFixed(2)}
              </p>
              <p className="text-xs text-muted-foreground">{collections?.cycles.active} Cycles</p>
            </div>
            <div className="text-center p-4 rounded-lg bg-purple-500/10 border border-purple-500/20">
              <p className="text-xs text-muted-foreground mb-1">Total Referral Earnings</p>
              <p className="text-2xl font-bold text-purple-400">
                ${collections?.referrals.totalReferralEarnings.toFixed(2)}
              </p>
              <p className="text-xs text-muted-foreground">All Time</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Deposits Collection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ArrowDownToLine className="w-5 h-5 text-green-400" />
            Deposits Collection
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Total Deposited</span>
              </div>
              <p className="text-xl font-bold">${collections?.deposits.total.toFixed(2)}</p>
              <Badge variant="secondary">{collections?.deposits.count.total} requests</Badge>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-400" />
                <span className="text-sm text-muted-foreground">Approved</span>
              </div>
              <p className="text-xl font-bold text-green-400">${collections?.deposits.approved.toFixed(2)}</p>
              <Badge className="bg-green-500/20 text-green-400">{collections?.deposits.count.approved}</Badge>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-yellow-400" />
                <span className="text-sm text-muted-foreground">Pending</span>
              </div>
              <p className="text-xl font-bold text-yellow-400">${collections?.deposits.pending.toFixed(2)}</p>
              <Badge className="bg-yellow-500/20 text-yellow-400">{collections?.deposits.count.pending}</Badge>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <XCircle className="w-4 h-4 text-red-400" />
                <span className="text-sm text-muted-foreground">Rejected</span>
              </div>
              <p className="text-xl font-bold text-red-400">${collections?.deposits.rejected.toFixed(2)}</p>
              <Badge className="bg-red-500/20 text-red-400">{collections?.deposits.count.rejected}</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Withdrawals Collection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ArrowUpFromLine className="w-5 h-5 text-red-400" />
            Withdrawals Collection
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Total Requested</span>
              </div>
              <p className="text-xl font-bold">${collections?.withdrawals.total.toFixed(2)}</p>
              <Badge variant="secondary">{collections?.withdrawals.count.total} requests</Badge>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-400" />
                <span className="text-sm text-muted-foreground">Paid</span>
              </div>
              <p className="text-xl font-bold text-green-400">${collections?.withdrawals.paid.toFixed(2)}</p>
              <Badge className="bg-green-500/20 text-green-400">{collections?.withdrawals.count.paid}</Badge>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Wallet className="w-4 h-4 text-blue-400" />
                <span className="text-sm text-muted-foreground">Approved</span>
              </div>
              <p className="text-xl font-bold text-blue-400">${collections?.withdrawals.approved.toFixed(2)}</p>
              <Badge className="bg-blue-500/20 text-blue-400">{collections?.withdrawals.count.approved}</Badge>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-yellow-400" />
                <span className="text-sm text-muted-foreground">Pending</span>
              </div>
              <p className="text-xl font-bold text-yellow-400">${collections?.withdrawals.pending.toFixed(2)}</p>
              <Badge className="bg-yellow-500/20 text-yellow-400">{collections?.withdrawals.count.pending}</Badge>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <XCircle className="w-4 h-4 text-red-400" />
                <span className="text-sm text-muted-foreground">Rejected</span>
              </div>
              <p className="text-xl font-bold text-red-400">${collections?.withdrawals.rejected.toFixed(2)}</p>
              <Badge className="bg-red-500/20 text-red-400">{collections?.withdrawals.count.rejected}</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Cycle Stats */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-primary" />
            Trading Cycles Collection
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Active Investment</span>
              </div>
              <p className="text-xl font-bold">${collections?.cycles.totalInvested.toFixed(2)}</p>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-green-400" />
                <span className="text-sm text-muted-foreground">Profit Generated</span>
              </div>
              <p className="text-xl font-bold text-green-400">${collections?.cycles.totalProfitGenerated.toFixed(2)}</p>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-yellow-400" />
                <span className="text-sm text-muted-foreground">Active Cycles</span>
              </div>
              <p className="text-xl font-bold text-yellow-400">{collections?.cycles.active}</p>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-400" />
                <span className="text-sm text-muted-foreground">Completed</span>
              </div>
              <p className="text-xl font-bold text-green-400">{collections?.cycles.completed}</p>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Ban className="w-4 h-4 text-red-400" />
                <span className="text-sm text-muted-foreground">Broken</span>
              </div>
              <p className="text-xl font-bold text-red-400">{collections?.cycles.broken}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Reinvestment Breakdown */}
      <Card className="border-purple-500/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="w-5 h-5 text-purple-400" />
            Reinvestment Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Wallet className="w-4 h-4 text-orange-400" />
                <span className="text-sm text-muted-foreground">From Cycle Wallet</span>
              </div>
              <p className="text-xl font-bold text-orange-400">${collections?.cycles.reinvestments.fromCycleWallet.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground">Added from cycle balance</p>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-400" />
                <span className="text-sm text-muted-foreground">From Team Income</span>
              </div>
              <p className="text-xl font-bold text-blue-400">${collections?.cycles.reinvestments.fromTeamIncome.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground">Added from referral earnings</p>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-purple-400" />
                <span className="text-sm text-muted-foreground">Total Reinvested</span>
              </div>
              <p className="text-xl font-bold text-purple-400">${collections?.cycles.reinvestments.total.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground">All additional investments</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Team/Referral Stats */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-400" />
            Referral Earnings Collection
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Wallet className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Team Income (Pending)</span>
              </div>
              <p className="text-xl font-bold">${collections?.referrals.totalTeamIncome.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground">From profits</p>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-purple-400" />
                <span className="text-sm text-muted-foreground">Total Team Earnings</span>
              </div>
              <p className="text-xl font-bold text-purple-400">${collections?.referrals.totalReferralEarnings.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground">All time</p>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-emerald-400" />
                <span className="text-sm text-muted-foreground">Direct Earnings (Pending)</span>
              </div>
              <p className="text-xl font-bold text-emerald-400">${collections?.referrals.totalDirectBalance.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground">From deposits</p>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-cyan-400" />
                <span className="text-sm text-muted-foreground">Total Direct Earnings</span>
              </div>
              <p className="text-xl font-bold text-cyan-400">${collections?.referrals.totalDirectEarnings.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground">All time</p>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Wallet className="w-4 h-4 text-green-400" />
                <span className="text-sm text-muted-foreground">Trading Balances</span>
              </div>
              <p className="text-xl font-bold text-green-400">${collections?.referrals.totalWalletBalance.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground">All users</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Earnings Source Breakdown */}
      <Card className="border-cyan-500/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-cyan-400" />
            Earnings Source Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <ArrowDownToLine className="w-4 h-4 text-green-400" />
                <span className="text-sm text-muted-foreground">From Deposits (Direct)</span>
              </div>
              <p className="text-xl font-bold text-green-400">${collections?.earnings.fromDeposits.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground">Commission on referral deposits</p>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-blue-400" />
                <span className="text-sm text-muted-foreground">From Profits (Team)</span>
              </div>
              <p className="text-xl font-bold text-blue-400">${collections?.earnings.fromProfits.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground">Commission on referral profits</p>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-purple-400" />
                <span className="text-sm text-muted-foreground">Total Distributed</span>
              </div>
              <p className="text-xl font-bold text-purple-400">${collections?.earnings.total.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground">All referral commissions</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default CollectionsCard;
