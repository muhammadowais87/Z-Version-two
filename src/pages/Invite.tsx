import BottomNav from "@/components/BottomNav";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Share2, Copy, Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";

const Invite = () => {
  const { toast } = useToast();
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const getUserId = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUserId(user?.id || null);
    };
    getUserId();
  }, []);

  const { data: profile } = useQuery({
    queryKey: ["profile", userId],
    queryFn: async () => {
      if (!userId) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("referral_code")
        .eq("id", userId)
        .single();
      
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
    staleTime: 5000,
  });

  const { data: botConfig } = useQuery({
    queryKey: ["telegram_bot"],
    queryFn: async () => {
      const { data } = await supabase
        .from("system_config")
        .select("value")
        .eq("key", "telegram_bot_username")
        .maybeSingle();
      
      return data?.value || "HyperliquidWhale_BOT";
    },
    staleTime: 60000,
    retry: false,
  });

  const referralCode = profile?.referral_code || "LOADING...";
  const botUsername = botConfig || "HyperliquidWhale_BOT";
  const referralLink = `https://t.me/${botUsername}?start=${referralCode}`;

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied!",
      description: `${label} copied to clipboard`,
    });
  };

  const shareReferral = () => {
    if (navigator.share) {
      navigator.share({
        title: "Join HyperliquidWhale",
        text: "Start your whale trading journey with me!",
        url: referralLink,
      });
    } else {
      copyToClipboard(referralLink, "Referral link");
    }
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <div className="bg-gradient-to-b from-primary to-primary/80 text-primary-foreground p-6 rounded-b-3xl shadow-lg">
        <div className="flex items-center gap-3 mb-4">
          <Share2 className="w-6 h-6" />
          <h1 className="text-2xl font-bold">Invite Friends</h1>
        </div>
        <p className="text-sm opacity-90">
          Share your referral and earn up to 10% from your team
        </p>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
        <Card className="p-6 bg-gradient-to-br from-primary/5 to-primary/10">
          <div className="text-center space-y-4">
            <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center mx-auto">
              <Users className="w-8 h-8 text-primary-foreground" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-foreground mb-2">
                5-Level Referral System
              </h3>
              <div className="grid grid-cols-5 gap-2 text-center">
                <div className="bg-card p-2 rounded-lg">
                  <p className="text-xs text-muted-foreground">L1</p>
                  <p className="font-bold text-primary">10%</p>
                </div>
                <div className="bg-card p-2 rounded-lg">
                  <p className="text-xs text-muted-foreground">L2</p>
                  <p className="font-bold text-primary">4%</p>
                </div>
                <div className="bg-card p-2 rounded-lg">
                  <p className="text-xs text-muted-foreground">L3</p>
                  <p className="font-bold text-primary">2%</p>
                </div>
                <div className="bg-card p-2 rounded-lg">
                  <p className="text-xs text-muted-foreground">L4</p>
                  <p className="font-bold text-primary">1%</p>
                </div>
                <div className="bg-card p-2 rounded-lg">
                  <p className="text-xs text-muted-foreground">L5</p>
                  <p className="font-bold text-primary">1%</p>
                </div>
              </div>
            </div>
          </div>
        </Card>

        <Card className="p-6 space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              Your Referral Code
            </label>
            <div className="flex gap-2">
              <Input value={referralCode} readOnly className="font-mono" />
              <Button
                onClick={() => copyToClipboard(referralCode, "Referral code")}
                variant="outline"
              >
                <Copy className="w-4 h-4" />
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              Your Referral Link
            </label>
            <div className="flex gap-2">
              <Input value={referralLink} readOnly className="text-xs" />
              <Button
                onClick={() => copyToClipboard(referralLink, "Referral link")}
                variant="outline"
              >
                <Copy className="w-4 h-4" />
              </Button>
            </div>
          </div>

          <Button onClick={shareReferral} className="w-full" size="lg">
            <Share2 className="w-4 h-4 mr-2" />
            Share Referral
          </Button>
        </Card>

        <Card className="p-6">
          <h3 className="font-semibold text-foreground mb-3">
            How Referrals Work
          </h3>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-start gap-2">
              <span className="text-primary">•</span>
              <span>Invite friends using your unique referral code or link</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary">•</span>
              <span>Earn passive income from 5 levels of referrals</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary">•</span>
              <span>Track your team growth and earnings in real-time</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary">•</span>
              <span>Withdraw earnings anytime (minimum $10)</span>
            </li>
          </ul>
        </Card>
      </div>

      <BottomNav />
    </div>
  );
};

export default Invite;
