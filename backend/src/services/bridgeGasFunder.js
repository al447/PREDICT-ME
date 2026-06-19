/**
 * bridgeGasFunder.js — Operator-funded gas top-ups for bridge operations
 *
 * Currently supports:
 *   - Solana: transfer SOL from operator to intake address for CCTP burn gas
 *
 * BRIDGE_SWEEP_ENABLED=false → no-op (skip real funding)
 */

const {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} = require('@solana/web3.js');
const bs58 = require('bs58');
const { CCTP_CONFIG } = require('../config/contracts');

const SWEEP_ENABLED = process.env.BRIDGE_SWEEP_ENABLED === 'true';
const SOLANA_RPC = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

/**
 * Ensure a Solana intake address has enough SOL for a CCTP burn transaction.
 * If the balance is below the threshold, the operator transfers SOL to top it up.
 *
 * @param {string} intakePubkeyStr - base58 Solana public key of the intake address
 * @param {number} [minLamports]   - minimum lamports required (default from env)
 * @throws {Error} if operator key is missing or operator balance too low
 */
async function ensureSolanaGas(intakePubkeyStr, minLamports) {
  if (!SWEEP_ENABLED) {
    console.log(`[GasFunder] Mock mode — skipping SOL gas check for ${intakePubkeyStr}`);
    return;
  }

  const threshold = minLamports || CCTP_CONFIG.solGasLamports || 5_000_000; // ~0.005 SOL
  const connection = new Connection(SOLANA_RPC, 'confirmed');
  const intakePubkey = new PublicKey(intakePubkeyStr);

  // Check current SOL balance
  const balance = await connection.getBalance(intakePubkey);
  if (balance >= threshold) {
    console.log(`[GasFunder] Intake ${intakePubkeyStr} has ${balance} lamports — sufficient`);
    return;
  }

  // Need to top up
  const operatorSecret = CCTP_CONFIG.solanaOperatorSecret;
  if (!operatorSecret) {
    // Non-fatal: warn and skip. Deposit stays in 'detected' for retry once key is set.
    console.warn('[GasFunder] SOLANA_OPERATOR_SECRET not set — skipping SOL gas top-up. Set the key in Render Dashboard to enable Solana CCTP sweeps.');
    const err = new Error('[GasFunder] SOLANA_OPERATOR_SECRET not configured');
    err.retryable = true;
    throw err;
  }

  const operatorKeypair = Keypair.fromSecretKey(bs58.decode(operatorSecret));

  // Check operator balance
  const operatorBalance = await connection.getBalance(operatorKeypair.publicKey);
  const topUpAmount = threshold - balance + 5000; // +5000 for the transfer fee
  if (operatorBalance < topUpAmount + 10_000) {
    throw new Error(
      `[GasFunder] Operator SOL balance too low: ${operatorBalance} lamports, need ${topUpAmount + 10_000}. ` +
      `Fund operator ${operatorKeypair.publicKey.toBase58()}`
    );
  }

  // Transfer SOL
  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: operatorKeypair.publicKey,
      toPubkey:   intakePubkey,
      lamports:   topUpAmount,
    })
  );

  const sig = await sendAndConfirmTransaction(connection, tx, [operatorKeypair], { commitment: 'confirmed' });
  console.log(`[GasFunder] Topped up ${intakePubkeyStr} with ${topUpAmount} lamports (${(topUpAmount / LAMPORTS_PER_SOL).toFixed(6)} SOL), tx: ${sig}`);
}

/**
 * Ensure an EVM intake address has enough native gas for approve + bridge deposit.
 * Operator sends ETH/MATIC/etc. from the operator wallet.
 *
 * @param {string} intakeAddress - The EVM HD-derived intake address
 * @param {number} chainId - The EVM chain ID
 */
async function ensureEvmGas(intakeAddress, chainId) {
  if (!SWEEP_ENABLED) {
    console.log(`[GasFunder] Mock mode — skipping EVM gas check for ${intakeAddress} on chain ${chainId}`);
    return;
  }

  const { ethers } = require('ethers');
  const { getOperatorKey } = require('../config/contracts');

  const RPC_URLS = {
    1:     process.env.ETH_RPC_URL    || 'https://ethereum-rpc.publicnode.com',
    8453:  process.env.BASE_RPC_URL   || 'https://base-rpc.publicnode.com',
    42161: process.env.ARB_RPC_URL    || 'https://arbitrum-one-rpc.publicnode.com',
    10:    process.env.OP_RPC_URL     || 'https://optimism-rpc.publicnode.com',
    43114: process.env.AVAX_RPC_URL   || 'https://avalanche-c-chain-rpc.publicnode.com',
    137:   process.env.POLYGON_RPC_URL || 'https://polygon-bor-rpc.publicnode.com',
    56:    process.env.BSC_RPC_URL     || 'https://bsc-dataseed.binance.org',
  };

  const rpcUrl = RPC_URLS[chainId];
  if (!rpcUrl) throw new Error(`[GasFunder] No RPC for EVM chain ${chainId}`);

  const { createProvider } = require('../config/contracts');
  const provider = createProvider(rpcUrl, chainId);
  const balance = await provider.getBalance(intakeAddress);

  // Need ~0.002 ETH for approve + deposit (varies by chain but safe minimum)
  const MIN_GAS = {
    1: ethers.parseEther('0.003'),      // Ethereum
    8453: ethers.parseEther('0.0005'),   // Base
    42161: ethers.parseEther('0.0005'),  // Arbitrum
    10: ethers.parseEther('0.0005'),     // Optimism
    43114: ethers.parseEther('0.01'),    // Avalanche
    137: ethers.parseEther('0.01'),      // Polygon (MATIC)
    56: ethers.parseEther('0.001'),      // BSC
  };

  const threshold = MIN_GAS[chainId] || ethers.parseEther('0.002');

  if (balance >= threshold) {
    console.log(`[GasFunder] Intake ${intakeAddress} on chain ${chainId} has sufficient gas (${ethers.formatEther(balance)})`);
    return;
  }

  const operatorKey = getOperatorKey();
  if (!operatorKey) throw new Error('[GasFunder] OPERATOR_PRIVATE_KEY not configured — cannot fund EVM gas');

  const wallet = new ethers.Wallet(operatorKey, provider);
  const topUpAmount = threshold - balance + ethers.parseEther('0.0001'); // small buffer

  const operatorBalance = await provider.getBalance(wallet.address);
  if (operatorBalance < topUpAmount + ethers.parseEther('0.0001')) {
    throw new Error(
      `[GasFunder] Operator native balance too low on chain ${chainId}: ` +
      `have ${ethers.formatEther(operatorBalance)}, need ${ethers.formatEther(topUpAmount)}. ` +
      `Fund operator ${wallet.address}`
    );
  }

  const tx = await wallet.sendTransaction({
    to: intakeAddress,
    value: topUpAmount,
  });
  const receipt = await tx.wait();
  console.log(`[GasFunder] Topped up ${intakeAddress} on chain ${chainId} with ${ethers.formatEther(topUpAmount)} native gas, tx: ${receipt.hash}`);
}

module.exports = { ensureSolanaGas, ensureEvmGas };
