import { useState } from 'react';
import { authAPI } from '../services/api';
import useAuthStore from '../store/authStore';
import useWcModalStore from '../store/wcModalStore';
import { getProviderFor, getCoinbaseProvider, WALLETS } from '../lib/walletProviders';
import toast from 'react-hot-toast';

// Legacy helper kept for backward compat (used in App.jsx auto-logout effect)
export const getInjectedProvider = () => {
  if (typeof window === 'undefined') return null;
  if (window.ethereum) return window.ethereum;
  if (window.rabby) return window.rabby;
  if (window.phantom?.ethereum) return window.phantom.ethereum;
  return null;
};

const useWallet = () => {
  const [isConnecting, setIsConnecting] = useState(false);
  const { setAuth } = useAuthStore();

  // ─── Shared sign-in flow for any injected EIP-1193 provider ───────────────
  const signInWithInjectedProvider = async (injected, { referralCode, walletName = 'Wallet' } = {}) => {
    try {
      // Request accounts — Coinbase Smart Wallet handles the full auth flow here.
      // We use the address returned directly by eth_requestAccounts to avoid an
      // extra eth_accounts round-trip (every round-trip through the Coinbase
      // Smart Wallet popup adds latency that can make it report "Request Cancelled").
      let accounts;
      try {
        accounts = await injected.request({ method: 'eth_requestAccounts' });
      } catch (permErr) {
        if (permErr.code === 4001 || permErr.code === -32000) throw permErr;
        // Some wallets need wallet_requestPermissions instead
        try {
          await injected.request({ method: 'wallet_requestPermissions', params: [{ eth_accounts: {} }] });
          accounts = await injected.request({ method: 'eth_accounts' });
        } catch { /* ignore */ }
      }

      if (!accounts?.length) {
        toast.error(`No account selected in ${walletName}`);
        return false;
      }
      const walletAddress = accounts[0];
      console.log(`[${walletName}] User selected:`, walletAddress);

      // Read the connected chain via the lightweight eth_chainId call (cached by
      // the wallet) rather than ethers' getNetwork(), which forces an RPC
      // round-trip and delays the signature prompt.
      let chainId;
      try {
        const hexChain = await injected.request({ method: 'eth_chainId' });
        chainId = Number(hexChain);
      } catch { /* ignore — backend falls back to a default chain */ }

      const timestamp = Date.now();
      const message = `Sign in to PolyBet365\nAddress: ${walletAddress}\nTimestamp: ${timestamp}`;

      // Sign immediately via raw personal_sign (hex-encoded message). This is the
      // most reliable signing path for Coinbase Smart Wallet — it reuses the
      // already-open popup session and avoids ethers' extra getSigner/getAddress
      // round-trips that were causing "Request Cancelled".
      const hexMessage = '0x' + Array.from(new TextEncoder().encode(message))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');

      console.log(`[${walletName}] Requesting signature for`, walletAddress, 'on chain', chainId);
      const signature = await injected.request({
        method: 'personal_sign',
        params: [hexMessage, walletAddress],
      });

      const { data } = await authAPI.walletAuth({ walletAddress, signature, message, referralCode, chainId });
      if (data.success) {
        setAuth(data.user, data.token, data.refreshToken, data.isNewUser === true);
        toast.success(`${walletName} connected!`);
        return true;
      }
      toast.error(data.error || 'Authentication failed');
      return false;
    } catch (err) {
      console.error(`[${walletName}] Error:`, err.code, err.message);
      if (err.code === 'ACTION_REJECTED' || err.code === 4001 || err?.info?.error?.code === 4001) {
        toast.error('Connection rejected by user');
      } else if (err.code === -32002) {
        toast.error(`${walletName} is busy. Please open it and approve the pending request.`);
      } else if (err.response?.data?.error) {
        toast.error(err.response.data.error);
      } else if (err.message?.includes('user rejected')) {
        toast.error('Connection rejected by user');
      } else {
        toast.error(`Wallet error: ${err.shortMessage || err.message || 'Unknown error'}`);
      }
      return false;
    }
  };

  // ─── Connect a specific wallet by ID ──────────────────────────────────────
  const connectInjectedWallet = async (walletId, { referralCode } = {}) => {
    const walletCfg = WALLETS.find((w) => w.id === walletId);
    if (!walletCfg) {
      toast.error('Unknown wallet');
      return false;
    }
    setIsConnecting(true);

    // Coinbase: always use SDK (smartWalletOnly) — it opens keys.coinbase.com
    // with the correct signed auth params internally.
    if (walletId === 'coinbase') {
      const cbProvider = getCoinbaseProvider();
      if (cbProvider) {
        const ok = await signInWithInjectedProvider(cbProvider, { referralCode, walletName: 'Coinbase Wallet' });
        setIsConnecting(false);
        return ok;
      }
    }

    const provider = getProviderFor(walletId);

    if (provider) {
      const ok = await signInWithInjectedProvider(provider, { referralCode, walletName: walletCfg.name });
      setIsConnecting(false);
      return ok;
    }

    // Not installed: WalletConnect QR fallback for mobile-capable wallets
    if (walletCfg.supportsWalletConnect) {
      const ok = await connectWalletConnect({ referralCode, walletName: walletCfg.name, installUrl: walletCfg.installUrl });
      setIsConnecting(false);
      return ok;
    }

    // Desktop-only wallets with no WC fallback — direct to install/connect page
    toast(`${walletCfg.name} not detected. Opening install page...`, { icon: '🔗' });
    window.open(walletCfg.installUrl, '_blank');
    setIsConnecting(false);
    return false;
  };

  // ─── Legacy generic wallet connect (MetaMask first injected provider) ─────
  const connectWallet = async ({ referralCode } = {}) => {
    return connectInjectedWallet('metamask', { referralCode });
  };

  const connectWalletConnect = async ({ referralCode, walletName, installUrl } = {}) => {
    setIsConnecting(true);
    let wcProvider = null;
    try {
      const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || '';
      if (!projectId || projectId === 'placeholder_walletconnect_project_id') {
        toast.error('WalletConnect not configured. Set VITE_WALLETCONNECT_PROJECT_ID in .env');
        setIsConnecting(false);
        return false;
      }

      // Clear any stale WalletConnect sessions from localStorage to prevent
      // "Pending session not found for topic ..." errors on reconnect
      Object.keys(localStorage)
        .filter(k => k.startsWith('wc@') || k.startsWith('walletconnect') || k.startsWith('W3M') || k.startsWith('WCM'))
        .forEach(k => localStorage.removeItem(k));

      // Use @walletconnect/ethereum-provider directly. We disable the built-in QR
      // modal and render our own custom dynamic.xyz-style QR modal instead.
      const { EthereumProvider } = await import('@walletconnect/ethereum-provider');
      wcProvider = await EthereumProvider.init({
        projectId,
        // No REQUIRED chains — only optional. This lets any wallet on any network
        // connect successfully (we only need to sign a login message, not a tx).
        optionalChains: [1, 137, 56, 8453, 42161],
        showQrModal: false, // we render our own QR modal
        metadata: {
          name: 'PolyBet365',
          description: 'Prediction market platform',
          url: window.location.origin,
          icons: [`${window.location.origin}/logo.png`],
        },
      });

      // Build a cancellation promise so that closing our QR modal aborts the
      // pending connection attempt instead of leaving it hanging.
      let cancelReject;
      const cancelPromise = new Promise((_, reject) => { cancelReject = reject; });

      // The provider emits the `wc:` pairing URI here — feed it to our modal.
      const onDisplayUri = (uri) => {
        useWcModalStore.getState().open(uri, () => {
          cancelReject(Object.assign(new Error('User closed the QR modal'), { code: 4001 }));
        }, walletName, installUrl);
      };
      wcProvider.on('display_uri', onDisplayUri);

      try {
        // connect() triggers `display_uri`; resolves once the user scans +
        // approves on their phone. Race it against modal-close cancellation.
        await Promise.race([wcProvider.connect(), cancelPromise]);
      } finally {
        try { wcProvider.removeListener?.('display_uri', onDisplayUri); } catch { /* ignore */ }
        // Connection settled (or cancelled) — hide the QR modal.
        useWcModalStore.getState().close();
      }

      // Read the connected address directly from the WC session. With optionalChains
      // (no forced mainnet) the provider auto-routes requests to the wallet's approved
      // chain, so we don't pass a chain explicitly — that avoids both the old
      // "Invalid Id" error AND the "expiry must be a number" error.
      const walletAddress = wcProvider.accounts?.[0];
      if (!walletAddress) {
        toast.error('No account returned from wallet. Please try again.');
        setIsConnecting(false);
        return false;
      }
      console.log('[WalletConnect] Connected:', walletAddress, 'on chainId', wcProvider.chainId);

      const timestamp = Date.now();
      const message = `Sign in to PolyBet365\nAddress: ${walletAddress}\nTimestamp: ${timestamp}`;

      // Critical UX: after the QR modal closes, the signature request is pushed to
      // the phone but the wallet app is NOT auto-foregrounded on desktop→mobile flows.
      // Tell the user to return to their wallet to approve the sign request.
      toast('Check your wallet to sign the login message', { icon: '📱', duration: 8000 });

      // Sign via direct personal_sign request — most reliable for mobile WalletConnect.
      // personal_sign expects params [hexMessage, address].
      const hexMessage = '0x' + Array.from(new TextEncoder().encode(message))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

      console.log('[WalletConnect] Requesting signature...');
      const signature = await wcProvider.request({
        method: 'personal_sign',
        params: [hexMessage, walletAddress],
      });
      console.log('[WalletConnect] Signature received, authenticating...');

      const wcChainId = Number(wcProvider.chainId) || undefined;
      const { data } = await authAPI.walletAuth({ walletAddress, signature, message, referralCode, chainId: wcChainId });

      if (data.success) {
        setAuth(data.user, data.token, data.refreshToken, data.isNewUser === true);
        toast.success('Wallet connected via WalletConnect!');
        setIsConnecting(false);
        return true;
      } else {
        toast.error(data.error || 'Authentication failed');
      }
    } catch (err) {
      console.error('[WalletConnect] Error:', err);
      if (err.message?.toLowerCase().includes('rejected') || err.code === 4001 || err.code === 5000 || err.code === 'ACTION_REJECTED') {
        toast.error('Request rejected in wallet');
      } else if (err.message?.includes('timeout')) {
        toast.error('Connection timeout. Please try again.');
      } else {
        toast.error(err.shortMessage || err.message || 'WalletConnect failed');
      }
    } finally {
      // Clean up WC provider session to avoid stale state on next attempt
      try { if (wcProvider) await wcProvider.disconnect(); } catch {}
    }
    setIsConnecting(false);
    return false;
  };

  return { connectWallet, connectInjectedWallet, connectWalletConnect, isConnecting };
};

export default useWallet;
