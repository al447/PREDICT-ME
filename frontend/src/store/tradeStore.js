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
 * Build + sign an EIP-712 CLOB market-buy order and submit it.
 * price: mid-market or 0.99 (willing to pay up to 99¢ per share → fills immediately).
 */
async function _placeOnChainOrder({ user, marketId, conditionId, tokenId, outcome, amount }) {
  const signer = await _getSigner();
  const signerAddress = await signer.getAddress();
  const makerAddress = user?.smartWallet?.proxy || signerAddress;

  // signatureType: 1=POLY_PROXY, 2=GNOSIS_SAFE, 0=EOA fallback
  const signatureType = user?.smartWallet?.signatureType ?? 0;

  // Market buy: price 0.99 fills against any ask ≤ 0.99
  const price = 0.99;
  const size  = parseFloat(amount) / price; // shares purchased

  const makerAmountBN = ethers.parseUnits(amount.toFixed(6), 6);
  const takerAmountBN = ethers.parseUnits(size.toFixed(6), 6);

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
    side:          0, // buy
    signatureType: BigInt(signatureType),
  };

  const signature = await signer.signTypedData(ORDER_DOMAIN, ORDER_TYPES, orderMessage);

  const { data } = await clobAPI.placeOrder({
    conditionId,
    tokenId,
    side:          0,
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
   */
  placeTrade: async (marketId, outcome, amount, candidate = null, market = null) => {
    const { user, openAuthModal } = useAuthStore.getState();
    if (!user) { openAuthModal(); return false; }
    if (get().isPlacing) return false;
    if (user.balance < amount) {
      toast.error('Insufficient balance');
      return false;
    }
    set({ isPlacing: true });

    try {
      const conditionId = market?.conditionId;
      const tokenId     = outcome === 'YES' ? market?.yesTokenId : market?.noTokenId;
      const useOnChain  = ONCHAIN_ENABLED && conditionId && tokenId;

      if (useOnChain) {
        const result = await _placeOnChainOrder({ user, marketId, conditionId, tokenId, outcome, amount });
        if (result.success) {
          useAuthStore.getState().refreshBalance();
          const label = candidate ? `${candidate} ${outcome}` : outcome;
          toast.success(`${outcome} order placed on-chain for $${amount}`);
          return result;
        }
        toast.error(result.error || 'On-chain order failed');
        return false;
      }

      // Legacy off-chain path
      const payload = { marketId, outcome, amount };
      if (candidate) payload.candidate = candidate;
      const { data } = await tradesAPI.place(payload);
      if (data.success) {
        useAuthStore.getState().updateBalance(data.newBalance);
        useAuthStore.getState().refreshBalance();
        if (data.market) {
          set({ lastMarketUpdate: data.market });
        }
        const shares = data.trade?.shares?.toFixed(2) || '0';
        const label = candidate ? `${candidate} ${outcome}` : outcome;
        toast.success(`Bought ${shares} ${label} shares for $${amount}`);
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
