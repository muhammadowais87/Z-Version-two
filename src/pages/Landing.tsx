import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import whaleLogo from "@/assets/logo.png";
import { TrendingUp, Users, Shield, Zap, Star, Lock, CheckCircle, AlertTriangle, Send } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { isTelegramMiniApp, getTelegramWebApp } from "@/lib/telegram";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
type ChanceStatus = 'available' | 'active' | 'locked' | 'completed' | 'disabled';
const getStatusIcon = (status: ChanceStatus) => {
  switch (status) {
    case 'active':
      return <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse" />;
    case 'locked':
      return <Lock className="w-4 h-4 text-muted-foreground" />;
    case 'completed':
      return <CheckCircle className="w-4 h-4 text-green-500" />;
    case 'disabled':
      return <AlertTriangle className="w-4 h-4 text-destructive" />;
    default:
      return <div className="w-3 h-3 rounded-full bg-primary/50" />;
  }
};
const getStatusLabel = (status: ChanceStatus) => {
  switch (status) {
    case 'active':
      return 'Active';
    case 'locked':
      return 'Locked';
    case 'completed':
      return 'Completed';
    case 'disabled':
      return 'Disabled';
    default:
      return 'Available';
  }
};
const Landing = () => {
  const navigate = useNavigate();
  const [showChoices, setShowChoices] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const isTgApp = isTelegramMiniApp();

  // Initialize Telegram WebApp if available
  useEffect(() => {
    if (isTgApp) {
      const webApp = getTelegramWebApp();
      webApp?.ready();
      webApp?.expand();
    }
  }, [isTgApp]);

  // Check auth status
  useEffect(() => {
    supabase.auth.getSession().then(({
      data: {
        session
      }
    }) => {
      setIsLoggedIn(!!session);
    });
    const {
      data: {
        subscription
      }
    } = supabase.auth.onAuthStateChange((_, session) => {
      setIsLoggedIn(!!session);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Fetch chance status if logged in
  const {
    data: progress
  } = useQuery({
    queryKey: ['landingChanceStatus'],
    queryFn: async () => {
      const {
        data: {
          user
        }
      } = await supabase.auth.getUser();
      if (!user) return null;
      const {
        data
      } = await supabase.from('user_trade_progress').select('*').eq('user_id', user.id).maybeSingle();
      return data;
    },
    enabled: isLoggedIn
  });

  // Check for active cycle
  const {
    data: activeCycle
  } = useQuery({
    queryKey: ['landingActiveCycle'],
    queryFn: async () => {
      const {
        data: {
          user
        }
      } = await supabase.auth.getUser();
      if (!user) return null;
      const {
        data
      } = await supabase.from('ai_trade_cycles').select('*').eq('user_id', user.id).eq('status', 'active').maybeSingle();
      return data;
    },
    enabled: isLoggedIn
  });
  const handleGetStarted = () => {
    if (!isLoggedIn) {
      // Not logged in - go directly to login
      navigate("/login");
      return;
    }

    // Logged in - check for active cycle
    if (activeCycle) {
      navigate("/ai-trade");
    } else {
      setShowChoices(true);
    }
  };
  const handleChanceSelect = (chance: number) => {
    setShowChoices(false);
    if (isLoggedIn) {
      navigate("/ai-trade", {
        state: {
          chance
        }
      });
    } else {
      navigate("/login", {
        state: {
          chance
        }
      });
    }
  };
  const chance1Status = (progress?.chance_1_status || 'available') as ChanceStatus;
  const chance2Status = (progress?.chance_2_status || 'locked') as ChanceStatus;
  const canSelectChance = (status: ChanceStatus) => {
    return status === 'available' || status === 'active';
  };
  const bothUsed = (chance1Status === 'completed' || chance1Status === 'disabled') && (chance2Status === 'completed' || chance2Status === 'disabled');
  return <div className="min-h-screen bg-gradient-to-b from-background to-secondary flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        <div className="text-center max-w-md space-y-8">
          <img src={whaleLogo} alt="HyperliquidWhale" className="w-32 h-32 mx-auto" fetchPriority="high" />
          
          <div className="space-y-4">
            <h1 className="text-4xl font-bold text-foreground">HyperliquidWhale</h1>
            <p className="text-lg text-muted-foreground">
              Learn Whale Trading Through Smart Simulation
            </p>
          </div>

          <div className="grid gap-4 text-left bg-card p-6 rounded-2xl shadow-lg">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <TrendingUp className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">2-Chance Cycle System</h3>
                <p className="text-sm text-muted-foreground">Two opportunities per cycle period with smart rules</p>
              </div>
            </div>
            
            <div className="flex items-start gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Users className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">5-Level Referrals</h3>
                <p className="text-sm text-muted-foreground">Build your team and earn passive rewards</p>
              </div>
            </div>
            
            
          </div>

          <div className="flex flex-col gap-3 w-full">
            <Button size="lg" className="w-full text-lg h-12" onClick={handleGetStarted}>
              {activeCycle ? "Continue Trading" : "Get Started"}
            </Button>
            {!isTgApp && <Button size="lg" variant="outline" className="w-full text-lg h-12 border-blue-500 text-blue-500 hover:bg-blue-500/10" onClick={() => window.open('https://t.me/HyperliquidWhale_BOT', '_blank')}>
                <Send className="mr-2 h-5 w-5" />
                Open in Telegram
              </Button>}
            {isLoggedIn && <Button size="lg" variant="outline" className="w-full text-lg h-12" onClick={() => navigate("/dashboard")}>
                Dashboard
              </Button>}
          </div>
        </div>
      </div>

      <Dialog open={showChoices} onOpenChange={setShowChoices}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-center text-xl">Choose Your Chance</DialogTitle>
            <DialogDescription className="text-center">
              {isLoggedIn ? "Select which chance to use for your trading cycle" : "You have 2 chances to start cycles. Select one to begin."}
            </DialogDescription>
          </DialogHeader>
          
          {bothUsed && isLoggedIn ? <div className="text-center py-6 space-y-3">
              <AlertTriangle className="w-12 h-12 text-destructive mx-auto" />
              <p className="text-destructive font-medium">No Chances Available</p>
              <p className="text-sm text-muted-foreground">
                You've used both chances. Please wait for the next reset to start again.
              </p>
            </div> : <div className="grid gap-4 py-4">
              <Button variant="outline" className={cn("h-28 flex flex-col gap-2 transition-all relative", isLoggedIn && !canSelectChance(chance1Status) && "opacity-50", canSelectChance(chance1Status) && "hover:bg-primary/10 hover:border-primary")} onClick={() => handleChanceSelect(1)} disabled={isLoggedIn && !canSelectChance(chance1Status)}>
                {isLoggedIn && <div className="absolute top-2 right-2 flex items-center gap-1">
                    {getStatusIcon(chance1Status)}
                    <Badge variant="outline" className="text-xs">
                      {getStatusLabel(chance1Status)}
                    </Badge>
                  </div>}
                <div className="p-2 bg-yellow-500/10 rounded-full">
                  <Zap className="w-6 h-6 text-yellow-500" />
                </div>
                <span className="font-semibold text-lg">Chance 1</span>
                <span className="text-xs text-muted-foreground">Start your journey</span>
              </Button>
              
              <Button variant="outline" className={cn("h-28 flex flex-col gap-2 transition-all relative", isLoggedIn && !canSelectChance(chance2Status) && "opacity-50", canSelectChance(chance2Status) && "hover:bg-primary/10 hover:border-primary")} onClick={() => handleChanceSelect(2)} disabled={isLoggedIn && !canSelectChance(chance2Status)}>
                {isLoggedIn && <div className="absolute top-2 right-2 flex items-center gap-1">
                    {getStatusIcon(chance2Status)}
                    <Badge variant="outline" className="text-xs">
                      {getStatusLabel(chance2Status)}
                    </Badge>
                  </div>}
                <div className="p-2 bg-purple-500/10 rounded-full">
                  <Star className="w-6 h-6 text-purple-500" />
                </div>
                <span className="font-semibold text-lg">Chance 2</span>
                <span className="text-xs text-muted-foreground">Alternative path</span>
              </Button>
            </div>}
        </DialogContent>
      </Dialog>
    </div>;
};
export default Landing;