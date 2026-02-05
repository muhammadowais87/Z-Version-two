import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Eye, TrendingUp, TrendingDown, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

interface WhalePosition {
  symbol: string;
  positionSize: number;
  positionValueUsd: number;
  unrealizedPnL: number;
  leverage: number;
}

const safeNumber = (val: number | undefined | null): number => {
  if (val === undefined || val === null) return 0;
  const num = Number(val);
  return isNaN(num) ? 0 : num;
};

const formatUSD = (value: number | undefined | null): string => {
  const num = safeNumber(value);
  if (Math.abs(num) >= 1000000) {
    return `$${(num / 1000000).toFixed(2)}M`;
  }
  if (Math.abs(num) >= 1000) {
    return `$${(num / 1000).toFixed(1)}K`;
  }
  return `$${num.toFixed(0)}`;
};

export function WhaleWatchWidget() {
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ['whale-positions-widget'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('coinglass-whale-position');
      if (error) throw error;
      return data;
    },
    refetchInterval: 60000,
  });

  const monitoredPositions: WhalePosition[] = data?.monitored_positions || [];
  const totalValue = monitoredPositions.reduce((sum, pos) => sum + safeNumber(pos?.positionValueUsd), 0);
  const totalPnl = monitoredPositions.reduce((sum, pos) => sum + safeNumber(pos?.unrealizedPnL), 0);

  return (
    <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-card via-card to-primary/5">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Eye className="h-4 w-4 text-primary" />
            Whale Watch
          </CardTitle>
          <Button 
            variant="ghost" 
            size="sm" 
            className="text-xs h-7"
            onClick={() => navigate('/whale-watch')}
          >
            View All <ArrowRight className="h-3 w-3 ml-1" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <>
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-8 w-full" />
          </>
        ) : monitoredPositions.length === 0 ? (
          <div className="text-center py-4 text-muted-foreground text-sm">
            <Eye className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No active positions</p>
          </div>
        ) : (
          <>
            {/* Summary Stats */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-background/50">
                <span className="text-xs text-muted-foreground">Total Size</span>
                <p className="text-lg font-bold text-foreground">{formatUSD(totalValue)}</p>
              </div>
              <div className="p-3 rounded-lg bg-background/50">
                <span className="text-xs text-muted-foreground">Total PnL</span>
                <p className={`text-lg font-bold flex items-center gap-1 ${totalPnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {totalPnl >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                  {formatUSD(Math.abs(totalPnl))}
                </p>
              </div>
            </div>

            {/* Top Position */}
            {monitoredPositions[0] && (
              <div className="p-3 rounded-lg border border-border/50 bg-card/50">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <Badge variant={safeNumber(monitoredPositions[0]?.positionSize) > 0 ? "default" : "destructive"} className="text-xs">
                      {safeNumber(monitoredPositions[0]?.positionSize) > 0 ? "LONG" : "SHORT"}
                    </Badge>
                    <span className="font-medium text-foreground">{monitoredPositions[0]?.symbol || 'N/A'}</span>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {safeNumber(monitoredPositions[0]?.leverage)}x
                  </Badge>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{formatUSD(monitoredPositions[0]?.positionValueUsd)}</span>
                  <span className={safeNumber(monitoredPositions[0]?.unrealizedPnL) >= 0 ? 'text-green-500' : 'text-red-500'}>
                    {safeNumber(monitoredPositions[0]?.unrealizedPnL) >= 0 ? '+' : ''}{formatUSD(monitoredPositions[0]?.unrealizedPnL)}
                  </span>
                </div>
              </div>
            )}

            {/* Position Count */}
            {monitoredPositions.length > 1 && (
              <p className="text-xs text-center text-muted-foreground">
                +{monitoredPositions.length - 1} more position{monitoredPositions.length > 2 ? 's' : ''}
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default WhaleWatchWidget;
