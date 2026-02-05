import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { 
  isTelegramMiniApp, 
  getTelegramUser, 
  getInitData, 
  getTelegramWebApp,
  TelegramUser,
  getReferralCodeFromStart
} from '@/lib/telegram';
import { useToast } from '@/hooks/use-toast';

interface TelegramAuthState {
  isLoading: boolean;
  isAuthenticated: boolean;
  isTelegramApp: boolean;
  telegramUser: TelegramUser | null;
  error: string | null;
  needsReferral: boolean;
}

const MAX_RETRIES = 5;
const INITIAL_RETRY_DELAY = 1000;

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const useTelegramAuth = () => {
  const [state, setState] = useState<TelegramAuthState>({
    isLoading: true,
    isAuthenticated: false,
    isTelegramApp: false,
    telegramUser: null,
    error: null,
    needsReferral: false
  });
  const { toast } = useToast();
  const retryCountRef = useRef(0);
  const manualReferralCodeRef = useRef<string | null>(null);

  const authenticateWithRetry = useCallback(async (retryCount = 0): Promise<boolean> => {
    try {
      const isTgApp = isTelegramMiniApp();
      
      if (!isTgApp) {
        console.log('Not running as Telegram Mini App');
        setState(prev => ({ 
          ...prev, 
          isLoading: false, 
          isTelegramApp: false,
          error: 'Please open this app from Telegram'
        }));
        return false;
      }
      
      // Tell Telegram we're ready
      const webApp = getTelegramWebApp();
      webApp?.ready();
      webApp?.expand();
      
      const telegramUser = getTelegramUser();
      const initData = getInitData();
      
      if (!telegramUser || !initData) {
        console.log('No Telegram user data available');
        setState(prev => ({ 
          ...prev, 
          isLoading: false,
          isTelegramApp: true,
          error: 'Failed to get Telegram user data'
        }));
        return false;
      }
      
      console.log('Telegram user detected:', telegramUser.id);
      
      // Check if already authenticated with Supabase
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session) {
        console.log('Already authenticated with Supabase');
        setState({
          isLoading: false,
          isAuthenticated: true,
          isTelegramApp: true,
          telegramUser,
          error: null,
          needsReferral: false
        });
        return true;
      }
      
      // Check for referral code - either from start_param or manually entered
      const startParamReferral = getReferralCodeFromStart();
      const referralCode = manualReferralCodeRef.current || startParamReferral;
      
      // Prepare initData with referral code if manually entered
      let authInitData = initData;
      if (manualReferralCodeRef.current && !startParamReferral) {
        // Append referral code to initData if not already present
        const params = new URLSearchParams(initData);
        if (!params.get('start_param')) {
          params.set('start_param', manualReferralCodeRef.current);
          // Need to recalculate hash - but since edge function uses original initData validation,
          // we'll pass referral separately
        }
      }
      
      // Authenticate with our edge function with timeout
      console.log(`Authenticating with Telegram... (attempt ${retryCount + 1}/${MAX_RETRIES})`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout
      
      try {
        const response = await supabase.functions.invoke('telegram-auth', {
          body: { 
            initData,
            referralCode: manualReferralCodeRef.current // Pass manual referral separately
          }
        });
        
        clearTimeout(timeoutId);
        
        const { data, error } = response;
        
        console.log('Auth response:', { data, error: error?.message || error });
        
        // Check for referral-related codes in data (even with error response)
        const responseCode = data?.code;
        if (responseCode === 'REFERRAL_REQUIRED' || responseCode === 'INVALID_REFERRAL') {
          console.log('Referral required/invalid, showing form');
          const errorMsg = responseCode === 'INVALID_REFERRAL' ? (data?.message || 'Invalid referral code') : null;
          setState(prev => ({ 
            ...prev, 
            isLoading: false,
            isTelegramApp: true,
            telegramUser,
            error: errorMsg,
            needsReferral: true
          }));
          return false;
        }
        
        // For FunctionsHttpError, the response body is in error.context
        if (error) {
          // Try to get the response body from the error
          let errorBody: any = null;
          try {
            if ((error as any).context?.json) {
              errorBody = await (error as any).context.json();
            } else if ((error as any).context) {
              errorBody = (error as any).context;
            }
          } catch (e) {
            console.log('Could not parse error context');
          }
          
          console.log('Error body:', errorBody);
          
          // Check if error body contains referral codes
          const errorCode = errorBody?.code || (error as any)?.code;
          if (errorCode === 'REFERRAL_REQUIRED' || errorCode === 'INVALID_REFERRAL') {
            console.log('Referral required/invalid from error body, showing form');
            const errorMsg = errorCode === 'INVALID_REFERRAL' ? (errorBody?.message || 'Invalid referral code') : null;
            setState(prev => ({ 
              ...prev, 
              isLoading: false,
              isTelegramApp: true,
              telegramUser,
              error: errorMsg,
              needsReferral: true
            }));
            return false;
          }
          
          // If no session, throw to retry logic
          if (!data?.session) {
            throw error;
          }
        }
        
        if (data?.session) {
          // Set the session directly from the edge function response
          const { error: setSessionError } = await supabase.auth.setSession({
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token
          });
          
          if (setSessionError) {
            console.error('Session set error:', setSessionError);
            throw setSessionError;
          }
          
          console.log('Successfully authenticated!');
          setState({
            isLoading: false,
            isAuthenticated: true,
            isTelegramApp: true,
            telegramUser,
            error: null,
            needsReferral: false
          });
          
          toast({
            title: "Welcome!",
            description: `Hello, ${telegramUser.first_name}!`
          });
          return true;
        } else {
          throw new Error('Invalid authentication response');
        }
      } catch (fetchError: any) {
        clearTimeout(timeoutId);
        
        // Check if it's a network error or timeout - retry
        const isNetworkError = 
          fetchError?.name === 'AbortError' ||
          fetchError?.message?.includes('network') ||
          fetchError?.message?.includes('timeout') ||
          fetchError?.message?.includes('Failed to fetch') ||
          fetchError?.code === 'ECONNREFUSED' ||
          fetchError?.code === 'ETIMEDOUT';
        
        if (isNetworkError && retryCount < MAX_RETRIES - 1) {
          const retryDelay = INITIAL_RETRY_DELAY * Math.pow(2, retryCount);
          console.log(`Network error, retrying in ${retryDelay}ms...`);
          
          setState(prev => ({
            ...prev,
            error: `Connection slow, retrying... (${retryCount + 1}/${MAX_RETRIES})`
          }));
          
          await delay(retryDelay);
          return authenticateWithRetry(retryCount + 1);
        }
        
        throw fetchError;
      }
    } catch (err: any) {
      console.error('Auth error:', err);
      
      const errorMessage = err?.message || 'Authentication error';
      
      setState(prev => ({ 
        ...prev, 
        isLoading: false,
        isTelegramApp: true,
        error: errorMessage
      }));
      
      return false;
    }
  }, [toast]);

  const authenticate = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true, error: null, needsReferral: false }));
    retryCountRef.current = 0;
    await authenticateWithRetry(0);
  }, [authenticateWithRetry]);

  const submitReferralCode = useCallback(async (code: string) => {
    manualReferralCodeRef.current = code;
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    await authenticateWithRetry(0);
  }, [authenticateWithRetry]);

  useEffect(() => {
    authenticate();
  }, [authenticate]);

  return {
    ...state,
    retry: authenticate,
    submitReferralCode
  };
};
