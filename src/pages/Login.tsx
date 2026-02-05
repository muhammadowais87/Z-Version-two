import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import whaleLogo from "@/assets/logo.png";
import { isTelegramMiniApp } from "@/lib/telegram";
import { useTelegramAuth } from "@/hooks/useTelegramAuth";
import FloatingBlobs from "@/components/FloatingBlobs";

const Login = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isTelegram = isTelegramMiniApp();
  
  const {
    isLoading,
    isAuthenticated,
    error,
    needsReferral,
    retry,
    submitReferralCode,
  } = useTelegramAuth();

  const [referralInput, setReferralInput] = useState('');
  const [referralError, setReferralError] = useState<string | null>(null);

  // Check for existing session (for non-Telegram access)
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        navigate("/dashboard", { replace: true });
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) {
        navigate("/dashboard", { replace: true });
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  // Redirect when authenticated via Telegram
  useEffect(() => {
    if (isAuthenticated) {
      navigate("/dashboard", { replace: true });
    }
  }, [isAuthenticated, navigate]);

  // Handle referral code from URL
  useEffect(() => {
    const ref = searchParams.get('ref') || searchParams.get('referral');
    if (ref && needsReferral) {
      setReferralInput(ref.toUpperCase());
      submitReferralCode(ref);
    }
  }, [searchParams, needsReferral, submitReferralCode]);

  const handleReferralSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (referralInput.trim()) {
      setReferralError(null);
      await submitReferralCode(referralInput.trim());
    }
  };

  // Telegram Mini App: Show loading state
  if (isTelegram && isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center relative">
        <FloatingBlobs />
        <div className="text-center space-y-4 relative z-10">
          <img src={whaleLogo} alt="HyperliquidWhale" className="w-20 h-20 mx-auto" />
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
          <p className="text-foreground/70">Authenticating...</p>
        </div>
      </div>
    );
  }

  // Telegram Mini App: Show referral input for new users
  if (isTelegram && needsReferral) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 relative">
        <FloatingBlobs />
        <Card className="max-w-md w-full border-primary/20 bg-card/80 backdrop-blur-sm relative z-10">
          <CardHeader className="text-center">
            <img src={whaleLogo} alt="HyperliquidWhale" className="w-20 h-20 mx-auto mb-4" />
            <CardTitle className="text-2xl">Welcome!</CardTitle>
            <CardDescription>
              Enter a referral code to create your account
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleReferralSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="referral">Referral Code</Label>
                <Input
                  id="referral"
                  type="text"
                  placeholder="WHALE1234"
                  value={referralInput}
                  onChange={(e) => setReferralInput(e.target.value.toUpperCase())}
                  className="font-mono"
                  disabled={isLoading}
                />
                {(referralError || error) && (
                  <p className="text-sm text-destructive">{referralError || error}</p>
                )}
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={!referralInput.trim() || isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Joining...
                  </>
                ) : (
                  'Join Now'
                )}
              </Button>
              <p className="text-xs text-center text-muted-foreground">
                Don't have a code? Ask an existing member to invite you.
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Telegram Mini App: Show error state
  if (isTelegram && error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 relative">
        <FloatingBlobs />
        <Card className="max-w-md w-full border-destructive/20 bg-card/80 backdrop-blur-sm relative z-10">
          <CardHeader className="text-center">
            <img src={whaleLogo} alt="HyperliquidWhale" className="w-20 h-20 mx-auto mb-4" />
            <CardTitle className="text-xl text-destructive">Authentication Error</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full" onClick={retry}>
              Try Again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Outside Telegram: Show instructions to open in Telegram
  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative">
      <FloatingBlobs />
      <Card className="max-w-md w-full border-primary/20 bg-card/80 backdrop-blur-sm relative z-10">
        <CardHeader className="text-center">
          <img src={whaleLogo} alt="HyperliquidWhale" className="w-20 h-20 mx-auto mb-4" />
          <CardTitle className="text-2xl">Welcome to HyperliquidWhale</CardTitle>
          <CardDescription>
            Open this app inside Telegram to login
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="bg-muted/50 rounded-lg p-4 space-y-3">
            <h4 className="font-medium">How to access:</h4>
            <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
              <li>Open Telegram on your device</li>
              <li>Search for <span className="font-mono text-primary">@HyperliquidWhale_BOT</span></li>
              <li>Start the bot and tap "Open App"</li>
              <li>You'll be automatically logged in</li>
            </ol>
          </div>

          <Button 
            className="w-full" 
            size="lg"
            onClick={() => window.open('https://t.me/HyperliquidWhale_BOT', '_blank')}
          >
            <Send className="mr-2 h-4 w-4" />
            Open Telegram Bot
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            This app requires Telegram for secure authentication
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default Login;
