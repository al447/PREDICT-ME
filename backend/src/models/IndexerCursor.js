const mongoose = require('mongoose');

/**
 * Persistent block cursor for the deposit indexer.
 * One document per chain. Tracks the last successfully scanned block so the
 * indexer never loses ground across backend restarts (especially important
 * for chains scanned via direct RPC like BSC and Base).
 */
const IndexerCursorSchema = new mongoose.Schema(
  {
    chain: { type: String, required: true, unique: true, index: true },
    lastBlock: { type: Number, required: true, default: 0 },
    updatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model('IndexerCursor', IndexerCursorSchema);
