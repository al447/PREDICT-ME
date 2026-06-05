const { ethers } = require('ethers');

/**
 * On-chain transaction verifier.
 * Verifies that:
 *   1. The transaction exists on the specified chain
 *   2. The transaction is confirmed (has receipt with status=1)
 *   3. The recipient matches the platform deposit address
 *   4. Returns sender, amount, and token info for the deposit
 *
 * Supports native transfers (ETH, MATIC, BNB) and ERC-20 transfers.
 */

// RPC endpoints per chain (use env vars or public RPCs as fallback)
const RPC_URLS = {
  ethereum: process.env.ETH_RPC || 'https://ethereum-rpc.publicnode.com',
  polygon: process.env.POLYGON_RPC_URL || 'https://polygon-bor-rpc.publicnode.com',
  bsc: process.env.BSC_RPC || 'https://bsc-rpc.publicnode.com',
  base: process.env.BASE_RPC || 'https://mainnet.base.org',
  arbitrum: process.env.ARB_RPC || 'https://arbitrum-one-rpc.publicnode.com',
  // Testnets
  sepolia: process.env.SEPOLIA_RPC || 'https://ethereum-sepolia-rpc.publicnode.com',
  'polygon-amoy': process.env.POLYGON_AMOY_RPC_URL || 'https://polygon-amoy-bor-rpc.publicnode.com',
};

// Known ERC-20 token contract addresses per chain
const TOKEN_ADDRESSES = {
  ethereum: {
    USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    DAI:  '0x6B175474E89094C44Da98b954EedeAC495271d0F',
    ETH: null, // Native
  },
  polygon: {
    USDC:  '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', // native Circle USDC
    USDCe: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', // bridged USDC.e
    USDT:  '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
    DAI:   '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063',
    MATIC: null, // Native
  },
  bsc: {
    USDC: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', // BSC: 18 decimals
    USDT: '0x55d398326f99059fF775485246999027B3197955', // BSC: 18 decimals
    DAI:  '0x1AF3F329e8BE154074D8769D1FFa4eE058B1DBc3',
    BUSD: '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56',
    BNB: null, // Native
  },
  base: {
    USDC:  '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    cbBTC: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf',
    ETH: null, // Native
  },
  arbitrum: {
    USDC:  '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    USDCe: '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8',
    USDT:  '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
    DAI:   '0xDA10009cbd5D07dd0CeCc66161FC93D7c9000da1',
    ARB:   '0x912CE59144191C1204E64559FE8253a0e49E6548',
    ETH: null, // Native
  },
  // Sepolia testnet — Circle's official testnet USDC
  sepolia: {
    USDC: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
    ETH: null, // Native
  },
  'polygon-amoy': {
    USDC: '0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582', // Circle's official Amoy USDC
    MATIC: null,
  },
};

// Default token decimals — used as fallback only when chain context is unavailable.
// NOTE: BSC USDC/USDT are 18 decimals (exception to the ERC-20 standard 6-decimal norm).
// Chain-aware lookup via CHAIN_TOKEN_DECIMALS takes precedence below.
const TOKEN_DECIMALS = {
  USDC: 6,
  USDCe: 6,
  USDT: 6,
  DAI: 18,
  BUSD: 18,
  ETH: 18,
  MATIC: 18,
  BNB: 18,
  ARB: 18,
  cbBTC: 8,
};

// Chain-specific overrides for tokens that deviate from the standard decimals
const CHAIN_TOKEN_DECIMALS = {
  bsc: { USDC: 18, USDT: 18, DAI: 18, BUSD: 18 },
};

const getTokenDecimals = (chain, token) => {
  return CHAIN_TOKEN_DECIMALS[chain]?.[token] ?? TOKEN_DECIMALS[token] ?? 18;
};

// Minimum confirmations required before crediting (3 guards against shallow reorgs)
const MIN_CONFIRMATIONS = process.env.NODE_ENV === 'production' ? 3 : 1;

// ERC-20 Transfer event signature: Transfer(address,address,uint256)
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

const _providers = {};

const getProvider = (chain) => {
  if (_providers[chain]) return _providers[chain];
  const url = RPC_URLS[chain];
  if (!url) {
    throw new Error(`No RPC URL configured for chain: ${chain}`);
  }
  _providers[chain] = new ethers.JsonRpcProvider(url);
  return _providers[chain];
};

const isNativeToken = (chain, token) => {
  const map = {
    ethereum: 'ETH',
    polygon: 'MATIC',
    bsc: 'BNB',
    base: 'ETH',
    arbitrum: 'ETH',
    sepolia: 'ETH',
    'polygon-amoy': 'MATIC',
  };
  return map[chain] === token.toUpperCase();
};

/**
 * Verify a deposit transaction on-chain.
 * 
 * @param {Object} opts
 * @param {string} opts.chain - 'ethereum' | 'polygon' | 'bsc' | 'base' | 'arbitrum'
 * @param {string} opts.token - 'USDC' | 'USDT' | 'ETH' | 'MATIC' | etc.
 * @param {string} opts.txHash - Transaction hash
 * @param {string} opts.expectedRecipient - Expected destination address
 * @returns {Promise<{verified: boolean, sender?: string, amount?: number, error?: string}>}
 */
const verifyDepositTx = async ({ chain, token, txHash, expectedRecipient }) => {
  if (!chain || !token || !txHash || !expectedRecipient) {
    return { verified: false, error: 'Missing required parameters' };
  }

  // Basic txHash format validation (0x + 64 hex chars)
  if (!/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
    return { verified: false, error: 'Invalid transaction hash format' };
  }

  let provider;
  try {
    provider = getProvider(chain);
  } catch (err) {
    return { verified: false, error: err.message };
  }

  try {
    // 1. Fetch transaction
    const tx = await provider.getTransaction(txHash);
    if (!tx) {
      return { verified: false, error: 'Transaction not found on chain' };
    }

    // 2. Fetch receipt (confirms tx succeeded)
    const receipt = await provider.getTransactionReceipt(txHash);
    if (!receipt) {
      return { verified: false, error: 'Transaction not yet confirmed' };
    }
    if (receipt.status !== 1) {
      return { verified: false, error: 'Transaction failed on chain' };
    }

    // 3. Check confirmations
    const currentBlock = await provider.getBlockNumber();
    const confirmations = currentBlock - receipt.blockNumber + 1;
    if (confirmations < MIN_CONFIRMATIONS) {
      return { verified: false, error: `Awaiting confirmations (${confirmations}/${MIN_CONFIRMATIONS})` };
    }

    const expectedRecipientLower = expectedRecipient.toLowerCase();
    const tokenUpper = token.toUpperCase();

    // 4. Native token transfer (ETH, MATIC, BNB)
    if (isNativeToken(chain, tokenUpper)) {
      if (tx.to?.toLowerCase() !== expectedRecipientLower) {
        return { 
          verified: false, 
          error: `Transaction sent to wrong address. Expected ${expectedRecipient}, got ${tx.to}` 
        };
      }

      const decimals = getTokenDecimals(chain, tokenUpper);
      const amount = parseFloat(ethers.formatUnits(tx.value, decimals));

      if (amount <= 0) {
        return { verified: false, error: 'Transaction has zero value' };
      }

      return {
        verified: true,
        sender: tx.from.toLowerCase(),
        amount,
        token: tokenUpper,
        chain,
        blockNumber: receipt.blockNumber,
        confirmations,
      };
    }

    // 5. ERC-20 transfer - parse logs for Transfer event
    const tokenAddress = TOKEN_ADDRESSES[chain]?.[tokenUpper];
    if (!tokenAddress) {
      return { verified: false, error: `Unsupported token ${tokenUpper} on ${chain}` };
    }

    const expectedRecipientPadded = '0x' + expectedRecipientLower.slice(2).padStart(64, '0');

    // Find Transfer log to our address
    const transferLog = receipt.logs.find(log => 
      log.address.toLowerCase() === tokenAddress.toLowerCase() &&
      log.topics[0] === TRANSFER_TOPIC &&
      log.topics[2]?.toLowerCase() === expectedRecipientPadded
    );

    if (!transferLog) {
      return { 
        verified: false, 
        error: `No ${tokenUpper} transfer to ${expectedRecipient} found in this transaction` 
      };
    }

    // Extract sender from topics[1] (padded address)
    const senderHex = '0x' + transferLog.topics[1].slice(26).toLowerCase();

    // Extract amount from data field — use chain-aware decimal lookup
    const decimals = getTokenDecimals(chain, tokenUpper);
    const rawAmount = BigInt(transferLog.data);
    const amount = parseFloat(ethers.formatUnits(rawAmount, decimals));

    if (amount <= 0) {
      return { verified: false, error: 'Transfer has zero amount' };
    }

    return {
      verified: true,
      sender: senderHex,
      amount,
      token: tokenUpper,
      chain,
      blockNumber: receipt.blockNumber,
      confirmations,
    };
  } catch (err) {
    console.error('[TxVerifier] Error:', err.message);
    return { verified: false, error: `Verification error: ${err.message}` };
  }
};

/**
 * Auto-detect chain by trying all supported chains.
 * Returns first chain where the tx is found and verified.
 */
const verifyDepositTxAutoDetect = async ({ token, txHash, expectedRecipient }) => {
  const tokenUpper = token.toUpperCase();
  const chainsToTry = Object.keys(RPC_URLS).filter(chain => 
    isNativeToken(chain, tokenUpper) || TOKEN_ADDRESSES[chain]?.[tokenUpper]
  );

  let lastError = 'Transaction not found on any supported chain';
  
  for (const chain of chainsToTry) {
    try {
      const result = await verifyDepositTx({ chain, token: tokenUpper, txHash, expectedRecipient });
      if (result.verified) {
        console.log(`[TxVerifier] Auto-detected chain: ${chain} for tx ${txHash}`);
        return result;
      }
      // Save the most descriptive error (skip "not found" errors)
      if (result.error && !result.error.includes('not found')) {
        lastError = result.error;
      }
    } catch (err) {
      // Continue trying other chains
    }
  }

  return { verified: false, error: lastError };
};

module.exports = { verifyDepositTx, verifyDepositTxAutoDetect };
