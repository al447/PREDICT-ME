// EIP-6963 Multi Injected Provider Discovery + legacy globals
// Detects which wallet extensions are installed and returns the right provider.
import { CoinbaseWalletSDK } from '@coinbase/wallet-sdk';

// getCoinbaseProvider creates a fresh provider each time it is called.
// Coinbase SDK v4 with preference:'smartWalletOnly' always opens the
// keys.coinbase.com Smart Wallet popup — exactly like Polymarket.
// We do NOT cache the provider: a stale provider from a cancelled attempt
// holds internal state that causes "Pop up window failed to open" on retry.
export const getCoinbaseProvider = () => {
  if (typeof window === 'undefined') return null;
  const sdk = new CoinbaseWalletSDK({
    appName: 'PolyBet365',
    appLogoUrl: window.location.origin + '/logo.png',
  });
  return sdk.makeWeb3Provider({ options: 'smartWalletOnly' });
};

export const WALLETS = [
  {
    id: 'metamask',
    name: 'MetaMask',
    rdns: 'io.metamask',
    legacyGlobal: () => window.ethereum?.isMetaMask && !window.ethereum?.isBraveWallet ? window.ethereum : null,
    // Not installed: no fallback — show install link only
    supportsWalletConnect: false,
    installUrl: 'https://metamask.io/download/',
    color: '#E17726',
  },
  {
    id: 'phantom',
    name: 'Phantom',
    rdns: 'app.phantom',
    legacyGlobal: () => window.phantom?.ethereum ?? null,
    // Not installed: open Chrome Web Store (no QR — extension-only wallet)
    supportsWalletConnect: false,
    installUrl: 'https://chromewebstore.google.com/detail/phantom/bfnaelmomeimhlpmgjnjophhpkkoljpa',
    color: '#AB9FF2',
  },
  {
    id: 'coinbase',
    name: 'Coinbase Wallet',
    rdns: 'com.coinbase.wallet',
    legacyGlobal: () => window.coinbaseWalletExtension ?? null,
    // Always available via SDK (handles extension + Smart Wallet web flow)
    supportsWalletConnect: false,
    installUrl: 'https://www.coinbase.com/wallet',
    color: '#0052FF',
  },
  {
    id: 'rabby',
    name: 'Rabby Wallet',
    rdns: 'io.rabby',
    // Rabby detection: window.rabby or ethereum.isRabby (when in MetaMask compatibility mode)
    legacyGlobal: () => {
      // Direct Rabby object
      if (window.rabby) return window.rabby;
      // Rabby in MetaMask compatibility mode (most common)
      if (window.ethereum?.isRabby) return window.ethereum;
      // Check if ethereum provider is Rabby by looking for unique Rabby properties
      if (window.ethereum?._rabby) return window.ethereum;
      return null;
    },
    // Not installed: open Chrome Web Store (no QR — desktop extension only)
    supportsWalletConnect: false,
    installUrl: 'https://chromewebstore.google.com/detail/rabby-wallet/acmacodkjbdgmoleebolmdjonilkdbch',
    color: '#8697FF',
  },
  {
    id: 'okx',
    name: 'OKX Wallet',
    rdns: 'com.okex.wallet',
    legacyGlobal: () => window.okxwallet ?? null,
    // Not installed: WalletConnect QR fallback (OKX mobile supports WC)
    supportsWalletConnect: true,
    installUrl: 'https://chromewebstore.google.com/detail/okx-wallet/mcohilncbfahbmgdjkbpemcciiolgcge',
    color: '#000000',
  },
  {
    id: 'bitget',
    name: 'Bitget Wallet',
    rdns: 'com.bitget.web3',
    legacyGlobal: () => window.bitkeep?.ethereum ?? window.bitget ?? null,
    // Not installed: WalletConnect QR fallback (Bitget mobile supports WC)
    supportsWalletConnect: true,
    installUrl: 'https://chromewebstore.google.com/detail/bitget-wallet-crypto-web3/jiidiaalihmmhddjgbnbgdfflelocpak',
    color: '#00D4C2',
  },
];

// EIP-6963 provider map: rdns -> EIP-1193 provider
const _eip6963Providers = new Map();
let _eip6963Initialized = false;

const initEIP6963 = () => {
  if (_eip6963Initialized || typeof window === 'undefined') return;
  _eip6963Initialized = true;

  window.addEventListener('eip6963:announceProvider', (event) => {
    const { info, provider } = event.detail ?? {};
    if (info?.rdns && provider) {
      _eip6963Providers.set(info.rdns, provider);
      // Also store by name for wallets that use different rdns
      if (info?.name?.toLowerCase().includes('rabby')) {
        _eip6963Providers.set('io.rabby', provider);
      }
    }
  });

  // Request all installed providers to announce themselves
  window.dispatchEvent(new Event('eip6963:requestProvider'));
};

// Call once on first use
if (typeof window !== 'undefined') {
  // Defer so extensions have time to register
  setTimeout(initEIP6963, 0);
}

/**
 * Returns the EIP-1193 provider for a given wallet id, or null if not installed.
 * Tries EIP-6963 first, then legacy globals.
 */
export const getProviderFor = (walletId) => {
  if (typeof window === 'undefined') return null;

  // Ensure EIP-6963 listeners are set up
  initEIP6963();

  const wallet = WALLETS.find((w) => w.id === walletId);
  if (!wallet) return null;

  // EIP-6963 first
  if (wallet.rdns && _eip6963Providers.has(wallet.rdns)) {
    return _eip6963Providers.get(wallet.rdns);
  }

  // Legacy global fallback
  try {
    const provider = wallet.legacyGlobal?.();
    if (provider) return provider;
  } catch {
    // ignore
  }

  return null;
};

/**
 * Returns true if the wallet extension is currently installed in the browser.
 */
export const isWalletInstalled = (walletId) => {
  return getProviderFor(walletId) !== null;
};
