import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Users, TrendingUp, DollarSign, Network, Lock, Unlock } from "lucide-react";

interface UnlockedLevels {
  direct_depositors: number;
  level_1_unlocked: boolean;
  level_2_unlocked: boolean;
  level_3_unlocked: boolean;
  level_4_unlocked: boolean;
  level_5_unlocked: boolean;
}

const COMMISSION_RATES = [
  { level: 1, percentage: 10, color: "bg-green-500" },
  { level: 2, percentage: 4, color: "bg-blue-500" },
  { level: 3, percentage: 2, color: "bg-purple-500" },
  { level: 4, percentage: 1, color: "bg-orange-500" },
  { level: 5, percentage: 1, color: "bg-pink-500" },
];

interface ReferralCommissionBreakdownProps {
  unlockedLevels?: UnlockedLevels | null;
}

export const ReferralCommissionBreakdown = ({ unlockedLevels }: ReferralCommissionBreakdownProps) => {
  const [depositAmount, setDepositAmount] = useState<number>(100);

  const calculateCommission = (percentage: number, isUnlocked: boolean) => {
    return isUnlocked ? (depositAmount * percentage) / 100 : 0;
  };

  const isLevelUnlocked = (level: number) => {
    if (!unlockedLevels) return false;
    return unlockedLevels[`level_${level}_unlocked` as keyof UnlockedLevels] as boolean;
  };

  const unlockedCount = unlockedLevels 
    ? [1, 2, 3, 4, 5].filter(l => isLevelUnlocked(l)).length 
    : 0;

  const totalCommission = COMMISSION_RATES.reduce(
    (sum, rate) => sum + calculateCommission(rate.percentage, isLevelUnlocked(rate.level)),
    0
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Network className="h-5 w-5 text-primary" />
          <CardTitle>Commission Breakdown Calculator</CardTitle>
        </div>
        <CardDescription>
          Calculate how much you can earn from your referral network
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Input Section */}
        <div className="space-y-2">
          <Label htmlFor="deposit">Deposit Amount (USDT)</Label>
          <div className="relative">
            <DollarSign className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              id="deposit"
              type="number"
              value={depositAmount}
              onChange={(e) => setDepositAmount(Number(e.target.value) || 0)}
              className="pl-9"
              placeholder="Enter amount"
              min="0"
            />
          </div>
        </div>

        {/* Commission Levels */}
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm font-medium">
            <span className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Level
            </span>
            <span className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Commission
            </span>
          </div>

          {COMMISSION_RATES.map((rate) => {
            const isUnlocked = isLevelUnlocked(rate.level);
            const commission = calculateCommission(rate.percentage, isUnlocked);
            return (
              <div
                key={rate.level}
                className={`flex items-center justify-between p-3 rounded-lg transition-colors ${
                  isUnlocked 
                    ? 'bg-muted/50 hover:bg-muted' 
                    : 'bg-muted/20 opacity-60'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Badge variant={isUnlocked ? "outline" : "secondary"} className="font-mono">
                    L{rate.level}
                  </Badge>
                  <div className="flex items-center gap-2">
                    <div
                      className={`h-2 w-16 rounded-full ${isUnlocked ? rate.color : 'bg-muted'}`}
                      style={{
                        opacity: isUnlocked ? 0.7 : 0.3,
                      }}
                    />
                    <span className="text-sm font-medium">
                      {rate.percentage}%
                    </span>
                    {isUnlocked ? (
                      <Unlock className="h-3 w-3 text-success" />
                    ) : (
                      <Lock className="h-3 w-3 text-muted-foreground" />
                    )}
                  </div>
                </div>
                <div className="text-right">
                  {isUnlocked ? (
                    <div className="font-bold text-primary">
                      ${commission.toFixed(2)}
                    </div>
                  ) : (
                    <Badge variant="secondary" className="text-xs">
                      Locked
                    </Badge>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Total Summary */}
        <div className="pt-4 border-t space-y-2">
          <div className="flex justify-between items-center text-sm text-muted-foreground">
            <span>Active Levels</span>
            <span className="font-mono">{unlockedCount} of {COMMISSION_RATES.length} unlocked</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-lg font-semibold">Your Commission</span>
            <span className="text-2xl font-bold text-primary">
              ${totalCommission.toFixed(2)}
            </span>
          </div>
          {unlockedCount < 5 && (
            <p className="text-xs text-amber-600">
              Unlock more levels by having {5 - (unlockedLevels?.direct_depositors || 0)} more direct referrals make their first deposit
            </p>
          )}
        </div>

        {/* Info Box */}
        <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 space-y-2">
          <div className="flex items-start gap-2">
            <TrendingUp className="h-4 w-4 text-primary mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-medium">How Level Unlocking Works</p>
              <p className="text-xs text-muted-foreground">
                Each level unlocks when you have that many direct referrals who have made at least one deposit.
                For example: 1 direct depositor = Level 1 active, 3 direct depositors = Levels 1-3 active, etc.
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
