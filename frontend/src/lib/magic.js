// Static imports — Magic SDK is bundled directly (not lazy-loaded).
// This guarantees the instance is available synchronously the moment this
// module is imported, which is required for loginWithPopup (Telegram) to
// open its popup inside the browser's user-gesture window without any await.
import { Magic } from 'magic-sdk';
import { OAuthExtension } from '@magic-ext/oauth2';

// Magic SDK requires a polygon.technology RPC — publicnode.com is blocked by Magic iframe CSP.
// For mainnet (chainId 137) use the official Polygon mainnet RPC.
const RPC_URL = import.meta.env.VITE_POLYGON_RPC || 'https://polygon-rpc.com';
const CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID || '137');
const PUBLISHABLE_KEY = import.meta.env.VITE_MAGIC_PUBLISHABLE_KEY;

// Initialized synchronously at module load — always non-null if key is set.
let _magic = null;

if (typeof window !== 'undefined' && PUBLISHABLE_KEY) {
  console.log('[Magic] Initializing with publishable key:', PUBLISHABLE_KEY);
  _magic = new Magic(PUBLISHABLE_KEY, {
    extensions: [new OAuthExtension()],
    network: { rpcUrl: RPC_URL, chainId: CHAIN_ID },
  });
} else if (!PUBLISHABLE_KEY) {
  console.warn('[Magic] VITE_MAGIC_PUBLISHABLE_KEY is not set');
}

// getMagicSync — returns the instance with zero async gap.
// Use this in popup-based click handlers (Telegram) where any await before
// window.open() causes the browser to block the popup.
export const getMagicSync = () => _magic;

// getMagic — async API kept for backward compat (Google, Steam, email flows).
export const getMagic = () => Promise.resolve(_magic);

// preloadMagic — no-op now that init is synchronous; kept for API compat.
export const preloadMagic = () => Promise.resolve(_magic);

export default getMagic;
