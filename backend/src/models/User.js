const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    email: { type: String, unique: true, sparse: true, lowercase: true, trim: true },
    googleId: { type: String, unique: true, sparse: true },
    walletAddress: { type: String, unique: true, sparse: true, lowercase: true },
    username: { type: String, trim: true },
    avatar: { type: String, default: '' },
    balance: { type: Number, default: 10000 },
    authProvider: { type: String, enum: ['google', 'wallet', 'email', 'magic'], required: true },
    favorites: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Market' }],
    role: { type: String, enum: ['user', 'admin'], default: 'user', index: true },
    password: { type: String, select: false },
    isActive: { type: Boolean, default: true },
    lastLogin: { type: Date },
    // Referral system fields
    referralCode: { type: String, index: true, sparse: true },
    referredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    referralCodeUsed: { type: String, default: null },
    pendingReferralBalance: { type: Number, default: 0 },
    referralStats: {
      totalEarned: { type: Number, default: 0 },
      totalReferred: { type: Number, default: 0 },
      pendingReferred: { type: Number, default: 0 },
    },
    referralBannedFromProgram: { type: Boolean, default: false },
    // Deposit system: per-user HD-derived addresses
    depositIndex: { type: Number, unique: true, sparse: true },
    depositAddresses: {
      evm: { type: String, default: null },
      solana: { type: String, default: null },
    },
    // Non-custodial: per-user Gnosis Safe proxy wallet
    smartWallet: {
      owner:    { type: String, default: null },  // EOA that owns the Safe (Magic address or web3 wallet)
      proxy:    { type: String, default: null },  // Deployed Safe proxy address
      deployed: { type: Boolean, default: false }, // true after first on-chain deployment
      chainId:  { type: Number, default: 80002 },
    },
    // Withdrawal rate-limiting
    withdrawalLimits: {
      dailyTotal: { type: Number, default: 0 },       // USD withdrawn today
      dailyResetAt: { type: Date, default: null },    // when the 24h window started
      lastWithdrawAt: { type: Date, default: null },  // timestamp of last withdrawal
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);
