import BottomNav from "@/components/BottomNav";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, TrendingUp, Copy, Share2, Activity, DollarSign, Target, ChevronDown, ChevronUp, ArrowRight, Wallet, Lock, Unlock, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { ReferralEarningsHistory } from "@/components/ReferralEarningsHistory";
interface TeamMemberDetails {
  id: string;
  email: string;
  level: number;
  joined_at: string;
  total_deposits: number;
  total_profit: number;
  wallet_balance: number;
  has_active_cycle: boolean;
  current_cycle_type: number | null;
  completed_cycles: number[];
}
const Team = () => {
  const [userId, setUserId] = useState<string | null>(null);
  const [expandedMember, setExpandedMember] = useState<string | null>(null);
  const [teamIncomeAmount, setTeamIncomeAmount] = useState("");
  const [teamIncomeDestination, setTeamIncomeDestination] = useState<"to-cycle" | "to-main">("to-main");
  const [transferSource, setTransferSource] = useState<"referral" | "team">("referral");
  const [searchQuery, setSearchQuery] = useState("");
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
    staleTime: 5000
  });
  const {
    data: referrals
  } = useQuery({
    queryKey: ["referrals", userId],
    queryFn: async () => {
      if (!userId) return [] as any[];

      // Use backend RPC to bypass profile RLS safely for downline display
      const {
        data,
        error
      } = await supabase.rpc("get_my_downline" as any);
      if (error) throw error;

      // Map RPC result back into the shape the UI already expects
      return ((data || []) as any[]).map(r => ({
        id: r.referral_id,
        referrer_id: r.referrer_id,
        referred_id: r.referred_id,
        level: r.level,
        created_at: r.created_at,
        profiles: {
          id: r.referred_id,
          email: r.email,
          created_at: r.created_at,
          total_deposits: r.total_deposits,
          total_profit: r.total_profit,
          wallet_balance: r.wallet_balance,
          telegram_first_name: r.telegram_first_name,
          telegram_last_name: r.telegram_last_name,
          telegram_username: r.telegram_username,
          referred_by_code: r.referred_by_code
        }
      }));
    },
    enabled: !!userId,
    staleTime: 5000
  });

  // Fetch referrer names for "Referred by" labels
  const {
    data: referrerNames
  } = useQuery({
    queryKey: ["referrerNames", referrals],
    queryFn: async () => {
      if (!referrals || referrals.length === 0) return {} as Record<string, string>;

      // Get unique referral codes from team members
      const codes = [...new Set(referrals.map(r => r.profiles?.referred_by_code).filter(Boolean) as string[])];
      if (codes.length === 0) return {} as Record<string, string>;
      const {
        data,
        error
      } = await supabase.rpc("get_referrer_names_by_codes" as any, {
        p_codes: codes
      });
      if (error) throw error;

      // Build map: referral_code -> display_name
      const map: Record<string, string> = {};
      ((data || []) as {
        referral_code: string;
        display_name: string;
      }[]).forEach(row => {
        map[row.referral_code] = row.display_name;
      });
      return map;
    },
    enabled: !!referrals && referrals.length > 0,
    refetchInterval: 5000
  });

  // Note: Actual earnings are tracked in the database (referral_earnings_history table)
  // and displayed via profile.total_direct_earnings (referral bonus from deposits)
  // and profile.total_referral_earnings (team earnings from cycle profits)

  // Fetch unlocked referral levels
  const {
    data: unlockedLevels
  } = useQuery({
    queryKey: ["unlockedLevels", userId],
    queryFn: async () => {
      if (!userId) return null;
      const {
        data,
        error
      } = await supabase.rpc("get_unlocked_referral_levels", {
        p_user_id: userId
      });
      if (error) throw error;
      return data as {
        direct_depositors: number;
        level_1_unlocked: boolean;
        level_2_unlocked: boolean;
        level_3_unlocked: boolean;
        level_4_unlocked: boolean;
        level_5_unlocked: boolean;
      };
    },
    enabled: !!userId,
    staleTime: 5000
  });

  // Fetch active cycles for all team members
  const {
    data: teamCycles
  } = useQuery({
    queryKey: ["teamCycles", referrals],
    queryFn: async () => {
      if (!referrals || referrals.length === 0) return {};
      const memberIds = referrals.map(r => r.referred_id);
      const {
        data,
        error
      } = await supabase.from("ai_trade_cycles").select("user_id, cycle_type, status").in("user_id", memberIds).eq("status", "active");
      if (error) throw error;

      // Map to user_id -> cycle info
      const cycleMap: Record<string, {
        cycle_type: number;
      }> = {};
      data?.forEach(cycle => {
        cycleMap[cycle.user_id] = {
          cycle_type: cycle.cycle_type
        };
      });
      return cycleMap;
    },
    enabled: !!referrals && referrals.length > 0,
    staleTime: 5000
  });

  // Fetch downline counts for each team member (their Level 1 and Level 2 referrals)
  const {
    data: teamDownlineCounts
  } = useQuery({
    queryKey: ["teamDownlineCounts", referrals],
    queryFn: async () => {
      if (!referrals || referrals.length === 0) return {};
      const memberIds = referrals.map(r => r.referred_id);

      // Get all referrals where these members are the referrer
      const {
        data,
        error
      } = await supabase.from("referrals").select("referrer_id, level").in("referrer_id", memberIds);
      if (error) throw error;

      // Count Level 1 and Level 2 for each member
      const countMap: Record<string, {
        level1: number;
        level2: number;
      }> = {};
      memberIds.forEach(id => {
        countMap[id] = {
          level1: 0,
          level2: 0
        };
      });
      data?.forEach(ref => {
        if (countMap[ref.referrer_id]) {
          if (ref.level === 1) {
            countMap[ref.referrer_id].level1++;
          } else if (ref.level === 2) {
            countMap[ref.referrer_id].level2++;
          }
        }
      });
      return countMap;
    },
    enabled: !!referrals && referrals.length > 0,
    staleTime: 5000
  });

  // Fetch trade progress for all team members
  const {
    data: teamProgress
  } = useQuery({
    queryKey: ["teamProgress", referrals],
    queryFn: async () => {
      if (!referrals || referrals.length === 0) return {};
      const memberIds = referrals.map(r => r.referred_id);
      const {
        data,
        error
      } = await supabase.from("user_trade_progress").select("user_id, completed_cycles").in("user_id", memberIds);
      if (error) throw error;
      const progressMap: Record<string, number[]> = {};
      data?.forEach(progress => {
        progressMap[progress.user_id] = progress.completed_cycles || [];
      });
      return progressMap;
    },
    enabled: !!referrals && referrals.length > 0,
    staleTime: 5000
  });
  const {
    data: botConfig
  } = useQuery({
    queryKey: ["telegram_bot"],
    queryFn: async () => {
      const {
        data
      } = await supabase.from("system_config").select("value").eq("key", "telegram_bot_username").maybeSingle();
      return data?.value || "HyperliquidWhale_BOT";
    },
    staleTime: 60000,
    retry: false
  });
  const transferMutation = useMutation({
    mutationFn: async ({
      amount,
      destination,
      source
    }: {
      amount: number;
      destination: "to-cycle" | "to-main";
      source: "referral" | "team";
    }) => {
      if (!userId) throw new Error("Not authenticated");
      let functionName: string;
      if (source === "referral") {
        functionName = destination === "to-cycle" ? "transfer_direct_earnings_to_cycle_wallet" : "transfer_direct_earnings_to_main_wallet";
      } else {
        functionName = destination === "to-cycle" ? "transfer_team_income_to_cycle_wallet" : "transfer_team_income_to_main_wallet";
      }
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
      const sourceLabel = variables.source === "referral" ? "Referral Bonus" : "Team Income";
      toast({
        title: "Transfer Successful",
        description: `$${variables.amount.toFixed(2)} from ${sourceLabel} transferred to ${variables.destination === "to-cycle" ? "Cycle Wallet" : "Main Wallet"}`
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
  const handleTransfer = () => {
    const amount = parseFloat(teamIncomeAmount);
    if (isNaN(amount) || amount <= 0) {
      toast({
        title: "Invalid Amount",
        description: "Please enter a valid amount",
        variant: "destructive"
      });
      return;
    }
    const availableBalance = transferSource === "referral" ? profile?.direct_earnings_balance || 0 : profile?.referral_balance || 0;
    if (amount > availableBalance) {
      toast({
        title: "Insufficient Balance",
        description: `Not enough ${transferSource === "referral" ? "Referral Bonus" : "Team Income"} balance`,
        variant: "destructive"
      });
      return;
    }
    transferMutation.mutate({
      amount,
      destination: teamIncomeDestination,
      source: transferSource
    });
  };
  const botUsername = botConfig || "HyperliquidWhale_BOT";
  const referralLink = profile?.referral_code ? `https://t.me/${botUsername}?start=${profile.referral_code}` : "";
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied!",
      description: "Referral link copied to clipboard"
    });
  };
  const shareReferral = async () => {
    if (navigator.share && referralLink) {
      try {
        await navigator.share({
          title: "Join HyperliquidWhale",
          text: "Start earning with AI-powered trading!",
          url: referralLink
        });
      } catch (error) {
        // User cancelled or share failed
      }
    } else {
      copyToClipboard(referralLink);
    }
  };

  // Filter referrals by search query
  const filteredReferrals = referrals?.filter(ref => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    const fullName = [ref.profiles?.telegram_first_name, ref.profiles?.telegram_last_name].filter(Boolean).join(' ').toLowerCase();
    const memberId = (ref.profiles?.id || ref.referred_id || '').toLowerCase();
    const email = (ref.profiles?.email || '').toLowerCase();
    return fullName.includes(query) || memberId.includes(query) || email.includes(query);
  });

  // Group referrals by level
  const referralsByLevel = filteredReferrals?.reduce((acc, ref) => {
    const level = ref.level;
    if (!acc[level]) {
      acc[level] = [];
    }
    acc[level].push(ref);
    return acc;
  }, {} as Record<number, typeof referrals>);
  const levels = [{
    level: 1,
    percentage: "10%"
  }, {
    level: 2,
    percentage: "4%"
  }, {
    level: 3,
    percentage: "2%"
  }, {
    level: 4,
    percentage: "1%"
  }, {
    level: 5,
    percentage: "1%"
  }];
  const totalMembers = referrals?.length || 0;
  return <div className="min-h-screen bg-background pb-20">
      <div className="bg-gradient-to-b from-primary to-primary/80 text-primary-foreground p-6 rounded-b-3xl shadow-lg">
        <div className="flex items-center gap-3 mb-4">
          <Users className="w-6 h-6" />
          <h1 className="text-2xl font-bold">My Team</h1>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-primary-foreground/10 rounded-xl p-3">
            <p className="text-xs opacity-90 mb-1">Total Members</p>
            <p className="text-xl font-bold">{totalMembers}</p>
          </div>
          <div className="bg-primary-foreground/10 rounded-xl p-3">
            <p className="text-xs opacity-90 mb-1">Referral Bonus</p>
            <p className="text-xl font-bold text-green-300">${Number(profile?.direct_earnings_balance || 0).toFixed(2)}</p>
          </div>
          <div className="bg-primary-foreground/10 rounded-xl p-3">
            <p className="text-xs opacity-90 mb-1">Team Earnings</p>
            <p className="text-xl font-bold">${Number(profile?.referral_balance || 0).toFixed(2)}</p>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
        {/* Quick Team Income Transfer */}
        <Card className="p-4 bg-gradient-to-br from-amber-500/10 to-orange-500/10 border-amber-500/30">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Wallet className="w-5 h-5 text-amber-500" />
              <h3 className="font-semibold text-foreground">Available Balance</h3>
            </div>
          </div>
          
          {/* Show both balances */}
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="bg-blue-500/10 rounded-lg p-2 border border-blue-500/20">
              <p className="text-xs text-muted-foreground">Referral Bonus</p>
              <p className="text-lg font-bold text-blue-500">${Number(profile?.direct_earnings_balance || 0).toFixed(2)}</p>
            </div>
            <div className="bg-emerald-500/10 rounded-lg p-2 border border-emerald-500/20">
              <p className="text-xs text-muted-foreground">Team Income</p>
              <p className="text-lg font-bold text-emerald-500">${Number(profile?.referral_balance || 0).toFixed(2)}</p>
            </div>
          </div>

          <div className="bg-amber-500/10 rounded-lg p-2 border border-amber-500/20 mb-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Total Available</p>
              <p className="text-lg font-bold text-amber-600">
                ${(Number(profile?.direct_earnings_balance || 0) + Number(profile?.referral_balance || 0)).toFixed(2)}
              </p>
            </div>
          </div>
          
          {(profile?.referral_balance || 0) > 0 || (profile?.direct_earnings_balance || 0) > 0 ? <>
              {/* Source Selection */}
              <div className="flex items-center gap-2 mb-3">
                <Button variant={transferSource === "referral" ? "default" : "outline"} size="sm" onClick={() => setTransferSource("referral")} className={`flex-1 text-xs ${transferSource === "referral" ? "bg-blue-600 hover:bg-blue-700" : ""}`}>
                  Referral (${Number(profile?.direct_earnings_balance || 0).toFixed(2)})
                </Button>
                <Button variant={transferSource === "team" ? "default" : "outline"} size="sm" onClick={() => setTransferSource("team")} className={`flex-1 text-xs ${transferSource === "team" ? "bg-emerald-600 hover:bg-emerald-700" : ""}`}>
                  Team (${Number(profile?.referral_balance || 0).toFixed(2)})
                </Button>
              </div>

              {/* Destination Selection */}
              <div className="flex items-center gap-2 mb-3">
                <Button variant={teamIncomeDestination === "to-main" ? "default" : "outline"} size="sm" onClick={() => setTeamIncomeDestination("to-main")} className="flex-1 text-xs">
                  To Main (Withdraw)
                </Button>
                <Button variant={teamIncomeDestination === "to-cycle" ? "default" : "outline"} size="sm" onClick={() => setTeamIncomeDestination("to-cycle")} className="flex-1 text-xs">
                  To Cycle (Trade)
                </Button>
              </div>

              <div className="flex gap-2">
                <Input type="number" placeholder="Amount" value={teamIncomeAmount} onChange={e => setTeamIncomeAmount(e.target.value)} min="0" className="flex-1" />
                <Button onClick={handleTransfer} disabled={transferMutation.isPending} className="bg-amber-600 hover:bg-amber-700">
                  {transferMutation.isPending ? "..." : "Transfer"}
                </Button>
              </div>
            </> : <p className="text-sm text-muted-foreground text-center py-2">
              Invite friends to earn referral commissions!
            </p>}
        </Card>

        <Card className="p-6 bg-gradient-to-br from-primary/10 to-primary/5">
          <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
            <Share2 className="w-5 h-5 text-primary" />
            Your Referral Link
          </h3>
          
          <div className="space-y-3">
            <div className="bg-background p-3 rounded-lg">
              <p className="text-xs text-muted-foreground mb-2">Referral Code</p>
              <div className="flex items-center gap-2">
                <Input value={profile?.referral_code || ""} readOnly className="font-mono font-bold text-lg" />
                <Button size="icon" variant="outline" onClick={() => copyToClipboard(profile?.referral_code || "")}>
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <div className="bg-background p-3 rounded-lg">
              <p className="text-xs text-muted-foreground mb-2">Share Link</p>
              <div className="flex items-center gap-2">
                <Input value={referralLink} readOnly className="font-mono text-xs" />
                <Button size="icon" variant="outline" onClick={() => copyToClipboard(referralLink)}>
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <Button className="w-full" onClick={shareReferral}>
              <Share2 className="w-4 h-4 mr-2" />
              Share Referral Link
            </Button>

            <div className="text-xs text-muted-foreground text-center space-y-1">
              <p>Earn commissions on 5 levels:</p>
              <p className="font-semibold">10% → 4% → 2% → 1% → 1%</p>
            </div>
          </div>
        </Card>

        {/* Level Unlock Progress Card */}
        <Card className="p-4 bg-gradient-to-br from-blue-500/10 to-indigo-500/10 border-blue-500/30">
          <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
            🔓 Level Unlock Progress
          </h3>
          <div className="mb-4">
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="text-muted-foreground">Direct Referrals with Deposits</span>
              <span className="font-bold text-foreground">{unlockedLevels?.direct_depositors || 0} / 5</span>
            </div>
            <div className="h-3 bg-secondary rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-500" style={{
              width: `${Math.min((unlockedLevels?.direct_depositors || 0) / 5 * 100, 100)}%`
            }} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Unlock each level by having more direct referrals make their first deposit. You need {Math.max(5 - (unlockedLevels?.direct_depositors || 0), 0)} more to unlock all levels.
          </p>
        </Card>

        {/* Referral Rules Card */}
        <Card className="p-4 bg-gradient-to-br from-amber-500/10 to-amber-500/5 border-amber-500/20">
          <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
            📋 Referral Commission Rules
          </h3>
          <ul className="text-sm text-muted-foreground space-y-2">
            <li className="flex items-start gap-2">
              <span className="text-primary font-bold">•</span>
              <span>Earn commission when your downline makes a <strong className="text-foreground">deposit</strong></span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary font-bold">•</span>
              <span>Earn commission when your downline completes a cycle and earns <strong className="text-foreground">cycle profits</strong></span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-amber-500 font-bold">⚠️</span>
              <span><strong className="text-foreground">Maximum $30</strong> commission per cycle profit (no limit on deposit commissions)</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-500 font-bold">🔒</span>
              <span><strong className="text-foreground">Unlock levels</strong> by having direct referrals deposit (1 deposit = Level 1, 2 deposits = Level 2, etc.)</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary font-bold">•</span>
              <span>Earn up to <strong className="text-foreground">5 levels deep</strong> in your referral chain</span>
            </li>
          </ul>
        </Card>

        

        <ReferralEarningsHistory />

        <Card className="p-6">
          <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-primary" />
            Referral Structure
          </h3>
          <div className="space-y-3">
            {levels.map(item => {
            const levelReferrals = referralsByLevel?.[item.level] || [];
            const isUnlocked = unlockedLevels?.[`level_${item.level}_unlocked` as keyof typeof unlockedLevels] ?? false;
            return <div key={item.level} className={`flex items-center justify-between p-3 rounded-lg transition-colors ${isUnlocked ? 'bg-secondary hover:bg-accent' : 'bg-muted/30 opacity-60'}`}>
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${isUnlocked ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                      L{item.level}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-foreground">
                          Level {item.level} ({item.percentage})
                        </p>
                        {isUnlocked ? <Unlock className="w-3 h-3 text-success" /> : <Lock className="w-3 h-3 text-muted-foreground" />}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {levelReferrals.length} member{levelReferrals.length !== 1 ? "s" : ""}
                        {!isUnlocked && ` • Need ${item.level} direct deposits to unlock`}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <Badge variant={isUnlocked ? "default" : "secondary"} className="text-xs">
                      {isUnlocked ? "Active" : "Locked"}
                    </Badge>
                  </div>
                </div>;
          })}
          </div>
        </Card>

        {/* Detailed Team Members by Level */}
        <Card className="p-6">
          <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary" />
            Team Members by Level
          </h3>
          
          {/* Search Input */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input type="text" placeholder="Search by name or user ID..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-10" />
          </div>
          
          {(() => {
          // Active = users who have made deposits (depositors), Inactive = users with no deposits
          const activeMembers = filteredReferrals?.filter(r => (r.profiles?.total_deposits || 0) > 0) || [];
          const inactiveMembers = filteredReferrals?.filter(r => (r.profiles?.total_deposits || 0) === 0) || [];
          return <Tabs defaultValue="all" className="w-full">
                <TabsList className="grid w-full grid-cols-4 mb-2">
                  <TabsTrigger value="all">All ({filteredReferrals?.length || 0})</TabsTrigger>
                  <TabsTrigger value="active" className="text-success">Depositors ({activeMembers.length})</TabsTrigger>
                  <TabsTrigger value="inactive">No Deposit ({inactiveMembers.length})</TabsTrigger>
                  <TabsTrigger value="levels">By Level</TabsTrigger>
                </TabsList>

                <TabsContent value="all" className="space-y-3">
                  {renderTeamMembers(filteredReferrals || [])}
                </TabsContent>

                <TabsContent value="active" className="space-y-3">
                  {renderTeamMembers(activeMembers)}
                </TabsContent>

                <TabsContent value="inactive" className="space-y-3">
                  {renderTeamMembers(inactiveMembers)}
                </TabsContent>

                <TabsContent value="levels" className="space-y-3">
                  <Tabs defaultValue="L1" className="w-full">
                    <TabsList className="grid w-full grid-cols-5 mb-4">
                      <TabsTrigger value="L1">L1 ({referralsByLevel?.[1]?.length || 0})</TabsTrigger>
                      <TabsTrigger value="L2">L2 ({referralsByLevel?.[2]?.length || 0})</TabsTrigger>
                      <TabsTrigger value="L3">L3 ({referralsByLevel?.[3]?.length || 0})</TabsTrigger>
                      <TabsTrigger value="L4">L4 ({referralsByLevel?.[4]?.length || 0})</TabsTrigger>
                      <TabsTrigger value="L5">L5 ({referralsByLevel?.[5]?.length || 0})</TabsTrigger>
                    </TabsList>

                    <TabsContent value="L1" className="space-y-3">
                      {renderTeamMembers(referralsByLevel?.[1] || [])}
                    </TabsContent>

                    <TabsContent value="L2" className="space-y-3">
                      {renderTeamMembers(referralsByLevel?.[2] || [])}
                    </TabsContent>

                    <TabsContent value="L3" className="space-y-3">
                      {renderTeamMembers(referralsByLevel?.[3] || [])}
                    </TabsContent>

                    <TabsContent value="L4" className="space-y-3">
                      {renderTeamMembers(referralsByLevel?.[4] || [])}
                    </TabsContent>

                    <TabsContent value="L5" className="space-y-3">
                      {renderTeamMembers(referralsByLevel?.[5] || [])}
                    </TabsContent>
                  </Tabs>
                </TabsContent>
              </Tabs>;
        })()}
        </Card>
      </div>

      <BottomNav />
    </div>;
  function renderTeamMembers(members: typeof referrals) {
    if (!members || members.length === 0) {
      return <div className="text-center py-8">
          <Users className="w-12 h-12 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No members in this category</p>
        </div>;
    }
    return members.map(referral => {
      const hasActiveCycle = !!teamCycles?.[referral.referred_id];
      const activeCycleType = teamCycles?.[referral.referred_id]?.cycle_type;
      const completedCycles = teamProgress?.[referral.referred_id] || [];
      const isExpanded = expandedMember === referral.id;
      const getCycleName = (type: number) => {
        switch (type) {
          case 1:
            return "Cycle 1";
          case 2:
            return "Cycle 2";
          case 3:
            return "Cycle 3";
          case 4:
            return "Special";
          default:
            return "Unknown";
        }
      };
      const telegramName = [referral.profiles?.telegram_first_name, referral.profiles?.telegram_last_name].filter(Boolean).join(' ');
      const username = referral.profiles?.telegram_username || '';
      const email = referral.profiles?.email || '';
      const displayUserId = referral.profiles?.id || referral.referred_id;
      const emailUser = email ? email.split('@')[0] : '';
      const fullName = telegramName || (username ? `@${username}` : emailUser ? emailUser.startsWith('telegram_') ? `User ${emailUser.replace('telegram_', '').substring(0, 8)}...` : emailUser : `User ${displayUserId.substring(0, 8)}...`);
      return <div key={referral.id} className="bg-secondary/50 rounded-lg overflow-hidden border border-border">
          {/* Member Header */}
          <div className="p-4 cursor-pointer hover:bg-secondary transition-colors" onClick={() => setExpandedMember(isExpanded ? null : referral.id)}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${hasActiveCycle ? 'bg-success/20' : 'bg-muted'}`}>
                  <Users className={`w-5 h-5 ${hasActiveCycle ? 'text-success' : 'text-muted-foreground'}`} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground">
                      {fullName}
                    </p>
                    {/* Show Depositor badge based on deposits, Trading badge if has active cycle */}
                    {(referral.profiles?.total_deposits || 0) > 0 ? (
                      <Badge variant="default" className="text-xs bg-green-600">
                        Depositor
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-xs">
                        No Deposit
                      </Badge>
                    )}
                    {hasActiveCycle && (
                      <Badge variant="outline" className="text-xs bg-blue-500/20 border-blue-500/30 text-blue-400">
                        Trading
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    <span className="font-mono">{displayUserId}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                    <span>Level {referral.level}</span>
                    <span>•</span>
                    <span>Joined {new Date(referral.created_at).toLocaleDateString()}</span>
                  </div>
                  {/* Show who referred this person */}
                  {referral.profiles?.referred_by_code && <div className="flex items-center gap-1 text-xs text-primary/80 mt-1">
                      <span>Referred by:</span>
                      <span className="font-medium">
                        {referrerNames?.[referral.profiles.referred_by_code] || referral.profiles.referred_by_code}
                      </span>
                    </div>}
                  {/* Show downline counts */}
                  {(() => {
                  const downline = teamDownlineCounts?.[referral.referred_id];
                  const totalDownline = (downline?.level1 || 0) + (downline?.level2 || 0);
                  if (totalDownline > 0) {
                    return <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                          <Users className="w-3 h-3" />
                          <span>Downline:</span>
                          <span className="font-medium text-foreground">L1: {downline?.level1 || 0}</span>
                          <span>•</span>
                          <span className="font-medium text-foreground">L2: {downline?.level2 || 0}</span>
                        </div>;
                  }
                  return null;
                })()}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {hasActiveCycle && <Badge variant="outline" className="text-xs bg-primary/10 border-primary/30">
                    {getCycleName(activeCycleType!)}
                  </Badge>}
                {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
              </div>
            </div>
          </div>

          {/* Expanded Details */}
          {isExpanded && <div className="px-4 pb-4 pt-2 border-t border-border bg-background/50">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-secondary p-3 rounded-lg">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                    <DollarSign className="w-3 h-3" />
                    Total Deposits
                  </div>
                  <p className="text-lg font-bold text-foreground">
                    ${Number(referral.profiles?.total_deposits || 0).toFixed(2)}
                  </p>
                </div>
                <div className="bg-secondary p-3 rounded-lg">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                    <TrendingUp className="w-3 h-3" />
                    Total Profit
                  </div>
                  <p className="text-lg font-bold text-success">
                    ${Number(referral.profiles?.total_profit || 0).toFixed(2)}
                  </p>
                </div>
                <div className="bg-secondary p-3 rounded-lg">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                    <Activity className="w-3 h-3" />
                    Current Status
                  </div>
                  <p className="text-sm font-medium text-foreground">
                    {hasActiveCycle ? `In ${getCycleName(activeCycleType!)}` : "No active cycle"}
                  </p>
                </div>
                <div className="bg-secondary p-3 rounded-lg">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                    <Target className="w-3 h-3" />
                    Completed Cycles
                  </div>
                  <div className="flex gap-1 flex-wrap">
                    {completedCycles.length > 0 ? completedCycles.map(cycle => <Badge key={cycle} variant="secondary" className="text-xs">
                          {getCycleName(cycle)}
                        </Badge>) : <span className="text-xs text-muted-foreground">None yet</span>}
                  </div>
                </div>
              </div>
              
              {/* Progress Indicator */}
              <div className="mt-3 pt-3 border-t border-border">
                <p className="text-xs text-muted-foreground mb-2">Cycle Progress</p>
                <div className="flex gap-1">
                  {[1, 2, 3, 4].map(cycle => <div key={cycle} className={`flex-1 h-2 rounded-full ${completedCycles.includes(cycle) ? 'bg-success' : activeCycleType === cycle ? 'bg-primary animate-pulse' : 'bg-muted'}`} title={getCycleName(cycle)} />)}
                </div>
                <div className="flex justify-between text-xs text-muted-foreground mt-1">
                  <span>C1</span>
                  <span>C2</span>
                  <span>C3</span>
                  <span>Special</span>
                </div>
              </div>
            </div>}
        </div>;
    });
  }
};
export default Team;