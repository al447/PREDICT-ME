/**
 * Deposit Model
 * Tracks user deposit transactions
 */

const mongoose = require('mongoose');

const depositSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  sessionId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  amount: {
    type: Number,
    required: true
  },
  currency: {
    type: String,
    required: true,
    default: 'USDC'
  },
  network: {
    type: String,
    required: true,
    default: 'polygon'
  },
  walletAddress: {
    type: String,
    required: true
  },
  provider: {
    type: String,
    required: true,
    enum: ['fun', 'moonpay']
  },
  status: {
    type: String,
    required: true,
    enum: ['pending', 'completed', 'failed'],
    default: 'pending',
    index: true
  },
  txHash: {
    type: String,
    sparse: true
  },
  failureReason: {
    type: String
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  completedAt: {
    type: Date
  }
}, {
  timestamps: true
});

// Compound indexes for common queries
depositSchema.index({ userId: 1, createdAt: -1 });
depositSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Deposit', depositSchema);
