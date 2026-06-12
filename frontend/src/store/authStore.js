import { create } from 'zustand';
import { authAPI } from '../services/api';
import { getMagic } from '../lib/magic';

const getStoredUser = () => {
  try { return JSON.parse(localStorage.getItem('pb365_user')); } catch { return null; }
};

const useAuthStore = create((set, get) => ({
  user: getStoredUser(),
  token: localStorage.getItem('pb365_token'),
  isAuthModalOpen: false,
  isNewUser: false,
  isLoading: false,
  error: null,

  setAuth: (user, token, refreshToken, isNewUser = false) => {
    localStorage.setItem('pb365_token', token);
    localStorage.setItem('pb365_user', JSON.stringify(user));
    if (refreshToken) localStorage.setItem('pb365_refresh_token', refreshToken);
    set({ user, token, error: null, isNewUser });
  },

  updateUser: (partial) => {
    const user = { ...get().user, ...partial };
    localStorage.setItem('pb365_user', JSON.stringify(user));
    set({ user });
  },

  clearNewUser: () => set({ isNewUser: false }),

  updateBalance: (balance) => {
    const user = { ...get().user, balance };
    localStorage.setItem('pb365_user', JSON.stringify(user));
    set({ user });
  },

  // Fetch latest balance from backend and sync everywhere
  refreshBalance: async () => {
    try {
      const token = get().token;
      if (!token) return;
      const { data } = await authAPI.getMe();
      if (data.success) {
        const updatedUser = { ...get().user, ...data.user };
        localStorage.setItem('pb365_user', JSON.stringify(updatedUser));
        set({ user: updatedUser });
      }
    } catch {}
  },

  updateFavorites: (favorites) => {
    const user = { ...get().user, favorites };
    localStorage.setItem('pb365_user', JSON.stringify(user));
    set({ user });
  },

  logout: async () => {
    try { await authAPI.logout(); } catch {}
    try {
      const magic = await getMagic();
      if (magic && (await magic.user.isLoggedIn())) await magic.user.logout();
    } catch {}
    localStorage.removeItem('pb365_token');
    localStorage.removeItem('pb365_user');
    localStorage.removeItem('pb365_refresh_token');
    set({ user: null, token: null });
  },

  openAuthModal: () => set({ isAuthModalOpen: true }),
  closeAuthModal: () => set({ isAuthModalOpen: false }),

  fetchMe: async () => {
    try {
      const { data } = await authAPI.getMe();
      if (data.success) {
        const updatedUser = { ...get().user, ...data.user };
        localStorage.setItem('pb365_user', JSON.stringify(updatedUser));
        set({ user: updatedUser });
      }
    } catch {}
  },
}));

export default useAuthStore;
