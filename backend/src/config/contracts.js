/**
 * M1 On-Chain Contract Configuration — Non-Custodial Live Product
 *
 * All values are env-driven so a mainnet cutover is a pure env change.
 *
 * Mainnet cutover checklist:
 *   1. NETWORK=mainnet
 *   2. MOCK_USDC_ADDRESS=0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174 (USDC.e)
 *   3. Re-deploy M1 contracts on Polygon mainnet, update all *_ADDRESS vars
 *   4. Fund RELAYER_PRIVATE_KEY + OPERATOR_PRIVATE_KEY with real MATIC
 */

const path = require('path');

// Load ABI JSON files
const loadAbi = (name) => require(path.join(__dirname, '..', 'contracts', `${name}.json`));

// ── Network ───────────────────────────────────────────────────────────────────
const NETWORK = process.env.NETWORK || 'amoy';
const IS_MAINNET = NETWORK === 'mainnet';

const CHAIN_ID = IS_MAINNET ? 137 : 80002;
const RPC_URL = IS_MAINNET
  ? (process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com')
  : (process.env.POLYGON_AMOY_RPC_URL || 'https://polygon-amoy-bor-rpc.publicnode.com');
const BLOCK_EXPLORER = IS_MAINNET
  ? 'https://polygonscan.com'
  : 'https://amoy.polygonscan.com';

// ── Feature flags ─────────────────────────────────────────────────────────────
const NONCUSTODIAL_ENABLED = process.env.NONCUSTODIAL_ENABLED === 'true';
const ONCHAIN_ENABLED = process.env.ONCHAIN_ENABLED === 'true';

// ── Contract addresses ────────────────────────────────────────────────────────
const ADDRESSES = {
  MOCK_USDC:         process.env.MOCK_USDC_ADDRESS,
  CTF:               process.env.CTF_ADDRESS || process.env.CONDITIONAL_TOKENS_ADDRESS,
  CTF_EXCHANGE:      process.env.EXCHANGE_ADDRESS || process.env.CTF_EXCHANGE_ADDRESS,
  UMA_ADAPTER:       process.env.UMA_ADAPTER_ADDRESS || process.env.UMA_CTF_ADAPTER_ADDRESS,
  NEG_RISK_ADAPTER:  process.env.NEG_RISK_ADAPTER_ADDRESS,
  NEG_RISK_EXCHANGE: process.env.NEG_RISK_EXCHANGE_ADDRESS,
  WALLET_FACTORY:    process.env.WALLET_FACTORY_ADDRESS,
  MARKET_FACTORY:    process.env.MARKET_FACTORY_ADDRESS,
};

const ABIS = {
  MOCK_USDC:         loadAbi('MockUSDC'),
  CTF:               loadAbi('ConditionalTokens'),
  CTF_EXCHANGE:      loadAbi('CTFExchange'),
  UMA_ADAPTER:       loadAbi('UmaCtfAdapter'),
  NEG_RISK_ADAPTER:  loadAbi('NegRiskAdapter'),
  NEG_RISK_EXCHANGE: loadAbi('NegRiskExchange'),
  WALLET_FACTORY:    loadAbi('WalletFactory'),
  MARKET_FACTORY:    loadAbi('MarketFactory'),
};

// ── EIP-712 domains for CLOB order signing ────────────────────────────────────
// MUST match the deployed exchange domainSeparator(). Verified on-chain (Amoy):
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
const BRIDGE_CONFIG = {
  provider:     process.env.BRIDGE_PROVIDER || 'relay',
  relayApiUrl:  process.env.RELAY_API_URL   || 'https://api.relay.link',
  lifiApiUrl:   process.env.LIFI_API_URL    || 'https://li.quest/v1',
  destChainId:  IS_MAINNET ? 137 : parseInt(process.env.BRIDGE_DEST_CHAIN_ID || '80002', 10),
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
  BRIDGE_CONFIG,
  CCTP_CONFIG,
  RELAY_CONFIG,
  MESSAGE_TRANSMITTER_ABI,
  getOperatorKey,
  getRelayerKey,
};
