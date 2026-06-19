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
      evm:    { type: String, default: null },
      solana: { type: String, default: null },
      btc:    { type: String, default: null },
    },
    // Relay BTC: stores the original requestId from Relay's /quote/v2 for the reusable deposit address
    relayBtcRequestId: { type: String, default: null },
    // Non-custodial: per-user proxy wallet (POLY_PROXY for Magic, Gnosis Safe for external wallets)
    smartWallet: {
      owner:         { type: String, default: null },   // EOA that owns the proxy
      proxy:         { type: String, default: null },   // Deployed proxy address (deposit destination)
      deployed:      { type: Boolean, default: false }, // true after first on-chain deployment
      chainId:       { type: Number, default: 137 },  // Mainnet only (137)
      proxyType:     { type: String, enum: ['poly', 'safe'], default: 'safe' }, // 'poly'=POLY_PROXY(sigType1), 'safe'=GnosisSafe(sigType2)
      signatureType: { type: Number, enum: [1, 2], default: 2 },               // 1=POLY_PROXY, 2=GNOSIS_SAFE
    },
    // Cached on-chain balance mirror (source of truth = chain; this is display cache)
    onchainBalance: { type: Number, default: null },
    onchainBalanceSyncedAt: { type: Date, default: null },
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
