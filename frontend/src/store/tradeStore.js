import { create } from 'zustand';
import { tradesAPI } from '../services/api';
import useAuthStore from './authStore';
import toast from 'react-hot-toast';

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

  placeTrade: async (marketId, outcome, amount) => {
    const { user, openAuthModal } = useAuthStore.getState();
    if (!user) { openAuthModal(); return false; }
    if (get().isPlacing) return false;
    if (user.balance < amount) {
      toast.error('Insufficient balance');
      return false;
    }
    set({ isPlacing: true });
    try {
      const { data } = await tradesAPI.place({ marketId, outcome, amount });
      if (data.success) {
        useAuthStore.getState().updateBalance(data.newBalance);
        useAuthStore.getState().refreshBalance();
        if (data.market) {
          set({ lastMarketUpdate: data.market });
        }
        const shares = data.trade?.shares?.toFixed(2) || '0';
        toast.success(`Bought ${shares} ${outcome} shares for $${amount}`);
        return data;
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Trade failed');
    } finally {
      set({ isPlacing: false });
    }
    return false;
  },
}));

export default useTradeStore;
