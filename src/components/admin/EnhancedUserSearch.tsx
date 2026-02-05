import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Search, User, Eye, X, Users, ArrowUpRight, ArrowDownRight,
  ChevronDown, ChevronUp, Filter
} from "lucide-react";
import EnhancedUserDetailsDialog from "./EnhancedUserDetailsDialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface EnhancedUserSearchProps {
  users: any[] | undefined;
  isLoading: boolean;
}

const EnhancedUserSearch = ({ users, isLoading }: EnhancedUserSearchProps) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchType, setSearchType] = useState<"all" | "email" | "referral_code" | "referred_by">("all");
  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  // Fetch user's complete data including upline and downline when selected
  const { data: userData, isLoading: isLoadingUserData } = useQuery({
    queryKey: ["admin-user-details-enhanced", selectedUser?.id],
    queryFn: async () => {
      if (!selectedUser?.id) return null;

      // First fetch the latest profile data to ensure we have up-to-date referral codes
      const { data: latestProfile, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", selectedUser.id)
        .maybeSingle();
      
      if (profileError) throw profileError;
      if (!latestProfile) return null;

      // Fetch all related data in parallel
      const [
        depositsRes, 
        withdrawalsRes, 
        cyclesRes, 
        progressRes, 
        downlineRes,
        earningsHistoryRes,
        transfersRes
      ] = await Promise.all([
        supabase
          .from("deposits")
          .select("*")
          .eq("user_id", selectedUser.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("withdrawals")
          .select("*")
          .eq("user_id", selectedUser.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("ai_trade_cycles")
          .select("*")
          .eq("user_id", selectedUser.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("user_trade_progress")
          .select("*")
          .eq("user_id", selectedUser.id)
          .maybeSingle(),
        // Get downline (users referred by this user)
        supabase
          .from("referrals")
          .select(`
            id,
            referred_id,
            level,
            created_at
          `)
          .eq("referrer_id", selectedUser.id)
          .order("level", { ascending: true }),
        // Get referral earnings history with referred user info
        supabase
          .from("referral_earnings_history")
          .select(`
            *,
            referred:profiles!referral_earnings_history_referred_id_fkey(
              email,
              telegram_username,
              telegram_first_name
            )
          `)
          .eq("referrer_id", selectedUser.id)
          .order("created_at", { ascending: false })
          .limit(50),
        // Get wallet transfers
        supabase
          .from("wallet_transfers")
          .select("*")
          .eq("user_id", selectedUser.id)
          .order("created_at", { ascending: false }),
      ]);

      // Fetch downline user details
      let downlineUsers: any[] = [];
      if (downlineRes.data && downlineRes.data.length > 0) {
        const downlineIds = downlineRes.data.map(r => r.referred_id);
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, email, referral_code, referred_by_code, total_deposits, total_profit, wallet_balance, created_at, telegram_username")
          .in("id", downlineIds);
        
        downlineUsers = downlineRes.data.map(ref => ({
          ...ref,
          profile: profiles?.find(p => p.id === ref.referred_id)
        }));
      }

      // Fetch upline using the latest profile's referred_by_code
      let uplineUsers: any[] = [];
      if (latestProfile.referred_by_code) {
        // First find the direct referrer by code
        const { data: referrer } = await supabase
          .from("profiles")
          .select("id, email, referral_code, referred_by_code, telegram_username")
          .eq("referral_code", latestProfile.referred_by_code)
          .maybeSingle();
        
        if (referrer) {
          uplineUsers.push({ level: 1, profile: referrer });
          
          // Get the upline chain (up to 5 levels)
          let currentReferredCode = referrer.referred_by_code;
          let level = 2;
          while (currentReferredCode && level <= 5) {
            const { data: upperReferrer } = await supabase
              .from("profiles")
              .select("id, email, referral_code, referred_by_code, telegram_username")
              .eq("referral_code", currentReferredCode)
              .maybeSingle();
            
            if (upperReferrer) {
              uplineUsers.push({ level, profile: upperReferrer });
              currentReferredCode = upperReferrer.referred_by_code;
              level++;
            } else {
              break;
            }
          }
        }
      }

      return {
        deposits: depositsRes.data || [],
        withdrawals: withdrawalsRes.data || [],
        cycles: cyclesRes.data || [],
        progress: progressRes.data,
        downline: downlineUsers,
        upline: uplineUsers,
        earningsHistory: earningsHistoryRes.data || [],
        transfers: transfersRes.data || [],
        latestProfile, // Include the latest profile data
      };
    },
    enabled: !!selectedUser?.id,
  });

  const filteredUsers = users?.filter(user => {
    if (!searchQuery.trim()) return false;
    const query = searchQuery.toLowerCase();
    
    switch (searchType) {
      case "email":
        return user.email.toLowerCase().includes(query);
      case "referral_code":
        return user.referral_code?.toLowerCase().includes(query);
      case "referred_by":
        return user.referred_by_code?.toLowerCase().includes(query);
      default:
        return (
          user.id.toLowerCase().includes(query) ||
          user.email.toLowerCase().includes(query) ||
          user.referral_code?.toLowerCase().includes(query) ||
          user.referred_by_code?.toLowerCase().includes(query) ||
          user.telegram_username?.toLowerCase().includes(query)
        );
    }
  });

  const handleSelectUser = (user: any) => {
    setSelectedUser(user);
    setShowDetails(true);
  };

  return (
    <>
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-background">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Search className="w-5 h-5 text-primary" />
              Advanced User Search
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
            >
              <Filter className="w-4 h-4 mr-1" />
              {showFilters ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {showFilters && (
            <div className="flex gap-2">
              <Select value={searchType} onValueChange={(v: any) => setSearchType(v)}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Search by..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Fields</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="referral_code">Referral Code</SelectItem>
                  <SelectItem value="referred_by">Referred By Code</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by ID, Email, Referral Code, Referred By..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-10"
            />
            {searchQuery && (
              <Button
                variant="ghost"
                size="sm"
                className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 p-0"
                onClick={() => setSearchQuery("")}
              >
                <X className="w-4 h-4" />
              </Button>
            )}
          </div>

          {isLoading ? (
            <div className="flex justify-center p-4">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
            </div>
          ) : filteredUsers && filteredUsers.length > 0 ? (
            <ScrollArea className="h-80">
              <div className="space-y-2 pr-2">
                {filteredUsers.map((user: any) => (
                  <div
                    key={user.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-card border hover:bg-accent/50 transition-colors cursor-pointer"
                    onClick={() => handleSelectUser(user)}
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        {user.telegram_photo_url ? (
                          <img src={user.telegram_photo_url} alt="" className="w-10 h-10 rounded-full" />
                        ) : (
                          <User className="w-5 h-5 text-primary" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm truncate">
                          {user.telegram_first_name || user.email}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="font-mono">{user.referral_code}</span>
                          {user.referred_by_code && (
                            <span className="flex items-center gap-1">
                              <ArrowUpRight className="w-3 h-3" />
                              {user.referred_by_code}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="text-right hidden sm:block">
                        <p className="text-sm font-medium text-green-400">
                          ${Number(user.wallet_balance || 0).toFixed(2)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Deposits: ${Number(user.total_deposits || 0).toFixed(0)}
                        </p>
                      </div>
                      <Badge variant={user.isAdmin ? "default" : "secondary"} className="shrink-0">
                        {user.isAdmin ? "Admin" : "User"}
                      </Badge>
                      <Button size="sm" variant="outline" className="shrink-0">
                        <Eye className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          ) : searchQuery ? (
            <p className="text-center text-muted-foreground py-4">
              No users found matching "{searchQuery}"
            </p>
          ) : (
            <p className="text-center text-muted-foreground py-4">
              Start typing to search for users by ID, Email, or Referral Code
            </p>
          )}
        </CardContent>
      </Card>

      <EnhancedUserDetailsDialog
        open={showDetails}
        onOpenChange={setShowDetails}
        user={userData?.latestProfile || selectedUser}
        userData={userData}
        isLoading={isLoadingUserData}
        allUsers={users}
        onSelectUser={handleSelectUser}
      />
    </>
  );
};

export default EnhancedUserSearch;
