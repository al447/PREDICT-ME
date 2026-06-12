/**
 * UserPosition — on-chain CTF ERC-1155 outcome token balance.
 *
 * Synced by depositIndexer.js (scanCtfPositions) from chain events.
 * One document per (user, conditionId, tokenId) triple.
 * balance is the net ERC-1155 token amount (6-decimal USDC-collateralised shares).
 */

const mongoose = require('mongoose');

const userPositionSchema = new mongoose.Schema(
  {
    user:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    walletAddress: { type: String, required: true, lowercase: true, index: true },
    conditionId: { type: String, required: true, index: true },
    tokenId:     { type: String, required: true },
    side:        { type: String, enum: ['YES', 'NO', 'UNKNOWN'], default: 'UNKNOWN' },
    balance:     { type: Number, default: 0 },
    lastTxHash:  { type: String },
    lastBlock:   { type: Number },
    syncedAt:    { type: Date, default: Date.now },
  },
  { timestamps: true }
);

userPositionSchema.index({ user: 1, conditionId: 1, tokenId: 1 }, { unique: true });

module.exports = mongoose.model('UserPosition', userPositionSchema);
