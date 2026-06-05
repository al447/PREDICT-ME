/**
 * withdrawalService.js — Non-custodial USDC withdrawal from Gnosis Safe
 *
 * The user's Safe holds USDC. To withdraw, the relayer calls
 * Safe.execTransaction(to=USDC, data=transfer(recipient, amount)).
 * The user signs the SafeTx hash; the relayer pays the MATIC gas.
 *
 * On the non-custodial model, funds never pass through admin wallets.
 */

const { ethers } = require('ethers');
const { ADDRESSES, ABIS, RPC_URL } = require('../config/contracts');
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
 * @param {string} safeAddress   - User's Safe proxy
 * @param {string} recipient     - Destination address
 * @param {number} amountUsdc    - Amount in USDC (human-readable)
 * @returns {{ domain, types, message }}
 */
async function prepareWithdrawal(safeAddress, recipient, amountUsdc) {
  if (!ethers.isAddress(safeAddress)) throw new Error('Invalid safeAddress');
  if (!ethers.isAddress(recipient))   throw new Error('Invalid recipient');
  if (amountUsdc <= 0)                throw new Error('Amount must be positive');

  const usdcAddress = ADDRESSES.MOCK_USDC;
  const data = encodeUsdcTransfer(recipient, amountUsdc);

  return buildSafeTxForSigning({
    safeAddress,
    to:    usdcAddress,
    value: '0',
    data,
  });
}

/**
 * Execute a USDC withdrawal from the user's Safe (gasless for user).
 * The relayer submits the Safe transaction and pays MATIC.
 *
 * @param {string} safeAddress    - User's Safe proxy
 * @param {string} recipient      - Destination address
 * @param {number} amountUsdc     - Amount in USDC
 * @param {string} userSignature  - EIP-712 SafeTx signature from the Safe owner
 * @returns {{ txHash, blockNumber, amountUsdc, recipient }}
 */
async function executeWithdrawal(safeAddress, recipient, amountUsdc, userSignature) {
  if (!ethers.isAddress(safeAddress)) throw new Error('Invalid safeAddress');
  if (!ethers.isAddress(recipient))   throw new Error('Invalid recipient');
  if (amountUsdc <= 0)                throw new Error('Amount must be positive');

  // Verify user has sufficient USDC balance in their Safe
  const balance = await walletService.getSmartWalletBalance(safeAddress);
  if (balance < amountUsdc) {
    throw new Error(`Insufficient Safe balance: ${balance} USDC available, ${amountUsdc} requested`);
  }

  const usdcAddress = ADDRESSES.MOCK_USDC;
  const data = encodeUsdcTransfer(recipient, amountUsdc);

  const result = await execSafeTransaction({
    safeAddress,
    to:            usdcAddress,
    value:         '0',
    data,
    userSignature,
  });

  console.log(`[Withdrawal] Safe=${safeAddress} → ${recipient} ${amountUsdc} USDC tx=${result.txHash}`);
  return { ...result, amountUsdc, recipient };
}

module.exports = {
  prepareWithdrawal,
  executeWithdrawal,
  encodeUsdcTransfer,
};
