import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, User, Edit, Eye, X } from "lucide-react";
import UserDetailsDialog from "./UserDetailsDialog";

interface UserSearchCardProps {
  users: any[] | undefined;
  isLoading: boolean;
}

const UserSearchCard = ({ users, isLoading }: UserSearchCardProps) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  // Fetch user's complete data when selected
  const { data: userData, isLoading: isLoadingUserData } = useQuery({
    queryKey: ["admin-user-details", selectedUser?.id],
    queryFn: async () => {
      if (!selectedUser?.id) return null;

      // Fetch all related data
      const [depositsRes, withdrawalsRes, cyclesRes, progressRes, referralsRes] = await Promise.all([
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
        supabase
          .from("referrals")
          .select("*")
          .eq("referrer_id", selectedUser.id),
      ]);

      return {
        deposits: depositsRes.data || [],
        withdrawals: withdrawalsRes.data || [],
        cycles: cyclesRes.data || [],
        progress: progressRes.data,
        referrals: referralsRes.data || [],
      };
    },
    enabled: !!selectedUser?.id,
  });

  const filteredUsers = users?.filter(user => {
    if (!searchQuery.trim()) return false;
    const query = searchQuery.toLowerCase();
    return (
      user.id.toLowerCase().includes(query) ||
      user.email.toLowerCase().includes(query) ||
      user.referral_code?.toLowerCase().includes(query)
    );
  });

  const handleSelectUser = (user: any) => {
    setSelectedUser(user);
    setShowDetails(true);
  };

  return (
    <>
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-background">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="w-5 h-5 text-primary" />
            Search User by ID / Email
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Enter User ID, Email, or Referral Code..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
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
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {filteredUsers.map((user: any) => (
                <div
                  key={user.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-card border hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <User className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">{user.email}</p>
                      <p className="text-xs text-muted-foreground font-mono">
                        {user.id.slice(0, 8)}...
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={user.isAdmin ? "default" : "secondary"}>
                      {user.isAdmin ? "Admin" : "User"}
                    </Badge>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleSelectUser(user)}
                    >
                      <Eye className="w-4 h-4 mr-1" />
                      View
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : searchQuery ? (
            <p className="text-center text-muted-foreground py-4">
              No users found matching "{searchQuery}"
            </p>
          ) : (
            <p className="text-center text-muted-foreground py-4">
              Start typing to search for users
            </p>
          )}
        </CardContent>
      </Card>

      <UserDetailsDialog
        open={showDetails}
        onOpenChange={setShowDetails}
        user={selectedUser}
        userData={userData}
        isLoading={isLoadingUserData}
      />
    </>
  );
};

export default UserSearchCard;
