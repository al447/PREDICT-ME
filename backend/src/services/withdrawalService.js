/**
 * withdrawalService.js — Non-custodial USDC withdrawals from proxy wallet
 *
 * Supports both proxy types:
 *   - POLY_PROXY (proxyType='poly', signatureType=1): relayer calls execTransaction
 *     on behalf of the user's proxy (same flow as Safe — proxy forwards calls).
 *   - Gnosis Safe (proxyType='safe', signatureType=2): relayer calls Safe.execTransaction
 *     with the user's EIP-712 signed SafeTx.
 *
 * In both cases: user signs the payload in-browser; relayer pays MATIC gas.
 */

const { ethers } = require('ethers');
const { ADDRESSES, ABIS, RPC_URL, getRelayerKey } = require('../config/contracts');
const { execSafeTransaction, buildSafeTxForSigning } = require('./relayerService');
const walletService = require('./walletService');

const USDC_TRANSFER_ABI = ['function transfer(address to, uint256 amount) returns (bool)'];
const USDC_DECIMALS = 6;

/**
 * Encode a USDC transfer calldata.
 */
function encodeUsdcTransfer(recipient, amountUsdc) {
  const iface = new ethers.Interface(USDC_TRANSFER_ABI);
  return iface.encodeFunctionData('transfer', [
    recipient,
    ethers.parseUnits(amountUsdc.toFixed(USDC_DECIMALS), USDC_DECIMALS),
  ]);
}

/**
 * Get the EIP-712 Safe transaction payload for a USDC withdrawal.
 * Returns the data the frontend must sign.
 *
 * @param {string} proxyAddress  - User's proxy wallet address
 * @param {string} recipient     - Destination address
 * @param {number} amountUsdc    - Amount in USDC (human-readable)
 * @returns {{ domain, types, message }}
 */
async function prepareWithdrawal(proxyAddress, recipient, amountUsdc) {
  if (!ethers.isAddress(proxyAddress)) throw new Error('Invalid proxyAddress');
  if (!ethers.isAddress(recipient))    throw new Error('Invalid recipient');
  if (amountUsdc <= 0)                 throw new Error('Amount must be positive');

  const usdcAddress = ADDRESSES.USDC;
  const data = encodeUsdcTransfer(recipient, amountUsdc);

  return buildSafeTxForSigning({
    safeAddress: proxyAddress,
    to:    usdcAddress,
    value: '0',
    data,
  });
}

/**
 * Execute a USDC withdrawal from the user's proxy wallet (gasless for user).
 * Accepts either the old positional signature or a single options object
 * (used by userController Phase 5).
 *
 * Options object form (preferred):
 *   { user, proxyAddress, toAddress, amount, signature, signedTx }
 *
 * Legacy positional form (backward compat):
 *   executeWithdrawal(safeAddress, recipient, amountUsdc, userSignature)
 *
 * @returns {{ txHash, amountUsdc, recipient }}
 */
async function executeWithdrawal(safeAddressOrOpts, recipient, amountUsdc, userSignature) {
  // Normalise overloaded call forms
  let proxyAddress, toAddress, amount, signature;
  if (safeAddressOrOpts && typeof safeAddressOrOpts === 'object' && !ethers.isAddress(safeAddressOrOpts)) {
    const opts = safeAddressOrOpts;
    proxyAddress = opts.proxyAddress;
    toAddress    = opts.toAddress;
    amount       = opts.amount;
    signature    = opts.signature || opts.userSignature;
  } else {
    proxyAddress = safeAddressOrOpts;
    toAddress    = recipient;
    amount       = amountUsdc;
    signature    = userSignature;
  }

  if (!ethers.isAddress(proxyAddress)) throw new Error('Invalid proxyAddress');
  if (!ethers.isAddress(toAddress))    throw new Error('Invalid toAddress');
  if (amount <= 0)                     throw new Error('Amount must be positive');

  // Check on-chain proxy balance
  const balance = await walletService.getSmartWalletBalance(proxyAddress);
  if (balance < amount) {
    throw new Error(`Insufficient proxy balance: ${balance.toFixed(6)} USDC available, ${amount} requested`);
  }

  const usdcAddress = ADDRESSES.USDC;
  const data = encodeUsdcTransfer(toAddress, amount);

  // Both POLY_PROXY and Gnosis Safe use execSafeTransaction (same interface).
  // The relayer's execSafeTransaction handles the low-level call pattern.
  const result = await execSafeTransaction({
    safeAddress:   proxyAddress,
    to:            usdcAddress,
    value:         '0',
    data,
    userSignature: signature,
  });

  console.log(`[Withdrawal] proxy=${proxyAddress} → ${toAddress} ${amount} USDC tx=${result.txHash}`);
  return { ...result, amountUsdc: amount, recipient: toAddress };
}

module.exports = {
  prepareWithdrawal,
  executeWithdrawal,
  encodeUsdcTransfer,
};
