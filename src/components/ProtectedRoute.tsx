import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useTelegramAuth } from "@/hooks/useTelegramAuth";
import { isTelegramMiniApp } from "@/lib/telegram";
import { Loader2 } from "lucide-react";
import whaleLogo from "@/assets/logo.png";
import ReferralCodeInput from "@/components/ReferralCodeInput";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [referralError, setReferralError] = useState<string | null>(null);
  const isTgApp = isTelegramMiniApp();
  const telegramAuth = useTelegramAuth();

  useEffect(() => {
    // If in Telegram Mini App, use Telegram auth state
    if (isTgApp) {
      if (!telegramAuth.isLoading) {
        setIsAuthenticated(telegramAuth.isAuthenticated);
      }
      return;
    }

    // For non-Telegram access, check Supabase session
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setIsAuthenticated(!!session);
    };

    checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(!!session);
    });

    return () => subscription.unsubscribe();
  }, [isTgApp, telegramAuth.isLoading, telegramAuth.isAuthenticated]);

  // Handle referral code submission
  const handleReferralSubmit = async (code: string) => {
    setReferralError(null);
    await telegramAuth.submitReferralCode(code);
    
    // Check for errors after submission
    if (telegramAuth.error) {
      setReferralError(telegramAuth.error);
    }
  };

  // Loading state
  if (isAuthenticated === null || (isTgApp && telegramAuth.isLoading)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5">
        <div className="text-center space-y-4">
          <img src={whaleLogo} alt="HyperliquidWhale" className="w-16 h-16 mx-auto" />
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
          <p className="text-muted-foreground text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  // Show referral code input for new Telegram users
  if (isTgApp && telegramAuth.needsReferral) {
    return (
      <ReferralCodeInput
        onSubmit={handleReferralSubmit}
        isLoading={telegramAuth.isLoading}
        error={referralError || telegramAuth.error}
      />
    );
  }

  // Redirect if not authenticated
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
