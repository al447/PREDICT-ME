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
    throw new Error('[GasFunder] SOLANA_OPERATOR_SECRET not configured — cannot fund intake gas');
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

module.exports = { ensureSolanaGas };
