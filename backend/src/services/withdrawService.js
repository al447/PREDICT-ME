/**
 * withdrawService.js — Multi-chain withdrawal from user's Gnosis Safe → destination
 *
 * Enforces User.withdrawalLimits before executing.
 * Routes to the correct bridge provider based on destination chain type.
 */

const User = require('../models/User');
const BridgeWithdrawal = require('../models/BridgeWithdrawal');
const across    = require('./bridgeProviders/acrossProvider');
const cctp      = require('./bridgeProviders/cctpProvider');
const relay     = require('./bridgeProviders/relayProvider');
const debridge  = require('./bridgeProviders/debridgeProvider');

const MIN_WITHDRAW_USD   = parseFloat(process.env.BRIDGE_MIN_WITHDRAW_USD || '10');
const MAX_WITHDRAW_USD   = parseFloat(process.env.BRIDGE_MAX_WITHDRAW_USD || '100000');

/**
 * Get a withdrawal quote.
 * @param {object} params
 * @param {number} params.fromAmountUsdc - USDC amount to withdraw
 * @param {string} params.toChainType    - 'evm' | 'svm' | 'btc'
 * @param {number} params.toChainId      - EVM dest chain id (null for btc/svm)
 * @param {string} params.toToken        - destination token symbol
 * @param {string} params.recipientAddr  - destination wallet address
 */
async function getQuote({ fromAmountUsdc, toChainType, toChainId, toToken, recipientAddr }) {
  validateAmount(fromAmountUsdc);

  const amountBase = Math.round(fromAmountUsdc * 1e6).toString();

  if (toChainType === 'evm') {
    const primary = await across.getQuote({
      fromChainId:  137,       // Polygon (Safe)
      inputToken:   '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', // USDC on Polygon
      outputToken:  resolveDestToken(toChainId, toToken),
      amount:       amountBase,
      recipient:    recipientAddr,
    });
    const fallback = await debridge.getQuote({
      fromChainId:      137,
      srcTokenAddress:  '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
      dstTokenAddress:  resolveDestToken(toChainId, toToken),
      srcTokenAmount:   amountBase,
      recipient:        recipientAddr,
    });
    return { primary, fallback };
  }

  if (toChainType === 'svm') {
    return { primary: cctp.getQuote({ amount: amountBase, recipient: recipientAddr }) };
  }

  if (toChainType === 'btc') {
    const relayQuote = await relay.getWithdrawQuote({ amountUsdc: fromAmountUsdc, btcRecipient: recipientAddr });
    return { primary: relayQuote };
  }

  throw new Error(`[Withdraw] Unsupported toChainType: ${toChainType}`);
}

/**
 * Execute a withdrawal.
 * @param {string} userId
 * @param {object} params - same as getQuote + { provider }
 */
async function executeWithdrawal(userId, { fromAmountUsdc, toChainType, toChainId, toToken, recipientAddr, provider = 'across' }) {
  validateAmount(fromAmountUsdc);

  const user = await User.findById(userId);
  if (!user) throw new Error('User not found');

  // Enforce balance
  if ((user.balance || 0) < fromAmountUsdc) {
    throw new Error(`[Withdraw] Insufficient balance: have ${user.balance}, need ${fromAmountUsdc}`);
  }

  // Enforce withdrawalLimits
  enforceWithdrawalLimits(user, fromAmountUsdc);

  // Reserve balance (debit first to prevent double-spend)
  await User.findByIdAndUpdate(userId, { $inc: { balance: -fromAmountUsdc } });

  const record = await BridgeWithdrawal.create({
    userId,
    fromAmountUsdc,
    toChainId:    toChainId || null,
    toChainType,
    toToken,
    recipientAddr,
    provider,
    status: 'pending',
  });

  // Execute async (non-blocking)
  executeAsync(record._id.toString(), { toChainType, provider, fromAmountUsdc, toChainId, toToken, recipientAddr, userId })
    .catch(err => console.error(`[Withdraw] Async execution failed for ${record._id}:`, err.message));

  return { withdrawalId: record._id, status: 'pending' };
}

async function executeAsync(withdrawalId, { toChainType, provider, fromAmountUsdc, toChainId, toToken, recipientAddr, userId }) {
  try {
    await BridgeWithdrawal.findByIdAndUpdate(withdrawalId, { status: 'bridging' });

    let result;
    if (toChainType === 'evm') {
      if (provider === 'debridge') {
        const amountBase = Math.round(fromAmountUsdc * 1e6).toString();
        const quote = await debridge.getQuote({
          fromChainId: 137,
          srcTokenAddress: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
          dstTokenAddress: resolveDestToken(toChainId, toToken),
          srcTokenAmount:  amountBase,
          recipient:       recipientAddr,
        });
        result = await debridge.execute({ orderCalldata: quote.orderCalldata });
      } else {
        // Across: operator deposits USDC into the Polygon SpokePool → fills on dest chain
        const amountBase = Math.round(fromAmountUsdc * 1e6).toString();

        if (process.env.BRIDGE_SWEEP_ENABLED !== 'true') {
          result = { provider: 'across', txHash: null, status: 'simulated' };
        } else {
          const { ethers } = require('ethers');
          const { RPC_URL: POLYGON_RPC, getOperatorKey } = require('../config/contracts');

          const rpcProvider = new ethers.JsonRpcProvider(POLYGON_RPC);
          const wallet = new ethers.Wallet(getOperatorKey(), rpcProvider);

          const POLYGON_USDC = '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359';
          const POLYGON_SPOKE_POOL = across.SPOKE_POOLS[137];
          if (!POLYGON_SPOKE_POOL) throw new Error('[Withdraw][Across] No SpokePool configured for Polygon (137)');

          // 1. Approve USDC to SpokePool (skip if already approved)
          const usdcAbi = [
            'function approve(address spender, uint256 amount) external returns (bool)',
            'function allowance(address owner, address spender) view returns (uint256)',
          ];
          const usdc = new ethers.Contract(POLYGON_USDC, usdcAbi, wallet);
          const currentAllowance = await usdc.allowance(wallet.address, POLYGON_SPOKE_POOL);
          if (currentAllowance < BigInt(amountBase)) {
            await (await usdc.approve(POLYGON_SPOKE_POOL, ethers.MaxUint256)).wait();
          }

          // 2. Build and send SpokePool.deposit() to bridge USDC to destination chain
          const destToken = resolveDestToken(toChainId, toToken);
          const fillDeadline = Math.floor(Date.now() / 1000) + 21600; // +6 hours
          const quoteTimestamp = Math.floor(Date.now() / 1000);

          const spokePoolAbi = [
            'function deposit(address recipient, address inputToken, address outputToken, uint256 inputAmount, uint256 outputAmount, uint256 destinationChainId, address exclusiveRelayer, uint32 quoteTimestamp, uint32 fillDeadline, uint32 exclusivityDeadline, bytes calldata message) external',
          ];
          const spokePool = new ethers.Contract(POLYGON_SPOKE_POOL, spokePoolAbi, wallet);

          const tx = await spokePool.deposit(
            recipientAddr,          // recipient on dest chain
            POLYGON_USDC,           // inputToken (Polygon USDC)
            destToken,              // outputToken on dest chain
            amountBase,             // inputAmount
            0,                      // outputAmount = 0 (relayer fills best-effort)
            toChainId,              // destinationChainId
            ethers.ZeroAddress,     // no exclusive relayer
            quoteTimestamp,
            fillDeadline,
            0,                      // no exclusivity deadline
            '0x',                   // no message
          );
          const receipt = await tx.wait();
          result = { provider: 'across', txHash: receipt.hash };
        }
      }
    } else if (toChainType === 'svm') {
      // CCTP reverse: burn USDC on Polygon → mint on Solana
      // For reverse, we need to burn from Polygon (domain 7) to Solana (domain 5)
      // The operator sends USDC from the Safe to the CCTP TokenMessenger on Polygon
      const { ethers } = require('ethers');
      const { CCTP_CONFIG, MESSAGE_TRANSMITTER_ABI, RPC_URL: POLYGON_RPC, getOperatorKey } = require('../config/contracts');

      if (process.env.BRIDGE_SWEEP_ENABLED !== 'true') {
        result = { provider: 'cctp', txHash: null, status: 'simulated' };
      } else {
        // Build depositForBurn on Polygon TokenMessenger for Solana destination
        const provider = new ethers.JsonRpcProvider(POLYGON_RPC);
        const wallet = new ethers.Wallet(getOperatorKey(), provider);
        const tokenMessengerAbi = [
          'function depositForBurn(uint256 amount, uint32 destinationDomain, bytes32 mintRecipient, address burnToken) external returns (uint64 nonce)',
        ];
        const tokenMessenger = new ethers.Contract(CCTP_CONFIG.polygonTokenMessenger, tokenMessengerAbi, wallet);

        // Pad Solana recipient (base58) to 32 bytes
        const { PublicKey } = require('@solana/web3.js');
        const recipientPubkey = new PublicKey(recipientAddr);
        const mintRecipient = '0x' + Buffer.from(recipientPubkey.toBytes()).toString('hex').padStart(64, '0');

        const amountBase = Math.round(fromAmountUsdc * 1e6);
        // Approve USDC spend first
        const usdcAbi = ['function approve(address spender, uint256 amount) external returns (bool)'];
        const usdc = new ethers.Contract(CCTP_CONFIG.polygonUsdc, usdcAbi, wallet);
        await (await usdc.approve(CCTP_CONFIG.polygonTokenMessenger, amountBase)).wait();

        const tx = await tokenMessenger.depositForBurn(
          amountBase,
          CCTP_CONFIG.solanaDomain, // 5
          mintRecipient,
          CCTP_CONFIG.polygonUsdc
        );
        const receipt = await tx.wait();
        result = { provider: 'cctp', txHash: receipt.hash };
      }
    } else if (toChainType === 'btc') {
      // Relay reverse: Polygon USDC → BTC
      if (process.env.BRIDGE_SWEEP_ENABLED !== 'true') {
        result = { provider: 'relay', txHash: null, status: 'simulated' };
      } else {
        const withdrawal = await relay.createBtcWithdrawal({
          fromSafe:     null, // operator sends from Safe
          btcRecipient: recipientAddr,
          amountUsdc:   fromAmountUsdc,
        });
        // The operator needs to send USDC to Relay's Polygon deposit address
        // This is done via a standard ERC20 transfer
        const { ethers } = require('ethers');
        const { RPC_URL: POLYGON_RPC, getOperatorKey, RELAY_CONFIG: RC } = require('../config/contracts');
        const provider = new ethers.JsonRpcProvider(POLYGON_RPC);
        const wallet = new ethers.Wallet(getOperatorKey(), provider);
        const usdcAbi = ['function transfer(address to, uint256 amount) external returns (bool)'];
        const polygonUsdc = RC?.polygonUsdc || '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359';
        const usdc = new ethers.Contract(polygonUsdc, usdcAbi, wallet);
        const amountBase = Math.round(fromAmountUsdc * 1e6);
        const tx = await usdc.transfer(withdrawal.depositAddress, amountBase);
        const receipt = await tx.wait();
        result = { provider: 'relay', txHash: receipt.hash, relayRequestId: withdrawal.requestId };
      }
    }

    await BridgeWithdrawal.findByIdAndUpdate(withdrawalId, {
      status:  'completed',
      txHash:  result?.txHash || null,
    });
  } catch (err) {
    console.error(`[Withdraw] executeAsync ${withdrawalId} failed:`, err.message);
    await BridgeWithdrawal.findByIdAndUpdate(withdrawalId, {
      status:       'failed',
      errorMessage: err.message,
    });
    // Refund deducted balance on failure
    await User.findByIdAndUpdate(userId, { $inc: { balance: fromAmountUsdc } });
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function validateAmount(amount) {
  if (typeof amount !== 'number' || isNaN(amount)) throw new Error('[Withdraw] Invalid amount');
  if (amount < MIN_WITHDRAW_USD) throw new Error(`[Withdraw] Minimum withdrawal is $${MIN_WITHDRAW_USD}`);
  if (amount > MAX_WITHDRAW_USD) throw new Error(`[Withdraw] Maximum withdrawal is $${MAX_WITHDRAW_USD}`);
}

function enforceWithdrawalLimits(user, amount) {
  const limits = user.withdrawalLimits;
  if (!limits) return;
  const now = Date.now();
  const dayMs  = 86400000;
  const weekMs = 604800000;

  if (limits.dailyLimit && limits.dailyUsed != null) {
    const dayReset = (limits.lastWithdrawAt?.getTime() || 0) + dayMs;
    const dailyUsed = now > dayReset ? 0 : (limits.dailyUsed || 0);
    if (dailyUsed + amount > limits.dailyLimit) {
      throw new Error(`[Withdraw] Daily limit exceeded (${dailyUsed + amount} > ${limits.dailyLimit})`);
    }
  }

  if (limits.weeklyLimit && limits.weeklyUsed != null) {
    const weekReset = (limits.weekResetAt?.getTime() || 0) + weekMs;
    const weeklyUsed = now > weekReset ? 0 : (limits.weeklyUsed || 0);
    if (weeklyUsed + amount > limits.weeklyLimit) {
      throw new Error(`[Withdraw] Weekly limit exceeded (${weeklyUsed + amount} > ${limits.weeklyLimit})`);
    }
  }
}

const USDC_DEST_BY_CHAIN = {
  1:     '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  8453:  '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  42161: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  10:    '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
  43114: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E',
};

function resolveDestToken(chainId, token) {
  if (token === 'USDC' && USDC_DEST_BY_CHAIN[chainId]) return USDC_DEST_BY_CHAIN[chainId];
  throw new Error(`[Withdraw] Cannot resolve token ${token} on chain ${chainId}`);
}

module.exports = { getQuote, executeWithdrawal };
