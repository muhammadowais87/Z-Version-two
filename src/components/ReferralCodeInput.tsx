import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Users } from 'lucide-react';
import whaleLogo from '@/assets/logo.png';

interface ReferralCodeInputProps {
  onSubmit: (code: string) => Promise<void>;
  isLoading: boolean;
  error?: string | null;
}

const ReferralCodeInput = ({ onSubmit, isLoading, error }: ReferralCodeInputProps) => {
  const [referralCode, setReferralCode] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (referralCode.trim()) {
      await onSubmit(referralCode.trim());
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 p-4">
      <Card className="w-full max-w-md border-border/50 bg-card/80 backdrop-blur-sm">
        <CardHeader className="text-center space-y-4">
          <img src={whaleLogo} alt="HyperliquidWhale" className="w-20 h-20 mx-auto" />
          <div>
            <CardTitle className="text-2xl font-bold text-foreground">Welcome!</CardTitle>
            <CardDescription className="text-muted-foreground mt-2">
              Enter your referral code to join HyperliquidWhale
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <div className="relative">
                <Users className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Enter referral code"
                  value={referralCode}
                  onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                  className="pl-10 bg-background/50 border-border/50"
                  disabled={isLoading}
                  autoFocus
                />
              </div>
              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={!referralCode.trim() || isLoading}
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
};

export default ReferralCodeInput;
