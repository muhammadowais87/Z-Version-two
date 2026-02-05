import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  CheckCircle, XCircle, Clock, DollarSign, TrendingUp, 
  Calendar, AlertCircle, Zap, Target, History, Activity,
  ArrowUpRight, ArrowDownRight, Timer
} from "lucide-react";
import { format, differenceInDays, differenceInHours, differenceInMinutes, differenceInSeconds } from "date-fns";

const CYCLE_NAMES: Record<number, string> = {
  1: "Cycle 1",
  2: "Cycle 2",
  3: "Cycle 3",
  4: "Special Cycle",
};

interface AITradeHistoryProps {
  systemConfig?: Record<string, string> | null;
}

const AITradeHistory = ({ systemConfig }: AITradeHistoryProps) => {
  const timeUnit = systemConfig?.cycle_time_unit || 'days';
  const penaltyReturn = parseFloat(systemConfig?.penalty_daily_return || '1.5');

  // Fetch all cycles
  const { data: allCycles, isLoading: loadingCycles } = useQuery({
    queryKey: ['allCyclesHistory'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      const { data, error } = await supabase
        .from('ai_trade_cycles')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    }
  });

  // Fetch user progress
  const { data: progress } = useQuery({
    queryKey: ['tradeProgressHistory'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data, error } = await supabase
        .from('user_trade_progress')
        .select('*')
        .eq('user_id', user.id)
        .single();
      if (error && error.code !== 'PGRST116') throw error;
      return data;
    }
  });

  // Calculate stats
  const stats = useMemo(() => {
    if (!allCycles) return {
      totalInvested: 0,
      totalProfit: 0,
      completedCycles: 0,
      brokenCycles: 0,
      activeCycles: 0,
      avgDailyProfit: 0,
      bestCycle: null as any,
      totalTaxPaid: 0
    };

    const completed = allCycles.filter(c => c.status === 'completed');
    const broken = allCycles.filter(c => c.status === 'broken');
    const active = allCycles.filter(c => c.status === 'active');
    
    const totalProfit = allCycles.reduce((sum, c) => sum + (c.current_profit || 0), 0);
    const totalInvested = allCycles.reduce((sum, c) => sum + (c.investment_amount || 0), 0);
    
    // No tax on early withdrawal anymore - tax only applies to withdrawals
    const totalTaxPaid = 0;

    const bestCycle = completed.length > 0 
      ? completed.reduce((best, c) => (c.current_profit || 0) > (best.current_profit || 0) ? c : best)
      : null;

    // Calculate days active
    const totalDays = allCycles.reduce((sum, c) => {
      const start = new Date(c.start_date);
      const end = c.status === 'active' ? new Date() : new Date(c.updated_at);
      return sum + differenceInDays(end, start);
    }, 0) || 1;

    return {
      totalInvested,
      totalProfit,
      completedCycles: completed.length,
      brokenCycles: broken.length,
      activeCycles: active.length,
      avgDailyProfit: totalProfit / totalDays,
      bestCycle,
      totalTaxPaid
    };
  }, [allCycles]);

  // Group cycles by day for daily summary
  const dailySummary = useMemo(() => {
    if (!allCycles) return [];
    
    const byDay: Record<string, { date: string; cycles: any[]; profit: number; invested: number }> = {};
    
    allCycles.forEach(cycle => {
      const day = format(new Date(cycle.start_date), 'yyyy-MM-dd');
      if (!byDay[day]) {
        byDay[day] = { date: day, cycles: [], profit: 0, invested: 0 };
      }
      byDay[day].cycles.push(cycle);
      byDay[day].profit += cycle.current_profit || 0;
      byDay[day].invested += cycle.investment_amount || 0;
    });
    
    return Object.values(byDay).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [allCycles]);

  const formatDuration = (start: string, end: string | Date) => {
    const startDate = new Date(start);
    const endDate = typeof end === 'string' ? new Date(end) : end;
    
    if (timeUnit === 'seconds') {
      return `${differenceInSeconds(endDate, startDate)} sec`;
    } else if (timeUnit === 'minutes') {
      return `${differenceInMinutes(endDate, startDate)} min`;
    } else {
      const days = differenceInDays(endDate, startDate);
      const hours = differenceInHours(endDate, startDate) % 24;
      return days > 0 ? `${days}d ${hours}h` : `${hours}h`;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge className="bg-green-500/20 text-green-500 border-green-500/30">Completed</Badge>;
      case 'broken':
        return <Badge className="bg-red-500/20 text-red-500 border-red-500/30">Broken</Badge>;
      case 'active':
        return <Badge className="bg-blue-500/20 text-blue-500 border-blue-500/30 animate-pulse">Active</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (loadingCycles) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => (
          <Card key={i} className="animate-pulse">
            <CardContent className="h-24" />
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Overview Stats */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="bg-gradient-to-br from-green-500/10 to-green-500/5 border-green-500/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-4 h-4 text-green-500" />
              <span className="text-xs text-muted-foreground">Total Profit</span>
            </div>
            <p className="text-xl font-bold text-green-500">${stats.totalProfit.toFixed(2)}</p>
          </CardContent>
        </Card>
        
        <Card className="bg-gradient-to-br from-blue-500/10 to-blue-500/5 border-blue-500/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="w-4 h-4 text-blue-500" />
              <span className="text-xs text-muted-foreground">Total Invested</span>
            </div>
            <p className="text-xl font-bold text-blue-500">${stats.totalInvested.toFixed(2)}</p>
          </CardContent>
        </Card>
        
        <Card className="bg-gradient-to-br from-purple-500/10 to-purple-500/5 border-purple-500/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle className="w-4 h-4 text-purple-500" />
              <span className="text-xs text-muted-foreground">Completed</span>
            </div>
            <p className="text-xl font-bold text-purple-500">{stats.completedCycles}</p>
          </CardContent>
        </Card>
        
        <Card className="bg-gradient-to-br from-amber-500/10 to-amber-500/5 border-amber-500/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Activity className="w-4 h-4 text-amber-500" />
              <span className="text-xs text-muted-foreground">Avg Daily</span>
            </div>
            <p className="text-xl font-bold text-amber-500">${stats.avgDailyProfit.toFixed(2)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Current Status Card */}
      <Card className="border-primary/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Target className="w-4 h-4 text-primary" />
            Current Status
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Active Chance</p>
              <p className="font-semibold">{progress?.active_chance ? `Chance ${progress.active_chance}` : 'None'}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Mode</p>
              <p className={`font-semibold ${progress?.is_penalty_mode ? 'text-amber-500' : 'text-green-500'}`}>
                {progress?.is_penalty_mode ? `Penalty (${penaltyReturn}%)` : 'Normal (100%)'}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Chance 1</p>
              <Badge variant="outline" className="capitalize">{progress?.chance_1_status || 'available'}</Badge>
            </div>
            <div>
              <p className="text-muted-foreground">Chance 2</p>
              <Badge variant="outline" className="capitalize">{progress?.chance_2_status || 'locked'}</Badge>
            </div>
          </div>
          
          {progress?.completed_cycles && progress.completed_cycles.length > 0 && (
            <>
              <Separator />
              <div>
                <p className="text-muted-foreground text-sm mb-2">Completed Cycles This Chance</p>
                <div className="flex gap-2">
                  {[1, 2, 3, 4].map(cycleNum => (
                    <Badge
                      key={cycleNum}
                      variant={progress.completed_cycles.includes(cycleNum) ? "default" : "outline"}
                      className={progress.completed_cycles.includes(cycleNum) ? "bg-green-500" : "opacity-50"}
                    >
                      {cycleNum === 4 ? 'Special' : `C${cycleNum}`}
                    </Badge>
                  ))}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Tabs for different views */}
      <Tabs defaultValue="all" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="all" className="text-xs">All Cycles</TabsTrigger>
          <TabsTrigger value="daily" className="text-xs">Daily Summary</TabsTrigger>
          <TabsTrigger value="stats" className="text-xs">Statistics</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="mt-4">
          <ScrollArea className="h-[400px] pr-4">
            <div className="space-y-3">
              {allCycles && allCycles.length > 0 ? (
                allCycles.map((cycle) => (
                  <Card key={cycle.id} className={`
                    ${cycle.status === 'completed' ? 'border-green-500/30 bg-green-500/5' : ''}
                    ${cycle.status === 'broken' ? 'border-red-500/30 bg-red-500/5' : ''}
                    ${cycle.status === 'active' ? 'border-blue-500/30 bg-blue-500/5' : ''}
                  `}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2">
                          {cycle.status === 'completed' && <CheckCircle className="w-4 h-4 text-green-500" />}
                          {cycle.status === 'broken' && <XCircle className="w-4 h-4 text-red-500" />}
                          {cycle.status === 'active' && <Zap className="w-4 h-4 text-blue-500" />}
                          <span className="font-semibold">{CYCLE_NAMES[cycle.cycle_type]}</span>
                          {cycle.chance_number && (
                            <Badge variant="outline" className="text-[10px]">Chance {cycle.chance_number}</Badge>
                          )}
                        </div>
                        {getStatusBadge(cycle.status)}
                      </div>
                      
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div>
                          <p className="text-muted-foreground">Invested</p>
                          <p className="font-semibold">${cycle.investment_amount.toFixed(2)}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Profit</p>
                          <p className={`font-semibold ${cycle.current_profit >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                            {cycle.current_profit >= 0 ? '+' : ''}${cycle.current_profit.toFixed(2)}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Duration</p>
                          <p className="font-semibold">
                            {formatDuration(cycle.start_date, cycle.status === 'active' ? new Date() : cycle.updated_at)}
                          </p>
                        </div>
                      </div>
                      
                      <div className="mt-2 flex items-center gap-2 text-[10px] text-muted-foreground">
                        <Calendar className="w-3 h-3" />
                        <span>{format(new Date(cycle.start_date), 'MMM d, yyyy HH:mm')}</span>
                        {cycle.status !== 'active' && (
                          <>
                            <span>→</span>
                            <span>{format(new Date(cycle.updated_at), 'MMM d, yyyy HH:mm')}</span>
                          </>
                        )}
                      </div>
                      
                      {/* Additional investments */}
                      {cycle.additional_investments && Array.isArray(cycle.additional_investments) && cycle.additional_investments.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-border/50">
                          <p className="text-[10px] text-muted-foreground mb-1">Additional Investments:</p>
                          <div className="flex flex-wrap gap-1">
                            {cycle.additional_investments.map((inv: any, idx: number) => (
                              <Badge key={idx} variant="outline" className="text-[9px]">
                                +${inv.amount} @ {format(new Date(inv.added_at), 'HH:mm')}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))
              ) : (
                <Card>
                  <CardContent className="py-12 text-center">
                    <History className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                    <p className="text-muted-foreground">No cycles yet</p>
                    <p className="text-sm text-muted-foreground mt-1">Start your first cycle to see history</p>
                  </CardContent>
                </Card>
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="daily" className="mt-4">
          <ScrollArea className="h-[400px] pr-4">
            <div className="space-y-3">
              {dailySummary.length > 0 ? (
                dailySummary.map((day) => (
                  <Card key={day.date}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-primary" />
                          <span className="font-semibold">{format(new Date(day.date), 'EEEE, MMM d')}</span>
                        </div>
                        <Badge variant="outline">{day.cycles.length} cycle{day.cycles.length > 1 ? 's' : ''}</Badge>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div className="flex items-center gap-2">
                          <ArrowUpRight className="w-4 h-4 text-green-500" />
                          <div>
                            <p className="text-xs text-muted-foreground">Profit</p>
                            <p className="font-bold text-green-500">+${day.profit.toFixed(2)}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <ArrowDownRight className="w-4 h-4 text-blue-500" />
                          <div>
                            <p className="text-xs text-muted-foreground">Invested</p>
                            <p className="font-bold text-blue-500">${day.invested.toFixed(2)}</p>
                          </div>
                        </div>
                      </div>
                      
                      <Separator className="my-3" />
                      
                      <div className="space-y-2">
                        {day.cycles.map((cycle: any) => (
                          <div key={cycle.id} className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2">
                              {cycle.status === 'completed' && <CheckCircle className="w-3 h-3 text-green-500" />}
                              {cycle.status === 'broken' && <XCircle className="w-3 h-3 text-red-500" />}
                              {cycle.status === 'active' && <Zap className="w-3 h-3 text-blue-500" />}
                              <span>{CYCLE_NAMES[cycle.cycle_type]}</span>
                            </div>
                            <span className={cycle.current_profit >= 0 ? 'text-green-500' : 'text-red-500'}>
                              {cycle.current_profit >= 0 ? '+' : ''}${cycle.current_profit.toFixed(2)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))
              ) : (
                <Card>
                  <CardContent className="py-12 text-center">
                    <Calendar className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                    <p className="text-muted-foreground">No daily data yet</p>
                  </CardContent>
                </Card>
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="stats" className="mt-4">
          <div className="space-y-4">
            {/* Performance Summary */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Performance Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Total Cycles</p>
                    <p className="text-2xl font-bold">{allCycles?.length || 0}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Success Rate</p>
                    <p className="text-2xl font-bold text-green-500">
                      {allCycles && allCycles.length > 0 
                        ? `${((stats.completedCycles / (stats.completedCycles + stats.brokenCycles)) * 100 || 0).toFixed(0)}%`
                        : '0%'
                      }
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Tax Paid</p>
                    <p className="text-xl font-bold text-red-500">-${stats.totalTaxPaid.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Net Profit</p>
                    <p className="text-xl font-bold text-green-500">
                      ${(stats.totalProfit - stats.totalTaxPaid).toFixed(2)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Best Cycle */}
            {stats.bestCycle && (
              <Card className="border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-amber-500/5">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Zap className="w-4 h-4 text-amber-500" />
                    Best Performing Cycle
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold">{CYCLE_NAMES[stats.bestCycle.cycle_type]}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(stats.bestCycle.start_date), 'MMM d, yyyy')}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-green-500">
                        +${stats.bestCycle.current_profit.toFixed(2)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        from ${stats.bestCycle.investment_amount.toFixed(2)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Cycle Breakdown */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Cycle Type Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {[1, 2, 3, 4].map(cycleType => {
                    const cyclesOfType = allCycles?.filter(c => c.cycle_type === cycleType) || [];
                    const completed = cyclesOfType.filter(c => c.status === 'completed').length;
                    const total = cyclesOfType.length;
                    const profit = cyclesOfType.reduce((sum, c) => sum + (c.current_profit || 0), 0);
                    
                    return (
                      <div key={cycleType} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="w-20 justify-center">
                            {cycleType === 4 ? 'Special' : `Cycle ${cycleType}`}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {completed}/{total} completed
                          </span>
                        </div>
                        <span className={`text-sm font-semibold ${profit >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                          {profit >= 0 ? '+' : ''}${profit.toFixed(2)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AITradeHistory;
