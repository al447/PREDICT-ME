import axios from 'axios';
import api from './api'; // Default api instance for public endpoints

const _depositBase = axios.create({
  baseURL: import.meta.env.VITE_BACKEND_URL ? import.meta.env.VITE_BACKEND_URL + '/api/deposits' : '/api/deposits',
  timeout: 30000,
});
_depositBase.interceptors.request.use((config) => {
  const token = localStorage.getItem('pb365_admin_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

const adminApi = axios.create({
  baseURL: import.meta.env.VITE_BACKEND_URL ? import.meta.env.VITE_BACKEND_URL + '/api/admin' : '/api/admin',
  timeout: 30000,
});

adminApi.interceptors.request.use((config) => {
  const token = localStorage.getItem('pb365_admin_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

adminApi.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('pb365_admin_token');
      localStorage.removeItem('pb365_admin');
      if (!window.location.pathname.includes('/admin/login')) {
        window.location.href = '/admin/login';
      }
    }
    return Promise.reject(err);
  }
);

export const adminAuthAPI = {
  login: (data) => adminApi.post('/auth/login', data),
  logout: () => adminApi.post('/auth/logout'),
  me: () => adminApi.get('/auth/me'),
  changePassword: (data) => adminApi.post('/auth/change-password', data),
};

export const adminMarketsAPI = {
  list: (params) => adminApi.get('/markets', { params }),
  getOne: (id) => adminApi.get(`/markets/${id}`),
  create: (data) => adminApi.post('/markets', data),
  update: (id, data) => adminApi.patch(`/markets/${id}`, data),
  close: (id) => adminApi.post(`/markets/${id}/close`),
  reopen: (id) => adminApi.post(`/markets/${id}/reopen`),
  resolve: (id, data) => adminApi.post(`/markets/${id}/resolve`, typeof data === 'string' ? { outcome: data } : data),
  remove: (id) => adminApi.delete(`/markets/${id}`),
};

export const adminUsersAPI = {
  list: (params) => adminApi.get('/users', { params }),
  getOne: (id) => adminApi.get(`/users/${id}`),
  ban: (id) => adminApi.patch(`/users/${id}/ban`),
  unban: (id) => adminApi.patch(`/users/${id}/unban`),
  adjustBalance: (id, amount, reason) => adminApi.patch(`/users/${id}/balance`, { amount, reason }),
  changeRole: (id, role) => adminApi.patch(`/users/${id}/role`, { role }),
};

export const adminDepositAPI = {
  list: (params) => _depositBase.get('/admin/list', { params }),
  stats: () => _depositBase.get('/admin/stats'),
  priceSuggestion: (id) => _depositBase.get(`/admin/${id}/price-suggestion`),
  credit: (id, amountUsd) => _depositBase.post(`/admin/${id}/credit`, { amountUsd }),
  reject: (id, reason) => _depositBase.post(`/admin/${id}/reject`, { reason }),
};

export const adminDashboardAPI = {
  stats: () => adminApi.get('/dashboard/stats'),
  volumeChart: (days = 30) => adminApi.get('/dashboard/volume-chart', { params: { days } }),
  recentActivity: (limit = 20) => adminApi.get('/dashboard/recent-activity', { params: { limit } }),
  trending: (limit = 10) => adminApi.get('/dashboard/trending-markets', { params: { limit } }),
  auditLog: (params) => adminApi.get('/dashboard/audit-log', { params }),
  pendingStats: () => {
    const token = localStorage.getItem('pb365_admin_token');
    return api.get('/markets/admin/pending-stats', { headers: { Authorization: `Bearer ${token}` } });
  },
};

export const adminReferralAPI = {
  getStats: () => adminApi.get('/referral/stats'),
  getConfig: () => adminApi.get('/referral/config'),
  updateConfig: (data) => adminApi.put('/referral/config', data),
  listReferrals: (params) => adminApi.get('/referral/list', { params }),
  listCommissions: (params) => adminApi.get('/referral/commissions', { params }),
  adjust: (userId, data) => adminApi.post(`/referral/users/${userId}/adjust`, data),
  ban: (userId, banned) => adminApi.post(`/referral/users/${userId}/ban`, { banned }),
  forceQualify: (refId) => adminApi.post(`/referral/${refId}/qualify`),
  revoke: (refId) => adminApi.post(`/referral/${refId}/revoke`),
  getLeaderboard: (params) => adminApi.get('/referral/leaderboard', { params }),
};

export default adminApi;
