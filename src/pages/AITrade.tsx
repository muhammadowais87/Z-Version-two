import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLocation } from "react-router-dom";
import BottomNav from "@/components/BottomNav";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertCircle, Lock, Unlock, TrendingUp, Clock, DollarSign, History, CheckCircle2, Zap } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useNavigate } from "react-router-dom";
import { AITradeSkeleton } from "@/components/LoadingSkeletons";
import AITradingActivity from "@/components/AITradingActivity";
import { ChanceSelector } from "@/components/ChanceSelector";
import AITradeHistory from "@/components/AITradeHistory";
import { PenaltyModeDisplay } from "@/components/PenaltyModeDisplay";
type ChanceStatus = 'available' | 'active' | 'locked' | 'completed' | 'disabled';
const AITrade = () => {
  const {
    toast
  } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();

  // Get chance from navigation state if available
  const initialChance = (location.state as {
    chance?: number;
  })?.chance || null;
  const [selectedChance, setSelectedChance] = useState<number | null>(initialChance);
  const [selectedCycle, setSelectedCycle] = useState<number | null>(null);
  const [investAmount, setInvestAmount] = useState("");
  const [showWithdrawConfirm, setShowWithdrawConfirm] = useState(false);
  const [showAddInvestment, setShowAddInvestment] = useState(false);
  const [additionalAmount, setAdditionalAmount] = useState("");
  const [showAddTeamIncome, setShowAddTeamIncome] = useState(false);
  const [teamIncomeAmount, setTeamIncomeAmount] = useState("");
  const [activeTab, setActiveTab] = useState("trade");

  // Fetch system config for cycle settings
  const {
    data: systemConfig
  } = useQuery({
    queryKey: ['systemConfig'],
    queryFn: async () => {
      const {
        data,
        error
      } = await supabase.from('system_config').select('key, value').in('key', ['cycle_time_unit', 'cycle_1_duration', 'cycle_2_duration', 'cycle_3_duration', 'cycle_4_duration', 'penalty_daily_return']);
      if (error) return null;
      const config: Record<string, string> = {};
      data?.forEach(item => {
        config[item.key] = item.value;
      });
      return config;
    },
    refetchInterval: 2000
  });

  // Derive cycle config from system settings
  const CYCLE_CONFIG = useMemo(() => {
    const timeUnit = systemConfig?.cycle_time_unit || 'days';
    const unit = timeUnit === 'seconds' ? 'sec' : timeUnit === 'minutes' ? 'min' : 'd';
    return {
      1: {
        duration: parseInt(systemConfig?.cycle_1_duration || '28'),
        name: "Cycle 1",
        color: "bg-green-500",
        unit
      },
      2: {
        duration: parseInt(systemConfig?.cycle_2_duration || '22'),
        name: "Cycle 2",
        color: "bg-yellow-500",
        unit
      },
      3: {
        duration: parseInt(systemConfig?.cycle_3_duration || '16'),
        name: "Cycle 3",
        color: "bg-red-500",
        unit
      },
      4: {
        duration: parseInt(systemConfig?.cycle_4_duration || '14'),
        name: "Special Cycle",
        color: "bg-purple-500",
        unit
      }
    };
  }, [systemConfig]);
  const timeUnit = systemConfig?.cycle_time_unit || 'days';
  const isTestMode = timeUnit === 'seconds' || timeUnit === 'minutes';
  const penaltyReturn = parseFloat(systemConfig?.penalty_daily_return || '2');

  // Fetch user profile
  const {
    data: profile
  } = useQuery({
    queryKey: ['profile'],
    queryFn: async () => {
      const {
        data: {
          user
        }
      } = await supabase.auth.getUser();
      if (!user) return null;
      const {
        data
      } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      return data;
    },
    refetchInterval: 2000
  });

  // Fetch active cycle
  const {
    data: activeCycle,
    isLoading: loadingActiveCycle
  } = useQuery({
    queryKey: ['activeCycle'],
    queryFn: async () => {
      const {
        data: {
          user
        }
      } = await supabase.auth.getUser();
      if (!user) return null;
      const {
        data
      } = await supabase.from('ai_trade_cycles').select('*').eq('user_id', user.id).eq('status', 'active').maybeSingle();
      return data;
    },
    refetchInterval: 2000
  });

  // Fetch user progress with chance status
  const {
    data: progress
  } = useQuery({
    queryKey: ['tradeProgress'],
    queryFn: async () => {
      const {
        data: {
          user
        }
      } = await supabase.auth.getUser();
      if (!user) return null;

      // First ensure progress record exists
      const {
        data: existingProgress
      } = await supabase.from('user_trade_progress').select('*').eq('user_id', user.id).maybeSingle();
      if (!existingProgress) {
        // Create initial progress record
        const {
          data: newProgress
        } = await supabase.from('user_trade_progress').insert({
          user_id: user.id,
          chance_1_status: 'available',
          chance_2_status: 'locked'
        }).select().single();
        return newProgress || {
          completed_cycles: [],
          is_penalty_mode: false,
          active_chance: null,
          penalty_chance: null,
          chance_1_status: 'available' as ChanceStatus,
          chance_2_status: 'locked' as ChanceStatus
        };
      }
      return existingProgress;
    },
    refetchInterval: 2000
  });

  // Auto-select chance if one is active
  useEffect(() => {
    if (progress?.active_chance && !selectedChance) {
      setSelectedChance(progress.active_chance);
    }
  }, [progress?.active_chance, selectedChance]);

  // Auto-select the next available cycle when chance is selected
  useEffect(() => {
    if (!selectedChance || activeCycle) return;
    const completedCycles = progress?.completed_cycles || [];

    // Find the next cycle to auto-select
    let nextCycle: number | null = null;
    if (!completedCycles.includes(1)) {
      nextCycle = 1; // Cycle 1 is next
    } else if (!completedCycles.includes(2)) {
      nextCycle = 2; // Cycle 2 is next
    } else if (!completedCycles.includes(3)) {
      nextCycle = 3; // Cycle 3 is next
    } else {
      nextCycle = 4; // Special cycle (all others completed)
    }
    setSelectedCycle(nextCycle);
  }, [selectedChance, progress?.completed_cycles, activeCycle]);

  // Auto-complete matured cycles in real-time
  const [, setTick] = useState(0);
  const [isCompletingCycle, setIsCompletingCycle] = useState(false);
  useEffect(() => {
    if (!activeCycle) return;
    const interval = setInterval(async () => {
      setTick(t => t + 1);

      // Check if cycle has ended and auto-complete it
      if (new Date(activeCycle.end_date) <= new Date() && !isCompletingCycle) {
        setIsCompletingCycle(true);
        try {
          // Call the user-specific completion function
          await supabase.rpc('complete_user_matured_cycles');
          // Refetch all data after completion
          queryClient.invalidateQueries({
            queryKey: ['activeCycle']
          });
          queryClient.invalidateQueries({
            queryKey: ['profile']
          });
          queryClient.invalidateQueries({
            queryKey: ['tradeProgress']
          });
        } catch (error) {
          console.error('Error completing cycle:', error);
        } finally {
          setIsCompletingCycle(false);
        }
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [activeCycle, queryClient, isCompletingCycle]);

  // Start cycle mutation
  const startCycleMutation = useMutation({
    mutationFn: async ({
      cycleType,
      amount,
      chanceNumber
    }: {
      cycleType: number;
      amount: number;
      chanceNumber: number;
    }) => {
      const {
        data,
        error
      } = await supabase.functions.invoke('start-cycle', {
        body: {
          cycle_type: cycleType,
          amount,
          chance_number: chanceNumber
        }
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['activeCycle']
      });
      queryClient.invalidateQueries({
        queryKey: ['profile']
      });
      queryClient.invalidateQueries({
        queryKey: ['tradeProgress']
      });
      toast({
        title: "Cycle Started!",
        description: "Your whale trade cycle has begun."
      });
      setSelectedCycle(null);
      setInvestAmount("");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to start cycle",
        variant: "destructive"
      });
    }
  });

  // Withdraw early mutation
  const withdrawMutation = useMutation({
    mutationFn: async (cycleId: string) => {
      const {
        data,
        error
      } = await supabase.functions.invoke('withdraw-cycle', {
        body: {
          cycle_id: cycleId
        }
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({
        queryKey: ['activeCycle']
      });
      queryClient.invalidateQueries({
        queryKey: ['profile']
      });
      queryClient.invalidateQueries({
        queryKey: ['tradeProgress']
      });
      let message = `Withdrawn: $${Number(data.withdrawn_amount).toFixed(2)}`;
      if (Number(data.tax_applied) > 0) {
        message += ` (Tax: $${Number(data.tax_applied).toFixed(2)})`;
      }
      if (data.next_chance_unlocked) {
        message += ` - Next chance unlocked!`;
      }
      toast({
        title: "Withdrawal Complete",
        description: message
      });
      setShowWithdrawConfirm(false);
      setSelectedChance(null);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to withdraw",
        variant: "destructive"
      });
    }
  });

  // Complete chance mutation - to finish current chance and unlock next
  const completeChanceMutation = useMutation({
    mutationFn: async () => {
      const {
        data,
        error
      } = await supabase.rpc('complete_current_chance');
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({
        queryKey: ['tradeProgress']
      });
      queryClient.invalidateQueries({
        queryKey: ['activeCycle']
      });
      queryClient.invalidateQueries({
        queryKey: ['profile']
      });
      const fundsMessage = data.funds_returned > 0 ? ` $${Number(data.funds_returned).toFixed(2)} returned to wallet.` : '';
      if (data.all_chances_completed) {
        toast({
          title: "All Chances Completed!",
          description: `You have completed both chances. Great job!${fundsMessage}`
        });
      } else {
        toast({
          title: "Chance Completed!",
          description: `Chance ${data.completed_chance} completed. Chance ${data.next_chance_unlocked} is now available!${fundsMessage}`
        });
      }
      setSelectedChance(null);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to complete chance",
        variant: "destructive"
      });
    }
  });

  // Add investment mutation - only for Cycle 1
  const addInvestmentMutation = useMutation({
    mutationFn: async ({
      cycleId,
      amount
    }: {
      cycleId: string;
      amount: number;
    }) => {
      const {
        data,
        error
      } = await supabase.rpc('add_investment_to_cycle', {
        p_cycle_id: cycleId,
        p_amount: amount
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({
        queryKey: ['activeCycle']
      });
      queryClient.invalidateQueries({
        queryKey: ['profile']
      });
      toast({
        title: "Investment Added!",
        description: `$${Number(data.amount_added).toFixed(2)} added to your Cycle 1. Profit will be calculated for remaining days.`
      });
      setShowAddInvestment(false);
      setAdditionalAmount("");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add investment",
        variant: "destructive"
      });
    }
  });

  // Add team income to cycle mutation - works for any active cycle
  const addTeamIncomeMutation = useMutation({
    mutationFn: async ({
      cycleId,
      amount
    }: {
      cycleId: string;
      amount: number;
    }) => {
      const {
        data,
        error
      } = await supabase.rpc('add_team_income_to_cycle', {
        p_cycle_id: cycleId,
        p_amount: amount
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({
        queryKey: ['activeCycle']
      });
      queryClient.invalidateQueries({
        queryKey: ['profile']
      });
      toast({
        title: "Team Income Added!",
        description: `$${Number(data.amount_added).toFixed(2)} from team income added to your cycle.`
      });
      setShowAddTeamIncome(false);
      setTeamIncomeAmount("");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add team income",
        variant: "destructive"
      });
    }
  });

  // Deactivate chance mutation - skip current chance and unlock next
  const deactivateChanceMutation = useMutation({
    mutationFn: async (chanceNumber: number) => {
      const {
        data,
        error
      } = await supabase.rpc('deactivate_chance', {
        p_chance_number: chanceNumber
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({
        queryKey: ['tradeProgress']
      });
      queryClient.invalidateQueries({
        queryKey: ['activeCycle']
      });
      queryClient.invalidateQueries({
        queryKey: ['profile']
      });
      const fundsMessage = data.funds_returned > 0 ? ` $${Number(data.funds_returned).toFixed(2)} returned to wallet.` : '';
      const penaltyMessage = data.penalty_mode_preserved ? ` Penalty mode continues on Chance ${data.next_chance_unlocked}.` : '';
      if (data.all_chances_used) {
        toast({
          title: "Chance 2 Deactivated",
          description: `You've used both chances.${fundsMessage}`
        });
      } else {
        toast({
          title: "Chance Deactivated!",
          description: `Chance ${data.deactivated_chance} deactivated. Chance ${data.next_chance_unlocked} is now available!${fundsMessage}${penaltyMessage}`
        });
      }
      setSelectedChance(null);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to deactivate chance",
        variant: "destructive"
      });
    }
  });
  const calculateProgress = () => {
    if (!activeCycle) return 0;
    const start = new Date(activeCycle.start_date).getTime();
    const end = new Date(activeCycle.end_date).getTime();
    const now = Date.now();
    const progress = (now - start) / (end - start) * 100;
    return Math.min(Math.max(progress, 0), 100);
  };
  const calculateCurrentValue = () => {
    if (!activeCycle) return 0;
    const cycleDuration = CYCLE_CONFIG[activeCycle.cycle_type as keyof typeof CYCLE_CONFIG].duration;
    const now = Date.now();
    const endTime = new Date(activeCycle.end_date).getTime();

    // Cap time at cycle end - don't grow past completion
    const effectiveNow = Math.min(now, endTime);

    // Calculate time passed based on time unit
    let timePassed: number;
    if (timeUnit === 'seconds') {
      timePassed = (effectiveNow - new Date(activeCycle.start_date).getTime()) / 1000;
    } else if (timeUnit === 'minutes') {
      timePassed = (effectiveNow - new Date(activeCycle.start_date).getTime()) / 60000;
    } else {
      timePassed = (effectiveNow - new Date(activeCycle.start_date).getTime()) / 86400000;
    }

    // Cap timePassed at cycle duration
    const cappedTimePassed = Math.min(timePassed, cycleDuration);

    // Calculate base investment value
    let baseValue: number;
    if (progress?.is_penalty_mode) {
      baseValue = activeCycle.investment_amount * (1 + penaltyReturn / 100 * cappedTimePassed);
    } else {
      baseValue = activeCycle.investment_amount * (1 + cappedTimePassed / cycleDuration);
    }

    // Calculate additional investments value (only for Cycle 1)
    let additionalValue = 0;
    const additionalInvestments = (activeCycle as any).additional_investments as Array<{
      amount: number;
      added_at: string;
    }> || [];
    if (activeCycle.cycle_type === 1 && additionalInvestments.length > 0) {
      additionalInvestments.forEach(inv => {
        const addedAt = new Date(inv.added_at).getTime();
        let timePassedForThis: number;
        if (timeUnit === 'seconds') {
          timePassedForThis = (effectiveNow - addedAt) / 1000;
        } else if (timeUnit === 'minutes') {
          timePassedForThis = (effectiveNow - addedAt) / 60000;
        } else {
          timePassedForThis = (effectiveNow - addedAt) / 86400000;
        }
        const cappedTimeForThis = Math.max(0, Math.min(timePassedForThis, cycleDuration));
        if (progress?.is_penalty_mode) {
          additionalValue += inv.amount * (1 + penaltyReturn / 100 * cappedTimeForThis);
        } else {
          additionalValue += inv.amount * (1 + cappedTimeForThis / cycleDuration);
        }
      });
    }
    return baseValue + additionalValue;
  };

  // Calculate total investment including additional
  const getTotalInvestment = () => {
    if (!activeCycle) return 0;
    const additionalInvestments = (activeCycle as any).additional_investments as Array<{
      amount: number;
      added_at: string;
    }> || [];
    const additionalTotal = additionalInvestments.reduce((sum, inv) => sum + inv.amount, 0);
    return activeCycle.investment_amount + additionalTotal;
  };
  const calculateRemainingTime = () => {
    if (!activeCycle) return 0;
    const end = new Date(activeCycle.end_date).getTime();
    const now = Date.now();
    const remaining = Math.max(0, Math.ceil((end - now) / 1000));
    return remaining;
  };
  const isCycleUnlocked = (cycleType: number) => {
    if (activeCycle) return false;
    if (cycleType === 1) return true;
    const completed = progress?.completed_cycles || [];
    if (cycleType === 2) return completed.includes(1);
    if (cycleType === 3) return completed.includes(1) && completed.includes(2);
    if (cycleType === 4) return completed.includes(1) && completed.includes(2) && completed.includes(3);
    return false;
  };
  const handleChanceSelect = (chance: number) => {
    setSelectedChance(chance);
    // Don't reset selectedCycle - let useEffect auto-select the next available
    setInvestAmount("");
  };
  const handleStartCycle = () => {
    if (!selectedCycle || !investAmount || !selectedChance) return;
    const amount = parseFloat(investAmount);
    if (isNaN(amount) || amount <= 0) {
      toast({
        title: "Invalid amount",
        variant: "destructive"
      });
      return;
    }
    startCycleMutation.mutate({
      cycleType: selectedCycle,
      amount,
      chanceNumber: selectedChance
    });
  };
  if (loadingActiveCycle) {
    return <AITradeSkeleton />;
  }
  const chance1Status = (progress?.chance_1_status || 'available') as ChanceStatus;
  const chance2Status = (progress?.chance_2_status || 'locked') as ChanceStatus;
  return <div className="min-h-screen bg-background pb-20">
      <div className="bg-gradient-to-b from-primary to-primary/80 text-primary-foreground p-6 rounded-b-3xl shadow-lg">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold mb-2">Whale Trade System</h1>
            <p className="text-sm opacity-90">2-Chance Cycle System</p>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-4">
        {/* Tab Navigation */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="trade" className="flex items-center gap-2">
              <Zap className="w-4 h-4" />
              Trade
            </TabsTrigger>
            <TabsTrigger value="history" className="flex items-center gap-2">
              <History className="w-4 h-4" />
              History
            </TabsTrigger>
          </TabsList>

          <TabsContent value="trade" className="space-y-6 mt-0">
            {/* Wallet Balance */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="w-5 h-5" />
                  Wallet Balance
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">${(profile?.cycle_wallet_balance || 0).toFixed(2)}</p>
                <p className="text-xs text-muted-foreground mt-1">Cycle Wallet Balance</p>
              </CardContent>
            </Card>

            {/* Penalty Mode ROI Progress Bar */}
            {progress?.is_penalty_mode && <PenaltyModeDisplay activeCycle={activeCycle} penaltyReturn={penaltyReturn} timeUnit={timeUnit} isTestMode={isTestMode} penaltyChance={(progress as any)?.penalty_chance} />}

            {/* Active Cycle Display */}
            {activeCycle && <>
                {/* Penalty Mode Banner for Active Cycle */}
                {progress?.is_penalty_mode && <Card className="border-amber-500/50 bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-amber-500/10">
                    <CardContent className="p-3">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-amber-500/20 border border-amber-500/40 animate-pulse">
                          <TrendingUp className="w-4 h-4 text-amber-400" />
                        </div>
                        <div>
                          <p className="text-xs text-amber-300/80 font-medium uppercase tracking-wider">Penalty Mode</p>
                          <p className="text-lg font-bold text-amber-400">
                            Earning {penaltyReturn}% per {isTestMode ? timeUnit === 'seconds' ? 'second' : 'minute' : 'day'}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>}

                <Card className="border-primary">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Active: {CYCLE_CONFIG[activeCycle.cycle_type as keyof typeof CYCLE_CONFIG].name}</span>
                  <div className="flex items-center gap-2">
                    {progress?.is_penalty_mode && <Badge variant="outline" className="border-amber-500 text-amber-500">
                        {penaltyReturn}%/{isTestMode ? timeUnit === 'seconds' ? 's' : 'min' : 'day'}
                      </Badge>}
                    <Badge className={CYCLE_CONFIG[activeCycle.cycle_type as keyof typeof CYCLE_CONFIG].color}>
                      {CYCLE_CONFIG[activeCycle.cycle_type as keyof typeof CYCLE_CONFIG].duration} {CYCLE_CONFIG[activeCycle.cycle_type as keyof typeof CYCLE_CONFIG].unit}
                    </Badge>
                  </div>
                </CardTitle>
                <CardDescription className="flex items-center gap-2 flex-wrap">
                  <span>Initial: ${activeCycle.investment_amount.toFixed(2)}</span>
                  {activeCycle.cycle_type === 1 && ((activeCycle as any).additional_investments?.length || 0) > 0 && <Badge variant="secondary" className="bg-green-500/20 text-green-600">
                      +${((activeCycle as any).additional_investments as Array<{
                      amount: number;
                    }>)?.reduce((sum: number, inv: {
                      amount: number;
                    }) => sum + inv.amount, 0).toFixed(2)} added
                    </Badge>}
                  <Badge variant="outline">Chance {activeCycle.chance_number || 1}</Badge>
                  {progress?.is_penalty_mode && <Badge variant="outline" className="border-amber-500/50 text-amber-500 text-xs">
                      Return: {penaltyReturn}% × {CYCLE_CONFIG[activeCycle.cycle_type as keyof typeof CYCLE_CONFIG].duration} = {(penaltyReturn * CYCLE_CONFIG[activeCycle.cycle_type as keyof typeof CYCLE_CONFIG].duration).toFixed(1)}%
                    </Badge>}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Show investment breakdown for Cycle 1 with additional investments */}
                {activeCycle.cycle_type === 1 && ((activeCycle as any).additional_investments?.length || 0) > 0 && <div className="bg-muted/50 p-3 rounded-lg text-sm space-y-2">
                    <p className="font-medium">Investment Breakdown:</p>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Initial Investment</span>
                      <span>${activeCycle.investment_amount.toFixed(2)}</span>
                    </div>
                    {((activeCycle as any).additional_investments as Array<{
                    amount: number;
                    added_at: string;
                  }>)?.map((inv, idx) => <div key={idx} className="flex justify-between text-green-600">
                        <span>+ Added Investment #{idx + 1}</span>
                        <span>${inv.amount.toFixed(2)}</span>
                      </div>)}
                    <div className="flex justify-between font-semibold border-t pt-2">
                      <span>Total Investment</span>
                      <span>${getTotalInvestment().toFixed(2)}</span>
                    </div>
                  </div>}

                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span>Progress</span>
                    <span>{calculateProgress().toFixed(1)}%</span>
                  </div>
                  <Progress value={calculateProgress()} />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Current Value</p>
                    <p className="text-xl font-bold text-success animate-pulse">${calculateCurrentValue().toFixed(2)}</p>
                    {activeCycle.cycle_type === 1 && ((activeCycle as any).additional_investments?.length || 0) > 0 && <p className="text-xs text-muted-foreground">(includes all investments + profit)</p>}
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Time Remaining</p>
                    <p className="text-xl font-bold flex items-center gap-1 text-primary">
                      <Clock className="w-4 h-4" />
                      {timeUnit === 'seconds' ? `${calculateRemainingTime()}s` : timeUnit === 'minutes' ? `${Math.ceil(calculateRemainingTime() / 60)}m ${calculateRemainingTime() % 60}s` : `${Math.ceil(calculateRemainingTime() / 86400)}d`}
                    </p>
                  </div>
                </div>

                {/* Live Profit Display - Shows real-time profit earned */}
                <div className={`p-4 rounded-lg border ${progress?.is_penalty_mode ? 'bg-amber-900/20 border-amber-500/30' : 'bg-green-900/20 border-green-500/30'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <DollarSign className={`w-4 h-4 ${progress?.is_penalty_mode ? 'text-amber-400' : 'text-green-400'} animate-pulse`} />
                      <span className="text-sm text-muted-foreground">Profit Earned</span>
                    </div>
                    
                  </div>
                  <p className={`text-2xl font-bold text-center ${progress?.is_penalty_mode ? 'text-amber-400' : 'text-green-400'} animate-pulse`}>
                    +${(calculateCurrentValue() - getTotalInvestment()).toFixed(4)}
                  </p>
                  <div className="flex justify-between text-xs text-muted-foreground mt-2">
                    <span>Investment: ${getTotalInvestment().toFixed(2)}</span>
                    <span>
                      {progress?.is_penalty_mode ? `Est. Final: $${(getTotalInvestment() + getTotalInvestment() * (penaltyReturn / 100) * CYCLE_CONFIG[activeCycle.cycle_type as keyof typeof CYCLE_CONFIG].duration).toFixed(2)}` : `Est. Final: $${(getTotalInvestment() * 2).toFixed(2)}`}
                    </span>
                  </div>
                </div>

                {/* Add Investment Option - Only for Cycle 1 */}
                {activeCycle.cycle_type === 1 && <div className="bg-green-500/10 p-4 rounded-lg border border-green-500/30">
                    <p className="text-sm font-semibold text-green-600 mb-2">💰 Add More Investment</p>
                    <p className="text-xs text-muted-foreground mb-3">
                      You can add more investment to Cycle 1. Additional funds will earn profit for the remaining days only.
                    </p>
                    {!showAddInvestment ? <Button variant="secondary" onClick={() => setShowAddInvestment(true)} className="w-full bg-green-600 hover:bg-green-700 text-white">
                        Add Investment
                      </Button> : <div className="space-y-3">
                        <div>
                          <Label htmlFor="additionalAmount" className="text-xs">Amount (USDT)</Label>
                          <Input id="additionalAmount" type="number" placeholder="Enter amount" value={additionalAmount} onChange={e => setAdditionalAmount(e.target.value)} min="0" step="0.01" />
                        </div>
                        <div className="flex gap-2">
                          <Button variant="outline" onClick={() => {
                        setShowAddInvestment(false);
                        setAdditionalAmount("");
                      }} className="flex-1">
                            Cancel
                          </Button>
                          <Button onClick={() => {
                        const amount = parseFloat(additionalAmount);
                        if (!isNaN(amount) && amount > 0) {
                          addInvestmentMutation.mutate({
                            cycleId: activeCycle.id,
                            amount
                          });
                        }
                      }} disabled={addInvestmentMutation.isPending || !additionalAmount} className="flex-1 bg-green-600 hover:bg-green-700">
                            {addInvestmentMutation.isPending ? "Adding..." : "Confirm"}
                          </Button>
                        </div>
                      </div>}
                  </div>}

                {/* Add Team Income Option - Available for any active cycle */}
                <div className={`p-4 rounded-lg border ${(profile?.referral_balance || 0) > 0 ? 'bg-amber-500/10 border-amber-500/30' : 'bg-muted/30 border-muted'}`}>
                  <div className="flex items-center gap-2 mb-2">
                    {(profile?.referral_balance || 0) > 0 ? <Unlock className="w-4 h-4 text-amber-600" /> : <Lock className="w-4 h-4 text-muted-foreground" />}
                    <p className={`text-sm font-semibold ${(profile?.referral_balance || 0) > 0 ? 'text-amber-600' : 'text-muted-foreground'}`}>
                      💰 Reinvest Team Income
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground mb-3">
                    {(profile?.referral_balance || 0) > 0 ? `Add your team income ($${(profile?.referral_balance || 0).toFixed(2)} available) directly to this active cycle.` : 'Invite friends to earn team income that you can reinvest into any active cycle.'}
                  </p>
                  {!showAddTeamIncome ? <Button variant="secondary" onClick={() => setShowAddTeamIncome(true)} disabled={(profile?.referral_balance || 0) <= 0} className={`w-full ${(profile?.referral_balance || 0) > 0 ? 'bg-amber-600 hover:bg-amber-700 text-white' : 'bg-muted text-muted-foreground cursor-not-allowed'}`}>
                      {(profile?.referral_balance || 0) > 0 ? 'Add Team Income' : 'No Team Income Available'}
                    </Button> : <div className="space-y-3">
                      <div>
                        <Label htmlFor="teamIncomeAmount" className="text-xs">Amount (USDT)</Label>
                        <Input id="teamIncomeAmount" type="number" placeholder="Enter amount" value={teamIncomeAmount} onChange={e => setTeamIncomeAmount(e.target.value)} min="0" max={profile?.referral_balance || 0} step="0.01" />
                        <p className="text-xs text-muted-foreground mt-1">
                          Available: ${(profile?.referral_balance || 0).toFixed(2)}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" onClick={() => {
                        setShowAddTeamIncome(false);
                        setTeamIncomeAmount("");
                      }} className="flex-1">
                          Cancel
                        </Button>
                        <Button onClick={() => {
                        const amount = parseFloat(teamIncomeAmount);
                        if (!isNaN(amount) && amount > 0) {
                          addTeamIncomeMutation.mutate({
                            cycleId: activeCycle.id,
                            amount
                          });
                        }
                      }} disabled={addTeamIncomeMutation.isPending || !teamIncomeAmount} className="flex-1 bg-amber-600 hover:bg-amber-700">
                          {addTeamIncomeMutation.isPending ? "Adding..." : "Confirm"}
                        </Button>
                      </div>
                    </div>}
                </div>

                {activeCycle.cycle_type === 4 && <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      Special Cycle: This cycle repeats automatically. You can withdraw profits freely without affecting your chance status.
                    </AlertDescription>
                  </Alert>}

                {/* Complete Chance Option - Only for Chance 1 on Special Cycle */}
                {activeCycle.cycle_type === 4 && activeCycle.chance_number === 1 && chance2Status !== 'completed' && chance2Status !== 'disabled' && <div className="bg-purple-500/10 p-4 rounded-lg border border-purple-500/30">
                    <p className="text-sm font-semibold text-purple-600 mb-2">🎯 Ready to Move On?</p>
                    <p className="text-xs text-muted-foreground mb-3">
                      Complete Chance 1 now to unlock Chance 2 and start fresh from Cycle 1 with a new opportunity.
                    </p>
                    <Button variant="default" onClick={() => completeChanceMutation.mutate()} disabled={completeChanceMutation.isPending} className="w-full bg-purple-600 hover:bg-purple-700">
                      {completeChanceMutation.isPending ? "Completing..." : "Complete Chance 1 & Unlock Chance 2"}
                    </Button>
                  </div>}

                {!showWithdrawConfirm ? <Button variant="destructive" onClick={() => setShowWithdrawConfirm(true)} className="w-full">
                    Withdraw Early
                  </Button> : <div className="space-y-3">
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription className="space-y-2">
                        <p className="font-semibold">⚠️ Warning: Early Withdrawal Penalty</p>
                        <p>If you withdraw now:</p>
                        <ul className="list-disc list-inside text-sm space-y-1 ml-2">
                          {activeCycle.cycle_type !== 4 && <>
                              <li>Your future cycles will earn only <strong>{penaltyReturn}% per {isTestMode ? 'second' : 'day'}</strong> instead of 100% profit</li>
                              <li>This penalty mode stays until you complete a full cycle</li>
                            </>}
                          {activeCycle.cycle_type === 4 && <li>The cycle will restart from Special Cycle</li>}
                        </ul>
                      </AlertDescription>
                    </Alert>
                    
                    {/* Deactivate Chance Option for Special Cycle */}
                    {activeCycle.cycle_type === 4 && activeCycle.chance_number === 1 && chance2Status !== 'completed' && chance2Status !== 'disabled' && <div className="bg-muted/50 p-3 rounded-lg border">
                        <p className="text-sm font-medium mb-2">🎯 Complete This Chance</p>
                        <p className="text-xs text-muted-foreground mb-3">
                          You've reached the Special Cycle! You can complete Chance 1 now and unlock Chance 2 to start fresh from Cycle 1.
                        </p>
                        <Button variant="secondary" onClick={() => completeChanceMutation.mutate()} disabled={completeChanceMutation.isPending} className="w-full">
                          Complete Chance 1 & Unlock Chance 2
                        </Button>
                      </div>}

                    <div className="flex gap-2">
                      <Button variant="outline" onClick={() => setShowWithdrawConfirm(false)} className="flex-1">
                        Cancel
                      </Button>
                      <Button variant="destructive" onClick={() => withdrawMutation.mutate(activeCycle.id)} disabled={withdrawMutation.isPending} className="flex-1">
                        {activeCycle.cycle_type === 4 ? 'Withdraw' : `Withdraw (with ${penaltyReturn}% penalty)`}
                      </Button>
                    </div>
                  </div>}
              </CardContent>
            </Card>

                {/* Whale Trading Activity */}
                <AITradingActivity activeInvestment={activeCycle} />
              </>}

            {/* Chance Selection - Show when no active cycle */}
            {!activeCycle && <>
                <ChanceSelector chance1Status={chance1Status} chance2Status={chance2Status} activeChance={selectedChance} onSelectChance={handleChanceSelect} hasActiveCycle={!!activeCycle} />

            {/* Penalty Mode Banner - Show when in penalty mode */}
            {progress?.is_penalty_mode && selectedChance === progress?.penalty_chance && <Card className="border-amber-500/50 bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-amber-500/10">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center w-10 h-10 rounded-full bg-amber-500/20 border border-amber-500/40 animate-pulse">
                        <TrendingUp className="w-5 h-5 text-amber-400" />
                      </div>
                      <div>
                        <p className="text-xs text-amber-300/80 font-medium uppercase tracking-wider">
                          Penalty Mode Active
                        </p>
                        <p className="text-xl font-bold text-amber-400">
                          {penaltyReturn}% Per {isTestMode ? timeUnit === 'seconds' ? 'Second' : 'Minute' : 'Day'}
                        </p>
                      </div>
                    </div>
                    <Button variant="outline" size="sm" className="border-amber-500 text-amber-600 hover:bg-amber-500/10" onClick={() => deactivateChanceMutation.mutate(selectedChance!)} disabled={deactivateChanceMutation.isPending}>
                      {deactivateChanceMutation.isPending ? "..." : `Skip Chance ${selectedChance}`}
                    </Button>
                  </div>
                  <p className="text-xs text-amber-300/70 mt-2">
                    Start a cycle below to earn {penaltyReturn}% per {isTestMode ? timeUnit === 'seconds' ? 'second' : 'minute' : 'day'}. Complete a full cycle to exit penalty mode.
                  </p>
                </CardContent>
              </Card>}

            {/* Deactivate Chance Option - Only for Chance 1 when not in penalty mode */}
            {!progress?.is_penalty_mode && selectedChance === 1 && <Card className="border-orange-500/50 bg-orange-500/5">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2 text-orange-600">
                    <AlertCircle className="w-4 h-4" />
                    Skip Chance {selectedChance}?
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground mb-3">
                    {selectedChance === 1 ? "Deactivate Chance 1 to immediately unlock Chance 2 and start fresh." : "Deactivate Chance 2. This will use up all your chances."}
                  </p>
                  <Button variant="outline" size="sm" className="w-full border-orange-500 text-orange-600 hover:bg-orange-500/10" onClick={() => deactivateChanceMutation.mutate(selectedChance)} disabled={deactivateChanceMutation.isPending}>
                    {deactivateChanceMutation.isPending ? "Deactivating..." : `Deactivate Chance ${selectedChance}`}
                  </Button>
                </CardContent>
              </Card>}

            {/* Cycle Selection - Show when chance is selected (including penalty mode) */}
            {selectedChance && <Card>
                <CardHeader>
                  <CardTitle>Cycle Progression for Chance {selectedChance}</CardTitle>
                  <CardDescription>
                    {progress?.is_penalty_mode ? `Penalty Mode: Earn ${penaltyReturn}% per ${isTestMode ? timeUnit === 'seconds' ? 'second' : 'minute' : 'day'}` : 'Cycles automatically advance as you complete them'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {[1, 2, 3, 4].map(cycleType => {
                  const completedCycles = progress?.completed_cycles || [];
                  const isCompleted = completedCycles.includes(cycleType);
                  const unlocked = isCycleUnlocked(cycleType);
                  const isCurrentCycle = selectedCycle === cycleType;
                  const config = CYCLE_CONFIG[cycleType as keyof typeof CYCLE_CONFIG];
                  return <Button key={cycleType} variant={isCurrentCycle ? "default" : "outline"} className={`w-full justify-between ${isCompleted ? 'border-green-500 bg-green-500/10 hover:bg-green-500/20' : ''}`} onClick={() => unlocked && setSelectedCycle(cycleType)} disabled={!unlocked}>
                        <span className="flex items-center gap-2">
                          {isCompleted ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : unlocked ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                          {config.name}
                          {isCompleted && <Badge variant="secondary" className="ml-2 bg-green-500/20 text-green-600">Done</Badge>}
                          {isCurrentCycle && !isCompleted && <Badge className="ml-2">Next</Badge>}
                        </span>
                        <span className="flex items-center gap-2">
                          <TrendingUp className="w-4 h-4" />
                          {config.duration} {config.unit} → {progress?.is_penalty_mode ? `${penaltyReturn}%/${isTestMode ? timeUnit === 'seconds' ? 's' : 'min' : 'd'}` : '2×'}
                        </span>
                      </Button>;
                })}
                </CardContent>
              </Card>}

            {/* Complete Chance Option - Only for Chance 1 when Special cycle is unlocked and not in penalty mode */}
            {!progress?.is_penalty_mode && selectedChance === 1 && isCycleUnlocked(4) && chance2Status !== 'completed' && chance2Status !== 'disabled' && <Card className="border-purple-500 bg-purple-500/5">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-purple-600">
                    <CheckCircle2 className="w-5 h-5" />
                    Complete Chance 1
                  </CardTitle>
                  <CardDescription>
                    You've unlocked the Special Cycle! Complete Chance 1 to unlock Chance 2 and start fresh from Cycle 1.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button variant="default" className="w-full bg-purple-600 hover:bg-purple-700" onClick={() => completeChanceMutation.mutate()} disabled={completeChanceMutation.isPending}>
                    {completeChanceMutation.isPending ? "Completing..." : "Complete Chance 1 & Unlock Chance 2"}
                  </Button>
                </CardContent>
              </Card>}

            {/* Investment Form - Show when cycle is selected (including penalty mode) */}
            {selectedChance && selectedCycle && <Card>
                <CardHeader>
                  <CardTitle>Start {CYCLE_CONFIG[selectedCycle as keyof typeof CYCLE_CONFIG].name}</CardTitle>
                  <CardDescription>
                    Duration: {CYCLE_CONFIG[selectedCycle as keyof typeof CYCLE_CONFIG].duration} {CYCLE_CONFIG[selectedCycle as keyof typeof CYCLE_CONFIG].unit} | 
                    Return: {progress?.is_penalty_mode ? `${penaltyReturn}% per ${isTestMode ? timeUnit === 'seconds' ? 'second' : 'minute' : 'day'}` : '100% (2×)'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {(profile?.cycle_wallet_balance || 0) <= 0 ? <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 space-y-3">
                      <div className="flex items-start gap-3">
                        <AlertCircle className="w-5 h-5 text-amber-500 mt-0.5" />
                        <div>
                          <p className="font-medium text-amber-600">Insufficient Cycle Wallet Balance</p>
                          <p className="text-sm text-muted-foreground">
                            Transfer funds to your Cycle Wallet first to start trading.
                          </p>
                        </div>
                      </div>
                      <Button onClick={() => navigate('/wallet')} className="w-full" variant="secondary">
                        <DollarSign className="w-4 h-4 mr-2" />
                        Go to Wallet
                      </Button>
                    </div> : <>
                      <div className="space-y-2">
                        <Label htmlFor="investAmount">Investment Amount (USDT)</Label>
                        <Input id="investAmount" type="number" placeholder="Enter amount" value={investAmount} onChange={e => setInvestAmount(e.target.value)} min="0" step="0.01" />
                        <p className="text-xs text-muted-foreground">
                          Available in Cycle Wallet: ${(profile?.cycle_wallet_balance || 0).toFixed(2)}
                        </p>
                        {investAmount && parseFloat(investAmount) > (profile?.cycle_wallet_balance || 0) && <p className="text-xs text-destructive mt-1">
                            Amount exceeds your Cycle Wallet balance
                          </p>}
                      </div>
                      <Button onClick={handleStartCycle} disabled={startCycleMutation.isPending || !investAmount || parseFloat(investAmount) > (profile?.cycle_wallet_balance || 0)} className="w-full">
                        {startCycleMutation.isPending ? "Starting..." : `Start Cycle (Chance ${selectedChance})`}
                      </Button>
                    </>}
                </CardContent>
              </Card>}
          </>}
          </TabsContent>

          <TabsContent value="history" className="mt-0">
            <AITradeHistory systemConfig={systemConfig} />
          </TabsContent>
        </Tabs>
      </div>

      <BottomNav />
    </div>;
};
export default AITrade;