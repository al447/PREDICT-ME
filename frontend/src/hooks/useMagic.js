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
      if (!result?.magic) return false;

      // Prefer a freshly-minted token from magic.user.getIdToken() — the idToken
      // embedded in getRedirectResult() is sometimes an OAuth-scoped token that
      // the Admin SDK cannot verify with ecRecover. A fresh getIdToken() call
      // always returns a standard DID token that the backend can validate.
      let didToken;
      try {
        didToken = await magic.user.getIdToken();
      } catch {
        didToken = result?.magic?.idToken;
      }
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

  // Telegram social login — popup-based OAuth2 (Magic Telegram only supports popup,
  // redirect returns -32602). The popup MUST open with zero async/setState before it
  // or the browser blocks it, so we call loginWithPopup as the first sync statement.
  const loginWithTelegram = ({ referralCode } = {}) => {
    const magic = getMagicSync();
    if (!magic) {
      toast.error('Magic is not configured. Set VITE_MAGIC_PUBLISHABLE_KEY.');
      return Promise.resolve(false);
    }

    // 1) Fire the popup synchronously — this is the user-gesture window.open call.
    const loginPromise = magic.oauth2.loginWithPopup({ provider: 'telegram' });

    // 2) Persist referral (sync) after the popup has been requested.
    const pendingRef = referralCode || getStoredReferralCode();
    if (pendingRef) sessionStorage.setItem('pb365_pending_referral', pendingRef);

    // 3) Resolve the rest asynchronously.
    return (async () => {
      try {
        const result = await loginPromise;
        const didToken = result?.magic?.idToken || (await magic.user.getIdToken());
        if (!didToken) return false;

        const ref = sessionStorage.getItem('pb365_pending_referral') || pendingRef || undefined;
        sessionStorage.removeItem('pb365_pending_referral');
        return await authenticateWithBackend(didToken, ref);
      } catch (err) {
        if (err?.code === -32603 && /denied|cancel|closed/i.test(err?.message || '')) {
          console.warn('[Magic][Telegram] User cancelled login');
          return false;
        }
        if (err?.code === -32603 && /popup|blocked/i.test(err?.message || '')) {
          toast.error('Popup was blocked. Allow popups for this site, then try again.', { duration: 6000 });
          return false;
        }
        if (err?.message?.includes('-10012') || err?.code === -10012) {
          toast.error('Telegram login is not fully configured yet. Please try Google login or a wallet instead.', { duration: 6000 });
          return false;
        }
        console.error('[Magic][Telegram] Error:', err?.message, err?.code);
        toast.error('Telegram login failed. Please try again or use a different login method.');
        return false;
      }
    })();
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
      const notEnabled =
        (err?.code === -32603 || err?.code === -32602) &&
        /not configured|not supported|not enabled|route/i.test(err?.message || '');
      if (notEnabled) {
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
