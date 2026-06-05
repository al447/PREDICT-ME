export const EVM_DEPOSIT_ADDRESS = import.meta.env.VITE_PLATFORM_WALLET || '0x786d99F5024acE87250544cE56309AEdB97f44cF';
export const SOL_DEPOSIT_ADDRESS = import.meta.env.VITE_SOLANA_DEPOSIT_ADDRESS || null;

const _ALL_CHAINS = [
  // Testnets first (when enabled) for easy testing
  { id: 'sepolia',  name: 'Sepolia (Testnet)', kind: 'evm', minUsd: 0.001, explorer: 'https://sepolia.etherscan.io/tx/', testnet: true },
  { id: 'polygon-amoy', name: 'Polygon Amoy (Testnet)', kind: 'evm', minUsd: 0.001, explorer: 'https://amoy.polygonscan.com/tx/', testnet: true },
  // Mainnets
  { id: 'ethereum', name: 'Ethereum', kind: 'evm', minUsd: 10, explorer: 'https://etherscan.io/tx/' },
  { id: 'solana',   name: 'Solana',   kind: 'sol', minUsd: 3,  explorer: 'https://solscan.io/tx/' },
  { id: 'bsc',      name: 'BSC',      kind: 'evm', minUsd: 3,  explorer: 'https://bscscan.com/tx/' },
  { id: 'base',     name: 'Base',     kind: 'evm', minUsd: 3,  explorer: 'https://basescan.org/tx/' },
  { id: 'polygon',  name: 'Polygon',  kind: 'evm', minUsd: 3,  explorer: 'https://polygonscan.com/tx/' },
  { id: 'arbitrum', name: 'Arbitrum', kind: 'evm', minUsd: 3,  explorer: 'https://arbiscan.io/tx/' },
];

export const CHAINS = _ALL_CHAINS.filter(c => !c.testnet || import.meta.env.VITE_ENABLE_TESTNETS === 'true');

// Always include all chains for explorer URL lookup (so old deposit history still resolves)
export const ALL_CHAINS_FOR_LOOKUP = _ALL_CHAINS;

export const TOKENS = [
  { id: 'USDC',  label: 'USDC',   color: '#2775CA' },
  { id: 'USDCe', label: 'USDC.e', color: '#2775CA' },
  { id: 'ARB',   label: 'ARB',    color: '#28A0F0' },
  { id: 'BNB',   label: 'BNB',    color: '#F3BA2F' },
  { id: 'BUSD',  label: 'BUSD',   color: '#F0B90B' },
  { id: 'cbBTC', label: 'cbBTC',  color: '#F7931A' },
  { id: 'DAI',   label: 'DAI',    color: '#F5A623' },
  { id: 'ETH',   label: 'ETH',    color: '#627EEA' },
  { id: 'MATIC', label: 'MATIC',  color: '#8247E5' },
  { id: 'SOL',   label: 'SOL',    color: '#9945FF' },
];

export const TOKEN_CHAINS = {
  USDC:  ['ethereum', 'solana', 'bsc', 'base', 'polygon', 'arbitrum', 'sepolia', 'polygon-amoy'],
  USDT:  ['polygon-amoy'], // MockUSDT on Polygon Amoy testnet
  USDCe: ['polygon', 'arbitrum'],
  ARB:   ['arbitrum'],
  BNB:   ['bsc'],
  BUSD:  ['bsc'],
  cbBTC: ['base'],
  DAI:   ['ethereum', 'bsc', 'polygon', 'arbitrum'],
  ETH:   ['ethereum', 'base', 'arbitrum', 'sepolia'],
  MATIC: ['polygon', 'polygon-amoy'],
  SOL:   ['solana'],
};

export const chainsForToken = (tokenId) =>
  CHAINS.filter((c) => (TOKEN_CHAINS[tokenId] || []).includes(c.id));

export const tokensForChain = (chainId) =>
  TOKENS.filter((t) => (TOKEN_CHAINS[t.id] || []).includes(chainId));

// Always use admin/platform wallet address for all deposits
// This simplifies the deposit flow - all funds go to the same address
export const getDepositAddress = (chain, userAddresses) => {
  if (!chain) return EVM_DEPOSIT_ADDRESS;
  if (chain.kind === 'sol') {
    return SOL_DEPOSIT_ADDRESS || EVM_DEPOSIT_ADDRESS;
  }
  return EVM_DEPOSIT_ADDRESS;
};

export const getTokenById = (id) => TOKENS.find((t) => t.id === id);
export const getChainById = (id) => CHAINS.find((c) => c.id === id) || ALL_CHAINS_FOR_LOOKUP.find((c) => c.id === id);
