import { create } from 'zustand';
import { adminAuthAPI } from '../services/adminApi';

const useAdminAuthStore = create((set, get) => ({
  admin: (() => { try { return JSON.parse(localStorage.getItem('pb365_admin') || 'null'); } catch { return null; } })(),
  token: localStorage.getItem('pb365_admin_token'),
  isLoading: false,

  setAdmin: (admin, token) => {
    localStorage.setItem('pb365_admin_token', token);
    localStorage.setItem('pb365_admin', JSON.stringify(admin));
    set({ admin, token });
  },

  logout: async () => {
    try { await adminAuthAPI.logout(); } catch {}
    localStorage.removeItem('pb365_admin_token');
    localStorage.removeItem('pb365_admin');
    set({ admin: null, token: null });
  },

  fetchMe: async () => {
    try {
      const { data } = await adminAuthAPI.me();
      if (data.success) {
        localStorage.setItem('pb365_admin', JSON.stringify(data.admin));
        set({ admin: data.admin });
      }
    } catch {
      get().logout();
    }
  },
}));

export default useAdminAuthStore;
