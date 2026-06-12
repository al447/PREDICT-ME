/**
 * useWithdraw — Non-custodial gasless USDC withdrawal from user's Gnosis Safe.
 *
 * Flow:
 *   1. Call prepareAndExec({ recipient, amount })
 *   2. Backend returns EIP-712 SafeTx payload
 *   3. User signs via signTypedData (MetaMask / Magic)
 *   4. Backend relayer submits Safe.execTransaction, paying MATIC gas
 *   5. USDC is transferred from Safe to recipient
 *
 * The platform never touches user funds.
 */

import { useState, useCallback } from 'react';
import { ethers } from 'ethers';
import toast from 'react-hot-toast';
import { useQuery, useMutation } from '@tanstack/react-query';
import { getMagic } from '../lib/magic';
import { onchainAPI } from '../services/api';
import useSmartWallet from './useSmartWallet';

/**
 * Get a browser signer (Magic-first, then MetaMask).
 */
async function getEthersSigner() {
  try {
    const magic = await getMagic();
    if (magic?.rpcProvider) {
      const isLoggedIn = await magic.user.isLoggedIn();
      if (isLoggedIn) {
        const bp = new ethers.BrowserProvider(magic.rpcProvider);
        return bp.getSigner();
      }
    }
  } catch { /* not Magic */ }

  if (window.ethereum) {
    const bp = new ethers.BrowserProvider(window.ethereum);
    await bp.send('eth_requestAccounts', []);
    return bp.getSigner();
  }

  throw new Error('No wallet signer found. Please connect a wallet.');
}

/**
 * useWithdraw — main hook.
 */
export function useWithdraw() {
  const { proxyAddress: safeAddress, balance: safeBalance, isDeployed } = useSmartWallet();
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastTxHash, setLastTxHash] = useState(null);

  /**
   * Prepare and execute withdrawal in one step.
   *
   * @param {string} recipient   - Destination EVM address
   * @param {number} amountUsdc  - Amount in USDC (human-readable)
   */
  const withdraw = useCallback(async (recipient, amountUsdc) => {
    if (!safeAddress) throw new Error('No smart wallet provisioned. Please deposit first.');
    if (!isDeployed)  throw new Error('Smart wallet not deployed. Please deploy first.');
    if (amountUsdc <= 0) throw new Error('Amount must be positive');
    if (!ethers.isAddress(recipient)) throw new Error('Invalid recipient address');

    setIsProcessing(true);
    try {
      // Step 1: Get EIP-712 SafeTx payload from backend
      const { data: prepResp } = await onchainAPI.prepareWithdrawal({
        recipient,
        amount: amountUsdc,
      });

      if (!prepResp.success) throw new Error(prepResp.error || 'Failed to prepare withdrawal');

      const { domain, types, message } = prepResp;

      // Step 2: Sign via user's wallet
      const signer = await getEthersSigner();
      const userSignature = await signer.signTypedData(domain, types, message);

      // Step 3: Submit to relayer
      const { data: execResp } = await onchainAPI.execWithdrawal({
        recipient,
        amount: amountUsdc,
        userSignature,
      });

      if (!execResp.success) throw new Error(execResp.error || 'Withdrawal execution failed');

      setLastTxHash(execResp.txHash);
      toast.success(`Withdrawal sent! ${amountUsdc} USDC → ${recipient.slice(0, 8)}…`);
      return execResp;

    } finally {
      setIsProcessing(false);
    }
  }, [safeAddress, isDeployed]);

  return {
    withdraw,
    safeAddress,
    safeBalance,
    isDeployed,
    isProcessing,
    lastTxHash,
  };
}

/**
 * useRedeem — redeem resolved market positions (gasless).
 */
export function useRedeem(conditionId) {
  const { proxyAddress: safeAddress } = useSmartWallet();

  const redeemableQuery = useQuery({
    queryKey: ['redeemable', conditionId, safeAddress],
    queryFn: async () => {
      if (!conditionId) return null;
      const { data } = await onchainAPI.getRedeemable(conditionId);
      return data;
    },
    enabled: !!conditionId && !!safeAddress,
    refetchInterval: 30_000,
  });

  const redeemMutation = useMutation({
    mutationFn: async () => {
      if (!conditionId) throw new Error('No conditionId');
      const { data } = await onchainAPI.redeem(conditionId);
      if (!data.success) throw new Error(data.error || 'Redemption failed');
      return data;
    },
    onSuccess: (data) => {
      if (data.redeemed) {
        toast.success(`Redeemed! tx: ${data.txHash?.slice(0, 10)}…`);
      } else {
        toast(data.reason || 'Nothing to redeem.');
      }
      redeemableQuery.refetch();
    },
    onError: (err) => {
      toast.error(err?.response?.data?.error || err.message || 'Redemption failed');
    },
  });

  return {
    redeemable:    redeemableQuery.data,
    isResolved:    redeemableQuery.data?.resolved || false,
    redeemableUsd: redeemableQuery.data?.redeemableUsdc || 0,
    isLoading:     redeemableQuery.isLoading,
    redeem:        redeemMutation.mutate,
    isRedeeming:   redeemMutation.isPending,
  };
}
