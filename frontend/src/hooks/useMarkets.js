import { useQuery } from '@tanstack/react-query';
import { marketsAPI, categoriesAPI } from '../services/api';

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
