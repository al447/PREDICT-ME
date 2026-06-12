import axios from 'axios';

const api = axios.create({
  baseURL: (import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000') + '/api',
  // 45s tolerates a backend cold-start wake-up (Render free tier) instead of
  // failing at 15s and triggering retries. Keep-alive cron keeps it warm in
  // steady state, so requests normally complete near-instantly.
  timeout: 45000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('pb365_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let isRefreshing = false;
let refreshQueue = [];

const processQueue = (error, token = null) => {
  refreshQueue.forEach((p) => (error ? p.reject(error) : p.resolve(token)));
  refreshQueue = [];
};

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config;
    const data = err.response?.data;

    if (err.response?.status === 401 && data?.code === 'TOKEN_EXPIRED' && !original._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          refreshQueue.push({ resolve, reject });
        }).then((token) => {
          original.headers.Authorization = `Bearer ${token}`;
          return api(original);
        });
      }

      original._retry = true;
      isRefreshing = true;

      const storedRefresh = localStorage.getItem('pb365_refresh_token');
      if (!storedRefresh) {
        localStorage.removeItem('pb365_token');
        localStorage.removeItem('pb365_user');
        localStorage.removeItem('pb365_refresh_token');
        isRefreshing = false;
        return Promise.reject(err);
      }

      try {
        const { data: refreshData } = await axios.post(
          `${api.defaults.baseURL}/auth/refresh`,
          { refreshToken: storedRefresh }
        );
        const newToken = refreshData.token;
        const newRefresh = refreshData.refreshToken;
        localStorage.setItem('pb365_token', newToken);
        if (newRefresh) localStorage.setItem('pb365_refresh_token', newRefresh);
        api.defaults.headers.common.Authorization = `Bearer ${newToken}`;
        processQueue(null, newToken);
        original.headers.Authorization = `Bearer ${newToken}`;
        return api(original);
      } catch (refreshErr) {
        processQueue(refreshErr, null);
        localStorage.removeItem('pb365_token');
        localStorage.removeItem('pb365_user');
        localStorage.removeItem('pb365_refresh_token');
        return Promise.reject(refreshErr);
      } finally {
        isRefreshing = false;
      }
    }

    if (err.response?.status === 401 && !original._retry) {
      localStorage.removeItem('pb365_token');
      localStorage.removeItem('pb365_user');
      localStorage.removeItem('pb365_refresh_token');
    }
    return Promise.reject(err);
  }
);

export const authAPI = {
  magicAuth: (didToken, referralCode) => api.post('/auth/magic', { didToken, referralCode }),
  walletAuth: (data) => api.post('/auth/wallet', data),
  refresh: (refreshToken) => api.post('/auth/refresh', { refreshToken }),
  getMe: () => api.get('/auth/me'),
  logout: () => api.post('/auth/logout', { refreshToken: localStorage.getItem('pb365_refresh_token') }),
};

export const referralAPI = {
  getMe: () => api.get('/referral/me'),
  getHistory: (params) => api.get('/referral/history', { params }),
  apply: (code) => api.post('/referral/apply', { code }),
  validate: (code) => api.get(`/referral/validate/${code}`),
};

export const marketsAPI = {
  getMarkets: (params) => api.get('/markets', { params }),
  getFeatured: () => api.get('/markets/featured'),
  getBySlug: (slug) => api.get(`/markets/${slug}`),
  getPriceHistory: (slug, days = 30) => api.get(`/markets/${slug}/price-history`, { params: { days } }),
  getCryptoPriceHistory: (slug, rangeOrDays = 30) => {
    const isRange = typeof rangeOrDays === 'string' && ['1H','6H','1D','1W','1M','ALL'].includes(rangeOrDays);
    return api.get(`/markets/${slug}/crypto-price-history`, {
      params: isRange ? { range: rangeOrDays } : { days: rangeOrDays },
    });
  },
};

export const categoriesAPI = {
  getAll: () => api.get('/categories'),
  getBySlug: (slug) => api.get(`/categories/${slug}`),
};

export const tradesAPI = {
  place: (data) => api.post('/trades', data),
  getMy: (params) => api.get('/trades/my', { params }),
  getPositions: () => api.get('/trades/positions'),
  getLeaderboard: (params) => api.get('/trades/leaderboard', { params }),
};

export const clobAPI = {
  getDomain: () => api.get('/clob/domain'),
  placeOrder: (data) => api.post('/clob/order', data),
  cancelOrder: (orderId) => api.delete(`/clob/order/${orderId}`),
  getOrders: (params) => api.get('/clob/orders', { params }),
  getOrderBook: (conditionId, tokenId, depth) =>
    api.get(`/clob/orderbook/${conditionId}/${tokenId}`, { params: { depth } }),
};

export const usersAPI = {
  getProfile: () => api.get('/users/profile'),
  updateProfile: (data) => api.patch('/users/profile', data),
  getPositions: () => api.get('/users/positions'),
  toggleFavorite: (marketId) => api.post(`/users/favorites/${marketId}`),
  getFavorites: () => api.get('/users/favorites'),
  deposit: (amount, txHash) => api.post('/users/deposit', { amount, txHash }),
  withdraw: (amount) => api.post('/users/withdraw', { amount }),
  getTransactions: (params) => api.get('/users/transactions', { params }),
};

export const depositAPI = {
  getAddresses: () => api.get('/deposits/addresses'),
  claim: (data) => api.post('/deposits/claim', data),
  getMine: () => api.get('/deposits/mine'),
  // MoonPay embedded widget
  moonpaySession: (data) => api.post('/deposits/moonpay/session', data),
  moonpaySignUrl: (url) => api.post('/deposits/moonpay/sign-url', { url }),
  moonpayGetSession: (externalTxId) => api.get(`/deposits/moonpay/session/${externalTxId}`),
  moonpaySellSession: (data) => api.post('/deposits/moonpay/sell-session', data),
  // Non-custodial bridge deposits
  getBridgeQuote: (data) => api.post('/deposits/bridge/quote', data),
  getBridgeStatus: (id) => api.get(`/deposits/bridge/status/${id}`),
};

export const bridgeAPI = {
  getSupportedAssets:  ()     => api.get('/bridge/supported-assets'),
  getDepositAddresses: ()     => api.get('/bridge/deposit-addresses'),
  getStatus:           (id)   => api.get(`/bridge/status/${id}`),
  getDeposits:         ()     => api.get('/bridge/deposits'),
  quote:               (body) => api.post('/bridge/quote', body),
  withdraw:            (body) => api.post('/bridge/withdraw', body),
  getWithdrawals:      ()     => api.get('/bridge/withdrawals'),
};

export const onchainAPI = {
  getStatus:      () => api.get('/onchain/status'),
  getMyWallet:    () => api.get('/onchain/my-wallet'),
  deployMyWallet: () => api.post('/onchain/my-wallet/deploy'),
  getWallet:      (owner)           => api.get(`/onchain/wallet/${owner}`),
  getUsdcBalance: (address)         => api.get(`/onchain/usdc/balance/${address}`),
  getPosition:    (address, tokenId)=> api.get(`/onchain/position/${address}/${tokenId}`),
  getPayouts:     (conditionId)     => api.get(`/onchain/payouts/${conditionId}`),
  // Redemption
  getRedeemable:  (conditionId)     => api.get(`/onchain/positions/${conditionId}/redeemable`),
  redeem:         (conditionId)     => api.post(`/onchain/positions/${conditionId}/redeem`),
  // Withdrawal (non-custodial, gasless)
  prepareWithdrawal: (data)         => api.post('/onchain/withdraw/prepare', data),
  execWithdrawal:    (data)         => api.post('/onchain/withdraw/exec', data),
  // Admin market publishing
  getPendingMarkets: ()             => api.get('/onchain/markets/pending'),
  publishMarket:     (marketId)     => api.post(`/onchain/market/${marketId}/publish`),
};

export const polymarketAPI = {
  getEvents: (params) => api.get('/polymarket/events', { params }),
  getEventBySlug: (slug) => api.get(`/polymarket/events/${slug}`),
  getPricesHistory: (market, interval = '1w', fidelity = 30) =>
    api.get('/polymarket/prices-history', { params: { market, interval, fidelity } }),
  getBatchPricesHistory: (markets, interval = '1w', fidelity = 30) =>
    api.post('/polymarket/prices-history/batch', { markets, interval, fidelity }),
  search: (q, limit = 10) => api.get('/polymarket/search', { params: { q, limit } }),
  getCryptoPrice: (symbol) => api.get('/polymarket/crypto/price-history', { params: { symbol } }),
  // Social proxies
  getComments: (eventSlug, limit = 20, offset = 0) =>
    api.get('/polymarket/social/comments', { params: { eventSlug, limit, offset } }),
  getHolders: (conditionId, limit = 10) =>
    api.get('/polymarket/social/holders', { params: { conditionId, limit } }),
  getActivity: (conditionId, limit = 20, offset = 0) =>
    api.get('/polymarket/social/activity', { params: { conditionId, limit, offset } }),
};

export const notificationAPI = {
  getNotifications: (params) => api.get('/notifications', { params }),
  getUnreadCount: () => api.get('/notifications', { params: { unreadOnly: true } }),
  markAsRead: (id) => api.put(`/notifications/${id}/read`),
  markAllAsRead: () => api.put('/notifications/read-all'),
  deleteNotification: (id) => api.delete(`/notifications/${id}`),
};

export default api;
