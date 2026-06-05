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
const ORDER_DOMAIN = {
  name: 'PolyBet365 CTF Exchange',
  version: '1',
  chainId: CHAIN_ID,
  verifyingContract: ADDRESSES.CTF_EXCHANGE,
};

const NEG_RISK_ORDER_DOMAIN = {
  name: 'PolyBet365 NegRisk Exchange',
  version: '1',
  chainId: CHAIN_ID,
  verifyingContract: ADDRESSES.NEG_RISK_EXCHANGE,
};

// ── Bridge config ─────────────────────────────────────────────────────────────
const BRIDGE_CONFIG = {
  provider:     process.env.BRIDGE_PROVIDER || 'relay',
  relayApiUrl:  process.env.RELAY_API_URL   || 'https://api.relay.link',
  lifiApiUrl:   process.env.LIFI_API_URL    || 'https://li.quest/v1',
  destChainId:  IS_MAINNET ? 137 : parseInt(process.env.BRIDGE_DEST_CHAIN_ID || '80002', 10),
  destToken:    'USDC',
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
  NEG_RISK_ORDER_DOMAIN,
  BRIDGE_CONFIG,
  getOperatorKey,
  getRelayerKey,
};
