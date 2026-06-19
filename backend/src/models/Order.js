/**
 * CLOB Order Model
 * Off-chain limit orders with EIP-712 signatures
 */

const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema(
  {
    // Order identification
    orderId: { type: String, required: true, unique: true }, // UUID
    
    // Market info
    conditionId: { type: String, required: true, index: true }, // CTF condition
    tokenId: { type: String, required: true, index: true }, // ERC1155 token ID (YES or NO)
    
    // User info
    maker:  { type: String, required: true, lowercase: true, index: true }, // Maker address (Safe proxy)
    signer: { type: String, lowercase: true, default: null },               // EOA signer (Safe owner)
    salt:   { type: String, default: null },                                 // EIP-712 salt
    
    // Order type
    side: { type: String, enum: ['buy', 'sell'], required: true }, // Buy or sell
    
    // Price in USDC (0.00 to 1.00, represents probability)
    // 0.65 = 65% = willing to pay $0.65 per share
    price: { type: Number, required: true, min: 0.01, max: 0.99 },
    
    // Quantity
    size: { type: Number, required: true, min: 0.01 }, // Number of shares
    remainingSize: { type: Number, required: true, min: 0 }, // Unfilled shares
    
    // Original signed amounts (preserved for on-chain settlement struct reconstruction)
    originalMakerAmount: { type: String, default: null },
    originalTakerAmount: { type: String, default: null },
    
    // Expiration
    expiration: { type: Date, required: true },
    
    // EIP-712 Signature
    signature: { type: String, required: true },

    // Signature type: 0=EOA, 1=POLY_PROXY, 2=GNOSIS_SAFE
    signatureType: { type: Number, enum: [0, 1, 2], default: 0 },
    
    // Nonce for replay protection
    nonce: { type: Number, required: true },
    
    // Status
    status: {
      type: String,
      enum: ['open', 'partially_filled', 'filled', 'cancelled', 'expired'],
      default: 'open',
      index: true,
    },
    
    // Total filled amount
    filled: { type: Number, default: 0 },
    
    // Transaction hash when settled on-chain
    settlementTxHash: { type: String, default: null },
    
    // Order type features
    orderType: {
      type: String,
      enum: ['GTC', 'FOK', 'IOC', 'POST_ONLY'],
      default: 'GTC',
    },
    
    // Fee tracking
    takerFee: { type: Number, default: 0 }, // In USDC (2% on Polymarket)
    
    // Timestamps
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Compound indexes for efficient queries
orderSchema.index({ conditionId: 1, tokenId: 1, status: 1, side: 1, price: -1 }); // Order book query
orderSchema.index({ maker: 1, status: 1 }); // User's open orders
orderSchema.index({ status: 1, expiration: 1 }); // Expired order cleanup

// TTL index: auto-delete cancelled/filled orders after 2 days to prevent storage bloat
orderSchema.index(
  { updatedAt: 1 },
  {
    expireAfterSeconds: 172800, // 2 days
    partialFilterExpression: { status: { $in: ['cancelled', 'filled'] } }
  }
);

// Virtual for total notional value
orderSchema.virtual('notional').get(function() {
  return this.price * this.size;
});

// Virtual for remaining notional
orderSchema.virtual('remainingNotional').get(function() {
  return this.price * this.remainingSize;
});

// Method to check if order is expired
orderSchema.methods.isExpired = function() {
  return new Date() > this.expiration;
};

// Method to fill part of the order
orderSchema.methods.fill = function(amount) {
  if (amount > this.remainingSize) {
    throw new Error('Fill amount exceeds remaining size');
  }
  
  this.filled += amount;
  this.remainingSize -= amount;
  
  if (this.remainingSize === 0) {
    this.status = 'filled';
  } else {
    this.status = 'partially_filled';
  }
  
  this.updatedAt = new Date();
};

// Method to cancel order
orderSchema.methods.cancel = function() {
  if (this.status === 'filled') {
    throw new Error('Cannot cancel filled order');
  }
  this.status = 'cancelled';
  this.updatedAt = new Date();
};

// Static method to generate order ID
orderSchema.statics.generateOrderId = function() {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
};

module.exports = mongoose.model('Order', orderSchema);
