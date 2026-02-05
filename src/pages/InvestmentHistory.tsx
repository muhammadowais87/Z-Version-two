import BottomNav from "@/components/BottomNav";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { History, TrendingUp, Clock, CheckCircle2, DollarSign } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

const InvestmentHistory = () => {
  const navigate = useNavigate();

  const { data: investments, isLoading } = useQuery({
    queryKey: ['investmentHistory'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      const { data } = await supabase
        .from('investments')
        .select('*')
        .eq('user_id', user.id)
        .order('invested_at', { ascending: false });

      return data || [];
    },
  });

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const calculateProgress = (investedAt: string, maturesAt: string) => {
    const invested = new Date(investedAt).getTime();
    const matures = new Date(maturesAt).getTime();
    const now = Date.now();
    const total = matures - invested;
    const elapsed = now - invested;
    return Math.min(100, Math.max(0, (elapsed / total) * 100));
  };

  const calculateCurrentProfit = (amount: number, investedAt: string, maturesAt: string, status: string) => {
    if (status === 'completed') {
      return amount; // 100% profit
    }
    const progress = calculateProgress(investedAt, maturesAt) / 100;
    return amount * progress;
  };

  const activeInvestments = investments?.filter(inv => inv.status === 'active') || [];
  const completedInvestments = investments?.filter(inv => inv.status === 'completed') || [];

  const totalInvested = investments?.reduce((sum, inv) => sum + Number(inv.amount), 0) || 0;
  const totalProfit = investments?.reduce((sum, inv) => {
    if (inv.status === 'completed') {
      return sum + Number(inv.profit);
    }
    return sum + calculateCurrentProfit(Number(inv.amount), inv.invested_at, inv.matures_at, inv.status);
  }, 0) || 0;

  return (
    <div className="min-h-screen bg-background pb-20">
      <div className="bg-gradient-to-b from-primary to-primary/80 text-primary-foreground p-6 rounded-b-3xl shadow-lg">
        <div className="flex items-center gap-3 mb-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/dashboard')}
            className="text-primary-foreground hover:bg-primary-foreground/10"
          >
            ← Back
          </Button>
          <History className="w-6 h-6" />
          <h1 className="text-2xl font-bold">Investment History</h1>
        </div>
        <p className="text-sm opacity-90">Track your investment performance</p>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
        {/* Summary Stats */}
        <div className="grid grid-cols-2 gap-4">
          <Card className="p-4 bg-gradient-to-br from-primary/10 to-primary/5">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="w-4 h-4 text-primary" />
              <p className="text-xs text-muted-foreground">Total Invested</p>
            </div>
            <p className="text-2xl font-bold text-foreground">${totalInvested.toFixed(2)}</p>
          </Card>
          <Card className="p-4 bg-gradient-to-br from-success/10 to-success/5">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-4 h-4 text-success" />
              <p className="text-xs text-muted-foreground">Total Profit</p>
            </div>
            <p className="text-2xl font-bold text-success">${totalProfit.toFixed(2)}</p>
          </Card>
        </div>

        {/* Active Investments */}
        {activeInvestments.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold text-foreground mb-3 flex items-center gap-2">
              <Clock className="w-5 h-5 text-primary" />
              Active Investments ({activeInvestments.length})
            </h2>
            <div className="space-y-3">
              {activeInvestments.map((investment) => {
                const progress = calculateProgress(investment.invested_at, investment.matures_at);
                const currentProfit = calculateCurrentProfit(
                  Number(investment.amount),
                  investment.invested_at,
                  investment.matures_at,
                  investment.status
                );
                const roi = ((currentProfit / Number(investment.amount)) * 100).toFixed(1);

                return (
                  <Card key={investment.id} className="p-4 border-primary/20">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <p className="text-sm text-muted-foreground">Investment Amount</p>
                        <p className="text-xl font-bold text-foreground">${Number(investment.amount).toFixed(2)}</p>
                      </div>
                      <Badge variant="default" className="bg-primary">
                        <Clock className="w-3 h-3 mr-1" />
                        Active
                      </Badge>
                    </div>

                    <div className="grid grid-cols-2 gap-3 mb-3">
                      <div>
                        <p className="text-xs text-muted-foreground">Current Profit</p>
                        <p className="text-lg font-semibold text-success">
                          ${currentProfit.toFixed(2)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">ROI</p>
                        <p className="text-lg font-semibold text-primary">+{roi}%</p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Progress</span>
                        <span>{progress.toFixed(1)}%</span>
                      </div>
                      <div className="h-2 bg-secondary rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary transition-all duration-300"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Started: {formatDate(investment.invested_at)}</span>
                        <span>Matures: {formatDate(investment.matures_at)}</span>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {/* Completed Investments */}
        {completedInvestments.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold text-foreground mb-3 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-success" />
              Completed Investments ({completedInvestments.length})
            </h2>
            <div className="space-y-3">
              {completedInvestments.map((investment) => {
                const roi = ((Number(investment.profit) / Number(investment.amount)) * 100).toFixed(1);

                return (
                  <Card key={investment.id} className="p-4 border-success/20 bg-success/5">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <p className="text-sm text-muted-foreground">Investment Amount</p>
                        <p className="text-xl font-bold text-foreground">${Number(investment.amount).toFixed(2)}</p>
                      </div>
                      <Badge variant="outline" className="border-success text-success">
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                        Completed
                      </Badge>
                    </div>

                    <div className="grid grid-cols-2 gap-3 mb-3">
                      <div>
                        <p className="text-xs text-muted-foreground">Total Profit</p>
                        <p className="text-lg font-semibold text-success">
                          ${Number(investment.profit).toFixed(2)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">ROI</p>
                        <p className="text-lg font-semibold text-success">+{roi}%</p>
                      </div>
                    </div>

                    <div className="flex justify-between text-xs text-muted-foreground pt-2 border-t border-border/50">
                      <span>Invested: {formatDate(investment.invested_at)}</span>
                      <span>Completed: {formatDate(investment.matures_at)}</span>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && (!investments || investments.length === 0) && (
          <Card className="p-8 text-center">
            <History className="w-16 h-16 text-muted-foreground mx-auto mb-4 opacity-50" />
            <h3 className="text-lg font-semibold text-foreground mb-2">No Investment History</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Make your first deposit to start investing
            </p>
            <Button onClick={() => navigate('/wallet')}>
              Go to Wallet
            </Button>
          </Card>
        )}

        {isLoading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="p-4 animate-pulse">
                <div className="h-20 bg-secondary rounded" />
              </Card>
            ))}
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
};

export default InvestmentHistory;
