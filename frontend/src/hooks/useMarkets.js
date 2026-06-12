import { useQuery } from '@tanstack/react-query';
import { marketsAPI, categoriesAPI, polymarketAPI } from '../services/api';

export const useMarkets = (params = {}) => {
  return useQuery({
    queryKey: ['markets', params],
    queryFn: () => marketsAPI.getMarkets(params).then((r) => r.data),
    staleTime: 30000,
  });
};

export const useFeaturedMarkets = () => {
  return useQuery({
    queryKey: ['markets', 'featured'],
    queryFn: () => marketsAPI.getFeatured().then((r) => r.data),
    staleTime: 30000,
  });
};

export const useMarket = (slug) => {
  return useQuery({
    queryKey: ['market', slug],
    queryFn: () => marketsAPI.getBySlug(slug).then((r) => r.data),
    enabled: !!slug,
    staleTime: 15000,
  });
};

export const useCategories = () => {
  return useQuery({
    queryKey: ['categories'],
    queryFn: () => categoriesAPI.getAll().then((r) => r.data),
    staleTime: 60000,
  });
};

export const useMarketComments = (eventSlug, limit = 20) => {
  return useQuery({
    queryKey: ['market-comments', eventSlug, limit],
    queryFn: () => polymarketAPI.getComments(eventSlug, limit).then((r) => r.data),
    enabled: !!eventSlug,
    staleTime: 60000,
    retry: false,
  });
};

export const useMarketHolders = (conditionId, limit = 10) => {
  return useQuery({
    queryKey: ['market-holders', conditionId, limit],
    queryFn: () => polymarketAPI.getHolders(conditionId, limit).then((r) => r.data),
    enabled: !!conditionId,
    staleTime: 60000,
    retry: false,
  });
};

export const useMarketActivity = (conditionId, limit = 20) => {
  return useQuery({
    queryKey: ['market-activity', conditionId, limit],
    queryFn: () => polymarketAPI.getActivity(conditionId, limit).then((r) => r.data),
    enabled: !!conditionId,
    staleTime: 30000,
    retry: false,
  });
};
