/**
 * network.js — Single source of truth for on-chain configuration.
 * All contract addresses, chain IDs, RPC URLs, and feature flags are
 * read from env vars here so a mainnet cutover is a pure env change.
 *
 * Mainnet cutover checklist:
 *   1. VITE_CHAIN_ID=137
 *   2. VITE_MOCK_USDC_ADDRESS=0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174 (USDC.e)
 *   3. VITE_BLOCK_EXPLORER=https://polygonscan.com
 *   4. VITE_BRIDGE_DEST_CHAIN_ID=137
 *   5. Re-deploy M1 contracts on mainnet, update all VITE_*_ADDRESS vars
 */

// ── Network ───────────────────────────────────────────────────────────────────
export const CHAIN_ID = parseInt(import.meta.env.VITE_CHAIN_ID || '80002', 10);
export const RPC_URL =
  CHAIN_ID === 137
    ? 'https://polygon-rpc.com'
    : (import.meta.env.VITE_POLYGON_AMOY_RPC || 'https://polygon-amoy-bor-rpc.publicnode.com');
export const BLOCK_EXPLORER =
  import.meta.env.VITE_BLOCK_EXPLORER || 'https://amoy.polygonscan.com';
export const NETWORK = CHAIN_ID === 137 ? 'mainnet' : 'amoy';
export const IS_MAINNET = CHAIN_ID === 137;

// ── Feature flags ─────────────────────────────────────────────────────────────
export const NONCUSTODIAL_ENABLED =
  import.meta.env.VITE_NONCUSTODIAL_ENABLED === 'true';
export const ONCHAIN_ENABLED =
  import.meta.env.VITE_ONCHAIN_ENABLED === 'true';

// ── Collateral token (USDC / USDC.e) ─────────────────────────────────────────
export const USDC_ADDRESS =
  import.meta.env.VITE_MOCK_USDC_ADDRESS ||
  '0xC9EfbCF51e175a8171dDb7f65d709e71be969e56'; // MockUSDC on Amoy
export const USDC_DECIMALS = 6;

// ── M1 On-Chain Contract Addresses ───────────────────────────────────────────
export const ADDRESSES = {
  USDC:              USDC_ADDRESS,
  CTF:               import.meta.env.VITE_CTF_ADDRESS               || '0x688d809494D56aCD8ea8b252937e9b51F7F8111B',
  CTF_EXCHANGE:      import.meta.env.VITE_CTF_EXCHANGE_ADDRESS       || '0x8CbA3487e88e19d5aA6A3C78Cc93d06Dc0801eBF',
  NEG_RISK_ADAPTER:  import.meta.env.VITE_NEG_RISK_ADAPTER_ADDRESS   || '0x2B73d9B65e1d4829aA5405101d64d6042d7fDa44',
  NEG_RISK_EXCHANGE: import.meta.env.VITE_NEG_RISK_EXCHANGE_ADDRESS  || '0x70bE8b784846d08c57efBE6fEe9e79632e7F9a87',
  WALLET_FACTORY:    import.meta.env.VITE_WALLET_FACTORY_ADDRESS     || '0xf88B96e47F45aA98176F4A5496A647e039B6ad5E',
  MARKET_FACTORY:    import.meta.env.VITE_MARKET_FACTORY_ADDRESS     || '0x14f5b9db28c1af09726cf0ca327652303565ae0e',
};

// ── Bridge config ─────────────────────────────────────────────────────────────
export const BRIDGE_PROVIDER =
  import.meta.env.VITE_BRIDGE_PROVIDER || 'relay';
export const RELAY_API_URL =
  import.meta.env.VITE_RELAY_API_URL || 'https://api.relay.link';
export const BRIDGE_DEST_CHAIN_ID =
  parseInt(import.meta.env.VITE_BRIDGE_DEST_CHAIN_ID || '80002', 10);

// ── EIP-712 domain for CLOB orders ───────────────────────────────────────────
// MUST match the deployed exchange domainSeparator() and backend config/contracts.js.
// Verified on-chain (Amoy): CTFExchange => name='Polymarket CTF Exchange', version='1'.
export const ORDER_DOMAIN = {
  name: 'Polymarket CTF Exchange',
  version: '1',
  chainId: CHAIN_ID,
  verifyingContract: ADDRESSES.CTF_EXCHANGE,
};

export const NEG_RISK_ORDER_DOMAIN = {
  name: 'Polymarket NegRisk CTF Exchange',
  version: '1',
  chainId: CHAIN_ID,
  verifyingContract: ADDRESSES.NEG_RISK_EXCHANGE,
};

// ── EIP-712 Order types (must match backend clobService.ORDER_TYPES exactly) ─
export const ORDER_TYPES = {
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
