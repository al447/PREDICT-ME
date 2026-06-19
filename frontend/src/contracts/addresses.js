// Contract addresses — Polygon MAINNET (chainId 137).
// Mainnet addresses are hardcoded as fallbacks so dashboard env overrides cannot break the app.

// ── Network Configuration ────────────────────────────────────────────────────
// Always 137 — dashboard overrides (e.g. VITE_CHAIN_ID=80002) are ignored.
export const CHAIN_ID = 137;

export const RPC_URL = import.meta.env.VITE_POLYGON_RPC || 'https://polygon-rpc.com';
export const PLATFORM_WALLET = import.meta.env.VITE_PLATFORM_WALLET || '0x786d99F5024acE87250544cE56309AEdB97f44cF';
export const BLOCK_EXPLORER = import.meta.env.VITE_BLOCK_EXPLORER || 'https://polygonscan.com';

// ── M1 On-Chain Stack (Polygon MAINNET — deployed 2026-06-17) ────────────────
export const USDC_ADDRESS              = import.meta.env.VITE_USDC_ADDRESS              || '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359';
export const CONDITIONAL_TOKENS_ADDRESS = import.meta.env.VITE_CTF_ADDRESS              || '0x4518a86c85F3D0aE6ac100B9384011bba63a9b1c';
export const CTF_EXCHANGE_ADDRESS      = import.meta.env.VITE_CTF_EXCHANGE_ADDRESS      || '0xB2FB436cC2E6F5c8F2cb9a876FF4AF0CfDF2D8D8';
export const UMA_CTF_ADAPTER_ADDRESS   = import.meta.env.VITE_UMA_ADAPTER_ADDRESS       || '0x78E4B65e23cAD525851F32A1FF19320dE1Df73f7';
export const NEG_RISK_ADAPTER_ADDRESS  = import.meta.env.VITE_NEG_RISK_ADAPTER_ADDRESS  || '0x32d2bE3240A73cDd5A432fE987477A615da29fa9';
export const NEG_RISK_EXCHANGE_ADDRESS = import.meta.env.VITE_NEG_RISK_EXCHANGE_ADDRESS || '0x6ceED4031F634bb57fcaE7AD71D58DFDcfCA7eB1';
export const WALLET_FACTORY_ADDRESS    = import.meta.env.VITE_WALLET_FACTORY_ADDRESS    || '0x2818282f94e6aBCAC612B5f14b79d061E3B681d8';
export const MARKET_FACTORY_ADDRESS    = import.meta.env.VITE_MARKET_FACTORY_ADDRESS    || '0x0e9Be76713060ae72bF4a431a79DE4e4342703Dd';

// WrappedCollateral for deposit wrapping
export const WRAPPED_COLLATERAL_ADDRESS = import.meta.env.VITE_WRAPPED_COLLATERAL_ADDRESS || '0xF5880Ed43a7af85Cf46E7D164b07D3c2C3727931';

