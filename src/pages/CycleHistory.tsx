import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import BottomNav from "@/components/BottomNav";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { CheckCircle, XCircle, Clock, DollarSign, TrendingUp, Calendar } from "lucide-react";
import { format } from "date-fns";
import { CycleHistorySkeleton } from "@/components/LoadingSkeletons";

const CYCLE_NAMES = {
  1: "Cycle 1 (25 days)",
  2: "Cycle 2 (18 days)",
  3: "Cycle 3 (14 days)",
  4: "Special Cycle (14 days)",
};

const CycleHistory = () => {
  // Fetch all cycles (completed and broken)
  const { data: cycleData, isLoading } = useQuery({
    queryKey: ['cycleHistory'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('get-cycle-history');
      if (error) throw error;
      return data;
    }
  });

  const cycles = cycleData?.cycles || [];
  const progress = cycleData?.progress;
  const stats = cycleData?.stats || { totalProfit: 0, totalTax: 0, completedCount: 0, brokenCount: 0 };

  const calculateDaysTaken = (startDate: string, endDate: string) => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const calculateTax = (cycle: any) => {
    if (cycle.status !== 'broken') return 0;
    if (cycle.cycle_type === 4) return 0; // No tax on special cycle
    
    // Calculate current value at time of withdrawal
    const currentValue = cycle.investment_amount + cycle.current_profit;
    return currentValue * 0.18;
  };

  if (isLoading) {
    return <CycleHistorySkeleton />;
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <div className="bg-gradient-to-b from-primary to-primary/80 text-primary-foreground p-6 rounded-b-3xl shadow-lg">
        <h1 className="text-2xl font-bold mb-2">Cycle History</h1>
        <p className="text-sm opacity-90">All your completed and broken cycles</p>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
        {/* Summary Stats */}
        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-success" />
                Completed
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{stats.completedCount || stats.completed_count}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <XCircle className="w-4 h-4 text-destructive" />
                Broken
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{stats.brokenCount || stats.broken_count}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-success" />
                Total Profit
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-success">${(stats.totalProfit || stats.total_profit || 0).toFixed(2)}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-destructive" />
                Total Tax
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-destructive">${(stats.totalTax || stats.total_tax || 0).toFixed(2)}</p>
            </CardContent>
          </Card>
        </div>

        {/* Penalty Mode Alert */}
        {progress?.is_penalty_mode && (
          <Card className="border-warning bg-warning/10">
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Penalty Mode Active
              </CardTitle>
              <CardDescription>
                You're earning 2% daily until you complete a full cycle. This was activated due to an early withdrawal.
              </CardDescription>
            </CardHeader>
          </Card>
        )}

        {/* Cycles List */}
        <div className="space-y-4">
          {cycles && cycles.length > 0 ? (
            cycles.map((cycle) => {
              const tax = calculateTax(cycle);
              const finalAmount = cycle.investment_amount + cycle.current_profit - tax;
              const isCompleted = cycle.status === 'completed';
              const daysTaken = calculateDaysTaken(cycle.start_date, cycle.updated_at);

              return (
                <Card key={cycle.id} className={isCompleted ? 'border-success/50' : 'border-destructive/50'}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-base flex items-center gap-2">
                          {isCompleted ? (
                            <CheckCircle className="w-5 h-5 text-success" />
                          ) : (
                            <XCircle className="w-5 h-5 text-destructive" />
                          )}
                          {CYCLE_NAMES[cycle.cycle_type as keyof typeof CYCLE_NAMES]}
                        </CardTitle>
                        <CardDescription className="mt-1">
                          {format(new Date(cycle.start_date), 'MMM d, yyyy')} → {format(new Date(cycle.updated_at), 'MMM d, yyyy')}
                        </CardDescription>
                      </div>
                      <Badge variant={isCompleted ? "default" : "destructive"}>
                        {isCompleted ? 'Completed' : 'Broken'}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground">Investment</p>
                        <p className="font-semibold">${cycle.investment_amount.toFixed(2)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Profit</p>
                        <p className="font-semibold text-success">+${cycle.current_profit.toFixed(2)}</p>
                      </div>
                      {isCompleted && (
                        <div className="col-span-2">
                          <p className="text-muted-foreground">Final Amount</p>
                          <p className="text-xl font-bold text-success">${finalAmount.toFixed(2)}</p>
                        </div>
                      )}
                    </div>

                    <Separator />

                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Calendar className="w-4 h-4" />
                        <span>Duration: {daysTaken} days</span>
                      </div>
                      {!isCompleted && (
                        <Badge variant="outline" className="text-xs">
                          Penalty Mode Applied
                        </Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <Clock className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">No cycle history yet</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Start your first whale trade cycle to see your history here
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <BottomNav />
    </div>
  );
};

export default CycleHistory;
