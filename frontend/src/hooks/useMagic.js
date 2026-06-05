import { useState } from 'react';
import { getMagic, getMagicSync, preloadMagic } from '../lib/magic';
import { authAPI } from '../services/api';
import useAuthStore from '../store/authStore';
import { clearStoredReferralCode, getStoredReferralCode } from '../lib/referralCapture';
import toast from 'react-hot-toast';

const useMagic = () => {
  const [isLoading, setIsLoading] = useState(false);
  const { setAuth } = useAuthStore();

  // Exchange a Magic DID token for our own JWT session
  const authenticateWithBackend = async (didToken, referralCode) => {
    const { data } = await authAPI.magicAuth(didToken, referralCode);
    if (data.success) {
      setAuth(data.user, data.token, data.refreshToken, data.isNewUser === true);
      toast.success(`Welcome, ${data.user.username || data.user.email}!`);
      clearStoredReferralCode();
      return true;
    }
    toast.error(data.error || 'Authentication failed');
    return false;
  };

  // Email login — Magic renders its own secure OTP UI
  const loginWithEmail = async (email, { referralCode } = {}) => {
    const magic = await getMagic();
    if (!magic) {
      toast.error('Magic is not configured. Set VITE_MAGIC_PUBLISHABLE_KEY.');
      return false;
    }
    setIsLoading(true);
    try {
      await magic.auth.loginWithEmailOTP({ email });
      const didToken = await magic.user.getIdToken();
      const ok = await authenticateWithBackend(didToken, referralCode);
      setIsLoading(false);
      return ok;
    } catch (err) {
      console.error('[Magic] Email login error:', err);
      if (err?.code === -32603 || /user.*denied|cancel/i.test(err?.message || '')) {
        toast.error('Login cancelled');
      } else {
        toast.error(err?.message || 'Email login failed');
      }
      setIsLoading(false);
      return false;
    }
  };

  // Google social login — redirect-based OAuth
  const loginWithGoogle = async () => {
    const magic = await getMagic();
    if (!magic) {
      toast.error('Magic is not configured. Set VITE_MAGIC_PUBLISHABLE_KEY.');
      return false;
    }
    try {
      // Persist referral code before redirect so it survives the OAuth round-trip
      const pendingRef = getStoredReferralCode();
      if (pendingRef) sessionStorage.setItem('pb365_pending_referral', pendingRef);

      await magic.oauth2.loginWithRedirect({
        provider: 'google',
        redirectURI: window.location.origin,
      });
      return true; // browser redirects away
    } catch (err) {
      console.error('[Magic] Google login error:', err);
      toast.error(err?.message || 'Google login failed');
      return false;
    }
  };

  // Complete OAuth flow after redirect back to the app
  const handleOAuthRedirect = async () => {
    const magic = await getMagic();
    if (!magic) return false;
    try {
      const result = await magic.oauth2.getRedirectResult();
      const didToken = result?.magic?.idToken;
      if (!didToken) return false;
      // Recover any referral code saved before the OAuth redirect
      const referralCode = sessionStorage.getItem('pb365_pending_referral') || undefined;
      sessionStorage.removeItem('pb365_pending_referral');
      return await authenticateWithBackend(didToken, referralCode);
    } catch (err) {
      const message = err?.message || '';
      const status = err?.code || err?.status;
      const isTeeFailure =
        /tee\.express\.magiclabs|wallet\/sign|sign\/message/i.test(message) ||
        /failed to fetch|network|cors/i.test(message) ||
        status === 500 ||
        status === -32603;

      // A real failure during wallet provisioning/signing (e.g. Magic TEE 500).
      // Distinguish it from the normal "no pending OAuth redirect" page load.
      if (isTeeFailure) {
        console.error('[Magic] OAuth redirect / TEE wallet error:', err);
        // Clear any stale pending referral so a retry starts clean
        sessionStorage.removeItem('pb365_pending_referral');
        toast.error(
          'Wallet sign-in service is temporarily unavailable. Please try again in a moment.'
        );
      }
      // Otherwise: no pending OAuth redirect — normal page load, stay silent.
      return false;
    }
  };

  // loginWithTelegram is intentionally NOT async — it must be a regular
  // function so that getMagicSync() + loginWithPopup() (which calls window.open
  // internally) execute in the SYNCHRONOUS part of the browser click handler.
  // The async work (waiting for the user to approve in the popup) happens on
  // the returned Promise, which the caller awaits separately.
  const loginWithTelegram = ({ referralCode } = {}) => {
    const magic = getMagicSync();
    if (!magic) {
      toast.error('Please wait a moment and try again.');
      getMagic(); // trigger load for next attempt
      return Promise.resolve(false);
    }
    // loginWithPopup opens the popup synchronously here — no await before this.
    return magic.oauth2.loginWithPopup({ provider: 'telegram' })
      .then((result) => {
        const didToken = result?.magic?.idToken;
        if (!didToken) {
          toast.error('Telegram login failed');
          return false;
        }
        const pendingRef = referralCode || getStoredReferralCode() || undefined;
        return authenticateWithBackend(didToken, pendingRef);
      })
      .catch((err) => {
        console.error('[Magic][Telegram] Error:', err?.message, err?.code);
        if (/closed|cancel|denied|blocked|popup/i.test(err?.message || '')) {
          toast.error('Telegram login cancelled');
        } else {
          toast.error(err?.message || 'Telegram login failed');
        }
        return false;
      });
  };

  // Steam social login — redirect-based (same completion path as Google)
  const loginWithSteam = async ({ referralCode } = {}) => {
    const magic = await getMagic();
    if (!magic) {
      toast.error('Magic is not configured. Set VITE_MAGIC_PUBLISHABLE_KEY.');
      return false;
    }
    try {
      // Use provided referralCode or fall back to stored code
      const pendingRef = referralCode || getStoredReferralCode();
      if (pendingRef) sessionStorage.setItem('pb365_pending_referral', pendingRef);

      await magic.oauth2.loginWithRedirect({
        provider: 'steam',
        redirectURI: window.location.origin,
      });
      return true; // browser redirects away
    } catch (err) {
      console.error('[Magic] Steam login error:', err);
      // Specific error for unconfigured Steam provider
      if (err?.code === -32603 && /steam.*not configured/i.test(err?.message || '')) {
        toast.error('Steam login is coming soon. Please use Telegram, Google, or wallet login for now.');
      } else {
        toast.error(err?.message || 'Steam login failed');
      }
      return false;
    }
  };

  const logoutMagic = async () => {
    const magic = await getMagic();
    if (!magic) return;
    try {
      const isLoggedIn = await magic.user.isLoggedIn();
      if (isLoggedIn) await magic.user.logout();
    } catch {
      /* ignore */
    }
  };

  return { isLoading, loginWithEmail, loginWithGoogle, loginWithTelegram, loginWithSteam, handleOAuthRedirect, logoutMagic, preloadMagic };
};

export default useMagic;
