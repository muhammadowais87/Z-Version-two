import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Activity, Zap, Bell, BellOff, Volume2, VolumeX } from "lucide-react";
import { useState, useEffect } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useToast } from "@/hooks/use-toast";

interface TradingActivityProps {
  activeInvestment: any;
}

const AITradingActivity = ({ activeInvestment }: TradingActivityProps) => {
  const { toast } = useToast();
  const [chartData, setChartData] = useState<{ time: string; value: number }[]>([]);
  const [stats, setStats] = useState({
    totalTrades: 0,
    winRate: 0,
    currentProfit: 0,
  });
  const [notificationsEnabled, setNotificationsEnabled] = useState(() => {
    const saved = localStorage.getItem('tradingNotifications');
    return saved !== null ? saved === 'true' : true;
  });
  const [soundMuted, setSoundMuted] = useState(() => {
    const saved = localStorage.getItem('tradingSoundMuted');
    return saved === 'true';
  });

  // Create audio context for trade sounds
  const playTradeSound = (profitable: boolean) => {
    if (soundMuted || !notificationsEnabled) return;
    
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    if (profitable) {
      // Success sound: ascending tones
      oscillator.frequency.setValueAtTime(523.25, audioContext.currentTime); // C5
      oscillator.frequency.setValueAtTime(659.25, audioContext.currentTime + 0.1); // E5
      oscillator.frequency.setValueAtTime(783.99, audioContext.currentTime + 0.2); // G5
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
    } else {
      // Loss sound: single low tone
      oscillator.frequency.setValueAtTime(293.66, audioContext.currentTime); // D4
      gainNode.gain.setValueAtTime(0.2, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
    }
    
    oscillator.type = 'sine';
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.3);
  };

  const toggleNotifications = () => {
    const newValue = !notificationsEnabled;
    setNotificationsEnabled(newValue);
    localStorage.setItem('tradingNotifications', String(newValue));
    
    toast({
      title: newValue ? "Notifications Enabled" : "Notifications Disabled",
      description: newValue 
        ? "You'll receive alerts for profitable trades" 
        : "Trade notifications are now muted",
    });
  };

  const toggleSound = () => {
    const newValue = !soundMuted;
    setSoundMuted(newValue);
    localStorage.setItem('tradingSoundMuted', String(newValue));
    
    toast({
      title: newValue ? "Sound Muted" : "Sound Enabled",
      description: newValue 
        ? "Trade sounds are now muted" 
        : "You'll hear sounds for trades",
    });
  };

  // Crypto pairs for realistic trading simulation
  const cryptoPairs = ["BTC/USDT", "ETH/USDT", "BNB/USDT", "SOL/USDT", "XRP/USDT", "ADA/USDT"];

  useEffect(() => {
    if (!activeInvestment) {
      setChartData([]);
      return;
    }

    const initialAmount = Number(activeInvestment.investment_amount);
    const investedAt = new Date(activeInvestment.start_date).getTime();
    const maturesAt = new Date(activeInvestment.end_date).getTime();
    const totalDuration = maturesAt - investedAt;
    
    // Calculate current profit based on time elapsed (doubles over cycle duration)
    const calculateCurrentProfit = () => {
      const now = Date.now();
      const elapsed = now - investedAt;
      const progress = Math.min(1, Math.max(0, elapsed / totalDuration));
      return initialAmount * progress; // Profit grows to match investment amount (2x total)
    };
    
    // Initialize chart data with historical performance showing profit growth
    const now = Date.now();
    const initialData = Array.from({ length: 20 }, (_, i) => {
      const pointTime = now - (19 - i) * 10000;
      const pointElapsed = pointTime - investedAt;
      const pointProgress = Math.min(1, Math.max(0, pointElapsed / totalDuration));
      const pointProfit = initialAmount * pointProgress;
      return {
        time: new Date(pointTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        value: initialAmount + pointProfit,
      };
    });
    setChartData(initialData);

    // Initialize stats
    setStats({
      totalTrades: 5,
      winRate: 70,
      currentProfit: calculateCurrentProfit(),
    });

    // Simulate live trading updates
    const interval = setInterval(() => {
      const currentProfit = calculateCurrentProfit();
      const targetValue = initialAmount + currentProfit;
      const currentValue = chartData[chartData.length - 1]?.value || initialAmount;
      
      // Gradually move towards target value (investment + current profit)
      const change = (targetValue - currentValue) * 0.3 + (Math.random() - 0.5) * (initialAmount * 0.01);
      const newValue = Math.max(initialAmount, currentValue + change);

      // Update chart
      setChartData(prev => {
        const updated = [...prev, {
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          value: newValue,
        }];
        return updated.slice(-20); // Keep last 20 points
      });

      // Randomly update stats (30% chance)
      if (Math.random() > 0.7) {
        const profit = (Math.random() - 0.3) * 50;
        const isProfitable = profit > 0;
        const pair = cryptoPairs[Math.floor(Math.random() * cryptoPairs.length)];
        
        // Play sound and show notification for profitable trades
        if (isProfitable && notificationsEnabled) {
          playTradeSound(true);
          toast({
            title: "🎉 Profitable Trade!",
            description: `${pair}: +$${profit.toFixed(2)}`,
            variant: "default",
          });
        } else if (!isProfitable && Math.random() > 0.7) {
          // Occasionally notify on losses (less frequent)
          playTradeSound(false);
        }
        
        // Update stats with current profit based on time elapsed
        setStats(prev => {
          const newTotalTrades = prev.totalTrades + 1;
          const newWinningTrades = Math.round((prev.winRate / 100) * prev.totalTrades) + (profit > 0 ? 1 : 0);
          const currentProfit = calculateCurrentProfit();
          return {
            totalTrades: newTotalTrades,
            winRate: (newWinningTrades / newTotalTrades) * 100,
            currentProfit: currentProfit,
          };
        });
      }
    }, 3000); // Update every 3 seconds

    return () => clearInterval(interval);
  }, [activeInvestment]);

  if (!activeInvestment) {
    return (
      <Card className="p-6">
        <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
          <Activity className="w-5 h-5" />
          Whale Trading Activity
        </h3>
        <div className="h-64 bg-secondary/50 rounded-lg flex items-center justify-center">
          <div className="text-center space-y-2">
            <Zap className="w-12 h-12 text-muted-foreground mx-auto opacity-50" />
            <p className="text-sm text-muted-foreground">No active investment</p>
            <p className="text-xs text-muted-foreground">Make a deposit to start whale trading</p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Trading Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="p-3">
          <p className="text-xs text-muted-foreground mb-1">Total Trades</p>
          <p className="text-lg font-bold text-foreground">{stats.totalTrades}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground mb-1">Win Rate</p>
          <p className="text-lg font-bold text-success">{stats.winRate.toFixed(1)}%</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground mb-1">Current Profit</p>
          <p className="text-lg font-bold text-success">
            ${stats.currentProfit.toFixed(2)}
          </p>
        </Card>
      </div>

      {/* Trading Chart */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-foreground flex items-center gap-2">
            <Activity className="w-4 h-4" />
            Portfolio Value
          </h3>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleSound}
              className="h-8 w-8 p-0"
            >
              {soundMuted ? (
                <VolumeX className="w-4 h-4 text-muted-foreground" />
              ) : (
                <Volume2 className="w-4 h-4 text-primary" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleNotifications}
              className="h-8 w-8 p-0"
            >
              {notificationsEnabled ? (
                <Bell className="w-4 h-4 text-primary" />
              ) : (
                <BellOff className="w-4 h-4 text-muted-foreground" />
              )}
            </Button>
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 bg-success rounded-full animate-pulse"></span>
              <span className="text-xs text-muted-foreground">Live</span>
            </div>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis 
              dataKey="time" 
              stroke="hsl(var(--muted-foreground))"
              fontSize={10}
              tickMargin={8}
            />
            <YAxis 
              stroke="hsl(var(--muted-foreground))"
              fontSize={10}
              tickFormatter={(value) => `$${value.toFixed(0)}`}
            />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: 'hsl(var(--card))', 
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
                fontSize: '12px'
              }}
              formatter={(value: number) => [`$${value.toFixed(2)}`, 'Value']}
            />
            <Line 
              type="monotone" 
              dataKey="value" 
              stroke="hsl(var(--primary))" 
              strokeWidth={2}
              dot={false}
              animationDuration={300}
            />
          </LineChart>
        </ResponsiveContainer>
      </Card>
    </div>
  );
};

export default AITradingActivity;
