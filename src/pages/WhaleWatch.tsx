import { lazy, Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import BottomNav from "@/components/BottomNav";
import { 
  Eye, 
  TrendingUp, 
  TrendingDown, 
  Activity, 
  Wallet, 
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
  DollarSign,
  Clock
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";

const WhalePnLChart = lazy(() => import("@/components/WhalePnLChart"));

const MONITORED_WALLET = "0x5b5d51203a0f9079f8aeb098a6523a13f298c060";

interface WhalePosition {
  user: string;
  symbol: string;
  positionSize: number;
  entryPrice: number;
  markPrice: number;
  liqPrice: number;
  leverage: number;
  marginBalance: number;
  positionValueUsd: number;
  unrealizedPnL: number;
  fundingFee: number;
  marginMode: string;
  createTime: number;
  updateTime: number;
}

interface WhaleAlert {
  user: string;
  symbol: string;
  positionSize: number;
  entryPrice: number;
  liqPrice: number;
  positionValueUsd: number;
  position_action: number;
  createTime: number;
}

const formatUSD = (value: number | undefined | null): string => {
  if (value === undefined || value === null) return '$0';
  const num = Number(value);
  if (isNaN(num)) return '$0';
  if (Math.abs(num) >= 1000000) {
    return `$${(num / 1000000).toFixed(2)}M`;
  }
  if (Math.abs(num) >= 1000) {
    return `$${(num / 1000).toFixed(2)}K`;
  }
  return `$${num.toFixed(2)}`;
};

const shortenAddress = (address: string | undefined | null): string => {
  if (!address) return 'Unknown';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

const safeNumber = (val: number | undefined | null): number => {
  if (val === undefined || val === null) return 0;
  const num = Number(val);
  return isNaN(num) ? 0 : num;
};

export default function WhaleWatch() {
  const { data: positionsData, isLoading: positionsLoading, refetch: refetchPositions } = useQuery({
    queryKey: ['whale-positions'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('coinglass-whale-position');
      if (error) throw error;
      return data;
    },
    refetchInterval: 60000, // Refetch every minute
  });

  const { data: alertsData, isLoading: alertsLoading, refetch: refetchAlerts } = useQuery({
    queryKey: ['whale-alerts'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('coinglass-whale-alerts');
      if (error) throw error;
      return data;
    },
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  const handleRefresh = () => {
    refetchPositions();
    refetchAlerts();
  };

  const monitoredPositions: WhalePosition[] = positionsData?.monitored_positions || [];
  const topWhales: WhalePosition[] = positionsData?.top_whales || [];
  const monitoredAlerts: WhaleAlert[] = alertsData?.monitored_alerts || [];
  const recentAlerts: WhaleAlert[] = alertsData?.recent_alerts || [];

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <div className="bg-gradient-to-br from-primary/20 via-primary/10 to-background p-6 pb-8">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/20">
              <Eye className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">Whale Watch</h1>
              <p className="text-sm text-muted-foreground">Hyperliquid Position Tracker</p>
            </div>
          </div>
          <Button variant="outline" size="icon" onClick={handleRefresh}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>

        {/* Monitored Wallet Card */}
        <Card className="bg-card/50 backdrop-blur border-primary/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Wallet className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium text-foreground">Monitored Wallet</span>
            </div>
            <code className="text-xs text-muted-foreground break-all">{MONITORED_WALLET}</code>
          </CardContent>
        </Card>
      </div>

      <div className="px-4 space-y-6 -mt-4">
        {/* PnL Performance Chart - Lazy Loaded */}
        <Suspense fallback={<Skeleton className="h-[300px] w-full rounded-lg" />}>
          <WhalePnLChart walletAddress={MONITORED_WALLET} />
        </Suspense>

        {/* Monitored Wallet Positions */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              Tracked Wallet Positions
            </CardTitle>
          </CardHeader>
          <CardContent>
            {positionsLoading ? (
              <div className="space-y-3">
                {[1, 2].map((i) => (
                  <Skeleton key={i} className="h-24 w-full" />
                ))}
              </div>
            ) : monitoredPositions.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Eye className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>No active positions for tracked wallet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {monitoredPositions.map((pos, idx) => (
                  <PositionCard key={idx} position={pos} isMonitored />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Monitored Wallet Alerts */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Activity className="h-5 w-5 text-orange-500" />
              Tracked Wallet Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            {alertsLoading ? (
              <div className="space-y-3">
                {[1, 2].map((i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : monitoredAlerts.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Activity className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>No recent activity for tracked wallet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {monitoredAlerts.map((alert, idx) => (
                  <AlertCard key={idx} alert={alert} isMonitored />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top Whales */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-green-500" />
              Top Whale Positions
            </CardTitle>
          </CardHeader>
          <CardContent>
            {positionsLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-24 w-full" />
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {topWhales.slice(0, 10).map((pos, idx) => (
                  <PositionCard key={idx} position={pos} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Alerts Feed */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Clock className="h-5 w-5 text-blue-500" />
              Recent Whale Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            {alertsLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {recentAlerts.slice(0, 15).map((alert, idx) => (
                  <AlertCard key={idx} alert={alert} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <BottomNav />
    </div>
  );
}

function PositionCard({ position, isMonitored = false }: { position: WhalePosition; isMonitored?: boolean }) {
  const positionSize = safeNumber(position?.positionSize);
  const isLong = positionSize > 0;
  const pnl = safeNumber(position?.unrealizedPnL);
  const pnlPositive = pnl >= 0;
  const leverage = safeNumber(position?.leverage);
  const entryPrice = safeNumber(position?.entryPrice);
  const liqPrice = safeNumber(position?.liqPrice);

  return (
    <div className={`p-4 rounded-xl border ${isMonitored ? 'border-primary/50 bg-primary/5' : 'border-border bg-card/50'}`}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <Badge variant={isLong ? "default" : "destructive"} className="text-xs">
            {isLong ? "LONG" : "SHORT"}
          </Badge>
          <span className="font-bold text-foreground">{position?.symbol || 'N/A'}</span>
          <Badge variant="outline" className="text-xs">
            {leverage}x
          </Badge>
        </div>
        {isMonitored && (
          <Badge variant="secondary" className="text-xs bg-primary/20 text-primary">
            TRACKED
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <span className="text-muted-foreground">Size</span>
          <p className="font-medium text-foreground">{formatUSD(position?.positionValueUsd)}</p>
        </div>
        <div>
          <span className="text-muted-foreground">PnL</span>
          <p className={`font-medium flex items-center gap-1 ${pnlPositive ? 'text-green-500' : 'text-red-500'}`}>
            {pnlPositive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            {formatUSD(Math.abs(pnl))}
          </p>
        </div>
        <div>
          <span className="text-muted-foreground">Entry</span>
          <p className="font-medium text-foreground">${entryPrice.toLocaleString()}</p>
        </div>
        <div>
          <span className="text-muted-foreground">Liq. Price</span>
          <p className="font-medium text-orange-500">${liqPrice.toLocaleString()}</p>
        </div>
      </div>

      {!isMonitored && (
        <div className="mt-2 pt-2 border-t border-border">
          <code className="text-xs text-muted-foreground">{shortenAddress(position?.user)}</code>
        </div>
      )}
    </div>
  );
}

function AlertCard({ alert, isMonitored = false }: { alert: WhaleAlert; isMonitored?: boolean }) {
  const isOpen = alert?.position_action === 1;
  const positionSize = safeNumber(alert?.positionSize);
  const isLong = positionSize > 0;
  const createTime = alert?.createTime ? new Date(alert.createTime) : new Date();

  return (
    <div className={`p-3 rounded-lg border ${isMonitored ? 'border-primary/50 bg-primary/5' : 'border-border bg-card/50'}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant={isOpen ? "default" : "secondary"} className="text-xs">
            {isOpen ? "OPENED" : "CLOSED"}
          </Badge>
          <Badge variant={isLong ? "default" : "destructive"} className="text-xs">
            {isLong ? "LONG" : "SHORT"}
          </Badge>
          <span className="font-medium text-foreground">{alert?.symbol || 'N/A'}</span>
        </div>
        <span className="text-xs text-muted-foreground">
          {formatDistanceToNow(createTime, { addSuffix: true })}
        </span>
      </div>
      <div className="flex items-center justify-between mt-2">
        <div className="flex items-center gap-1 text-sm">
          <DollarSign className="h-3 w-3 text-muted-foreground" />
          <span className="text-foreground">{formatUSD(alert?.positionValueUsd)}</span>
        </div>
        {!isMonitored && (
          <code className="text-xs text-muted-foreground">{shortenAddress(alert?.user)}</code>
        )}
      </div>
    </div>
  );
}
