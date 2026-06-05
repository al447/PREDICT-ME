import { create } from 'zustand';
import { usersAPI } from '../services/api';
import useAuthStore from './authStore';

const useFavoritesStore = create((set, get) => ({
  favorites: [],
  favoriteIds: [],
  isLoading: false,

  fetchFavorites: async () => {
    const { user } = useAuthStore.getState();
    if (!user) return;
    set({ isLoading: true });
    try {
      const { data } = await usersAPI.getFavorites();
      if (data.success) {
        const ids = data.favorites.map((f) => String(f._id || f));
        set({ favorites: data.favorites, favoriteIds: ids });
        useAuthStore.getState().updateFavorites(ids);
      }
    } catch {}
    set({ isLoading: false });
  },

  toggleFavorite: async (marketId) => {
    const { user, openAuthModal } = useAuthStore.getState();
    if (!user) { openAuthModal(); return; }
    try {
      const { data } = await usersAPI.toggleFavorite(marketId);
      if (data.success) {
        const ids = get().favoriteIds.filter((id) => id !== String(marketId));
        if (data.isFavorited) ids.push(String(marketId));
        set({ favoriteIds: ids });
        useAuthStore.getState().updateFavorites(ids);
      }
    } catch {}
  },

  isFavorited: (marketId) => get().favoriteIds.includes(String(marketId)),
}));

export default useFavoritesStore;
