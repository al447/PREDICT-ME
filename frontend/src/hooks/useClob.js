/**
 * CLOB (Central Limit Order Book) Hooks
 * For placing orders, viewing order book, and real-time WebSocket updates
 */

import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ethers } from 'ethers';
import toast from 'react-hot-toast';
import api from '../services/api';
import { ORDER_DOMAIN, ORDER_TYPES, ADDRESSES } from '../config/network';
import useAuthStore from '../store/authStore';

// Route CLOB calls via the main api instance
const settlementAPI = {
  get:    (url, cfg) => api.get(url, cfg),
  post:   (url, data, cfg) => api.post(url, data, cfg),
  delete: (url, cfg) => api.delete(url, cfg),
};

/**
 * Get the browser signer (MetaMask / WalletConnect / Magic).
 * For Magic users the ethers provider is injected by the Magic SDK.
 */
async function getEthersSigner() {
  if (window.ethereum) {
    const provider = new ethers.BrowserProvider(window.ethereum);
    await provider.send('eth_requestAccounts', []);
    return provider.getSigner();
  }
  throw new Error('No Ethereum provider found. Please connect a wallet.');
}

// WebSocket hook
export function useClobWebSocket(conditionId, tokenId, onMessage) {
  const [ws, setWs] = useState(null);
  const [connected, setConnected] = useState(false);
  
  useEffect(() => {
    if (!conditionId || !tokenId) return;
    
    // Connect to WebSocket
    const wsUrl = `${import.meta.env.VITE_BACKEND_URL || 'ws://localhost:5000'}`.replace('http', 'ws');
    const socket = new WebSocket(wsUrl);
    
    socket.onopen = () => {
      console.log('[CLOB WS] Connected');
      setConnected(true);
      
      // Subscribe to order book
      socket.send(JSON.stringify({
        type: 'subscribe',
        payload: { conditionId, tokenId },
      }));
    };
    
    socket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      onMessage?.(message);
    };
    
    socket.onclose = () => {
      console.log('[CLOB WS] Disconnected');
      setConnected(false);
    };
    
    socket.onerror = (err) => {
      console.error('[CLOB WS] Error:', err);
    };
    
    setWs(socket);
    
    return () => {
      socket.close();
    };
  }, [conditionId, tokenId]);
  
  return { ws, connected };
}

/**
 * Get order book for a market
 */
export function useOrderBook(conditionId, tokenId, depth = 20) {
  return useQuery({
    queryKey: ['orderBook', conditionId, tokenId, depth],
    queryFn: async () => {
      if (!conditionId || !tokenId) return null;
      const response = await settlementAPI.get(`/clob/orderbook/${conditionId}/${tokenId}?depth=${depth}`);
      return response.data;
    },
    enabled: !!conditionId && !!tokenId,
    refetchInterval: 5000, // Fallback polling if WS fails
  });
}

/**
 * Get user's orders
 */
export function useUserOrders(status) {
  const queryClient = useQueryClient();
  
  const query = useQuery({
    queryKey: ['userOrders', status],
    queryFn: async () => {
      const params = status ? { status } : {};
      const response = await settlementAPI.get('/clob/orders', { params });
      return response.data.orders;
    },
  });
  
  return {
    ...query,
    refresh: () => queryClient.invalidateQueries(['userOrders']),
  };
}

/**
 * Get EIP-712 domain and types for signing orders
 */
export function useClobDomain() {
  return useQuery({
    queryKey: ['clobDomain'],
    queryFn: async () => {
      const response = await settlementAPI.get('/clob/domain');
      return response.data;
    },
    staleTime: Infinity, // Domain doesn't change
  });
}

/**
 * Create limit order (buy or sell) — Non-custodial EIP-712 signed order.
 *
 * The maker is the user's Gnosis Safe proxy address.
 * The signer is the EOA (Magic address or connected wallet) that controls the Safe.
 * The backend verifyOrderSignature checks that signer == recovered address.
 */
export function useCreateOrder() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  return useMutation({
    mutationFn: async ({
      conditionId,
      tokenId,
      side,         // 'buy' | 'sell'
      price,        // 0.01 – 0.99
      size,         // number of shares
      expiration,   // unix timestamp seconds
      makerOverride,  // optional: use this as maker (Safe proxy)
    }) => {
      const ethersSigner = await getEthersSigner();
      const signerAddress = await ethersSigner.getAddress();

      // maker = Safe proxy if provisioned, else fall back to EOA
      const makerAddress = makerOverride || user?.smartWallet?.proxy || signerAddress;

      // Calculate amounts (6-decimal USDC)
      const makerAmountBN = ethers.parseUnits(size.toFixed(6), 6);
      const takerAmountBN = ethers.parseUnits((size * price).toFixed(6), 6);

      const sideNum  = side === 'buy' ? 0 : 1;
      const salt     = BigInt(Math.floor(Math.random() * 1e15));
      const nonce    = BigInt(Date.now());
      const expiryTs = typeof expiration === 'number' ? BigInt(expiration) : BigInt(Math.floor(Date.now() / 1000) + 3600 * 24);
      const FEE_BPS  = 200n;

      // EIP-712 message — matches backend ORDER_TYPES exactly
      const orderMessage = {
        salt,
        maker:         makerAddress,
        signer:        signerAddress,
        taker:         ethers.ZeroAddress,
        tokenId:       BigInt(tokenId),
        makerAmount:   makerAmountBN,
        takerAmount:   takerAmountBN,
        expiration:    expiryTs,
        nonce,
        feeRateBps:    FEE_BPS,
        side:          sideNum,
        signatureType: 0,
      };

      const signature = await ethersSigner.signTypedData(
        ORDER_DOMAIN,
        ORDER_TYPES,
        orderMessage
      );

      const { data } = await settlementAPI.post('/clob/order', {
        conditionId,
        tokenId,
        side:          sideNum,
        price,
        size,
        maker:         makerAddress,
        signer:        signerAddress,
        salt:          salt.toString(),
        makerAmount:   makerAmountBN.toString(),
        takerAmount:   takerAmountBN.toString(),
        expiration:    Number(expiryTs),
        nonce:         Number(nonce),
        signature,
        signatureType: 0,
      });

      return data;
    },
    onSuccess: (data) => {
      toast.success('Order placed!');
      queryClient.invalidateQueries({ queryKey: ['orderBook'] });
      queryClient.invalidateQueries({ queryKey: ['userOrders'] });
    },
    onError: (err) => {
      toast.error(err?.response?.data?.error || err.message || 'Order failed');
    },
  });
}

/**
 * Cancel order
 */
export function useCancelOrder() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (orderId) => {
      const response = await settlementAPI.delete(`/clob/order/${orderId}`);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['userOrders']);
      queryClient.invalidateQueries(['orderBook']);
    },
  });
}

/**
 * Get best bid/ask spread for a market
 */
export function useMarketSpread(conditionId, tokenId) {
  const { data: orderBook, isLoading } = useOrderBook(conditionId, tokenId, 1);
  
  const bestBid = orderBook?.data?.bids?.[0]?.price || 0;
  const bestAsk = orderBook?.data?.asks?.[0]?.price || 0;
  const spread = bestAsk - bestBid;
  const midPrice = (bestBid + bestAsk) / 2;
  
  return {
    bestBid,
    bestAsk,
    spread,
    midPrice,
    isLoading,
  };
}

/**
 * Real-time order book with WebSocket
 */
export function useRealtimeOrderBook(conditionId, tokenId) {
  const [orderBook, setOrderBook] = useState(null);
  const [trades, setTrades] = useState([]);
  
  const handleMessage = useCallback((message) => {
    switch (message.type) {
      case 'orderbook':
      case 'orderbook_update':
        setOrderBook(message.data);
        break;
      case 'trade':
        setTrades(prev => [message.data, ...prev].slice(0, 50)); // Keep last 50
        break;
    }
  }, []);
  
  const { connected } = useClobWebSocket(conditionId, tokenId, handleMessage);
  
  // Fallback to REST on disconnect
  const { data: restOrderBook } = useOrderBook(conditionId, tokenId, 20);
  
  return {
    orderBook: connected ? orderBook : restOrderBook?.data,
    trades,
    connected,
    usingFallback: !connected,
  };
}

/**
 * Hook to get all active markets from CLOB
 */
export function useClobMarkets() {
  return useQuery({
    queryKey: ['clobMarkets'],
    queryFn: async () => {
      const response = await settlementAPI.get('/clob/markets');
      return response.data.markets;
    },
    refetchInterval: 30000,
  });
}

/**
 * Estimate order value and fees
 */
export function useOrderEstimator() {
  return useCallback((size, price, side) => {
    const notional = size * price;
    const takerFeeRate = 0.02; // 2% on Polymarket
    const takerFee = notional * takerFeeRate;
    
    if (side === 'buy') {
      return {
        youPay: notional + takerFee,
        youReceive: size,
        fees: takerFee,
        maxProfit: size * (1 - price),
      };
    } else {
      return {
        youPay: size,
        youReceive: notional - takerFee,
        fees: takerFee,
        maxProfit: notional - takerFee,
      };
    }
  }, []);
}
