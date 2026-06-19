/**
 * cctpProvider.js — Circle CCTP bridge for Solana USDC → Polygon USDC
 *
 * Uses Circle's Cross-Chain Transfer Protocol (CCTP v1):
 *   1. burnOnSolana()     — depositForBurn on Solana TokenMessengerMinter
 *   2. getAttestation()   — poll Circle Iris API for attestation
 *   3. mintOnPolygon()    — receiveMessage on Polygon MessageTransmitter
 *
 * BRIDGE_SWEEP_ENABLED=true  → real on-chain operations
 * BRIDGE_SWEEP_ENABLED=false → mock/simulated (no external calls)
 */

const { ethers } = require('ethers');
const axios = require('axios');
const {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  sendAndConfirmTransaction,
} = require('@solana/web3.js');
const {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  TOKEN_PROGRAM_ID,
} = require('@solana/spl-token');

const {
  CCTP_CONFIG,
  MESSAGE_TRANSMITTER_ABI,
  RPC_URL: POLYGON_RPC,
  getOperatorKey,
  getPolygonProvider,
} = require('../../config/contracts');

const SWEEP_ENABLED = process.env.BRIDGE_SWEEP_ENABLED === 'true';
const SOLANA_RPC = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

// ── Quote ────────────────────────────────────────────────────────────────────

/**
 * CCTP is 1:1 for USDC with zero protocol fee.
 */
function getQuote({ amount, recipient }) {
  return {
    quoteId:         `cctp-${Date.now()}`,
    estimatedOutput: amount,
    estimatedFee:    '0',
    estimatedTime:   120,
    provider:        'cctp',
  };
}

// ── Burn on Solana ───────────────────────────────────────────────────────────

/**
 * Execute depositForBurn on Solana's TokenMessengerMinter program.
 *
 * @param {object} params
 * @param {Uint8Array} params.secretKey        - Solana intake keypair secret key
 * @param {string}     params.amount           - USDC amount in base units (6 decimals)
 * @param {string}     params.mintRecipientEvm - 20-byte EVM address of the Polygon Safe
 * @returns {{ txHash, messageHash, messageBytes, provider }}
 */
async function burnOnSolana({ secretKey, amount, mintRecipientEvm }) {
  if (!SWEEP_ENABLED) {
    console.log('[CCTP] Sandbox mode — skipping real Solana CCTP burn');
    return { status: 'simulated', txHash: null, messageHash: null, messageBytes: null, provider: 'cctp' };
  }

  const connection = new Connection(SOLANA_RPC, 'confirmed');
  const payer = Keypair.fromSecretKey(secretKey);

  const tokenMessengerPubkey = new PublicKey(CCTP_CONFIG.solanaTokenMessenger);
  const messageTransmitterPubkey = new PublicKey(CCTP_CONFIG.solanaMessageTransmitter);
  const usdcMint = new PublicKey(CCTP_CONFIG.solanaUsdc);

  // Get the user's USDC ATA (Associated Token Account)
  const sourceAta = await getAssociatedTokenAddress(usdcMint, payer.publicKey);

  // Pad the EVM mintRecipient to 32 bytes (left-padded with zeros)
  const mintRecipientBytes = Buffer.alloc(32);
  const evmAddrBytes = Buffer.from(mintRecipientEvm.replace('0x', ''), 'hex');
  evmAddrBytes.copy(mintRecipientBytes, 32 - evmAddrBytes.length);

  // Build the depositForBurn instruction data
  // Instruction discriminator for depositForBurn: first 8 bytes of sha256("global:deposit_for_burn")
  const amountBN = BigInt(amount);
  const destinationDomain = CCTP_CONFIG.polygonDomain; // 7 for Polygon

  // CCTP depositForBurn instruction layout:
  // [8 bytes discriminator][8 bytes amount LE][4 bytes destDomain LE][32 bytes mintRecipient]
  const discriminator = Buffer.from([133, 237, 67, 66, 112, 205, 245, 2]); // depositForBurn discriminator
  const amountBuf = Buffer.alloc(8);
  amountBuf.writeBigUInt64LE(amountBN);
  const domainBuf = Buffer.alloc(4);
  domainBuf.writeUInt32LE(destinationDomain);

  const instructionData = Buffer.concat([discriminator, amountBuf, domainBuf, mintRecipientBytes]);

  // Derive PDA accounts required by the CCTP program
  // These are program-specific PDAs — exact seeds depend on the CCTP Solana program
  const [senderAuthority] = PublicKey.findProgramAddressSync(
    [Buffer.from('sender_authority')],
    tokenMessengerPubkey
  );

  const [messageTransmitterState] = PublicKey.findProgramAddressSync(
    [Buffer.from('message_transmitter')],
    messageTransmitterPubkey
  );

  const [tokenMessengerState] = PublicKey.findProgramAddressSync(
    [Buffer.from('token_messenger')],
    tokenMessengerPubkey
  );

  const [remoteTokenMessengerKey] = PublicKey.findProgramAddressSync(
    [Buffer.from('remote_token_messenger'), domainBuf],
    tokenMessengerPubkey
  );

  const [tokenMinterKey] = PublicKey.findProgramAddressSync(
    [Buffer.from('token_minter')],
    tokenMessengerPubkey
  );

  const [localToken] = PublicKey.findProgramAddressSync(
    [Buffer.from('local_token'), usdcMint.toBuffer()],
    tokenMessengerPubkey
  );

  // Message sent event account (unique per message, uses nonce)
  // Use a fresh keypair for the message_sent_event_data account
  const messageSentEventAccount = Keypair.generate();

  const keys = [
    { pubkey: payer.publicKey,            isSigner: true,  isWritable: true },
    { pubkey: senderAuthority,            isSigner: false, isWritable: false },
    { pubkey: sourceAta,                  isSigner: false, isWritable: true },
    { pubkey: usdcMint,                   isSigner: false, isWritable: true },
    { pubkey: messageTransmitterState,    isSigner: false, isWritable: true },
    { pubkey: tokenMessengerState,        isSigner: false, isWritable: false },
    { pubkey: remoteTokenMessengerKey,    isSigner: false, isWritable: false },
    { pubkey: tokenMinterKey,             isSigner: false, isWritable: false },
    { pubkey: localToken,                 isSigner: false, isWritable: true },
    { pubkey: messageSentEventAccount.publicKey, isSigner: true, isWritable: true },
    { pubkey: messageTransmitterPubkey,   isSigner: false, isWritable: false },
    { pubkey: TOKEN_PROGRAM_ID,           isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId,    isSigner: false, isWritable: false },
  ];

  const burnInstruction = new TransactionInstruction({
    programId: tokenMessengerPubkey,
    keys,
    data: instructionData,
  });

  const tx = new Transaction().add(burnInstruction);

  const signature = await sendAndConfirmTransaction(connection, tx, [payer, messageSentEventAccount], {
    commitment: 'confirmed',
  });

  console.log(`[CCTP] Burn tx confirmed: ${signature}`);

  // Parse the MessageSent event from the transaction logs to extract messageHash + messageBytes
  // For now, we store the tx signature and use the Iris API to fetch the attestation
  // The Iris API can look up by Solana tx hash
  return {
    txHash:       signature,
    messageHash:  null, // will be populated by Iris
    messageBytes: null, // will be populated by Iris
    provider:     'cctp',
  };
}

// ── Attestation polling ──────────────────────────────────────────────────────

/**
 * Poll Circle's Iris API for the CCTP attestation.
 *
 * @param {string} burnTxHash - Solana burn transaction signature
 * @returns {{ status: 'pending'|'complete', attestation, message }}
 */
async function getAttestation(burnTxHash) {
  if (!SWEEP_ENABLED) {
    return { status: 'pending', attestation: null, message: null, provider: 'cctp' };
  }

  try {
    // Iris API: GET /v1/messages/{sourceDomain}/{txHash}
    const url = `${CCTP_CONFIG.irisApi}/v1/messages/${CCTP_CONFIG.solanaDomain}/${burnTxHash}`;
    const { data } = await axios.get(url, { timeout: 15000 });

    const msg = data?.messages?.[0];
    if (!msg) return { status: 'pending', provider: 'cctp' };

    if (msg.status === 'complete') {
      return {
        status:      'complete',
        attestation: msg.attestation,
        message:     msg.message,
        messageHash: msg.messageHash,
        provider:    'cctp',
      };
    }

    return { status: 'pending', provider: 'cctp' };
  } catch (err) {
    console.warn('[CCTP] Iris attestation poll error:', err.message);
    return { status: 'pending', error: err.message, provider: 'cctp' };
  }
}

// ── Mint on Polygon ──────────────────────────────────────────────────────────

/**
 * Call MessageTransmitter.receiveMessage(message, attestation) on Polygon.
 * Idempotent: if the nonce is already used, treat as success.
 *
 * @param {object} params
 * @param {string} params.messageBytes - hex-encoded message from Iris
 * @param {string} params.attestation  - hex-encoded attestation from Iris
 * @returns {{ txHash, provider }}
 */
async function mintOnPolygon({ messageBytes, attestation }) {
  if (!SWEEP_ENABLED) {
    console.log('[CCTP] Sandbox mode — skipping real Polygon mint');
    return { txHash: null, provider: 'cctp' };
  }

  const provider = getPolygonProvider();
  const operatorKey = getOperatorKey();
  const wallet = new ethers.Wallet(operatorKey, provider);

  const messageTransmitter = new ethers.Contract(
    CCTP_CONFIG.polygonMessageTransmitter,
    MESSAGE_TRANSMITTER_ABI,
    wallet
  );

  try {
    const tx = await messageTransmitter.receiveMessage(messageBytes, attestation);
    const receipt = await tx.wait();
    console.log(`[CCTP] Polygon mint tx confirmed: ${receipt.hash}`);
    return { txHash: receipt.hash, provider: 'cctp' };
  } catch (err) {
    // If nonce already used, the message was already received — idempotent success
    if (err.message?.includes('Nonce already used') || err.message?.includes('nonce already used')) {
      console.log('[CCTP] Polygon mint nonce already used — treating as success');
      return { txHash: null, provider: 'cctp', alreadyMinted: true };
    }
    throw err;
  }
}

// ── Status ───────────────────────────────────────────────────────────────────

/**
 * Get the overall CCTP bridge status backed by Iris.
 */
async function getStatus(burnTxHash) {
  if (!burnTxHash) return { status: 'pending', provider: 'cctp' };
  return getAttestation(burnTxHash);
}

module.exports = { getQuote, burnOnSolana, getAttestation, mintOnPolygon, getStatus };
