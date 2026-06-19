const mongoose = require('mongoose');

/**
 * BridgeWithdrawal — tracks the lifecycle of a user-initiated withdrawal.
 *
 * Lifecycle:
 *   pending → bridging → completed
 *                     └→ failed
 */
const bridgeWithdrawalSchema = new mongoose.Schema(
  {
    userId:         { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    fromAmountUsdc: { type: Number, required: true },         // USDC deducted from Safe
    toChainId:      { type: Number, default: null },          // destination chain id (null for BTC)
    toChainType:    { type: String, enum: ['evm', 'svm', 'btc'], required: true },
    toToken:        { type: String, required: true },         // destination token symbol
    recipientAddr:  { type: String, required: true },         // destination wallet address
    quoteId:        { type: String, default: null },          // provider quote reference
    status: {
      type: String,
      enum: ['pending', 'bridging', 'completed', 'failed', 'requires_attention'],
      default: 'pending',
      index: true,
    },
    provider:       { type: String, default: null },
    safeDebitTxHash:{ type: String, default: null, lowercase: true }, // proxy→operator debit (user-signed)
    refundTxHash:   { type: String, default: null, lowercase: true }, // operator→proxy refund on failure
    txHash:         { type: String, default: null, lowercase: true },
    estimatedOutput:{ type: Number, default: null },          // estimated destination amount
    actualOutput:   { type: Number, default: null },
    errorMessage:   { type: String, default: null },
  },
  { timestamps: true }
);

bridgeWithdrawalSchema.index({ createdAt: -1 });

module.exports = mongoose.model('BridgeWithdrawal', bridgeWithdrawalSchema);
