import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { History, TrendingUp, DollarSign, ArrowUpRight, Users, Gift } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

interface EarningsRecord {
  id: string;
  amount: number;
  commission_percent: number;
  source_type: 'deposit' | 'profit';
  source_amount: number;
  referral_level: number;
  created_at: string;
  referred_name?: string;
  referred_email?: string;
}

export const ReferralEarningsHistory = () => {
  const { data: earnings, isLoading } = useQuery({
    queryKey: ["referral-earnings-history"],
    queryFn: async () => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) return [];

      // Fetch earnings history with referred user info
      const { data, error } = await supabase
        .from("referral_earnings_history")
        .select(`
          id,
          amount,
          commission_percent,
          source_type,
          source_amount,
          referral_level,
          created_at,
          referred_id
        `)
        .eq("referrer_id", user.user.id)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;

      // Fetch referred user details (name + email)
      if (data && data.length > 0) {
        const referredIds = [...new Set(data.map(e => e.referred_id))];
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, email, telegram_first_name, telegram_last_name, telegram_username")
          .in("id", referredIds);

        const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);
        
        return data.map(e => {
          const profile = profileMap.get(e.referred_id);
          let displayName = "Unknown";
          
          if (profile) {
            if (profile.telegram_first_name || profile.telegram_last_name) {
              displayName = [profile.telegram_first_name, profile.telegram_last_name]
                .filter(Boolean)
                .join(" ");
            } else if (profile.telegram_username) {
              displayName = `@${profile.telegram_username}`;
            } else if (profile.email) {
              displayName = profile.email.split("@")[0];
            }
          }
          
          return {
            ...e,
            referred_name: displayName,
            referred_email: profile?.email || "Unknown"
          };
        }) as EarningsRecord[];
      }

      return data as EarningsRecord[];
    },
  });

  // Calculate separate totals
  const totalReferralBonus = earnings?.filter(e => e.source_type === 'deposit').reduce((sum, e) => sum + e.amount, 0) || 0;
  const totalTeamEarnings = earnings?.filter(e => e.source_type === 'profit').reduce((sum, e) => sum + e.amount, 0) || 0;
  const totalEarnings = totalReferralBonus + totalTeamEarnings;

  const getLevelColor = (level: number) => {
    switch (level) {
      case 1: return "bg-emerald-500/20 text-emerald-500 border-emerald-500/30";
      case 2: return "bg-blue-500/20 text-blue-500 border-blue-500/30";
      case 3: return "bg-purple-500/20 text-purple-500 border-purple-500/30";
      case 4: return "bg-amber-500/20 text-amber-500 border-amber-500/30";
      case 5: return "bg-rose-500/20 text-rose-500 border-rose-500/30";
      default: return "bg-muted text-muted-foreground";
    }
  };

  if (isLoading) {
    return (
      <Card className="p-4">
        <div className="animate-pulse space-y-3">
          <div className="h-6 bg-muted rounded w-1/3"></div>
          <div className="h-20 bg-muted rounded"></div>
          <div className="h-20 bg-muted rounded"></div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-4 bg-gradient-to-br from-emerald-500/5 to-teal-500/5 border-emerald-500/20">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-foreground flex items-center gap-2">
          <History className="w-5 h-5 text-emerald-500" />
          Earnings History
        </h3>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Total Earned</p>
          <p className="text-lg font-bold text-emerald-500">${totalEarnings.toFixed(2)}</p>
        </div>
      </div>

      {/* Separate totals for Referral Bonus and Team Earnings */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-blue-500/10 rounded-lg p-3 border border-blue-500/20">
          <div className="flex items-center gap-2 mb-1">
            <Gift className="w-4 h-4 text-blue-500" />
            <p className="text-xs text-muted-foreground">Referral Bonus</p>
          </div>
          <p className="text-lg font-bold text-blue-500">${totalReferralBonus.toFixed(2)}</p>
          <p className="text-xs text-muted-foreground">From deposits</p>
        </div>
        <div className="bg-emerald-500/10 rounded-lg p-3 border border-emerald-500/20">
          <div className="flex items-center gap-2 mb-1">
            <Users className="w-4 h-4 text-emerald-500" />
            <p className="text-xs text-muted-foreground">Team Earnings</p>
          </div>
          <p className="text-lg font-bold text-emerald-500">${totalTeamEarnings.toFixed(2)}</p>
          <p className="text-xs text-muted-foreground">From profits</p>
        </div>
      </div>

      {!earnings || earnings.length === 0 ? (
        <div className="text-center py-8">
          <DollarSign className="w-12 h-12 text-muted-foreground mx-auto mb-2 opacity-50" />
          <p className="text-sm text-muted-foreground">No earnings yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Invite friends to start earning commissions!
          </p>
        </div>
      ) : (
        <ScrollArea className="h-[300px] pr-2">
          <div className="space-y-2">
            {earnings.map((earning) => (
              <div
                key={earning.id}
                className="bg-background/50 rounded-lg p-3 border border-border/50 hover:border-border transition-colors"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      earning.source_type === 'deposit' 
                        ? 'bg-blue-500/20' 
                        : 'bg-emerald-500/20'
                    }`}>
                      {earning.source_type === 'deposit' ? (
                        <Gift className="w-4 h-4 text-blue-500" />
                      ) : (
                        <TrendingUp className="w-4 h-4 text-emerald-500" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground flex items-center gap-1">
                        +${earning.amount.toFixed(2)}
                        <ArrowUpRight className="w-3 h-3 text-emerald-500" />
                      </p>
                      <p className="text-xs text-muted-foreground font-medium">
                        {earning.referred_name}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <Badge 
                      variant="outline" 
                      className={`text-xs ${getLevelColor(earning.referral_level)}`}
                    >
                      L{earning.referral_level}
                    </Badge>
                  </div>
                </div>
                
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <Badge 
                      variant="secondary" 
                      className={`text-xs ${
                        earning.source_type === 'deposit' 
                          ? 'bg-blue-500/10 text-blue-600' 
                          : 'bg-emerald-500/10 text-emerald-600'
                      }`}
                    >
                      {earning.source_type === 'deposit' ? 'Referral Bonus' : 'Team Earning'}
                    </Badge>
                    <span className="text-muted-foreground">
                      {earning.commission_percent}% of ${earning.source_amount.toFixed(2)}
                    </span>
                  </div>
                  <span className="text-muted-foreground">
                    {format(new Date(earning.created_at), "MMM d, HH:mm")}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
    </Card>
  );
};
