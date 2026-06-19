import { create } from 'zustand';
import { ethers } from 'ethers';
import { tradesAPI, clobAPI } from '../services/api';
import useAuthStore from './authStore';
import toast from 'react-hot-toast';
import { getMagic } from '../lib/magic';
import { ORDER_DOMAIN, ORDER_TYPES, ONCHAIN_ENABLED } from '../config/network';

/**
 * Get the best available EIP-712 signer (Magic first, then injected wallet).
 */
async function _getSigner() {
  try {
    const magic = await getMagic();
    if (magic && magic.rpcProvider) {
      const ok = await magic.user.isLoggedIn();
      if (ok) {
        const p = new ethers.BrowserProvider(magic.rpcProvider);
        return p.getSigner();
      }
    }
  } catch { /* fall through */ }
  if (window.ethereum) {
    const p = new ethers.BrowserProvider(window.ethereum);
    await p.send('eth_requestAccounts', []);
    return p.getSigner();
  }
  throw new Error('No wallet connected. Please sign in or connect a wallet.');
}

/**
 * Build + sign an EIP-712 CLOB order and submit it.
 * BUY:  price 0.99 fills against any ask ≤ 0.99 (market buy)
 * SELL: price 0.01 fills against any bid ≥ 0.01 (market sell)
 */
async function _placeOnChainOrder({ user, marketId, conditionId, tokenId, outcome, amount, side = 'buy' }) {
  const signer = await _getSigner();
  const signerAddress = await signer.getAddress();
  const makerAddress = user?.smartWallet?.proxy || signerAddress;

  const signatureType = user?.smartWallet?.signatureType ?? 0;
  const isBuy = side === 'buy';
  const sideNum = isBuy ? 0 : 1;

  // Market order pricing: use extreme price for immediate fill
  const price = isBuy ? 0.99 : 0.01;
  const size  = isBuy
    ? parseFloat(amount) / price
    : parseFloat(amount); // For sell, amount = shares to sell

  // BUY: maker gives USDC (makerAmount), wants shares (takerAmount)
  // SELL: maker gives shares (makerAmount), wants USDC (takerAmount)
  const makerAmountBN = isBuy
    ? ethers.parseUnits(parseFloat(amount).toFixed(6), 6)
    : ethers.parseUnits(size.toFixed(6), 6);
  const takerAmountBN = isBuy
    ? ethers.parseUnits(size.toFixed(6), 6)
    : ethers.parseUnits((size * price).toFixed(6), 6);

  const salt     = BigInt(Math.floor(Math.random() * 1e15));
  const nonce    = BigInt(Date.now());
  const expiryTs = BigInt(Math.floor(Date.now() / 1000) + 3600 * 24);
  const FEE_BPS  = 200n;

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
    signatureType: BigInt(signatureType),
  };

  const signature = await signer.signTypedData(ORDER_DOMAIN, ORDER_TYPES, orderMessage);

  const { data } = await clobAPI.placeOrder({
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
    signatureType,
  });

  return data;
}

const useTradeStore = create((set, get) => ({
  trades: [],
  positions: [],
  isLoading: false,
  isPlacing: false,
  isLoadingPositions: false,
  total: 0,
  page: 1,
  pages: 1,
  lastMarketUpdate: null,

  fetchTrades: async (params = {}) => {
    if (!localStorage.getItem('pb365_token')) return;
    set({ isLoading: true });
    try {
      const { data } = await tradesAPI.getMy(params);
      if (data.success) {
        set({ trades: data.trades, total: data.total, page: data.page, pages: data.pages });
      }
    } catch {}
    set({ isLoading: false });
  },

  fetchPositions: async () => {
    if (!localStorage.getItem('pb365_token')) return;
    set({ isLoadingPositions: true });
    try {
      const { data } = await tradesAPI.getPositions();
      if (data.success) {
        set({ positions: data.positions });
      }
    } catch {}
    set({ isLoadingPositions: false });
  },

  /**
   * Place a trade.
   * - When ONCHAIN_ENABLED=true and market has conditionId/tokenId → CLOB on-chain order.
   * - Otherwise → legacy off-chain MongoDB trade (fallback / paper trading).
   * @param {string} side - 'buy' or 'sell'
   */
  placeTrade: async (marketId, outcome, amount, candidate = null, market = null, side = 'buy') => {
    const { user, openAuthModal } = useAuthStore.getState();
    if (!user) { openAuthModal(); return false; }
    if (get().isPlacing) return false;
    if (side === 'buy' && user.balance < amount) {
      toast.error('Insufficient balance');
      return false;
    }
    set({ isPlacing: true });

    try {
      const conditionId = market?.conditionId;
      // Fix: case-insensitive check for token matching
      const isYes = outcome.toLowerCase() === 'yes';
      const tokenId = isYes ? market?.yesTokenId : market?.noTokenId;
      const useOnChain  = ONCHAIN_ENABLED && conditionId && tokenId;

      if (useOnChain) {
        const result = await _placeOnChainOrder({ user, marketId, conditionId, tokenId, outcome, amount, side });
        if (result.success) {
          useAuthStore.getState().refreshBalance();
          get().fetchPositions();
          const label = candidate ? `${candidate} ${outcome}` : outcome;
          toast.success(`${side === 'buy' ? 'Buy' : 'Sell'} ${outcome} order placed on-chain for $${amount}`);
          return result;
        }
        toast.error(result.error || 'On-chain order failed');
        return false;
      }

      // Legacy off-chain path
      const payload = { marketId, outcome, amount, side };
      if (candidate) payload.candidate = candidate;
      const { data } = await tradesAPI.place(payload);
      if (data.success) {
        useAuthStore.getState().updateBalance(data.newBalance);
        useAuthStore.getState().refreshBalance();
        get().fetchPositions();
        if (data.market) {
          set({ lastMarketUpdate: data.market });
        }
        const shares = data.trade?.shares?.toFixed(2) || '0';
        const label = candidate ? `${candidate} ${outcome}` : outcome;
        toast.success(`${side === 'buy' ? 'Bought' : 'Sold'} ${shares} ${label} shares for $${amount}`);
        return data;
      }
    } catch (err) {
      const msg = err?.response?.data?.error || err.message || 'Trade failed';
      toast.error(msg);
    } finally {
      set({ isPlacing: false });
    }
    return false;
  },
}));

export default useTradeStore;
