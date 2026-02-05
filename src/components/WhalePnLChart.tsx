import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from "recharts";
import { TrendingUp, TrendingDown, BarChart3 } from "lucide-react";
import { format, subDays, subMonths } from "date-fns";

interface PnLDataPoint {
  id: string;
  wallet_address: string;
  total_pnl: number;
  total_position_value: number;
  position_count: number;
  snapshot_time: string;
}

type TimeRange = "7d" | "30d";

const formatUSD = (value: number): string => {
  if (Math.abs(value) >= 1000000) {
    return `$${(value / 1000000).toFixed(2)}M`;
  }
  if (Math.abs(value) >= 1000) {
    return `$${(value / 1000).toFixed(2)}K`;
  }
  return `$${value.toFixed(2)}`;
};

// Generate demo data since we're just starting to collect real data
const generateDemoData = (days: number): { date: string; pnl: number; value: number }[] => {
  const data = [];
  const baseValue = 5000000;
  const basePnL = 250000;
  
  for (let i = days; i >= 0; i--) {
    const date = subDays(new Date(), i);
    const randomPnL = basePnL + (Math.random() - 0.5) * 500000;
    const randomValue = baseValue + (Math.random() - 0.5) * 2000000;
    
    data.push({
      date: format(date, "MMM dd"),
      pnl: randomPnL,
      value: randomValue,
    });
  }
  
  return data;
};

export default function WhalePnLChart({ walletAddress }: { walletAddress: string }) {
  const [timeRange, setTimeRange] = useState<TimeRange>("7d");
  
  const { data: pnlHistory, isLoading } = useQuery({
    queryKey: ['whale-pnl-history', walletAddress, timeRange],
    queryFn: async () => {
      const startDate = timeRange === "7d" 
        ? subDays(new Date(), 7).toISOString()
        : subMonths(new Date(), 1).toISOString();
      
      const { data, error } = await supabase
        .from('whale_pnl_history')
        .select('*')
        .eq('wallet_address', walletAddress.toLowerCase())
        .gte('snapshot_time', startDate)
        .order('snapshot_time', { ascending: true });
      
      if (error) throw error;
      return data as PnLDataPoint[];
    },
    refetchInterval: 60000,
  });

  // Use real data if available, otherwise use demo data
  const chartData = pnlHistory && pnlHistory.length > 5
    ? pnlHistory.map(d => ({
        date: format(new Date(d.snapshot_time), "MMM dd"),
        pnl: d.total_pnl,
        value: d.total_position_value,
      }))
    : generateDemoData(timeRange === "7d" ? 7 : 30);

  const latestPnL = chartData[chartData.length - 1]?.pnl || 0;
  const firstPnL = chartData[0]?.pnl || 0;
  const pnlChange = latestPnL - firstPnL;
  const pnlChangePercent = firstPnL !== 0 ? ((pnlChange / Math.abs(firstPnL)) * 100) : 0;
  const isPositive = pnlChange >= 0;

  const latestValue = chartData[chartData.length - 1]?.value || 0;

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[200px] w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            PnL Performance
          </CardTitle>
          <div className="flex gap-1">
            <Button
              variant={timeRange === "7d" ? "default" : "outline"}
              size="sm"
              onClick={() => setTimeRange("7d")}
              className="h-7 text-xs"
            >
              7D
            </Button>
            <Button
              variant={timeRange === "30d" ? "default" : "outline"}
              size="sm"
              onClick={() => setTimeRange("30d")}
              className="h-7 text-xs"
            >
              1M
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Stats Summary */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="p-3 rounded-lg bg-card border">
            <p className="text-xs text-muted-foreground mb-1">Current PnL</p>
            <p className={`text-lg font-bold flex items-center gap-1 ${latestPnL >= 0 ? 'text-green-500' : 'text-red-500'}`}>
              {latestPnL >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
              {formatUSD(latestPnL)}
            </p>
          </div>
          <div className="p-3 rounded-lg bg-card border">
            <p className="text-xs text-muted-foreground mb-1">{timeRange === "7d" ? "7D" : "30D"} Change</p>
            <p className={`text-lg font-bold ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
              {isPositive ? "+" : ""}{formatUSD(pnlChange)}
              <span className="text-xs ml-1">({pnlChangePercent.toFixed(1)}%)</span>
            </p>
          </div>
        </div>

        {/* PnL Chart */}
        <div className="h-[180px] mt-4">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
              <defs>
                <linearGradient id="pnlGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
              <XAxis 
                dataKey="date" 
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis 
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                tickFormatter={(value) => formatUSD(value)}
                tickLine={false}
                axisLine={false}
                width={60}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'hsl(var(--card))', 
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
                labelStyle={{ color: 'hsl(var(--foreground))' }}
                formatter={(value: number) => [formatUSD(value), 'PnL']}
              />
              <Area 
                type="monotone" 
                dataKey="pnl" 
                stroke="hsl(var(--primary))" 
                strokeWidth={2}
                fill="url(#pnlGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Position Value Chart */}
        <div className="mt-6">
          <p className="text-sm font-medium text-foreground mb-2">Position Value</p>
          <div className="h-[120px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
                <XAxis 
                  dataKey="date" 
                  tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis 
                  tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                  tickFormatter={(value) => formatUSD(value)}
                  tickLine={false}
                  axisLine={false}
                  width={60}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--card))', 
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                  formatter={(value: number) => [formatUSD(value), 'Position Value']}
                />
                <Line 
                  type="monotone" 
                  dataKey="value" 
                  stroke="hsl(var(--chart-2))" 
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {(!pnlHistory || pnlHistory.length < 5) && (
          <p className="text-xs text-muted-foreground text-center mt-4">
            📊 Demo data shown. Real data collection starting...
          </p>
        )}
      </CardContent>
    </Card>
  );
}