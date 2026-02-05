import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Activity } from "lucide-react";
import { LineChart, Line, ResponsiveContainer, YAxis } from "recharts";

interface PortfolioSparklineProps {
  walletBalance: number;
  totalProfit: number;
  totalInvestment: number;
  activeCycleAmount?: number; // Amount currently in active cycle
  isActive?: boolean;
}

interface DataPoint {
  value: number;
  time: number;
}

export const PortfolioSparkline = ({ 
  walletBalance, 
  totalProfit, 
  totalInvestment,
  activeCycleAmount = 0,
  isActive = false 
}: PortfolioSparklineProps) => {
  const [data, setData] = useState<DataPoint[]>([]);
  // Portfolio value includes wallet balance + active cycle amount (what's currently invested)
  const [currentValue, setCurrentValue] = useState(walletBalance + activeCycleAmount);
  const [change, setChange] = useState(0);
  const [isIncreasing, setIsIncreasing] = useState(true);

  useEffect(() => {
    // Portfolio value = wallet balance + active cycle investment
    const totalValue = walletBalance + activeCycleAmount;
    const baseValue = Math.max(0, totalValue - totalProfit);
    
    const initialData: DataPoint[] = Array.from({ length: 20 }, (_, i) => {
      const progress = i / 19;
      const value = baseValue + (totalProfit * progress);
      return {
        value: Math.max(0, value + (Math.random() - 0.5) * (Math.max(totalValue, 1) * 0.02)),
        time: Date.now() - (19 - i) * 5000,
      };
    });
    
    setData(initialData);
    setCurrentValue(totalValue);
  }, [walletBalance, totalProfit, activeCycleAmount]);

  useEffect(() => {
    if (!isActive) return;

    // Simulate real-time updates
    const interval = setInterval(() => {
      const totalValue = walletBalance + activeCycleAmount;
      const variance = (Math.random() - 0.5) * (Math.max(totalValue, 1) * 0.01);
      const newValue = Math.max(0, totalValue + variance);
      const previousValue = data[data.length - 1]?.value || totalValue;
      
      setData(prev => {
        const updated = [...prev, {
          value: newValue,
          time: Date.now(),
        }];
        return updated.slice(-20);
      });

      setCurrentValue(newValue);
      setChange(previousValue > 0 ? ((newValue - previousValue) / previousValue) * 100 : 0);
      setIsIncreasing(newValue >= previousValue);
    }, 3000);

    return () => clearInterval(interval);
  }, [isActive, walletBalance, activeCycleAmount, data]);

  const profitPercentage = totalInvestment > 0 
    ? ((totalProfit / totalInvestment) * 100) 
    : 0;

  const minValue = Math.min(...data.map(d => d.value));
  const maxValue = Math.max(...data.map(d => d.value));

  return (
    <Card className="relative overflow-hidden group hover:shadow-glow transition-all duration-300 border-2 border-transparent hover:border-primary/30 animate-fade-in-up">
      {/* Animated background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5 opacity-50"></div>
      <div className="absolute inset-0 bg-shimmer bg-[length:200%_100%] animate-shimmer opacity-10"></div>
      
      <CardHeader className="relative z-10 pb-2">
        <CardTitle className="text-sm flex items-center justify-between">
          <span className="flex items-center gap-2 text-muted-foreground">
            <Activity className="w-4 h-4 text-primary animate-pulse" />
            Portfolio Value
          </span>
          {isActive && (
            <Badge 
              variant="secondary" 
              className={`text-xs animate-fade-in-up ${
                isIncreasing 
                  ? "bg-success/20 text-success border-success/30" 
                  : "bg-destructive/20 text-destructive border-destructive/30"
              }`}
            >
              {isIncreasing ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}
              {change >= 0 ? "+" : ""}{change.toFixed(2)}%
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      
      <CardContent className="relative z-10 space-y-2">
        {/* Current Value Display */}
        <div className="flex items-end justify-between">
          <div>
            <p className="text-3xl font-bold bg-gradient-vibrant bg-clip-text text-transparent animate-scale-in">
              ${currentValue.toFixed(2)}
            </p>
            {totalProfit !== 0 && (
              <p className={`text-sm font-semibold flex items-center gap-1 ${
                profitPercentage >= 0 ? "text-success" : "text-destructive"
              }`}>
                {profitPercentage >= 0 ? (
                  <TrendingUp className="w-3 h-3 animate-float" />
                ) : (
                  <TrendingDown className="w-3 h-3 animate-float" />
                )}
                {profitPercentage >= 0 ? "+" : ""}${totalProfit.toFixed(2)} ({profitPercentage.toFixed(1)}%)
              </p>
            )}
          </div>
        </div>

        {/* Sparkline Chart */}
        <div className="h-16 -mx-2 mt-2">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <defs>
                <linearGradient id="portfolioGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.8} />
                  <stop offset="50%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="hsl(var(--accent))" stopOpacity={0.1} />
                </linearGradient>
                <linearGradient id="lineGradient" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="hsl(var(--primary))" />
                  <stop offset="100%" stopColor="hsl(var(--accent))" />
                </linearGradient>
              </defs>
              <YAxis domain={[minValue * 0.98, maxValue * 1.02]} hide />
              <Line 
                type="monotone" 
                dataKey="value" 
                stroke="url(#lineGradient)"
                strokeWidth={2.5}
                dot={false}
                fill="url(#portfolioGradient)"
                fillOpacity={1}
                animationDuration={800}
                animationEasing="ease-in-out"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Mini stats */}
        {data.length > 0 && (
          <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t border-border/50">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-primary/50"></span>
              Low: ${minValue.toFixed(2)}
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-accent/50"></span>
              High: ${maxValue.toFixed(2)}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default PortfolioSparkline;
