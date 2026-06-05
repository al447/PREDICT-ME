import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import useAuthStore from '../../store/authStore';
import useWallet from '../../hooks/useWallet';
import useMagic from '../../hooks/useMagic';
import { getStoredReferralCode, clearStoredReferralCode } from '../../lib/referralCapture';
import { MoreHorizontal } from 'lucide-react';

/* ── Icon-only square tile (Polymarket style) ── */
const IconTile = ({ name, icon, disabled, loading, onClick, customIcon }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    title={name}
    className="flex items-center justify-center w-full aspect-square rounded-xl bg-[#1e2130] hover:bg-[#252840] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
  >
    {loading ? (
      <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
    ) : customIcon ? (
      customIcon
    ) : (
      <img src={icon} alt={name} className="w-8 h-8 object-contain" />
    )}
  </button>
);

/* ── Auth Modal ── */
const AuthModal = () => {
  const { isAuthModalOpen, closeAuthModal } = useAuthStore();
  const { connectInjectedWallet, connectWalletConnect } = useWallet();
  const { loginWithEmail, loginWithGoogle, loginWithTelegram, loginWithSteam, preloadMagic } = useMagic();
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isTelegramLoading, setIsTelegramLoading] = useState(false);
  const [isSteamLoading, setIsSteamLoading] = useState(false);
  const [connectingWallet, setConnectingWallet] = useState(null);
  const [showMore, setShowMore] = useState(false);

  const referralCode = isAuthModalOpen ? (getStoredReferralCode() || '') : '';
  const anyBusy = isLoading || isGoogleLoading || isTelegramLoading || isSteamLoading || !!connectingWallet;

  useEffect(() => {
    if (isAuthModalOpen) {
      // Warm up the Magic SDK as soon as the modal opens so the popup-based
      // flows (Telegram) have the SDK already cached by the time user clicks.
      // This ensures loginWithPopup runs synchronously within the user gesture.
      preloadMagic();
    } else {
      setEmail('');
      setIsLoading(false);
      setConnectingWallet(null);
      setShowMore(false);
    }
  }, [isAuthModalOpen]);

  const handleGoogle = async () => {
    setIsGoogleLoading(true);
    await loginWithGoogle();
    setIsGoogleLoading(false);
  };

  const handleTelegram = () => {
    // NOT async — loginWithTelegram() is a sync function that calls
    // getMagicSync() + loginWithPopup() (window.open) immediately in the
    // synchronous click handler before any microtask/await can fire.
    setIsTelegramLoading(true);
    loginWithTelegram({ referralCode }).then((ok) => {
      if (ok) { clearStoredReferralCode(); closeAuthModal(); }
      setIsTelegramLoading(false);
    });
  };

  const handleSteam = async () => {
    setIsSteamLoading(true);
    const ok = await loginWithSteam({ referralCode });
    if (ok) { clearStoredReferralCode(); closeAuthModal(); }
    setIsSteamLoading(false);
  };

  const handleWallet = async (walletId) => {
    setConnectingWallet(walletId);
    const ok = await connectInjectedWallet(walletId, { referralCode });
    if (ok) { clearStoredReferralCode(); closeAuthModal(); }
    setConnectingWallet(null);
  };

  const handleWalletConnect = async () => {
    setConnectingWallet('walletconnect');
    const ok = await connectWalletConnect({ referralCode });
    if (ok) { clearStoredReferralCode(); closeAuthModal(); }
    setConnectingWallet(null);
  };

  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    setIsLoading(true);
    const ok = await loginWithEmail(email.trim(), { referralCode });
    setIsLoading(false);
    if (ok) closeAuthModal();
  };

  if (!isAuthModalOpen) return null;

  // Row 1: Telegram, Steam, MetaMask, Rabby
  // Row 2: Coinbase, Phantom, Rabby, ... (dots expands to show Bitget + WalletConnect)
  const mainTiles = [
    // {
    //   id: 'telegram', name: 'Telegram', icon: '/icons/telegram.svg',
    //   loading: isTelegramLoading,
    //   onClick: handleTelegram,
    // },
    // {
    //   id: 'steam', name: 'Steam', icon: '/icons/steam.svg',
    //   loading: isSteamLoading,
    //   onClick: handleSteam,
    // },
    {
      id: 'metamask', name: 'MetaMask', icon: '/icons/metamask.svg',
      loading: connectingWallet === 'metamask',
      onClick: () => handleWallet('metamask'),
    },
    // {
    //   id: 'rabby', name: 'Rabby', icon: '/icons/rabby.png',
    //   loading: connectingWallet === 'rabby',
    //   onClick: () => handleWallet('rabby'),
    // },
    // {
    //   id: 'coinbase', name: 'Coinbase', icon: '/icons/coinbase.svg',
    //   loading: connectingWallet === 'coinbase',
    //   onClick: () => handleWallet('coinbase'),
    // },
    // {
    //   id: 'okx', name: 'OKX Wallet', icon: '/icons/okx.png',
    //   loading: connectingWallet === 'okx',
    //   onClick: () => handleWallet('okx'),
    // },
    // {
    //   id: 'bitget', name: 'Bitget', icon: '/icons/bitget.jpg',
    //   loading: connectingWallet === 'bitget',
    //   onClick: () => handleWallet('bitget'),
    // },
  ];

  const moreTiles = [
    // {
    //   id: 'phantom', name: 'Phantom', icon: '/icons/phantom.png',
    //   loading: connectingWallet === 'phantom',
    //   onClick: () => handleWallet('phantom'),
    // },
    {
      id: 'walletconnect', name: 'WalletConnect', icon: '/icons/walletconnect.svg',
      loading: connectingWallet === 'walletconnect',
      onClick: handleWalletConnect,
    },
  ];

  return (
    <AnimatePresence>
      {isAuthModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={closeAuthModal}
          />

          {/* Modal panel */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 16 }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
            className="relative w-full max-w-[420px] bg-[#13151f] rounded-2xl shadow-2xl z-10 mx-2 max-h-[92vh] overflow-y-auto"
          >
            <div className="px-5 pt-7 pb-6">

              {/* Title */}
              <h2 className="text-[22px] font-bold text-center text-white mb-5">
                Welcome to PolyBet365
              </h2>

              {/* ── Full-width Google button (Polymarket style) ── */}
              <button
                type="button"
                onClick={handleGoogle}
                disabled={anyBusy}
                className="w-full flex items-center justify-center gap-3 py-3.5 rounded-xl bg-[#1d9bf0] hover:bg-[#1a8cd8] active:bg-[#1a7bbf] text-white font-semibold text-[15px] transition-colors disabled:opacity-50 disabled:cursor-not-allowed mb-4"
              >
                {isGoogleLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <img src="/icons/google.svg" alt="Google" className="w-5 h-5" />
                )}
                Continue with Google
              </button>

              {/* OR divider */}
              <div className="flex items-center gap-3 mb-4">
                <div className="flex-1 h-px bg-white/10" />
                <span className="text-sm text-gray-500 font-medium">OR</span>
                <div className="flex-1 h-px bg-white/10" />
              </div>

              {/* ── Email + Continue (inline, Polymarket style) ── */}
              <form onSubmit={handleEmailSubmit} className="flex gap-0 rounded-xl border border-white/10 overflow-hidden focus-within:border-white/25 transition-colors mb-4">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email address"
                  className="flex-1 min-w-0 px-4 py-3 bg-transparent text-white placeholder:text-gray-500 outline-none text-sm"
                />
                <button
                  type="submit"
                  disabled={isLoading || !email.trim()}
                  className="px-5 py-3 bg-[#2c3252] hover:bg-[#353b5e] text-white text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0 flex items-center gap-2"
                >
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Continue'}
                </button>
              </form>

              {/* ── 4-column icon grid (Polymarket style) ── */}
              <div className="grid grid-cols-4 gap-2.5 mb-5">
                {mainTiles.map((t) => (
                  <IconTile
                    key={t.id}
                    name={t.name}
                    icon={t.icon}
                    loading={t.loading}
                    disabled={anyBusy}
                    onClick={t.onClick}
                  />
                ))}

                {/* ... more button — hidden once expanded */}
                {!showMore && (
                  <button
                    type="button"
                    onClick={() => setShowMore(true)}
                    disabled={anyBusy}
                    title="More options"
                    className="flex items-center justify-center w-full aspect-square rounded-xl bg-[#1e2130] hover:bg-[#252840] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <MoreHorizontal className="w-6 h-6 text-gray-400" />
                  </button>
                )}

                {/* Expanded: Bitget + WalletConnect */}
                <AnimatePresence>
                  {showMore && moreTiles.map((t) => (
                    <motion.div
                      key={t.id}
                      initial={{ opacity: 0, scale: 0.85 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.85 }}
                      transition={{ duration: 0.15 }}
                    >
                      <IconTile
                        name={t.name}
                        icon={t.icon}
                        loading={t.loading}
                        disabled={anyBusy}
                        onClick={t.onClick}
                      />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>

              {/* Terms + Privacy */}
              <p className="text-center text-xs text-gray-500">
                <a href="/terms" target="_blank" rel="noopener noreferrer" className="hover:text-gray-300 transition-colors">Terms</a>
                <span className="mx-2">•</span>
                <a href="/privacy" target="_blank" rel="noopener noreferrer" className="hover:text-gray-300 transition-colors">Privacy</a>
              </p>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default AuthModal;
