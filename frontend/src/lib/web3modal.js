// Web3Modal is loaded lazily — the 1.6 MB bundle is only fetched
// when the user clicks "Connect Wallet" for the first time.

const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || '';

const chains = [
  { chainId: 1,     name: 'Ethereum',  currency: 'ETH',   explorerUrl: 'https://etherscan.io',      rpcUrl: 'https://cloudflare-eth.com' },
  { chainId: 137,   name: 'Polygon',   currency: 'MATIC',  explorerUrl: 'https://polygonscan.com',   rpcUrl: 'https://polygon-rpc.com' },
  { chainId: 56,    name: 'BNB Chain', currency: 'BNB',    explorerUrl: 'https://bscscan.com',       rpcUrl: 'https://bsc-dataseed.binance.org' },
  { chainId: 8453,  name: 'Base',      currency: 'ETH',    explorerUrl: 'https://basescan.org',      rpcUrl: 'https://mainnet.base.org' },
  { chainId: 42161, name: 'Arbitrum',  currency: 'ETH',    explorerUrl: 'https://arbiscan.io',       rpcUrl: 'https://arb1.arbitrum.io/rpc' },
];

let modal = null;

export async function initWeb3Modal() {
  if (modal) return modal;
  if (!projectId || projectId === 'placeholder_walletconnect_project_id') {
    console.warn('[Web3Modal] No WalletConnect project ID configured');
    return null;
  }
  const { createWeb3Modal, defaultConfig } = await import('@web3modal/ethers/react');
  const metadata = {
    name: 'PolyBet365',
    description: 'Prediction market platform - works on any network',
    url: typeof window !== 'undefined' ? window.location.origin : 'https://polybet365.com',
    icons: [typeof window !== 'undefined' ? `${window.location.origin}/logo.png` : ''],
  };
  const ethersConfig = defaultConfig({
    metadata,
    enableEIP6963: false,
    enableInjected: false,
    enableCoinbase: false,
  });
  modal = createWeb3Modal({
    ethersConfig,
    chains,
    projectId,
    themeMode: 'dark',
    themeVariables: {
      '--w3m-accent': '#d4a853',
      '--w3m-border-radius-master': '2px',
    },
    featuredWalletIds: [],
    includeWalletIds: [],
    excludeWalletIds: [],
    allWallets: 'HIDE',
    enableAnalytics: false,
    enableOnramp: false,
    enableEmail: false,
    enableSwaps: false,
  });
  console.log('[Web3Modal] Initialized');
  return modal;
}

export function getWeb3ModalInstance() {
  return modal;
}
