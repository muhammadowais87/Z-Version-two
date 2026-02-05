import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface MyPayVerseWallet {
  _id: string;
  userId: string;
  customerId: string;
  address: string;
  balance: number;
  incomeBalance: number;
  totalDeposit: number;
  totalSpent: number;
  totalFloatingBalance: number;
  withdrawLimitAmount: number;
  withdrawLimitCount: number;
  currentWithdrawLimitAmount: number;
  currentWithdrawLimitCount: number;
  isBlocked: boolean;
  createdAt: string;
  updatedAt: string;
}

interface MyPayVerseTransaction {
  _id: string;
  type: string;
  amount: number;
  status: string;
  createdAt: string;
}

export function useMyPayVerseWallet(userId: string | null) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch wallet details
  const { data: wallet, isLoading: isLoadingWallet, refetch: refetchWallet } = useQuery({
    queryKey: ["mypayverse-wallet", userId],
    queryFn: async () => {
      if (!userId) return null;
      
      const { data, error } = await supabase.functions.invoke("mypayverse-wallet", {
        body: { action: "get_wallet" },
      });

      if (error) {
        console.error("Error fetching MyPayVerse wallet:", error);
        throw error;
      }

      return data.wallet as MyPayVerseWallet | null;
    },
    enabled: !!userId,
    staleTime: 1000 * 2,
    refetchInterval: 2000, // Auto-refresh every 2 seconds
  });

  // Create wallet mutation
  const createWalletMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("mypayverse-wallet", {
        body: { action: "create_wallet" },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);
      
      return data.wallet as MyPayVerseWallet;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mypayverse-wallet", userId] });
    },
    onError: (error: Error) => {
      console.error("Failed to create wallet:", error);
    },
  });

  // Auto-create wallet when user is loaded and wallet doesn't exist
  useEffect(() => {
    if (userId && wallet === null && !isLoadingWallet && !createWalletMutation.isPending) {
      createWalletMutation.mutate();
    }
  }, [userId, wallet, isLoadingWallet, createWalletMutation.isPending]);

  // Fetch transactions
  const { data: transactions, isLoading: isLoadingTransactions } = useQuery({
    queryKey: ["mypayverse-transactions", userId, wallet?.address],
    queryFn: async () => {
      if (!userId || !wallet?.address) return [];
      
      const { data, error } = await supabase.functions.invoke("mypayverse-wallet", {
        body: { action: "get_transactions", walletAddress: wallet.address },
      });

      if (error) {
        console.error("Error fetching MyPayVerse transactions:", error);
        throw error;
      }

      return (data.transactions || []) as MyPayVerseTransaction[];
    },
    enabled: !!userId && !!wallet?.address,
    staleTime: 1000 * 2,
    refetchInterval: 2000, // Auto-refresh every 2 seconds
  });

  // Withdraw mutation
  const withdrawMutation = useMutation({
    mutationFn: async ({ amount, walletAddress }: { amount: number; walletAddress: string }) => {
      const { data, error } = await supabase.functions.invoke("mypayverse-wallet", {
        body: { action: "withdraw", amount, walletAddress },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);
      
      return data.transaction;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mypayverse-wallet", userId] });
      queryClient.invalidateQueries({ queryKey: ["mypayverse-transactions", userId] });
      toast({
        title: "Withdrawal Submitted",
        description: "Your withdrawal request has been submitted.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Withdrawal Failed",
        description: error.message || "Failed to submit withdrawal",
        variant: "destructive",
      });
    },
  });

  return {
    wallet,
    transactions,
    isLoadingWallet: isLoadingWallet || createWalletMutation.isPending,
    isLoadingTransactions,
    withdraw: withdrawMutation.mutate,
    isWithdrawing: withdrawMutation.isPending,
    refetchWallet,
  };
}
