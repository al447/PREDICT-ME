/**
 * network.js — Polygon MAINNET (chainId 137) configuration.
 * All addresses hardcoded as fallbacks — Vercel/Render dashboard overrides cannot break the app.
 */

// ── Network ───────────────────────────────────────────────────────────────────
export const CHAIN_ID = 137;
export const RPC_URL = import.meta.env.VITE_POLYGON_RPC || 'https://polygon-rpc.com';
export const BLOCK_EXPLORER = import.meta.env.VITE_BLOCK_EXPLORER || 'https://polygonscan.com';
export const NETWORK = 'mainnet';
export const IS_MAINNET = true;

// ── Feature flags ─────────────────────────────────────────────────────────────
export const NONCUSTODIAL_ENABLED =
  import.meta.env.VITE_NONCUSTODIAL_ENABLED === 'true';
export const ONCHAIN_ENABLED =
  import.meta.env.VITE_ONCHAIN_ENABLED === 'true';

// ── Collateral token (native USDC on Polygon mainnet) ─────────────────────────
export const USDC_ADDRESS = import.meta.env.VITE_USDC_ADDRESS || '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359';
export const USDC_DECIMALS = 6;

// ── M1 On-Chain Contract Addresses (Polygon MAINNET — deployed 2026-06-17) ────
export const ADDRESSES = {
  USDC:              USDC_ADDRESS,
  CTF:               import.meta.env.VITE_CTF_ADDRESS              || '0x4518a86c85F3D0aE6ac100B9384011bba63a9b1c',
  CTF_EXCHANGE:      import.meta.env.VITE_CTF_EXCHANGE_ADDRESS      || '0xB2FB436cC2E6F5c8F2cb9a876FF4AF0CfDF2D8D8',
  UMA_ADAPTER:       import.meta.env.VITE_UMA_ADAPTER_ADDRESS       || '0x78E4B65e23cAD525851F32A1FF19320dE1Df73f7',
  NEG_RISK_ADAPTER:  import.meta.env.VITE_NEG_RISK_ADAPTER_ADDRESS  || '0x32d2bE3240A73cDd5A432fE987477A615da29fa9',
  NEG_RISK_EXCHANGE: import.meta.env.VITE_NEG_RISK_EXCHANGE_ADDRESS || '0x6ceED4031F634bb57fcaE7AD71D58DFDcfCA7eB1',
  WALLET_FACTORY:    import.meta.env.VITE_WALLET_FACTORY_ADDRESS    || '0x2818282f94e6aBCAC612B5f14b79d061E3B681d8',
  MARKET_FACTORY:    import.meta.env.VITE_MARKET_FACTORY_ADDRESS    || '0x0e9Be76713060ae72bF4a431a79DE4e4342703Dd',
};

// ── Bridge config ─────────────────────────────────────────────────────────────
export const BRIDGE_PROVIDER = import.meta.env.VITE_BRIDGE_PROVIDER || 'relay';
export const RELAY_API_URL = import.meta.env.VITE_RELAY_API_URL || 'https://api.relay.link';
export const BRIDGE_DEST_CHAIN_ID = 137;

// ── EIP-712 domain for CLOB orders ───────────────────────────────────────────
// MUST match the deployed exchange domainSeparator() and backend config/contracts.js.
// Verified on-chain (Mainnet): CTFExchange => name='Polymarket CTF Exchange', version='1'.
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
