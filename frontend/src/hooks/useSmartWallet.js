/**
 * useSmartWallet — Per-user Gnosis Safe proxy wallet hook
 *
 * Returns the user's non-custodial Safe address (predicted via WalletFactory
 * CREATE2, no gas needed). The Safe is the deposit destination and the holder
 * of all USDC + ERC1155 prediction-market positions.
 *
 * Usage:
 *   const { proxyAddress, isDeployed, balance, ensureDeployed, isLoading } = useSmartWallet();
 */

import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import useAuthStore from '../store/authStore';
import api from '../services/api';

const onchainAPI = {
  getMyWallet: () => api.get('/onchain/my-wallet'),
  deployMyWallet: () => api.post('/onchain/my-wallet/deploy'),
};

export default function useSmartWallet() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['smart-wallet', user?._id],
    queryFn: async () => {
      const { data: resp } = await onchainAPI.getMyWallet();
      return resp;
    },
    enabled: !!user?.walletAddress,
    staleTime: 30_000,
    retry: 2,
  });

  const deployMutation = useMutation({
    mutationFn: async () => {
      const { data: resp } = await onchainAPI.deployMyWallet();
      return resp;
    },
    onSuccess: (resp) => {
      toast.success('Smart wallet activated on-chain!');
      queryClient.invalidateQueries({ queryKey: ['smart-wallet', user?._id] });
    },
    onError: (err) => {
      console.error('[useSmartWallet] deploy error:', err);
      toast.error(err?.response?.data?.error || 'Failed to deploy smart wallet');
    },
  });

  const ensureDeployed = useCallback(async () => {
    if (data?.deployed) return data;
    return deployMutation.mutateAsync();
  }, [data, deployMutation]);

  return {
    /** Safe proxy address (predicted, usable as deposit destination even before deployment) */
    proxyAddress: data?.proxy || null,
    /** EOA that owns the Safe (Magic address or connected wallet) */
    ownerAddress: data?.owner || null,
    /** Whether the Safe contract has been deployed on-chain */
    isDeployed:   data?.deployed || false,
    /** On-chain USDC balance of the Safe (in human-readable USDC) */
    balance:      data?.balance ?? 0,
    /** Trigger Safe deployment on-chain (gasless via relayer) */
    ensureDeployed,
    isDeploying:  deployMutation.isPending,
    isLoading,
    error,
    refetch,
  };
}
