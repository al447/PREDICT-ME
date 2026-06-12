import { Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { useEffect, lazy, Suspense } from 'react';
import useThemeStore from './store/themeStore';
import useAuthStore from './store/authStore';
import useFavoritesStore from './store/favoritesStore';
import useDepositModalStore from './store/depositModalStore';
import { captureReferralCode } from './lib/referralCapture';
import useMagic from './hooks/useMagic';
import PageSpinner from './components/common/PageSpinner';
import AdminRoute from './components/admin/AdminRoute';

// Public pages (lazy)
const HomePage = lazy(() => import('./pages/HomePage'));
const CategoryPage = lazy(() => import('./pages/CategoryPage'));
const PoliticsPage = lazy(() => import('./pages/PoliticsPage'));
const SportsPage = lazy(() => import('./pages/SportsPage'));
const MarketDetailPage = lazy(() => import('./pages/MarketDetailPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const LeaderboardPage = lazy(() => import('./pages/LeaderboardPage'));
const RewardsPage = lazy(() => import('./pages/RewardsPage'));
const DepositPage = lazy(() => import('./pages/DepositPage'));
const PortfolioPage = lazy(() => import('./pages/PortfolioPage'));
const ReferralPage = lazy(() => import('./pages/ReferralPage'));
const WithdrawPage = lazy(() => import('./pages/WithdrawPage'));
const ActivityPage = lazy(() => import('./pages/ActivityPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));

// Admin pages (lazy)
const AdminLoginPage = lazy(() => import('./pages/admin/AdminLoginPage'));
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const AdminMarketsList = lazy(() => import('./pages/admin/AdminMarketsList'));
const AdminMarketCreate = lazy(() => import('./pages/admin/AdminMarketCreate'));
const AdminMarketDetail = lazy(() => import('./pages/admin/AdminMarketDetail'));
const AdminMarketEdit = lazy(() => import('./pages/admin/AdminMarketEdit'));
const AdminUsersList = lazy(() => import('./pages/admin/AdminUsersList'));
const AdminUserDetail = lazy(() => import('./pages/admin/AdminUserDetail'));
const AdminAuditLogPage = lazy(() => import('./pages/admin/AdminAuditLogPage'));
const AdminReferralDashboard = lazy(() => import('./pages/admin/AdminReferralDashboard'));
const AdminDepositsPage = lazy(() => import('./pages/admin/AdminDepositsPage'));
const AdminOnChainMigration = lazy(() => import('./pages/admin/AdminOnChainMigration'));
const AdminLayout = lazy(() => import('./components/admin/AdminLayout'));

// Modals (lazy)
const AuthModal = lazy(() => import('./components/auth/AuthModal'));
const OnboardingModal = lazy(() => import('./components/auth/OnboardingModal'));
const DepositModal = lazy(() => import('./components/deposit/DepositModal'));
const WalletConnectQRModal = lazy(() => import('./components/auth/WalletConnectQRModal'));

function App() {
  const { initTheme } = useThemeStore();
  const { user, fetchMe, logout, isAuthModalOpen } = useAuthStore();
  const { fetchFavorites } = useFavoritesStore();
  const { isOpen: isDepositOpen } = useDepositModalStore();
  const { handleOAuthRedirect } = useMagic();

  // Capture referral code from URL on app load (before anything else)
  useEffect(() => {
    captureReferralCode();
  }, []);

  // Complete Magic Google OAuth redirect, if returning from the provider.
  // Only run when the URL carries query params (OAuth redirects always do) — this
  // avoids loading the heavy magic-sdk chunk on normal page loads.
  useEffect(() => {
    if (!window.location.search || window.location.search.length <= 1) return;
    handleOAuthRedirect().then((ok) => {
      if (ok) {
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    });
  }, []);

  useEffect(() => {
    initTheme();
  }, []);

  useEffect(() => {
    if (user) {
      fetchMe();
      fetchFavorites();
    }
  }, [user?.id]);

  // Auto-logout if MetaMask account changes
  useEffect(() => {
    if (!window.ethereum || !user?.walletAddress) return;
    const handleAccountsChanged = (accounts) => {
      if (!accounts.length) {
        logout();
      } else if (user.walletAddress && accounts[0].toLowerCase() !== user.walletAddress.toLowerCase()) {
        logout();
        window.location.reload();
      }
    };
    window.ethereum.on('accountsChanged', handleAccountsChanged);
    return () => window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
  }, [user?.walletAddress]);

  // Auto-logout on WalletConnect disconnect
  useEffect(() => {
    if (!user?.walletAddress) return;
    let unsubscribe;
    (async () => {
      try {
        const { getWeb3ModalInstance } = await import('./lib/web3modal');
        const modal = getWeb3ModalInstance();
        if (!modal) return;
        unsubscribe = modal.subscribeProvider(({ isConnected }) => {
          if (!isConnected && user?.walletAddress) {
            logout();
          }
        });
      } catch {}
    })();
    return () => { unsubscribe?.(); };
  }, [user?.walletAddress]);

  return (
    <>
      <Suspense fallback={<PageSpinner />}>
        <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/crypto" element={<CategoryPage />} />
        <Route path="/sports" element={<SportsPage />} />
        <Route path="/sports/live" element={<SportsPage />} />
        <Route path="/sports/futures" element={<SportsPage />} />
        <Route path="/weather" element={<CategoryPage />} />
        <Route path="/politics" element={<PoliticsPage />} />
        <Route path="/finance" element={<CategoryPage />} />
        <Route path="/new" element={<CategoryPage />} />
        <Route path="/breaking" element={<CategoryPage />} />
        <Route path="/esports" element={<CategoryPage />} />
        <Route path="/iran" element={<CategoryPage />} />
        <Route path="/geopolitics" element={<CategoryPage />} />
        <Route path="/tech" element={<CategoryPage />} />
        <Route path="/culture" element={<CategoryPage />} />
        <Route path="/economy" element={<CategoryPage />} />
        <Route path="/elections" element={<CategoryPage />} />
        <Route path="/market/:slug" element={<MarketDetailPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/leaderboard" element={<LeaderboardPage />} />
        <Route path="/rewards" element={<RewardsPage />} />
        <Route path="/deposit" element={<DepositPage />} />
        <Route path="/portfolio" element={<PortfolioPage />} />
        <Route path="/referral" element={<ReferralPage />} />
        <Route path="/withdraw" element={<WithdrawPage />} />
        <Route path="/activity" element={<ActivityPage />} />

        {/* Admin routes */}
        <Route path="/admin/login" element={<AdminLoginPage />} />
        <Route path="/admin" element={<AdminRoute><AdminLayout /></AdminRoute>}>
          <Route index element={<AdminDashboard />} />
          <Route path="markets" element={<AdminMarketsList />} />
          <Route path="markets/create" element={<AdminMarketCreate />} />
          <Route path="markets/:id" element={<AdminMarketDetail />} />
          <Route path="markets/:id/edit" element={<AdminMarketEdit />} />
          <Route path="markets/migrate" element={<AdminOnChainMigration />} />
          <Route path="users" element={<AdminUsersList />} />
          <Route path="users/:id" element={<AdminUserDetail />} />
          <Route path="audit-log" element={<AdminAuditLogPage />} />
          <Route path="referrals" element={<AdminReferralDashboard />} />
          <Route path="deposits" element={<AdminDepositsPage />} />
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      </Suspense>

      <Suspense fallback={null}>
        {isAuthModalOpen && <AuthModal />}
        <OnboardingModal />
        {isDepositOpen && <DepositModal />}
        <WalletConnectQRModal />
      </Suspense>

      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: 'var(--color-surface)',
            color: 'var(--color-text)',
            border: '1px solid var(--color-border)',
            borderRadius: '12px',
          },
          success: { iconTheme: { primary: '#00c853', secondary: 'white' } },
          error: { iconTheme: { primary: '#ff1744', secondary: 'white' } },
        }}
      />
    </>
  );
}

export default App;
