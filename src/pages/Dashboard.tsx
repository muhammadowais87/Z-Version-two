import { lazy, Suspense } from "react";
import BottomNav from "@/components/BottomNav";
import StatCard from "@/components/StatCard";
import FloatingBlobs from "@/components/FloatingBlobs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TrendingUp, DollarSign, Users, History } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { DashboardSkeleton } from "@/components/LoadingSkeletons";
import { Skeleton } from "@/components/ui/skeleton";
import { WalletHistoryDialog } from "@/components/WalletHistoryDialog";

// Lazy load heavy components for better initial page load
const TradingViewWidget = lazy(() => import("@/components/TradingViewWidget"));
const AITradingActivity = lazy(() => import("@/components/AITradingActivity"));
const PortfolioSparkline = lazy(() => import("@/components/PortfolioSparkline"));
const WhaleWatchWidget = lazy(() => import("@/components/WhaleWatchWidget"));

const Dashboard = () => {
  const navigate = useNavigate();

  // Fetch user profile with auto-refresh
  const { data: profile, isLoading: loadingProfile } = useQuery({
    queryKey: ['profile'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
      
      return data;
    },
    refetchInterval: 2000, // Auto-refresh every 2 seconds
  });

  // Fetch active AI trade cycle with auto-refresh
  const { data: activeCycle, isLoading: loadingActiveCycle } = useQuery({
    queryKey: ['activeCycle'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data } = await supabase
        .from('ai_trade_cycles')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .maybeSingle();
      return data;
    },
    refetchInterval: 2000, // Auto-refresh every 2 seconds
  });

  // Calculate total active cycle amount (including additional investments)
  const getActiveCycleAmount = () => {
    if (!activeCycle) return 0;
    const additionalInvestments = (activeCycle as any).additional_investments as Array<{amount: number}> || [];
    const additionalTotal = additionalInvestments.reduce((sum, inv) => sum + inv.amount, 0);
    return activeCycle.investment_amount + additionalTotal;
  };

  if (loadingProfile || loadingActiveCycle) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="min-h-screen pb-20 relative">
      <FloatingBlobs />
      <div className="relative overflow-hidden bg-gradient-vibrant text-primary-foreground p-6 rounded-b-3xl shadow-glow z-10">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4xIj48cGF0aCBkPSJNMzYgMzRjMC0yLjIxLTEuNzktNC00LTRzLTQgMS43OS00IDQgMS43OSA0IDQgNCA0LTEuNzkgNC00em0wLTEwYzAtMi4yMS0xLjc5LTQtNC00cy00IDEuNzktNCA0IDEuNzkgNCA0IDQgNC0xLjc5IDQtNHptMC0xMGMwLTIuMjEtMS43OS00LTQtNHMtNCAxLjc5LTQgNCAxLjc5IDQgNCA0IDQtMS43OSA0LTR6Ii8+PC9nPjwvZz48L3N2Zz4=')] opacity-20"></div>
        <div className="relative z-10 animate-fade-in-up">
          <h1 className="text-2xl font-bold mb-2">Welcome Back!</h1>
          <p className="text-sm opacity-90">Your Whale Trading Portfolio</p>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-6 relative z-10">
        {/* Portfolio Sparkline Widget - Lazy Loaded */}
        <div className="animate-fade-in-up" style={{ animationDelay: "0.05s" }}>
          <Suspense fallback={<Skeleton className="h-[120px] w-full rounded-lg" />}>
            <PortfolioSparkline 
              walletBalance={(profile?.wallet_balance || 0) + (profile?.cycle_wallet_balance || 0) + (profile?.referral_balance || 0)}
              totalProfit={profile?.total_profit || 0}
              totalInvestment={profile?.total_investment || 0}
              activeCycleAmount={getActiveCycleAmount()}
              isActive={!!activeCycle}
            />
          </Suspense>
        </div>

        <div className="flex items-center justify-between gap-3 animate-fade-in-up" style={{ animationDelay: "0.1s" }}>
          <Card className="flex-1 p-4 bg-gradient-success border-0 shadow-success-glow hover:shadow-lg transition-all duration-300 hover:scale-[1.02] cursor-pointer">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-white/80 mb-1 font-medium">Wallet Balance</p>
                <p className="text-2xl font-bold text-white">${(profile?.wallet_balance || 0).toFixed(2)}</p>
              </div>
              <div className="animate-float">
                <DollarSign className="w-10 h-10 text-white" />
              </div>
            </div>
          </Card>
          <WalletHistoryDialog>
            <Button
              variant="outline"
              size="icon"
              className="h-[76px] w-[76px] flex-shrink-0 border-2 hover:border-primary hover:bg-primary/10 hover:scale-110 transition-all duration-300"
            >
              <div className="flex flex-col items-center gap-1">
                <History className="w-5 h-5" />
                <span className="text-xs">History</span>
              </div>
            </Button>
          </WalletHistoryDialog>
        </div>

        {/* Whale Trade CTA */}
        <Card className="relative overflow-hidden bg-gradient-purple border-0 shadow-glow hover:shadow-xl transition-all duration-300 hover:scale-[1.02] animate-fade-in-up" style={{ animationDelay: "0.2s" }}>
          <div className="absolute inset-0 bg-shimmer bg-[length:200%_100%] animate-shimmer opacity-20"></div>
          <CardHeader className="relative z-10">
            <CardTitle className="flex items-center gap-2 text-white">
              <div className="animate-float">
                <TrendingUp className="w-5 h-5" />
              </div>
              Whale Trade System
            </CardTitle>
            <CardDescription className="text-white/90">
              {activeCycle ? (
                <>Active cycle in progress - Growing your investment automatically</>
              ) : (
                <>Start automated trading cycles and double your investment</>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="relative z-10">
            <Button 
              onClick={() => navigate('/ai-trade')}
              className="w-full bg-white text-primary hover:bg-white/90 font-semibold hover:scale-105 transition-transform duration-200"
              size="lg"
            >
              {activeCycle ? "View Active Cycle" : "Get Started"}
            </Button>
          </CardContent>
        </Card>

        {/* Whale Trading Activity - Lazy Loaded, Show when cycle is active */}
        {activeCycle && (
          <div className="animate-fade-in-up" style={{ animationDelay: "0.25s" }}>
            <Suspense fallback={<Skeleton className="h-[200px] w-full rounded-lg" />}>
              <AITradingActivity activeInvestment={activeCycle} />
            </Suspense>
          </div>
        )}

        {/* Whale Watch Widget - Lazy Loaded */}
        <div className="animate-fade-in-up" style={{ animationDelay: "0.27s" }}>
          <Suspense fallback={<Skeleton className="h-[180px] w-full rounded-lg" />}>
            <WhaleWatchWidget />
          </Suspense>
        </div>

        {/* TradingView Chart - Lazy Loaded */}
        <div className="animate-fade-in-up" style={{ animationDelay: "0.28s" }}>
          <Suspense fallback={<Skeleton className="h-[500px] w-full rounded-lg" />}>
            <TradingViewWidget symbol="BINANCE:BTCUSDT" height={500} />
          </Suspense>
        </div>

        <div className="grid grid-cols-2 gap-4 animate-fade-in-up" style={{ animationDelay: "0.3s" }}>
          <StatCard
            icon={DollarSign}
            label="Total Deposits"
            value={`$${(profile?.total_deposits || 0).toFixed(2)}`}
            variant="success"
          />
          <StatCard
            icon={TrendingUp}
            label="Total Profit"
            value={`$${(profile?.total_profit || 0).toFixed(2)}`}
            trend={profile?.total_investment > 0 ? `+${((profile?.total_profit / profile?.total_investment) * 100).toFixed(2)}%` : undefined}
            variant="success"
          />
        </div>

        <div className="grid grid-cols-2 gap-4 animate-fade-in-up" style={{ animationDelay: "0.4s" }}>
          <StatCard
            icon={DollarSign}
            label="Total Investment"
            value={`$${(profile?.total_investment || 0).toFixed(2)}`}
          />
          <StatCard
            icon={Users}
            label="Referral Earnings"
            value={`$${(profile?.total_referral_earnings || 0).toFixed(2)}`}
          />
        </div>
      </div>

      <BottomNav />
    </div>
  );
};

export default Dashboard;
