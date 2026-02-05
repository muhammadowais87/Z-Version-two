import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, Clock, DollarSign } from "lucide-react";
import type { Json } from "@/integrations/supabase/types";

interface PenaltyModeDisplayProps {
  activeCycle: {
    id: string;
    investment_amount: number;
    start_date: string;
    end_date: string;
    additional_investments?: Json | null;
  } | null;
  penaltyReturn: number;
  timeUnit: string;
  isTestMode: boolean;
  penaltyChance?: number;
}

export const PenaltyModeDisplay = ({
  activeCycle,
  penaltyReturn,
  timeUnit,
  isTestMode,
  penaltyChance,
}: PenaltyModeDisplayProps) => {
  const [tick, setTick] = useState(0);
  const [currentProfit, setCurrentProfit] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);

  // Calculate total investment
  const getTotalInvestment = () => {
    if (!activeCycle) return 0;
    const additionalInvestments = (activeCycle.additional_investments as Array<{ amount: number; added_at: string }>) || [];
    const additionalTotal = additionalInvestments.reduce((sum, inv) => sum + inv.amount, 0);
    return activeCycle.investment_amount + additionalTotal;
  };

  // Update profit every second
  useEffect(() => {
    if (!activeCycle) return;

    const interval = setInterval(() => {
      setTick((t) => t + 1);

      const totalInvestment = getTotalInvestment();
      const now = Date.now();
      const startTime = new Date(activeCycle.start_date).getTime();
      const endTime = new Date(activeCycle.end_date).getTime();
      const effectiveNow = Math.min(now, endTime);

      // Calculate time passed based on time unit
      let timePassed: number;
      if (timeUnit === 'seconds') {
        timePassed = (effectiveNow - startTime) / 1000;
      } else if (timeUnit === 'minutes') {
        timePassed = (effectiveNow - startTime) / 60000;
      } else {
        timePassed = (effectiveNow - startTime) / 86400000;
      }

      // Calculate profit: investment * (penaltyReturn% * timePassed)
      const profit = totalInvestment * ((penaltyReturn / 100) * timePassed);
      setCurrentProfit(profit);
      setElapsedTime(Math.floor((effectiveNow - startTime) / 1000)); // elapsed in seconds
    }, 1000);

    return () => clearInterval(interval);
  }, [activeCycle, penaltyReturn, timeUnit]);

  // Format time remaining for 5-minute cycle
  const formatTimeRemaining = () => {
    if (!activeCycle) return "0:00";
    const endTime = new Date(activeCycle.end_date).getTime();
    const remaining = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
    const minutes = Math.floor(remaining / 60);
    const seconds = remaining % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  // Format elapsed time
  const formatElapsedTime = () => {
    const minutes = Math.floor(elapsedTime / 60);
    const seconds = elapsedTime % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  // Calculate profit per minute
  const profitPerMinute = () => {
    const totalInvestment = getTotalInvestment();
    return totalInvestment * (penaltyReturn / 100);
  };

  const totalInvestment = getTotalInvestment();
  const currentValue = totalInvestment + currentProfit;

  return (
    <Card className="border-amber-500/50 bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-amber-500/10 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-r from-amber-500/5 via-transparent to-amber-500/5 animate-pulse" />
      <CardContent className="relative p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-amber-500/20 border border-amber-500/40">
              <TrendingUp className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <p className="text-xs text-amber-300/80 font-medium uppercase tracking-wider">
                {penaltyChance === 2 ? "Permanent Mode" : "Penalty Mode Active"}
              </p>
              <p className="text-xl font-bold text-amber-400">
                {penaltyReturn}% Per {isTestMode ? (timeUnit === 'seconds' ? 'Second' : 'Minute') : 'Day'}
              </p>
            </div>
          </div>
          {activeCycle && (
            <div className="text-right">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Time Remaining</p>
              <p className="text-2xl font-bold text-amber-400 flex items-center gap-1">
                <Clock className="w-4 h-4" />
                {formatTimeRemaining()}
              </p>
            </div>
          )}
        </div>

        {/* Live Profit Display */}
        {activeCycle && (
          <div className="bg-amber-900/20 rounded-lg p-4 mb-4">
            <div className="grid grid-cols-2 gap-4 mb-3">
              <div>
                <p className="text-xs text-amber-300/70 mb-1">Investment</p>
                <p className="text-lg font-bold text-white">${totalInvestment.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-xs text-amber-300/70 mb-1">Current Value</p>
                <p className="text-lg font-bold text-green-400">${currentValue.toFixed(4)}</p>
              </div>
            </div>
            
            {/* Live Profit Counter */}
            <div className="bg-amber-900/30 rounded-lg p-3 border border-amber-500/30">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-green-400 animate-pulse" />
                  <span className="text-xs text-amber-300/70">Profit Earned</span>
                </div>
                <span className="text-xs text-muted-foreground">Elapsed: {formatElapsedTime()}</span>
              </div>
              <p className="text-2xl font-bold text-green-400 text-center animate-pulse">
                +${currentProfit.toFixed(4)}
              </p>
              <p className="text-xs text-center text-amber-300/70 mt-1">
                Earning ${profitPerMinute().toFixed(4)} every {isTestMode ? (timeUnit === 'seconds' ? 'second' : 'minute') : 'day'}
              </p>
            </div>
          </div>
        )}

        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="h-3 bg-amber-900/30 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-amber-500 via-orange-400 to-amber-500 rounded-full relative overflow-hidden transition-all duration-1000"
              style={{ width: activeCycle ? `${Math.min(100, (elapsedTime / ((new Date(activeCycle.end_date).getTime() - new Date(activeCycle.start_date).getTime()) / 1000)) * 100)}%` : '0%' }}
            >
              <div
                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent"
                style={{ animation: 'shimmer 2s infinite' }}
              />
            </div>
          </div>
          <p className="text-xs text-amber-300/70 text-center">
            {penaltyChance === 2
              ? `Earning ${penaltyReturn}% per ${isTestMode ? (timeUnit === 'seconds' ? 'second' : 'minute') : 'day'} on all investments`
              : `Complete Chance 1 to restore 100% profit potential`}
          </p>
        </div>
      </CardContent>
    </Card>
  );
};

export default PenaltyModeDisplay;
