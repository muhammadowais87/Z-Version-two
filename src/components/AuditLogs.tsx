import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, AlertCircle, Filter, DollarSign, UserX, CheckCircle, XCircle, Clock } from "lucide-react";
import { useState } from "react";

interface AuditLog {
  id: string;
  admin_id: string;
  action_type: string;
  target_type: string;
  target_id: string | null;
  details: Record<string, any>;
  created_at: string;
}

interface AdminProfile {
  id: string;
  email: string;
}

const AuditLogs = () => {
  const [filterAction, setFilterAction] = useState<string>("all");

  const { data: auditLogs, isLoading } = useQuery({
    queryKey: ["auditLogs", filterAction],
    queryFn: async () => {
      let query = supabase
        .from("audit_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);

      if (filterAction !== "all") {
        query = query.eq("action_type", filterAction);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as AuditLog[];
    },
  });

  const { data: adminProfiles } = useQuery({
    queryKey: ["adminProfiles"],
    queryFn: async () => {
      if (!auditLogs) return {};
      
      const adminIds = [...new Set(auditLogs.map(log => log.admin_id))];
      const { data, error } = await supabase
        .from("profiles")
        .select("id, email")
        .in("id", adminIds);

      if (error) throw error;
      
      return (data as AdminProfile[]).reduce((acc, profile) => {
        acc[profile.id] = profile.email;
        return acc;
      }, {} as Record<string, string>);
    },
    enabled: !!auditLogs && auditLogs.length > 0,
  });

  const getActionBadgeColor = (actionType: string) => {
    if (actionType.includes("APPROVE")) return "default";
    if (actionType.includes("REJECT")) return "destructive";
    if (actionType.includes("DELETE")) return "destructive";
    if (actionType.includes("ADD") || actionType.includes("MANUAL")) return "secondary";
    return "outline";
  };

  const formatActionType = (actionType: string) => {
    return actionType
      .split("_")
      .map(word => word.charAt(0) + word.slice(1).toLowerCase())
      .join(" ");
  };

  const formatDetails = (action: string, details: Record<string, any>) => {
    switch (action) {
      case "APPROVE_DEPOSIT":
      case "REJECT_DEPOSIT":
        return `Amount: $${Number(details.amount).toFixed(2)}${
          details.reason ? ` | Reason: ${details.reason}` : ""
        }`;
      case "APPROVE_WITHDRAWAL":
      case "REJECT_WITHDRAWAL":
        return `Amount: $${Number(details.amount).toFixed(2)}${
          details.wallet_address ? ` | To: ${details.wallet_address.slice(0, 10)}...${details.wallet_address.slice(-8)}` : ""
        }${details.reason ? ` | Reason: ${details.reason}` : ""}`;
      case "MARK_WITHDRAWAL_PAID":
        return `Amount: $${Number(details.amount).toFixed(2)}`;
      case "ADD_MANUAL_DEPOSIT":
        return `Amount: $${Number(details.amount).toFixed(2)}${
          details.notes ? ` | Notes: ${details.notes}` : ""
        }`;
      case "DELETE_USER":
        return `Email: ${details.email}`;
      default:
        const entries = Object.entries(details);
        if (entries.length === 0) return "-";
        return entries
          .map(([key, value]) => `${key}: ${value}`)
          .join(", ");
    }
  };

  const getActionIcon = (actionType: string) => {
    if (actionType.includes("APPROVE")) return CheckCircle;
    if (actionType.includes("REJECT")) return XCircle;
    if (actionType.includes("DELETE")) return UserX;
    if (actionType.includes("DEPOSIT") || actionType.includes("WITHDRAWAL")) return DollarSign;
    return FileText;
  };

  if (isLoading) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </Card>
    );
  }

  if (!auditLogs || auditLogs.length === 0) {
    return (
      <Card className="p-6">
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <AlertCircle className="w-12 h-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No Audit Logs</h3>
          <p className="text-sm text-muted-foreground">
            Admin actions will appear here once they are performed.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <FileText className="w-6 h-6 text-primary" />
          <h2 className="text-2xl font-bold">Audit Logs</h2>
          <Badge variant="secondary">
            {auditLogs.length} records
          </Badge>
        </div>
        
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <Select value={filterAction} onValueChange={setFilterAction}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Filter by action" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Actions</SelectItem>
              <SelectItem value="APPROVE_DEPOSIT">Approve Deposit</SelectItem>
              <SelectItem value="REJECT_DEPOSIT">Reject Deposit</SelectItem>
              <SelectItem value="APPROVE_WITHDRAWAL">Approve Withdrawal</SelectItem>
              <SelectItem value="REJECT_WITHDRAWAL">Reject Withdrawal</SelectItem>
              <SelectItem value="MARK_WITHDRAWAL_PAID">Mark Paid</SelectItem>
              <SelectItem value="ADD_MANUAL_DEPOSIT">Manual Deposit</SelectItem>
              <SelectItem value="DELETE_USER">Delete User</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      
      <ScrollArea className="h-[600px]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[50px]"></TableHead>
              <TableHead className="w-[180px]">Timestamp</TableHead>
              <TableHead>Admin</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {auditLogs.map((log) => {
              const ActionIcon = getActionIcon(log.action_type);
              return (
                <TableRow key={log.id} className="hover:bg-muted/50">
                  <TableCell>
                    <div className={`p-2 rounded-lg ${
                      log.action_type.includes("APPROVE") ? "bg-green-500/10" :
                      log.action_type.includes("REJECT") ? "bg-red-500/10" :
                      log.action_type.includes("DELETE") ? "bg-orange-500/10" :
                      "bg-blue-500/10"
                    }`}>
                      <ActionIcon className={`w-4 h-4 ${
                        log.action_type.includes("APPROVE") ? "text-green-500" :
                        log.action_type.includes("REJECT") ? "text-red-500" :
                        log.action_type.includes("DELETE") ? "text-orange-500" :
                        "text-blue-500"
                      }`} />
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-muted-foreground" />
                      {new Date(log.created_at).toLocaleString()}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm font-medium">
                    {adminProfiles?.[log.admin_id] || log.admin_id.slice(0, 8)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={getActionBadgeColor(log.action_type)}>
                      {formatActionType(log.action_type)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-foreground">
                    {formatDetails(log.action_type, log.details)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </ScrollArea>
    </Card>
  );
};

export default AuditLogs;
