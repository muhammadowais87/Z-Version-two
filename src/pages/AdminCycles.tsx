import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import BottomNav from "@/components/BottomNav";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { 
  CheckCircle, 
  XCircle, 
  Clock, 
  TrendingUp, 
  Settings,
  AlertTriangle,
  Play,
  Save,
  RefreshCw,
  Search
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Separator } from "@/components/ui/separator";

const CYCLE_NAMES: Record<number, string> = {
  1: "Cycle 1",
  2: "Cycle 2",
  3: "Cycle 3",
  4: "Special",
};

interface SystemConfig {
  cycle_time_unit: string;
  cycle_1_duration: string;
  cycle_2_duration: string;
  cycle_3_duration: string;
  cycle_4_duration: string;
  profit_multiplier: string;
  penalty_daily_return: string;
}

const AdminCycles = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>('active');
  const [mainTab, setMainTab] = useState<string>('cycles');
  const [searchQuery, setSearchQuery] = useState<string>('');
  
  // Settings state
  const [settings, setSettings] = useState<SystemConfig>({
    cycle_time_unit: 'seconds',
    cycle_1_duration: '25',
    cycle_2_duration: '18',
    cycle_3_duration: '14',
    cycle_4_duration: '14',
    profit_multiplier: '2',
    penalty_daily_return: '2'
  });

  // Fetch system config
  const { data: configData, isLoading: isLoadingConfig } = useQuery({
    queryKey: ['systemConfig'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('system_config')
        .select('key, value')
        .in('key', [
          'cycle_time_unit',
          'cycle_1_duration',
          'cycle_2_duration',
          'cycle_3_duration',
          'cycle_4_duration',
          'profit_multiplier',
          'penalty_daily_return'
        ]);
      if (error) throw error;
      return data;
    }
  });

  // Update settings state when config is fetched
  useEffect(() => {
    if (configData) {
      const newSettings: Partial<SystemConfig> = {};
      configData.forEach(item => {
        newSettings[item.key as keyof SystemConfig] = item.value;
      });
      setSettings(prev => ({ ...prev, ...newSettings }));
    }
  }, [configData]);

  // Save settings mutation
  const saveSettingsMutation = useMutation({
    mutationFn: async (newSettings: SystemConfig) => {
      const updates = Object.entries(newSettings).map(([key, value]) => ({
        key,
        value: String(value)
      }));
      
      for (const update of updates) {
        const { error } = await supabase
          .from('system_config')
          .update({ value: update.value, updated_at: new Date().toISOString() })
          .eq('key', update.key);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['systemConfig'] });
      toast({
        title: "Settings Saved",
        description: "System configuration has been updated successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to save settings",
        variant: "destructive",
      });
    }
  });

  // Fetch all cycles and stats
  const { data: cyclesData, isLoading } = useQuery({
    queryKey: ['adminCycles', statusFilter],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('admin-get-all-cycles', {
        body: { status: statusFilter }
      });
      if (error) throw error;
      return data;
    },
    staleTime: 30000, // Consider data stale after 30 seconds
  });

  const cycles = cyclesData?.cycles || [];
  const stats = cyclesData?.stats || {};

  // Filter cycles based on search query
  const filteredCycles = cycles.filter((cycle: any) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    const profile = Array.isArray(cycle.profiles) ? cycle.profiles[0] : cycle.profiles;
    const email = (profile?.email || '').toLowerCase();
    const referralCode = (profile?.referral_code || '').toLowerCase();
    const userId = (cycle.user_id || '').toLowerCase();
    return email.includes(query) || referralCode.includes(query) || userId.includes(query);
  });

  // Manually complete cycle
  const completeCycleMutation = useMutation({
    mutationFn: async (cycleId: string) => {
      const { data, error } = await supabase.functions.invoke('admin-complete-cycle', {
        body: { cycle_id: cycleId }
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminCycles'] });
      toast({
        title: "Cycle Completed",
        description: "The cycle has been manually completed and funds transferred.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to complete cycle",
        variant: "destructive",
      });
    }
  });

  // Manage penalty mode
  const managePenaltyMutation = useMutation({
    mutationFn: async ({ userId, enable }: { userId: string; enable: boolean }) => {
      const { data, error } = await supabase.functions.invoke('admin-manage-penalty', {
        body: { target_user_id: userId, enable_penalty: enable }
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminCycles'] });
      toast({
        title: "Penalty Mode Updated",
        description: "User penalty status has been changed.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update penalty mode",
        variant: "destructive",
      });
    }
  });

  const calculateProgress = (startDate: string, endDate: string) => {
    const start = new Date(startDate).getTime();
    const end = new Date(endDate).getTime();
    const now = Date.now();
    const progress = ((now - start) / (end - start)) * 100;
    return Math.min(Math.max(progress, 0), 100);
  };

  const handleSettingChange = (key: keyof SystemConfig, value: string) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const isTestMode = settings.cycle_time_unit === 'seconds';

  if (isLoading && isLoadingConfig) {
    return (
      <div className="min-h-screen bg-background pb-20 flex items-center justify-center">
        <div className="text-center">Loading admin panel...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <div className="bg-gradient-to-b from-primary to-primary/80 text-primary-foreground p-6 rounded-b-3xl shadow-lg">
        <h1 className="text-2xl font-bold mb-2">Whale Trade Admin</h1>
        <p className="text-sm opacity-90">Manage cycles and system configuration</p>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Main Tabs */}
        <Tabs value={mainTab} onValueChange={setMainTab}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="cycles" className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Cycles
            </TabsTrigger>
            <TabsTrigger value="settings" className="flex items-center gap-2">
              <Settings className="w-4 h-4" />
              Settings
            </TabsTrigger>
          </TabsList>

          {/* Settings Tab */}
          <TabsContent value="settings" className="space-y-6 mt-6">
            {/* Mode Toggle */}
            <Card className={isTestMode ? "border-warning border-2" : "border-success border-2"}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      {isTestMode ? (
                        <AlertTriangle className="w-5 h-5 text-warning" />
                      ) : (
                        <CheckCircle className="w-5 h-5 text-success" />
                      )}
                      System Mode
                    </CardTitle>
                    <CardDescription>
                      {isTestMode 
                        ? "⚠️ TEST MODE: Cycles use SECONDS for quick testing" 
                        : "✅ PRODUCTION MODE: Cycles use DAYS for real operation"}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-sm font-medium ${!isTestMode ? 'text-success' : 'text-muted-foreground'}`}>
                      Production
                    </span>
                    <Switch
                      checked={isTestMode}
                      onCheckedChange={(checked) => handleSettingChange('cycle_time_unit', checked ? 'seconds' : 'days')}
                    />
                    <span className={`text-sm font-medium ${isTestMode ? 'text-warning' : 'text-muted-foreground'}`}>
                      Test Mode
                    </span>
                  </div>
                </div>
              </CardHeader>
            </Card>

            {/* Cycle Durations */}
            <Card>
              <CardHeader>
                <CardTitle>Cycle Durations</CardTitle>
                <CardDescription>
                  Set the duration for each cycle type (in {isTestMode ? 'seconds' : 'days'})
                </CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="cycle_1">Cycle 1</Label>
                  <Input
                    id="cycle_1"
                    type="number"
                    value={settings.cycle_1_duration}
                    onChange={(e) => handleSettingChange('cycle_1_duration', e.target.value)}
                    min="1"
                  />
                  <p className="text-xs text-muted-foreground">
                    {settings.cycle_1_duration} {isTestMode ? 'seconds' : 'days'}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cycle_2">Cycle 2</Label>
                  <Input
                    id="cycle_2"
                    type="number"
                    value={settings.cycle_2_duration}
                    onChange={(e) => handleSettingChange('cycle_2_duration', e.target.value)}
                    min="1"
                  />
                  <p className="text-xs text-muted-foreground">
                    {settings.cycle_2_duration} {isTestMode ? 'seconds' : 'days'}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cycle_3">Cycle 3</Label>
                  <Input
                    id="cycle_3"
                    type="number"
                    value={settings.cycle_3_duration}
                    onChange={(e) => handleSettingChange('cycle_3_duration', e.target.value)}
                    min="1"
                  />
                  <p className="text-xs text-muted-foreground">
                    {settings.cycle_3_duration} {isTestMode ? 'seconds' : 'days'}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cycle_4">Special Cycle</Label>
                  <Input
                    id="cycle_4"
                    type="number"
                    value={settings.cycle_4_duration}
                    onChange={(e) => handleSettingChange('cycle_4_duration', e.target.value)}
                    min="1"
                  />
                  <p className="text-xs text-muted-foreground">
                    {settings.cycle_4_duration} {isTestMode ? 'seconds' : 'days'}
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Profit Settings */}
            <Card>
              <CardHeader>
                <CardTitle>Profit Configuration</CardTitle>
                <CardDescription>
                  Configure profit multiplier and penalty mode returns
                </CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="profit_multiplier">Profit Multiplier</Label>
                  <Input
                    id="profit_multiplier"
                    type="number"
                    step="0.1"
                    value={settings.profit_multiplier}
                    onChange={(e) => handleSettingChange('profit_multiplier', e.target.value)}
                    min="1"
                  />
                  <p className="text-xs text-muted-foreground">
                    {settings.profit_multiplier}x = {((parseFloat(settings.profit_multiplier) - 1) * 100).toFixed(0)}% profit
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="penalty_daily_return">Penalty Mode Return (%)</Label>
                  <Input
                    id="penalty_daily_return"
                    type="number"
                    step="0.1"
                    value={settings.penalty_daily_return}
                    onChange={(e) => handleSettingChange('penalty_daily_return', e.target.value)}
                    min="0"
                  />
                  <p className="text-xs text-muted-foreground">
                    {settings.penalty_daily_return}% per {isTestMode ? 'second' : 'day'} in penalty
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Save Button */}
            <Button 
              onClick={() => saveSettingsMutation.mutate(settings)}
              disabled={saveSettingsMutation.isPending}
              className="w-full"
              size="lg"
            >
              {saveSettingsMutation.isPending ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Save All Settings
                </>
              )}
            </Button>
          </TabsContent>

          {/* Cycles Tab */}
          <TabsContent value="cycles" className="space-y-6 mt-6">
            {/* System Statistics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Clock className="w-4 h-4 text-primary" />
                    Active
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold">{stats.total_active || 0}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    ${Number(stats.total_invested || 0).toFixed(2)} invested
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-success" />
                    Completed
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold">{stats.total_completed || 0}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    ${Number(stats.total_profit_paid || 0).toFixed(2)} profit paid
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <XCircle className="w-4 h-4 text-destructive" />
                    Broken
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold">{stats.total_broken || 0}</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-warning" />
                    Penalty Mode
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold">{stats.users_in_penalty || 0}</p>
                  <p className="text-xs text-muted-foreground mt-1">users affected</p>
                </CardContent>
              </Card>
            </div>

            {/* Cycle Type Breakdown */}
            <Card>
              <CardHeader>
                <CardTitle>Active Cycles by Type</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-4 gap-4">
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground">Cycle 1</p>
                    <p className="text-2xl font-bold text-primary">{stats.cycle_1_active || 0}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground">Cycle 2</p>
                    <p className="text-2xl font-bold text-primary">{stats.cycle_2_active || 0}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground">Cycle 3</p>
                    <p className="text-2xl font-bold text-primary">{stats.cycle_3_active || 0}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground">Special</p>
                    <p className="text-2xl font-bold text-primary">{stats.cycle_4_active || 0}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Cycles List */}
            <Card>
              <CardHeader>
                <CardTitle>Cycle Management</CardTitle>
                <CardDescription>Monitor and manage user trading cycles</CardDescription>
              </CardHeader>
              <CardContent>
                <Tabs value={statusFilter} onValueChange={setStatusFilter}>
                  <TabsList className="grid w-full grid-cols-4">
                    <TabsTrigger value="all">All</TabsTrigger>
                    <TabsTrigger value="active">Active</TabsTrigger>
                    <TabsTrigger value="completed">Completed</TabsTrigger>
                    <TabsTrigger value="broken">Broken</TabsTrigger>
                  </TabsList>

                  {/* Search Bar */}
                  <div className="relative mt-4 mb-4">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                    <Input
                      placeholder="Search by email, referral code, or user ID..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10"
                    />
                  </div>

                  <TabsContent value={statusFilter} className="space-y-4 mt-4">
                    {filteredCycles.length === 0 ? (
                      <Alert>
                        <AlertDescription>
                          {searchQuery ? `No cycles found matching "${searchQuery}"` : `No cycles found with status: ${statusFilter}`}
                        </AlertDescription>
                      </Alert>
                    ) : (
                      filteredCycles.map((cycle: any) => {
                        const profile = Array.isArray(cycle.profiles) ? cycle.profiles[0] : cycle.profiles;
                        const progress = cycle.status === 'active' ? calculateProgress(cycle.start_date, cycle.end_date) : 100;
                        const timeUnit = settings.cycle_time_unit === 'seconds' ? 's' : 'd';
                        const expectedProfit = Number(cycle.investment_amount) * (parseFloat(settings.profit_multiplier) - 1);
                        
                        return (
                          <Card key={cycle.id} className="border-l-4 border-l-primary">
                            <CardHeader>
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-2">
                                    <Badge variant={
                                      cycle.status === 'active' ? 'default' : 
                                      cycle.status === 'completed' ? 'secondary' : 
                                      'destructive'
                                    }>
                                      {CYCLE_NAMES[cycle.cycle_type]} ({settings[`cycle_${cycle.cycle_type}_duration` as keyof SystemConfig]}{timeUnit})
                                    </Badge>
                                    <Badge variant="outline">
                                      {cycle.status}
                                    </Badge>
                                  </div>
                                  <CardTitle className="text-lg">
                                    {profile?.email || 'Unknown User'}
                                  </CardTitle>
                                  <CardDescription className="mt-1">
                                    Started: {format(new Date(cycle.start_date), 'MMM d, yyyy HH:mm:ss')}
                                    {cycle.status === 'active' && (
                                      <> • Ends: {format(new Date(cycle.end_date), 'MMM d, yyyy HH:mm:ss')}</>
                                    )}
                                  </CardDescription>
                                </div>
                                <div className="text-right">
                                  <p className="text-sm text-muted-foreground">Investment</p>
                                  <p className="text-xl font-bold">${Number(cycle.investment_amount).toFixed(2)}</p>
                                  <p className="text-sm text-success font-semibold">
                                    +${Number(cycle.current_profit || 0).toFixed(2)} profit
                                  </p>
                                </div>
                              </div>
                            </CardHeader>
                            <CardContent className="space-y-4">
                              {cycle.status === 'active' && (
                                <div>
                                  <div className="flex justify-between text-sm mb-2">
                                    <span>Progress</span>
                                    <span>{progress.toFixed(1)}%</span>
                                  </div>
                                  <div className="w-full bg-secondary rounded-full h-2">
                                    <div 
                                      className="bg-primary h-2 rounded-full transition-all"
                                      style={{ width: `${progress}%` }}
                                    />
                                  </div>
                                </div>
                              )}

                              <div className="grid grid-cols-3 gap-4 text-sm">
                                <div>
                                  <p className="text-muted-foreground">Current Profit</p>
                                  <p className="font-semibold text-success">
                                    +${Number(cycle.current_profit || 0).toFixed(2)}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-muted-foreground">User Balance</p>
                                  <p className="font-semibold">
                                    ${Number(profile?.wallet_balance || 0).toFixed(2)}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-muted-foreground">User ID</p>
                                  <p className="font-mono text-xs">
                                    {cycle.user_id.slice(0, 8)}...
                                  </p>
                                </div>
                              </div>

                              {cycle.status === 'active' && (
                                <>
                                  <Separator />
                                  <div className="flex gap-2">
                                    <Button
                                      onClick={() => completeCycleMutation.mutate(cycle.id)}
                                      disabled={completeCycleMutation.isPending}
                                      size="sm"
                                      className="flex-1"
                                    >
                                      <Play className="w-4 h-4 mr-2" />
                                      Complete Now
                                    </Button>
                                  </div>
                                </>
                              )}
                            </CardContent>
                          </Card>
                        );
                      })
                    )}
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <BottomNav />
    </div>
  );
};

export default AdminCycles;