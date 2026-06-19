/**
 * On-chain data hooks (react-query)
 * Reads: balances, positions, market info
 * Writes: approve, split, merge, redeem (exposed as async functions)
 */

import { useQuery, useMutation } from '@tanstack/react-query';
import { ethers } from 'ethers';
import { getReadContract, getContract } from '../contracts/getContract';
import { getSigner } from '../lib/getSigner';
import { BLOCK_EXPLORER } from '../contracts/addresses';

const REFETCH_INTERVAL = 30000; // 30s

// ===== Read Hooks =====

/**
 * Get USDC balance for an address
 */
export function useUsdcBalance(address, enabled = true) {
  return useQuery({
    queryKey: ['usdcBalance', address],
    queryFn: async () => {
      if (!address) return 0;
      const usdc = getReadContract('USDC');
      const raw = await usdc.balanceOf(address);
      return Number(raw) / 1e6; // 6 decimals
    },
    enabled: !!address && enabled,
    refetchInterval: REFETCH_INTERVAL,
  });
}

/**
 * Get USDC allowance (owner -> spender)
 */
export function useUsdcAllowance(owner, spender, enabled = true) {
  return useQuery({
    queryKey: ['usdcAllowance', owner, spender],
    queryFn: async () => {
      if (!owner || !spender) return 0;
      const usdc = getReadContract('USDC');
      const raw = await usdc.allowance(owner, spender);
      return Number(raw) / 1e6;
    },
    enabled: !!owner && !!spender && enabled,
    refetchInterval: REFETCH_INTERVAL,
  });
}

/**
 * Get on-chain market info by conditionId
 */
export function useMarketInfo(conditionId, enabled = true) {
  return useQuery({
    queryKey: ['marketInfo', conditionId],
    queryFn: async () => {
      if (!conditionId) return null;
      const mf = getReadContract('MarketFactory');
      const info = await mf.getMarket(conditionId);
      return {
        questionId: info.questionId,
        conditionId: info.conditionId,
        token0: info.token0.toString(),
        token1: info.token1.toString(),
        collateral: info.collateral,
        createdAt: Number(info.createdAt),
        negRisk: info.negRisk,
      };
    },
    enabled: !!conditionId && enabled,
  });
}

/**
 * Get ERC1155 position balance for a specific tokenId
 */
export function usePositionBalance(address, tokenId, enabled = true) {
  return useQuery({
    queryKey: ['positionBalance', address, tokenId],
    queryFn: async () => {
      if (!address || !tokenId) return 0;
      const ctf = getReadContract('ConditionalTokens');
      const raw = await ctf.balanceOf(address, tokenId);
      return Number(raw);
    },
    enabled: !!address && !!tokenId && enabled,
    refetchInterval: REFETCH_INTERVAL,
  });
}

/**
 * Get both YES and NO position balances for a market
 */
export function useMarketPositions(address, conditionId, enabled = true) {
  const { data: marketInfo } = useMarketInfo(conditionId, enabled);

  const yesQuery = usePositionBalance(address, marketInfo?.token0, enabled && !!marketInfo);
  const noQuery = usePositionBalance(address, marketInfo?.token1, enabled && !!marketInfo);

  return {
    marketInfo,
    yesBalance: yesQuery.data || 0,
    noBalance: noQuery.data || 0,
    isLoading: yesQuery.isLoading || noQuery.isLoading,
    refetch: () => {
      yesQuery.refetch();
      noQuery.refetch();
    },
  };
}

/**
 * Get predicted wallet address for an owner
 */
export function usePredictedWallet(owner, enabled = true) {
  return useQuery({
    queryKey: ['predictedWallet', owner],
    queryFn: async () => {
      if (!owner) return null;
      const wf = getReadContract('WalletFactory');
      return await wf.predictProxyAddress(owner);
    },
    enabled: !!owner && enabled,
  });
}

/**
 * Get deployed proxy address for an owner
 */
export function useDeployedProxy(owner, enabled = true) {
  return useQuery({
    queryKey: ['deployedProxy', owner],
    queryFn: async () => {
      if (!owner) return null;
      const wf = getReadContract('WalletFactory');
      const proxy = await wf.proxyOf(owner);
      // Check if proxy exists (not zero address)
      return proxy === '0x0000000000000000000000000000000000000000' ? null : proxy;
    },
    enabled: !!owner && enabled,
    refetchInterval: REFETCH_INTERVAL,
  });
}

// ===== Write Helpers (not hooks) =====

/**
 * Approve USDC for a spender
 */
export async function approveUsdc(spender, amount) {
  const usdc = await getContract('USDC', true);
  const amountWei = ethers.parseUnits(amount.toString(), 6);
  const tx = await usdc.approve(spender, amountWei);
  const receipt = await tx.wait();
  return {
    txHash: receipt.hash,
    explorerUrl: `${BLOCK_EXPLORER}/tx/${receipt.hash}`,
  };
}

/**
 * Split position: USDC -> YES + NO tokens
 * @param {string} conditionId
 * @param {number} amount - USDC amount (6 decimals)
 */
export async function splitPosition(conditionId, amount) {
  const ctf = await getContract('ConditionalTokens', true);
  const usdc = await getContract('USDC', true);
  const collateral = await usdc.getAddress();
  const amountWei = ethers.parseUnits(amount.toString(), 6);

  // First approve CTF to spend USDC
  const approveTx = await usdc.approve(await ctf.getAddress(), amountWei);
  await approveTx.wait();

  // Then split
  const tx = await ctf.splitPosition(
    collateral,
    conditionId,
    amountWei // partition (0 for col/yes/no split)
  );
  const receipt = await tx.wait();

  return {
    txHash: receipt.hash,
    explorerUrl: `${BLOCK_EXPLORER}/tx/${receipt.hash}`,
  };
}

/**
 * Merge positions: YES + NO -> USDC
 */
export async function mergePositions(conditionId, amount) {
  const ctf = await getContract('ConditionalTokens', true);
  const usdc = await getContract('USDC', true);
  const collateral = await usdc.getAddress();
  const amountWei = ethers.parseUnits(amount.toString(), 6);

  const tx = await ctf.mergePositions(
    collateral,
    conditionId, // partition
    amountWei
  );
  const receipt = await tx.wait();

  return {
    txHash: receipt.hash,
    explorerUrl: `${BLOCK_EXPLORER}/tx/${receipt.hash}`,
  };
}

/**
 * Redeem positions after market resolution
 */
export async function redeemPositions(conditionId, tokenIds, amounts) {
  const ctf = await getContract('ConditionalTokens', true);

  // Convert amounts to wei
  const amountsWei = amounts.map(a => ethers.parseUnits(a.toString(), 6));

  const tx = await ctf.redeemPositions(
    await (await getContract('USDC', false)).getAddress(),
    conditionId,
    tokenIds,
    amountsWei
  );
  const receipt = await tx.wait();

  return {
    txHash: receipt.hash,
    explorerUrl: `${BLOCK_EXPLORER}/tx/${receipt.hash}`,
  };
}

// ===== Write Mutations (for react-query) =====

export function useApproveUsdc() {
  return useMutation({
    mutationFn: ({ spender, amount }) => approveUsdc(spender, amount),
  });
}

export function useSplitPosition() {
  return useMutation({
    mutationFn: ({ conditionId, amount }) => splitPosition(conditionId, amount),
  });
}

export function useMergePositions() {
  return useMutation({
    mutationFn: ({ conditionId, amount }) => mergePositions(conditionId, amount),
  });
}

export function useRedeemPositions() {
  return useMutation({
    mutationFn: ({ conditionId, tokenIds, amounts }) =>
      redeemPositions(conditionId, tokenIds, amounts),
  });
}
