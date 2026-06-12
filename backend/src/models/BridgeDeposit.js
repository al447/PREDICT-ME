const mongoose = require('mongoose');

/**
 * BridgeDeposit — tracks the lifecycle of a custodial intake-address deposit.
 *
 * Lifecycle:
 *   EVM:    detected → sweeping → bridging → credited | failed
 *   Solana: detected → sweeping → attesting → minting → credited | failed
 *   BTC:    detected → bridging → credited | failed  (Relay handles sweep)
 *
 * sourceTxHash is sparse-unique: BTC/Relay deposits use relayRequestId for
 * idempotency (stored as sourceTxHash), while EVM/Solana use the actual tx hash.
 */
const bridgeDepositSchema = new mongoose.Schema(
  {
    userId:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    chainType:     { type: String, enum: ['evm', 'svm', 'btc'], required: true },
    sourceChainId: { type: Number, default: null },           // EVM chain id (null for BTC/SVM)
    sourceToken:   { type: String, required: true },          // e.g. 'USDC', 'ETH', 'BTC'
    sourceAmount:  { type: Number, required: true },          // human-readable amount
    sourceTxHash:  { type: String, lowercase: true, default: null },
    intakeAddress: { type: String, required: true, lowercase: true },
    status: {
      type: String,
      enum: ['detected', 'sweeping', 'bridging', 'attesting', 'minting', 'credited', 'failed'],
      default: 'detected',
      index: true,
    },
    bridgeProvider: { type: String, default: null },          // 'across', 'cctp', 'relay', 'wormhole', 'thorchain'
    bridgeTxHash:   { type: String, default: null, lowercase: true },
    outboundTxHash: { type: String, default: null, lowercase: true }, // destination-chain fill/mint tx
    safeTxHash:     { type: String, default: null, lowercase: true },
    creditedAmount: { type: Number, default: null },          // USDC credited to Safe
    creditedAt:     { type: Date,   default: null },
    errorMessage:   { type: String, default: null },
    retryCount:     { type: Number, default: 0 },

    // ── Circle CCTP (Solana → Polygon) ──────────────────────────────────────
    cctpMessageHash:  { type: String, default: null },
    cctpMessageBytes: { type: String, default: null },        // hex-encoded
    cctpAttestation:  { type: String, default: null },        // hex-encoded

    // ── Relay (Bitcoin → Polygon) ───────────────────────────────────────────
    relayRequestId:     { type: String, default: null, index: true },
    relayDepositAddress:{ type: String, default: null, lowercase: true },
  },
  { timestamps: true }
);

// Sparse-unique: allows null sourceTxHash (Relay uses relayRequestId for idempotency)
bridgeDepositSchema.index({ sourceTxHash: 1 }, { unique: true, sparse: true });
bridgeDepositSchema.index({ intakeAddress: 1 });
bridgeDepositSchema.index({ createdAt: -1 });

module.exports = mongoose.model('BridgeDeposit', bridgeDepositSchema);
