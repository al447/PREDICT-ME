import { useQuery } from '@tanstack/react-query';
import api from '../services/api';

/**
 * Fetches live orderbook from Polymarket CLOB (via our backend proxy).
 * Falls back to visual-only if market has no polymarketTokenId mapped.
 */
export const useOrderbook = (marketSlug, options = {}) => {
  return useQuery({
    queryKey: ['orderbook', marketSlug],
    queryFn: async () => {
      const { data } = await api.get(`/polymarket-clob/orderbook/${marketSlug}`);
      return data;
    },
    enabled: !!marketSlug,
    staleTime: 5000, // Refresh every 5 seconds for live feel
    refetchInterval: 5000,
    ...options,
  });
};

/**
 * List markets with Polymarket CLOB mapping
 */
export const useMappedPolymarketMarkets = () => {
  return useQuery({
    queryKey: ['polymarket-mapped-markets'],
    queryFn: async () => {
      const { data } = await api.get('/polymarket-clob/mapped-markets');
      return data;
    },
    staleTime: 60000,
  });
};
