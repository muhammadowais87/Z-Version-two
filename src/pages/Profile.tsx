import BottomNav from "@/components/BottomNav";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { User, Mail, LogOut, Key, Copy } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";

const Profile = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [userId, setUserId] = useState<string | null>(null);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied!",
      description: `${label} copied to clipboard`,
    });
  };

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUserId(user?.id || null);
    });
  }, []);

  const { data: user } = useQuery({
    queryKey: ["currentUser"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      return user;
    },
    refetchInterval: 2000,
  });

  const { data: profile } = useQuery({
    queryKey: ["profile", userId],
    queryFn: async () => {
      if (!userId) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();
      
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
    refetchInterval: 2000,
  });

  const { data: downlineCounts } = useQuery({
    queryKey: ["downlineCounts", userId],
    queryFn: async () => {
      if (!userId) return { L1: 0, L2: 0, L3: 0, L4: 0, L5: 0, total: 0 };
      const { data, error } = await supabase
        .from("referrals")
        .select("level")
        .eq("referrer_id", userId);
      
      if (error) throw error;
      
      const counts = { L1: 0, L2: 0, L3: 0, L4: 0, L5: 0, total: 0 };
      data?.forEach(ref => {
        if (ref.level >= 1 && ref.level <= 5) {
          counts[`L${ref.level}` as keyof typeof counts]++;
          counts.total++;
        }
      });
      return counts;
    },
    enabled: !!userId,
    refetchInterval: 2000,
  });

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast({
        title: "Logout failed",
        description: error.message,
        variant: "destructive",
      });
      return;
    }
    toast({
      title: "Logged out",
      description: "See you soon!",
    });
    navigate("/login");
  };

  const getDaysActive = () => {
    if (!profile?.created_at) return 0;
    const created = new Date(profile.created_at);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - created.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <div className="bg-gradient-to-b from-primary to-primary/80 text-primary-foreground p-6 rounded-b-3xl shadow-lg">
        <div className="flex items-center gap-3 mb-4">
          <User className="w-6 h-6" />
          <h1 className="text-2xl font-bold">Profile</h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-16 h-16 bg-primary-foreground/20 rounded-full flex items-center justify-center">
            <User className="w-8 h-8" />
          </div>
          <div>
            <p className="font-semibold">@{profile?.telegram_username || user?.email?.split("@")[0] || "User"}</p>
            <p className="text-sm opacity-90">{profile?.telegram_username ? 'Telegram User' : user?.email || "Loading..."}</p>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
        <Card className="p-6 space-y-4">
          <h3 className="font-semibold text-foreground">Account Information</h3>
          
          <div className="space-y-2">
            <Label htmlFor="username">Telegram Username</Label>
            <div className="flex gap-2">
              <Mail className="w-5 h-5 text-muted-foreground mt-2" />
              <Input
                id="username"
                type="text"
                value={profile?.telegram_username ? `@${profile.telegram_username}` : 'Not set'}
                readOnly
                className="flex-1"
              />
              <Button 
                size="icon" 
                variant="outline"
                onClick={() => copyToClipboard(profile?.telegram_username ? `@${profile.telegram_username}` : '', 'Username')}
                disabled={!profile?.telegram_username}
              >
                <Copy className="w-4 h-4" />
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="userid">User ID</Label>
            <div className="flex gap-2">
              <Key className="w-5 h-5 text-muted-foreground mt-2" />
              <Input
                id="userid"
                value={user?.id || ""}
                readOnly
                className="font-mono text-xs flex-1"
              />
              <Button 
                size="icon" 
                variant="outline"
                onClick={() => copyToClipboard(user?.id || '', 'User ID')}
                disabled={!user?.id}
              >
                <Copy className="w-4 h-4" />
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="referralcode">Referral Code</Label>
            <div className="flex gap-2">
              <Input
                id="referralcode"
                value={profile?.referral_code || ""}
                readOnly
                className="font-mono font-bold text-primary flex-1"
              />
              <Button 
                size="icon" 
                variant="outline"
                onClick={() => copyToClipboard(profile?.referral_code || '', 'Referral Code')}
                disabled={!profile?.referral_code}
              >
                <Copy className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <h3 className="font-semibold text-foreground mb-4">Account Stats</h3>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="text-center p-3 bg-secondary rounded-lg">
              <p className="text-2xl font-bold text-foreground">{getDaysActive()}</p>
              <p className="text-xs text-muted-foreground">Days Active</p>
            </div>
            <div className="text-center p-3 bg-secondary rounded-lg">
              <p className="text-2xl font-bold text-foreground">{downlineCounts?.total || 0}</p>
              <p className="text-xs text-muted-foreground">Total Downline</p>
            </div>
          </div>
          
          <h4 className="font-medium text-foreground mb-3 text-sm">Downline by Level</h4>
          <div className="grid grid-cols-5 gap-2">
            {[1, 2, 3, 4, 5].map((level) => (
              <div key={level} className="text-center p-2 bg-primary/10 rounded-lg">
                <p className="text-lg font-bold text-primary">{downlineCounts?.[`L${level}` as keyof typeof downlineCounts] || 0}</p>
                <p className="text-xs text-muted-foreground">L{level}</p>
              </div>
            ))}
          </div>
        </Card>

        <Button
          variant="destructive"
          className="w-full justify-start"
          onClick={handleLogout}
        >
          <LogOut className="w-4 h-4 mr-2" />
          Logout
        </Button>
      </div>

      <BottomNav />
    </div>
  );
};

export default Profile;