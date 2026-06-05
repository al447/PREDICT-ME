/**
 * Gasless Relayer Service
 * Sponsors transactions for Magic/social users
 * Users sign via Magic, relayer submits and pays gas
 */

const { ethers } = require('ethers');
const crypto = require('crypto');

// Rate limiting storage (in-memory, use Redis in production)
const rateLimitMap = new Map();

// Relay queue for batching
const relayQueue = [];
let relayTimer = null;

/**
 * Relayer configuration
 */
const RELAYER_CONFIG = {
  // Max transactions per user per hour
  HOURLY_LIMIT: 50,
  // Max transaction value (in USDC) per transaction
  MAX_VALUE_USDC: 10000,
  // Whitelist of allowed contract methods
  ALLOWED_METHODS: [
    'approve',           // USDC approve
    'splitPosition',     // CTF split
    'mergePositions',    // CTF merge
    'redeemPositions',   // CTF redeem
    'split',             // NegRisk split
    'merge',             // NegRisk merge
    'redeem',            // NegRisk redeem
  ],
  // Batching: max time to wait before processing queue (ms)
  BATCH_TIMEOUT_MS: 5000,
  // Batching: max queue size before immediate processing
  BATCH_SIZE_THRESHOLD: 10,
};

/**
 * Initialize relayer wallet
 */
function getRelayerWallet() {
  const key = process.env.RELAYER_PRIVATE_KEY || process.env.DEPLOYER_PRIVATE_KEY;
  if (!key) throw new Error('RELAYER_PRIVATE_KEY or DEPLOYER_PRIVATE_KEY not set');
  const provider = new ethers.JsonRpcProvider(
    process.env.POLYGON_AMOY_RPC_URL || 'https://polygon-amoy-bor-rpc.publicnode.com'
  );
  return new ethers.Wallet(key, provider);
}

/**
 * Check rate limit for user
 */
function checkRateLimit(userAddress) {
  const now = Date.now();
  const hourAgo = now - 60 * 60 * 1000;
  
  if (!rateLimitMap.has(userAddress)) {
    rateLimitMap.set(userAddress, []);
  }
  
  const timestamps = rateLimitMap.get(userAddress);
  // Remove old entries
  const valid = timestamps.filter(t => t > hourAgo);
  
  if (valid.length >= RELAYER_CONFIG.HOURLY_LIMIT) {
    return { allowed: false, retryAfter: Math.ceil((valid[0] - hourAgo) / 1000) };
  }
  
  valid.push(now);
  rateLimitMap.set(userAddress, valid);
  return { allowed: true, remaining: RELAYER_CONFIG.HOURLY_LIMIT - valid.length };
}

/**
 * Validate relay request
 */
function validateRelayRequest(request) {
  const { userAddress, targetContract, method, params, signature, nonce } = request;
  
  // Check required fields
  if (!userAddress || !targetContract || !method || !params || !signature || !nonce) {
    throw new Error('Missing required fields');
  }
  
  // Validate method is allowed
  if (!RELAYER_CONFIG.ALLOWED_METHODS.includes(method)) {
    throw new Error(`Method ${method} not allowed`);
  }
  
  // Validate addresses
  if (!ethers.isAddress(userAddress)) throw new Error('Invalid userAddress');
  if (!ethers.isAddress(targetContract)) throw new Error('Invalid targetContract');
  
  return true;
}

/**
 * Build EIP-712 domain for relayer
 */
function getRelayDomain() {
  return {
    name: 'PolyBet365 Relayer',
    version: '1',
    chainId: 80002, // Polygon Amoy
    verifyingContract: process.env.RELAYER_VERIFIER_CONTRACT || '0x0000000000000000000000000000000000000000',
  };
}

/**
 * Build EIP-712 types for relay authorization
 */
const RELAY_TYPES = {
  RelayRequest: [
    { name: 'userAddress', type: 'address' },
    { name: 'targetContract', type: 'address' },
    { name: 'method', type: 'string' },
    { name: 'params', type: 'bytes' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
};

/**
 * Verify user's EIP-712 signature
 */
async function verifyRelaySignature(request) {
  const { userAddress, targetContract, method, params, signature, nonce, deadline } = request;
  
  const domain = getRelayDomain();
  const message = {
    userAddress,
    targetContract,
    method,
    params,
    nonce,
    deadline,
  };
  
  const recovered = ethers.verifyTypedData(domain, RELAY_TYPES, message, signature);
  
  if (recovered.toLowerCase() !== userAddress.toLowerCase()) {
    throw new Error('Invalid signature: recovered address does not match userAddress');
  }
  
  // Check deadline
  if (Date.now() > deadline * 1000) {
    throw new Error('Signature expired');
  }
  
  return true;
}

/**
 * Get contract ABI by address
 */
function getContractAbi(address) {
  const addresses = require('../config/contracts').ADDRESSES;
  const abis = require('../config/contracts').ABIS;
  
  for (const [name, addr] of Object.entries(addresses)) {
    if (addr.toLowerCase() === address.toLowerCase()) {
      return abis[name];
    }
  }
  throw new Error(`ABI not found for contract: ${address}`);
}

/**
 * Execute a single relay transaction
 */
async function executeRelay(request) {
  const { userAddress, targetContract, method, params } = request;
  
  const wallet = getRelayerWallet();
  const abi = getContractAbi(targetContract);
  const contract = new ethers.Contract(targetContract, abi, wallet);
  
  // Decode params and execute
  const decodedParams = ethers.AbiCoder.defaultAbiCoder().decode(
    getMethodParamTypes(method),
    params
  );
  
  const tx = await contract[method](...decodedParams);
  const receipt = await tx.wait();
  
  return {
    txHash: receipt.hash,
    blockNumber: receipt.blockNumber,
    gasUsed: receipt.gasUsed.toString(),
    from: userAddress,
    relayer: wallet.address,
  };
}

/**
 * Get parameter types for a method
 */
function getMethodParamTypes(method) {
  const types = {
    approve: ['address', 'uint256'],
    splitPosition: ['address', 'bytes32', 'uint256'],
    mergePositions: ['address', 'bytes32', 'uint256'],
    redeemPositions: ['address', 'bytes32', 'uint256[]', 'uint256[]'],
  };
  return types[method] || [];
}

/**
 * Queue a relay request for batching
 */
async function queueRelay(request) {
  validateRelayRequest(request);
  await verifyRelaySignature(request);
  
  const rateCheck = checkRateLimit(request.userAddress);
  if (!rateCheck.allowed) {
    throw new Error(`Rate limit exceeded. Retry after ${rateCheck.retryAfter}s`);
  }
  
  // Add to queue
  const queuedRequest = {
    ...request,
    id: crypto.randomUUID(),
    queuedAt: Date.now(),
  };
  
  relayQueue.push(queuedRequest);
  
  // Process queue if threshold reached
  if (relayQueue.length >= RELAYER_CONFIG.BATCH_SIZE_THRESHOLD) {
    await processRelayQueue();
  } else {
    // Set timer for batch processing
    if (!relayTimer) {
      relayTimer = setTimeout(processRelayQueue, RELAYER_CONFIG.BATCH_TIMEOUT_MS);
    }
  }
  
  return {
    queued: true,
    requestId: queuedRequest.id,
    estimatedProcessing: RELAYER_CONFIG.BATCH_TIMEOUT_MS,
    rateLimitRemaining: rateCheck.remaining,
  };
}

/**
 * Process relay queue immediately
 */
async function processRelayQueue() {
  if (relayQueue.length === 0) return;
  
  if (relayTimer) {
    clearTimeout(relayTimer);
    relayTimer = null;
  }
  
  const batch = [...relayQueue];
  relayQueue.length = 0;
  
  const results = [];
  
  for (const request of batch) {
    try {
      const result = await executeRelay(request);
      results.push({
        requestId: request.id,
        status: 'success',
        ...result,
      });
    } catch (err) {
      results.push({
        requestId: request.id,
        status: 'failed',
        error: err.message,
      });
    }
  }
  
  return results;
}

/**
 * Get relayer status and balance
 */
async function getRelayerStatus() {
  const wallet = getRelayerWallet();
  const provider = wallet.provider;
  
  const [balance, nonce] = await Promise.all([
    provider.getBalance(wallet.address),
    provider.getTransactionCount(wallet.address),
  ]);
  
  return {
    address: wallet.address,
    balance: ethers.formatEther(balance),
    nonce,
    queueLength: relayQueue.length,
    hourlyLimit: RELAYER_CONFIG.HOURLY_LIMIT,
    maxValueUSDC: RELAYER_CONFIG.MAX_VALUE_USDC,
  };
}

/**
 * Estimate gas for a relay transaction
 */
async function estimateRelayGas(request) {
  const wallet = getRelayerWallet();
  const abi = getContractAbi(request.targetContract);
  const contract = new ethers.Contract(request.targetContract, abi, wallet);
  
  const decodedParams = ethers.AbiCoder.defaultAbiCoder().decode(
    getMethodParamTypes(request.method),
    request.params
  );
  
  const gasEstimate = await contract[request.method].estimateGas(...decodedParams);
  
  return {
    estimatedGas: gasEstimate.toString(),
    estimatedCostPOL: 'TBD', // Would need gas price
  };
}

// ── Gnosis Safe ABI (subset for execTransaction) ─────────────────────────────
const GNOSIS_SAFE_ABI = [
  'function execTransaction(address to, uint256 value, bytes calldata data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address payable refundReceiver, bytes memory signatures) payable returns (bool)',
  'function getTransactionHash(address to, uint256 value, bytes calldata data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, uint256 _nonce) view returns (bytes32)',
  'function nonce() view returns (uint256)',
];

// ── EIP-712 Safe Transaction Types ────────────────────────────────────────────
const SAFE_TX_TYPES = {
  SafeTx: [
    { name: 'to',             type: 'address' },
    { name: 'value',          type: 'uint256' },
    { name: 'data',           type: 'bytes'   },
    { name: 'operation',      type: 'uint8'   },
    { name: 'safeTxGas',      type: 'uint256' },
    { name: 'baseGas',        type: 'uint256' },
    { name: 'gasPrice',       type: 'uint256' },
    { name: 'gasToken',       type: 'address' },
    { name: 'refundReceiver', type: 'address' },
    { name: 'nonce',          type: 'uint256' },
  ],
};

/**
 * Execute a transaction through a user's Gnosis Safe (gasless for the user).
 * The relayer pays MATIC gas. The user signs the Safe transaction hash via EIP-712.
 *
 * @param {object} params
 * @param {string} params.safeAddress    - User's Safe proxy address
 * @param {string} params.to             - Target contract address
 * @param {string} [params.value]        - ETH value in wei (default: '0')
 * @param {string} params.data           - Encoded calldata (hex)
 * @param {string} params.userSignature  - EIP-712 signature from the Safe owner
 * @param {number} [params.chainId]      - Chain ID for Safe EIP-712 domain
 * @returns {Promise<{txHash: string, blockNumber: number}>}
 */
async function execSafeTransaction({ safeAddress, to, value = '0', data, userSignature, chainId }) {
  const wallet   = getRelayerWallet();
  const safe     = new ethers.Contract(safeAddress, GNOSIS_SAFE_ABI, wallet);
  const safeNonce = await safe.nonce();

  const { CHAIN_ID, RPC_URL: _rpc } = require('../config/contracts');
  const effectiveChainId = chainId || CHAIN_ID;

  const safeDomain = {
    chainId:           effectiveChainId,
    verifyingContract: safeAddress,
  };

  const safeTxMessage = {
    to,
    value:          BigInt(value),
    data:           data || '0x',
    operation:      0,          // CALL
    safeTxGas:      0n,
    baseGas:        0n,
    gasPrice:       0n,
    gasToken:       ethers.ZeroAddress,
    refundReceiver: ethers.ZeroAddress,
    nonce:          safeNonce,
  };

  // Verify the user's signature matches the Safe transaction hash
  const recovered = ethers.verifyTypedData(safeDomain, SAFE_TX_TYPES, safeTxMessage, userSignature);
  const safeOwners = await getSafeOwners(safeAddress, wallet.provider);
  if (!safeOwners.includes(recovered.toLowerCase())) {
    throw new Error(`Safe signature invalid: recovered=${recovered}, expected one of [${safeOwners.join(',')}]`);
  }

  const tx = await safe.execTransaction(
    to,
    BigInt(value),
    data || '0x',
    0,                  // CALL
    0n, 0n, 0n,         // safeTxGas, baseGas, gasPrice
    ethers.ZeroAddress, // gasToken
    ethers.ZeroAddress, // refundReceiver
    userSignature,
    { gasLimit: 500_000 }
  );

  const receipt = await tx.wait();
  console.log(`[Relayer] execSafeTransaction: safe=${safeAddress} to=${to} tx=${receipt.hash}`);
  return { txHash: receipt.hash, blockNumber: receipt.blockNumber };
}

async function getSafeOwners(safeAddress, provider) {
  const abi = ['function getOwners() view returns (address[])'];
  const safe = new ethers.Contract(safeAddress, abi, provider);
  const owners = await safe.getOwners();
  return owners.map((o) => o.toLowerCase());
}

/**
 * Execute multiple calls through the user's Safe in sequence (gasless batch).
 * Each call is a separate Safe transaction signed individually.
 *
 * For atomic multi-call, use MultiSend via a delegatecall operation.
 *
 * @param {object[]} calls - Array of { safeAddress, to, value, data, userSignature }
 */
async function execSafeBatch(calls) {
  const results = [];
  for (const call of calls) {
    try {
      const result = await execSafeTransaction(call);
      results.push({ status: 'success', ...result });
    } catch (err) {
      results.push({ status: 'failed', error: err.message });
    }
  }
  return results;
}

/**
 * Build the Safe transaction hash for a user to sign (frontend helper endpoint).
 * Returns the EIP-712 domain + message so the frontend can call signTypedData.
 *
 * @param {object} params
 * @param {string} params.safeAddress
 * @param {string} params.to
 * @param {string} [params.value]
 * @param {string} params.data
 * @param {number} [params.chainId]
 */
async function buildSafeTxForSigning({ safeAddress, to, value = '0', data, chainId }) {
  const wallet  = getRelayerWallet();
  const safe    = new ethers.Contract(safeAddress, GNOSIS_SAFE_ABI, wallet);
  const safeNonce = await safe.nonce();

  const { CHAIN_ID } = require('../config/contracts');
  const effectiveChainId = chainId || CHAIN_ID;

  const safeDomain = {
    chainId:           effectiveChainId,
    verifyingContract: safeAddress,
  };

  const safeTxMessage = {
    to,
    value:          value.toString(),
    data:           data || '0x',
    operation:      0,
    safeTxGas:      '0',
    baseGas:        '0',
    gasPrice:       '0',
    gasToken:       ethers.ZeroAddress,
    refundReceiver: ethers.ZeroAddress,
    nonce:          safeNonce.toString(),
  };

  return { domain: safeDomain, types: SAFE_TX_TYPES, message: safeTxMessage };
}

module.exports = {
  queueRelay,
  processRelayQueue,
  executeRelay,
  verifyRelaySignature,
  getRelayerStatus,
  estimateRelayGas,
  // Non-custodial Safe execution
  execSafeTransaction,
  execSafeBatch,
  buildSafeTxForSigning,
  getRelayerWallet,
  checkRateLimit,
  RELAYER_CONFIG,
  RELAY_TYPES,
  SAFE_TX_TYPES,
  getRelayDomain,
};
