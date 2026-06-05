/**
 * Gasless Relayer Hooks
 * For Magic/social users to submit transactions without paying gas
 * User signs EIP-712 message, backend relayer executes and pays gas
 */

import { useMutation, useQuery } from '@tanstack/react-query';
import { ethers } from 'ethers';
import toast from 'react-hot-toast';
import { getMagic } from '../lib/magic';
import api from '../services/api';
import { CHAIN_ID, ADDRESSES } from '../config/network';
import useAuthStore from '../store/authStore';

const settlementAPI = {
  get:  (url, cfg) => api.get(url, cfg),
  post: (url, data, cfg) => api.post(url, data, cfg),
};

const RELAYER_DOMAIN = {
  name: 'PolyBet365 Relayer',
  version: '1',
  chainId: CHAIN_ID,
};

const RELAY_TYPES = {
  RelayRequest: [
    { name: 'userAddress', type: 'address' },
    { name: 'targetContract', type: 'address' },
    { name: 'method', type: 'string' },
    { name: 'params', type: 'bytes' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
};

/**
 * Generate unique nonce
 */
function generateNonce() {
  return Date.now() + Math.floor(Math.random() * 1000000);
}

/**
 * Get deadline (10 minutes from now)
 */
function getDeadline() {
  return Math.floor(Date.now() / 1000) + 600; // 10 minutes
}

/**
 * Encode parameters for relay
 */
function encodeParams(types, values) {
  return ethers.AbiCoder.defaultAbiCoder().encode(types, values);
}

/**
 * Get Magic signer for EIP-712 signing
 */
async function getMagicSigner() {
  const magic = await getMagic();
  if (!magic || !magic.rpcProvider) {
    throw new Error('Magic not initialized');
  }
  
  const isLoggedIn = await magic.user.isLoggedIn();
  if (!isLoggedIn) {
    throw new Error('User not logged in to Magic');
  }
  
  const browserProvider = new ethers.BrowserProvider(magic.rpcProvider);
  return await browserProvider.getSigner();
}

/**
 * Submit relay request to backend
 */
async function submitRelayRequest(request) {
  const response = await settlementAPI.post('/relayer/submit', request);
  return response.data;
}

/**
 * Gasless approve hook
 */
export function useGaslessApprove() {
  return useMutation({
    mutationFn: async ({ spender, amount }) => {
      const signer = await getMagicSigner();
      const userAddress = await signer.getAddress();
      
      // Get contract addresses from environment/config
      const usdcAddress = import.meta.env.VITE_MOCK_USDC_ADDRESS;
      
      // Encode parameters
      const params = encodeParams(
        ['address', 'uint256'],
        [spender, ethers.parseUnits(amount.toString(), 6)]
      );
      
      // Create relay request message
      const message = {
        userAddress: userAddress.toLowerCase(),
        targetContract: usdcAddress.toLowerCase(),
        method: 'approve',
        params,
        nonce: generateNonce(),
        deadline: getDeadline(),
      };
      
      // Sign EIP-712 message
      const signature = await signer.signTypedData(
        RELAYER_DOMAIN,
        RELAY_TYPES,
        message
      );
      
      // Submit to relayer
      const result = await submitRelayRequest({
        ...message,
        signature,
      });
      
      return result;
    },
  });
}

/**
 * Gasless split position hook
 */
export function useGaslessSplitPosition() {
  return useMutation({
    mutationFn: async ({ conditionId, amount }) => {
      const signer = await getMagicSigner();
      const userAddress = await signer.getAddress();
      
      const ctfAddress = import.meta.env.VITE_CONDITIONAL_TOKENS_ADDRESS;
      const usdcAddress = import.meta.env.VITE_MOCK_USDC_ADDRESS;
      
      // Encode: splitPosition(address collateral, bytes32 conditionId, uint amount)
      // partition = 0 for col/yes/no split
      const params = encodeParams(
        ['address', 'bytes32', 'uint256'],
        [usdcAddress, conditionId, ethers.parseUnits(amount.toString(), 6)]
      );
      
      const message = {
        userAddress: userAddress.toLowerCase(),
        targetContract: ctfAddress.toLowerCase(),
        method: 'splitPosition',
        params,
        nonce: generateNonce(),
        deadline: getDeadline(),
      };
      
      const signature = await signer.signTypedData(
        RELAYER_DOMAIN,
        RELAY_TYPES,
        message
      );
      
      return await submitRelayRequest({
        ...message,
        signature,
      });
    },
  });
}

/**
 * Gasless merge positions hook
 */
export function useGaslessMergePositions() {
  return useMutation({
    mutationFn: async ({ conditionId, amount }) => {
      const signer = await getMagicSigner();
      const userAddress = await signer.getAddress();
      
      const ctfAddress = import.meta.env.VITE_CONDITIONAL_TOKENS_ADDRESS;
      const usdcAddress = import.meta.env.VITE_MOCK_USDC_ADDRESS;
      
      const params = encodeParams(
        ['address', 'bytes32', 'uint256'],
        [usdcAddress, conditionId, ethers.parseUnits(amount.toString(), 6)]
      );
      
      const message = {
        userAddress: userAddress.toLowerCase(),
        targetContract: ctfAddress.toLowerCase(),
        method: 'mergePositions',
        params,
        nonce: generateNonce(),
        deadline: getDeadline(),
      };
      
      const signature = await signer.signTypedData(
        RELAYER_DOMAIN,
        RELAY_TYPES,
        message
      );
      
      return await submitRelayRequest({
        ...message,
        signature,
      });
    },
  });
}

/**
 * Gasless redeem positions hook (post-resolution)
 */
export function useGaslessRedeemPositions() {
  return useMutation({
    mutationFn: async ({ conditionId, tokenIds, amounts }) => {
      const signer = await getMagicSigner();
      const userAddress = await signer.getAddress();
      
      const ctfAddress = import.meta.env.VITE_CONDITIONAL_TOKENS_ADDRESS;
      const usdcAddress = import.meta.env.VITE_MOCK_USDC_ADDRESS;
      
      // Convert amounts to wei
      const amountsWei = amounts.map(a => ethers.parseUnits(a.toString(), 6));
      
      const params = encodeParams(
        ['address', 'bytes32', 'uint256[]', 'uint256[]'],
        [usdcAddress, conditionId, tokenIds, amountsWei]
      );
      
      const message = {
        userAddress: userAddress.toLowerCase(),
        targetContract: ctfAddress.toLowerCase(),
        method: 'redeemPositions',
        params,
        nonce: generateNonce(),
        deadline: getDeadline(),
      };
      
      const signature = await signer.signTypedData(
        RELAYER_DOMAIN,
        RELAY_TYPES,
        message
      );
      
      return await submitRelayRequest({
        ...message,
        signature,
      });
    },
  });
}

/**
 * useSafeExec — Execute any call through the user's Gnosis Safe (gasless).
 *
 * Flow:
 *   1. Frontend calls prepareAndSign({ safeAddress, to, data }) → gets EIP-712 payload
 *   2. User signs the SafeTx hash via signTypedData
 *   3. Frontend calls execViaSafe({ safeAddress, to, data, signature })
 *   4. Backend relayer calls Safe.execTransaction, paying MATIC gas
 *
 * Usage:
 *   const { prepareAndSign, execViaSafe, isPreparing, isExecuting } = useSafeExec();
 */
export function useSafeExec() {
  const { user } = useAuthStore();

  const prepareMutation = useMutation({
    mutationFn: async ({ safeAddress, to, value = '0', data = '0x' }) => {
      const { data: resp } = await settlementAPI.post('/relayer/safe/prepare', {
        safeAddress, to, value, data,
      });
      return resp; // { domain, types, message }
    },
  });

  const execMutation = useMutation({
    mutationFn: async ({ safeAddress, to, value = '0', data = '0x', userSignature }) => {
      const { data: resp } = await settlementAPI.post('/relayer/safe/exec', {
        safeAddress, to, value, data, userSignature,
      });
      return resp; // { txHash, blockNumber }
    },
    onSuccess: (resp) => {
      toast.success(`Transaction submitted: ${resp.txHash?.slice(0, 10)}…`);
    },
    onError: (err) => {
      toast.error(err?.response?.data?.error || 'Safe execution failed');
    },
  });

  /**
   * Full flow: prepare EIP-712 payload, sign, execute — all in one call.
   *
   * @param {object} params
   * @param {string} params.safeAddress - User's Safe proxy
   * @param {string} params.to          - Target contract
   * @param {string} [params.value]     - ETH value in wei
   * @param {string} params.data        - Encoded calldata
   */
  const prepareAndExec = async ({ safeAddress, to, value = '0', data = '0x' }) => {
    // Step 1: Get EIP-712 payload from backend
    const payload = await prepareMutation.mutateAsync({ safeAddress, to, value, data });
    const { domain, types, message } = payload;

    // Step 2: Get signer
    let signer;
    try {
      const magic = await getMagic();
      if (magic?.rpcProvider) {
        const isLoggedIn = await magic.user.isLoggedIn();
        if (isLoggedIn) {
          const bp = new ethers.BrowserProvider(magic.rpcProvider);
          signer = await bp.getSigner();
        }
      }
    } catch { /* not Magic */ }

    if (!signer && window.ethereum) {
      const bp = new ethers.BrowserProvider(window.ethereum);
      await bp.send('eth_requestAccounts', []);
      signer = await bp.getSigner();
    }

    if (!signer) throw new Error('No wallet signer available');

    // Step 3: Sign Safe transaction
    const userSignature = await signer.signTypedData(domain, types, message);

    // Step 4: Submit to relayer
    return execMutation.mutateAsync({ safeAddress, to, value, data, userSignature });
  };

  return {
    prepareAndExec,
    isPreparing:  prepareMutation.isPending,
    isExecuting:  execMutation.isPending,
    isBusy:       prepareMutation.isPending || execMutation.isPending,
    lastTxHash:   execMutation.data?.txHash || null,
    error:        execMutation.error || prepareMutation.error,
  };
}

/**
 * Get relayer status
 */
export async function getRelayerStatus() {
  const response = await settlementAPI.get('/relayer/status');
  return response.data;
}

/**
 * Get EIP-712 domain info for signing
 */
export async function getRelayerDomain() {
  const response = await settlementAPI.get('/relayer/domain');
  return response.data;
}

/**
 * Hook to check if gasless transactions are available
 */
export function useGaslessStatus() {
  return useQuery({
    queryKey: ['relayerStatus'],
    queryFn: getRelayerStatus,
    refetchInterval: 30000,
  });
}
