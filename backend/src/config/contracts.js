/**
 * M1 On-Chain Contract Configuration — MAINNET ONLY
 * Testnet support disabled. All values MUST be set via environment variables.
 *
 * Required env vars:
 *   1. NETWORK=mainnet (enforced)
 *   2. USDC_ADDRESS=0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359 (native USDC)
 *   3. POLYGON_RPC_URL=https://polygon-bor-rpc.publicnode.com (or other mainnet RPC)
 *   4. *_ADDRESS vars for all contracts
 *   5. RELAYER_PRIVATE_KEY + OPERATOR_PRIVATE_KEY funded with POL
 */

const path = require('path');

// Load ABI JSON files
const loadAbi = (name) => require(path.join(__dirname, '..', 'contracts', `${name}.json`));

// ── Mainnet Enforcement ───────────────────────────────────────────────────────
if (process.env.NETWORK && process.env.NETWORK !== 'mainnet') {
  throw new Error(`[PredictMe] Invalid NETWORK=${process.env.NETWORK}. Only 'mainnet' is supported.`);
}

// ── Network ───────────────────────────────────────────────────────────────────
const NETWORK = 'mainnet';
const IS_MAINNET = true;
const CHAIN_ID = 137;

// RPC URL must be explicitly set (no defaults)
const RPC_URL = process.env.POLYGON_RPC_URL || '';
if (!RPC_URL) {
  console.warn('[PredictMe] WARNING: POLYGON_RPC_URL not set — on-chain features will fail at runtime.');
}

const BLOCK_EXPLORER = 'https://polygonscan.com';

// ── Feature flags ─────────────────────────────────────────────────────────────
const NONCUSTODIAL_ENABLED = process.env.NONCUSTODIAL_ENABLED === 'true';
const ONCHAIN_ENABLED = process.env.ONCHAIN_ENABLED === 'true';

// ── Contract addresses ────────────────────────────────────────────────────────
// All addresses MUST be set via environment variables (no testnet defaults).
// We log warnings at startup but defer hard failures to actual usage so that
// deploys don't crash while Render syncs blueprint env vars.
const envOrWarn = (name) => {
  const value = process.env[name];
  if (!value) {
    console.warn(`[PredictMe] WARNING: env var ${name} not set — on-chain features using it will fail at runtime.`);
    return '';
  }
  return value;
};

const ADDRESSES = {
  // Native Circle USDC on Polygon mainnet (0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359)
  // USDC_ADDRESS is the canonical key; MOCK_USDC_ADDRESS kept for backward compat
  USDC:              process.env.USDC_ADDRESS || process.env.MOCK_USDC_ADDRESS || '',
  MOCK_USDC:         process.env.USDC_ADDRESS || process.env.MOCK_USDC_ADDRESS || '',
  CTF:               envOrWarn('CTF_ADDRESS'),
  CTF_EXCHANGE:      envOrWarn('CTF_EXCHANGE_ADDRESS'),
  UMA_ADAPTER:       envOrWarn('UMA_ADAPTER_ADDRESS'),
  NEG_RISK_ADAPTER:  envOrWarn('NEG_RISK_ADAPTER_ADDRESS'),
  NEG_RISK_EXCHANGE: envOrWarn('NEG_RISK_EXCHANGE_ADDRESS'),
  WALLET_FACTORY:    envOrWarn('WALLET_FACTORY_ADDRESS'),
  MARKET_FACTORY:    envOrWarn('MARKET_FACTORY_ADDRESS'),
  WRAPPED_COLLATERAL: envOrWarn('WRAPPED_COLLATERAL_ADDRESS'),
  CRYPTO_RESOLVER:   envOrWarn('CRYPTO_MARKET_RESOLVER_ADDRESS'),  // M7
};

const ABIS = {
  USDC:              loadAbi('USDC'),
  MOCK_USDC:         loadAbi('USDC'), // backward-compat alias
  CTF:               loadAbi('ConditionalTokens'),
  CTF_EXCHANGE:      loadAbi('CTFExchange'),
  UMA_ADAPTER:       loadAbi('UmaCtfAdapter'),
  NEG_RISK_ADAPTER:  loadAbi('NegRiskAdapter'),
  NEG_RISK_EXCHANGE: loadAbi('NegRiskExchange'),
  WALLET_FACTORY:    loadAbi('WalletFactory'),
  MARKET_FACTORY:    loadAbi('MarketFactory'),
  WRAPPED_COLLATERAL: loadAbi('WrappedCollateral'),
  CRYPTO_RESOLVER:   loadAbi('CryptoMarketResolver'),  // M7 on-chain price resolution
};

// ── EIP-712 domains for CLOB order signing ────────────────────────────────────
// MUST match the deployed exchange domainSeparator(). Verified on-chain (Mainnet):
// CTFExchange => name='Polymarket CTF Exchange', version='1'.
const ORDER_DOMAIN = {
  name: 'Polymarket CTF Exchange',
  version: '1',
  chainId: CHAIN_ID,
  verifyingContract: ADDRESSES.CTF_EXCHANGE,
};

const NEG_RISK_ORDER_DOMAIN = {
  name: 'Polymarket NegRisk CTF Exchange',
  version: '1',
  chainId: CHAIN_ID,
  verifyingContract: ADDRESSES.NEG_RISK_EXCHANGE,
};

// ── UMA Optimistic Oracle Configuration ───────────────────────────────────────
// Mainnet UMA addresses (verified at docs.uma.xyz)
const UMA_CONFIG = {
  // UMA Finder contract address (mainnet)
  finder: process.env.UMA_FINDER_ADDRESS || '0x09aea4b2242abC8bb4BB78D537A67a245A7bEC64',
  // Optimistic Oracle V2 address (mainnet) - verified at docs.uma.xyz
  // https://docs.uma.xyz/resources/network-addresses → Polygon mainnet OO V2
  optimisticOracleV2: process.env.UMA_OO_V2_ADDRESS || '0xee3Afe347D5C74317041E2618C49534dAf887c24',
  // Native USDC is whitelisted as reward/collateral on UMA mainnet
  rewardToken: process.env.UMA_REWARD_TOKEN_ADDRESS || process.env.USDC_ADDRESS || envOrWarn('MOCK_USDC_ADDRESS'),
  // Proposal bond must be >= UMA's finalFee for USDC (typically ~1500 USDC)
  minProposalBond: process.env.UMA_MIN_PROPOSAL_BOND || (1500 * 1e6).toString(),
  // Default liveness period (2 hours in seconds)
  defaultLiveness: parseInt(process.env.UMA_DEFAULT_LIVENESS || '7200', 10),
};

// ── EIP-712 Order type definition (matches CTFExchange ABI) ──────────────────
// signature is NOT part of the signed struct.
const ORDER_TYPES = {
  Order: [
    { name: 'salt',          type: 'uint256' },
    { name: 'maker',         type: 'address' },
    { name: 'signer',        type: 'address' },
    { name: 'taker',         type: 'address' },
    { name: 'tokenId',       type: 'uint256' },
    { name: 'makerAmount',   type: 'uint256' },
    { name: 'takerAmount',   type: 'uint256' },
    { name: 'expiration',    type: 'uint256' },
    { name: 'nonce',         type: 'uint256' },
    { name: 'feeRateBps',    type: 'uint256' },
    { name: 'side',          type: 'uint8'   },
    { name: 'signatureType', type: 'uint8'   },
  ],
};

// ── Bridge config ─────────────────────────────────────────────────────────────
let BRIDGE_DEST_CHAIN_ID = parseInt(process.env.BRIDGE_DEST_CHAIN_ID || '137', 10);
if (BRIDGE_DEST_CHAIN_ID !== 137) {
  console.warn(`[PredictMe] WARNING: BRIDGE_DEST_CHAIN_ID=${BRIDGE_DEST_CHAIN_ID} is not mainnet. Overriding to 137.`);
  BRIDGE_DEST_CHAIN_ID = 137;
}

const BRIDGE_CONFIG = {
  provider:     process.env.BRIDGE_PROVIDER || 'relay',
  relayApiUrl:  process.env.RELAY_API_URL   || 'https://api.relay.link',
  lifiApiUrl:   process.env.LIFI_API_URL    || 'https://li.quest/v1',
  destChainId:  137,
  destToken:    'USDC',
};

// ── Circle CCTP config (Solana → Polygon) ────────────────────────────────────
const CCTP_CONFIG = {
  irisApi:                 process.env.CCTP_IRIS_API || 'https://iris-api.circle.com',
  solanaDomain:            parseInt(process.env.CCTP_SOLANA_DOMAIN || '5'),
  polygonDomain:           parseInt(process.env.CCTP_POLYGON_DOMAIN || '7'),
  solanaUsdc:              process.env.CCTP_SOLANA_USDC || 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  // Solana CCTP program IDs — VERIFY against Circle docs before mainnet
  solanaTokenMessenger:    process.env.CCTP_SOLANA_TOKEN_MESSENGER || 'CCTPiPYPc6AsJuwueEnWgSgucamXDZwBd53dQ11YiKX3o',
  solanaMessageTransmitter:process.env.CCTP_SOLANA_MESSAGE_TRANSMITTER || 'CCTPmbSD7gX1bxKPAmg77w8oFzNFpaQiQUWD43TKaecd',
  // Polygon CCTP contract addresses — VERIFY against Circle docs before mainnet
  polygonTokenMessenger:   process.env.CCTP_POLYGON_TOKEN_MESSENGER || '0x9daF8c91AEFAE50b9c0E69629D3F6Ca40cA3B3FE',
  polygonMessageTransmitter: process.env.CCTP_POLYGON_MESSAGE_TRANSMITTER || '0xF3be9355363857F3e001be68856A2f96b4C39Ba9',
  polygonUsdc:             process.env.CCTP_POLYGON_USDC || '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
  solanaOperatorSecret:    process.env.SOLANA_OPERATOR_SECRET || null,
  solGasLamports:          parseInt(process.env.BRIDGE_SOL_GAS_LAMPORTS || '5000000'),
};

// ── Relay config (Bitcoin → Polygon) ─────────────────────────────────────────
const RELAY_CONFIG = {
  apiUrl:              process.env.RELAY_API_URL || 'https://api.relay.link',
  bitcoinChainId:      parseInt(process.env.RELAY_BITCOIN_CHAIN_ID || '8253038'),
  polygonChainId:      137,
  polygonUsdc:         process.env.RELAY_POLYGON_USDC || '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
  btcNativeSentinel:   process.env.RELAY_BTC_NATIVE_SENTINEL || 'bc1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqmql8k8',
  watcherPollMs:       parseInt(process.env.RELAY_WATCHER_POLL_MS || '30000'),
};

// ── Polygon MessageTransmitter ABI (CCTP mint) ──────────────────────────────
const MESSAGE_TRANSMITTER_ABI = [
  'function receiveMessage(bytes message, bytes attestation) external returns (bool success)',
  'function usedNonces(bytes32) view returns (uint256)',
];

// ── Provider factory ──────────────────────────────────────────────────────────
// Uses staticNetwork to skip ethers' eth_chainId auto-detection, which can fail
// with "failed to detect network" on some Node versions (e.g. Node 25). The
// chainId is known from config, so detection is unnecessary.

// Common EVM chain name → chainId map (mainnet chains only, testnet chains removed)
const CHAIN_ID_BY_NAME = {
  ethereum: 1,
  polygon: 137,
  bsc: 56,
  base: 8453,
  arbitrum: 42161,
  optimism: 10,
  avalanche: 43114,
};

/**
 * Create a JsonRpcProvider with a static network (skips eth_chainId detection).
 * @param {string} url       RPC endpoint
 * @param {number} chainId   known chain id (required to skip detection)
 * @param {object} opts      extra JsonRpcApiProviderOptions (e.g. batchMaxCount)
 */
const createProvider = (url, chainId, opts = {}) => {
  const { ethers } = require('ethers');
  if (chainId) {
    const network = new ethers.Network(String(chainId), Number(chainId));
    return new ethers.JsonRpcProvider(url, network, { staticNetwork: network, ...opts });
  }
  return new ethers.JsonRpcProvider(url, undefined, opts);
};

let _polygonProvider = null;
const getPolygonProvider = () => {
  if (!_polygonProvider) {
    _polygonProvider = createProvider(RPC_URL, CHAIN_ID);
  }
  return _polygonProvider;
};

// ── Operator/Relayer key helpers ──────────────────────────────────────────────
const getOperatorKey = () => {
  const key = process.env.OPERATOR_PRIVATE_KEY || process.env.DEPLOYER_PRIVATE_KEY;
  if (!key) throw new Error('OPERATOR_PRIVATE_KEY not set');
  return key;
};

const getRelayerKey = () => {
  const key = process.env.RELAYER_PRIVATE_KEY || process.env.DEPLOYER_PRIVATE_KEY;
  if (!key) throw new Error('RELAYER_PRIVATE_KEY not set');
  return key;
};

// Public address of the operator wallet (derived from OPERATOR_PRIVATE_KEY).
// Used as the on-chain destination when a user's Safe is debited for a
// cross-chain bridge withdrawal (the operator then bridges from its own wallet).
const getOperatorAddress = () => {
  const { ethers } = require('ethers');
  return new ethers.Wallet(getOperatorKey()).address;
};

function validate() {
  const missing = Object.entries(ADDRESSES)
    .filter(([_, val]) => !val)
    .map(([key]) => key);
  if (missing.length > 0) {
    throw new Error(`Missing contract addresses in env: ${missing.join(', ')}`);
  }
}

module.exports = {
  ADDRESSES,
  ABIS,
  validate,
  CHAIN_ID,
  RPC_URL,
  BLOCK_EXPLORER,
  NETWORK,
  IS_MAINNET,
  NONCUSTODIAL_ENABLED,
  ONCHAIN_ENABLED,
  ORDER_DOMAIN,
  ORDER_TYPES,
  NEG_RISK_ORDER_DOMAIN,
  UMA_CONFIG,
  BRIDGE_CONFIG,
  CCTP_CONFIG,
  RELAY_CONFIG,
  MESSAGE_TRANSMITTER_ABI,
  getOperatorKey,
  getOperatorAddress,
  getRelayerKey,
  getPolygonProvider,
  createProvider,
  CHAIN_ID_BY_NAME,
};
