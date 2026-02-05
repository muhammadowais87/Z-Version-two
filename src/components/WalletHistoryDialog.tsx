import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, TrendingUp, Wallet, Clock } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

interface WalletHistoryDialogProps {
  children: React.ReactNode;
}

interface WalletTransfer {
  id: string;
  amount: number;
  from_wallet: string;
  to_wallet: string;
  created_at: string;
}

const getWalletLabel = (wallet: string) => {
  switch (wallet) {
    case 'main': return 'Main Wallet';
    case 'cycle': return 'Cycle Wallet';
    case 'team': return 'Team Income';
    default: return wallet;
  }
};

const getWalletColor = (wallet: string) => {
  switch (wallet) {
    case 'main': return 'bg-green-500/20 text-green-500';
    case 'cycle': return 'bg-blue-500/20 text-blue-500';
    case 'team': return 'bg-amber-500/20 text-amber-500';
    default: return 'bg-muted text-muted-foreground';
  }
};

export const WalletHistoryDialog = ({ children }: WalletHistoryDialogProps) => {
  // Fetch wallet transfers
  const { data: transfers, isLoading: loadingTransfers } = useQuery({
    queryKey: ['walletTransfers'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      
      const { data, error } = await supabase
        .from('wallet_transfers')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);
      
      if (error) throw error;
      return data as WalletTransfer[];
    },
  });

  // Fetch completed cycles for earnings
  const { data: completedCycles, isLoading: loadingCycles } = useQuery({
    queryKey: ['completedCyclesHistory'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      
      const { data, error } = await supabase
        .from('ai_trade_cycles')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'completed')
        .order('updated_at', { ascending: false })
        .limit(50);
      
      if (error) throw error;
      return data;
    },
  });

  // Fetch referral earnings
  const { data: referralEarnings, isLoading: loadingReferrals } = useQuery({
    queryKey: ['referralEarningsHistory'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      
      const { data, error } = await supabase
        .from('referral_earnings_history')
        .select('*')
        .eq('referrer_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);
      
      if (error) throw error;
      return data;
    },
  });

  // Calculate daily earnings (last 24 hours)
  const today = new Date();
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  
  const dailyCycleEarnings = completedCycles?.filter(c => 
    new Date(c.updated_at) >= yesterday
  ).reduce((sum, c) => sum + (c.current_profit || 0), 0) || 0;

  const dailyReferralEarnings = referralEarnings?.filter(e => 
    new Date(e.created_at) >= yesterday
  ).reduce((sum, e) => sum + (e.amount || 0), 0) || 0;

  const totalDailyEarnings = dailyCycleEarnings + dailyReferralEarnings;

  return (
    <Dialog>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="max-w-md max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="w-5 h-5" />
            Wallet History
          </DialogTitle>
        </DialogHeader>

        {/* Daily Earnings Summary */}
        <div className="bg-gradient-to-r from-green-500/20 to-emerald-500/20 rounded-lg p-4 border border-green-500/30">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-4 h-4 text-green-500" />
            <span className="text-sm font-medium text-foreground">Last 24 Hours Earnings</span>
          </div>
          <p className="text-2xl font-bold text-green-500">${totalDailyEarnings.toFixed(2)}</p>
          <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
            <span>Cycle Profit: ${dailyCycleEarnings.toFixed(2)}</span>
            <span>Referral: ${dailyReferralEarnings.toFixed(2)}</span>
          </div>
        </div>

        <Tabs defaultValue="transfers" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="transfers">Transfers</TabsTrigger>
            <TabsTrigger value="earnings">Earnings</TabsTrigger>
          </TabsList>

          <TabsContent value="transfers">
            <ScrollArea className="h-[300px] pr-4">
              {loadingTransfers ? (
                <div className="text-center py-8 text-muted-foreground">Loading...</div>
              ) : transfers?.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Wallet className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>No transfers yet</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {transfers?.map((transfer) => (
                    <div key={transfer.id} className="bg-secondary/50 rounded-lg p-3 border border-border">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Badge className={getWalletColor(transfer.from_wallet)}>
                            {getWalletLabel(transfer.from_wallet)}
                          </Badge>
                          <ArrowRight className="w-4 h-4 text-muted-foreground" />
                          <Badge className={getWalletColor(transfer.to_wallet)}>
                            {getWalletLabel(transfer.to_wallet)}
                          </Badge>
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-lg font-bold text-foreground">
                          ${Number(transfer.amount).toFixed(2)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(transfer.created_at), 'MMM d, yyyy h:mm a')}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="earnings">
            <ScrollArea className="h-[300px] pr-4">
              {loadingCycles && loadingReferrals ? (
                <div className="text-center py-8 text-muted-foreground">Loading...</div>
              ) : (completedCycles?.length === 0 && referralEarnings?.length === 0) ? (
                <div className="text-center py-8 text-muted-foreground">
                  <TrendingUp className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>No earnings yet</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Merge and sort by date */}
                  {[
                    ...(completedCycles?.map(c => ({
                      id: c.id,
                      type: 'cycle' as const,
                      amount: c.current_profit,
                      date: c.updated_at,
                      details: `Cycle ${c.cycle_type} Profit`
                    })) || []),
                    ...(referralEarnings?.map(e => ({
                      id: e.id,
                      type: 'referral' as const,
                      amount: e.amount,
                      date: e.created_at,
                      details: `Level ${e.referral_level} Commission`
                    })) || [])
                  ]
                    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                    .slice(0, 30)
                    .map((earning) => (
                      <div key={earning.id} className="bg-secondary/50 rounded-lg p-3 border border-border">
                        <div className="flex items-center justify-between mb-1">
                          <Badge className={earning.type === 'cycle' ? 'bg-blue-500/20 text-blue-500' : 'bg-amber-500/20 text-amber-500'}>
                            {earning.type === 'cycle' ? 'Cycle Profit' : 'Referral'}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(earning.date), 'MMM d, yyyy')}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">{earning.details}</span>
                          <span className="text-lg font-bold text-green-500">
                            +${Number(earning.amount).toFixed(2)}
                          </span>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

export default WalletHistoryDialog;