/**
 * Manually credit a Polygon Amoy USDC deposit (one-time fix for missed indexer)
 * Usage: node src/scripts/manualCreditPolygonAmoy.js <txHash> <amountUsd> <senderAddress>
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const PendingDeposit = require('../models/PendingDeposit');
const User = require('../models/User');
const Transaction = require('../models/Transaction');

const txHash = process.argv[2];
const amountUsd = parseFloat(process.argv[3]);
const senderAddress = process.argv[4];

if (!txHash || !amountUsd || !senderAddress) {
  console.log('Usage: node src/scripts/manualCreditPolygonAmoy.js <txHash> <amountUsd> <senderAddress>');
  console.log('Example: node src/scripts/manualCreditPolygonAmoy.js 0x123... 5.00 0xabc...');
  process.exit(1);
}

const normalizedTxHash = txHash.toLowerCase();
const senderLower = senderAddress.toLowerCase();

async function main() {
  await mongoose.connect(process.env.MONGODB_URI || process.env.MONGODB_URL);
  console.log('Connected to MongoDB\n');

  // Find user by sender address (case-insensitive)
  const user = await User.findOne({
    walletAddress: { $regex: `^${senderLower}$`, $options: 'i' },
  });

  if (!user) {
    console.log('❌ No user found with wallet address:', senderAddress);
    console.log('Make sure you have signed in via MetaMask so your wallet is linked.');
    process.exit(1);
  }

  console.log('👤 User found:', user.email || user.walletAddress);
  console.log(`   Current Balance: $${user.balance?.toFixed(2) || '0.00'}`);

  // Check if deposit already exists
  const existing = await PendingDeposit.findOne({ txHash: normalizedTxHash });
  if (existing) {
    console.log('\n⚠️  Deposit already exists in database');
    console.log(`   Status: ${existing.status}`);
    console.log(`   Credited: $${existing.creditedAmountUsd || 0}`);
    if (existing.status === 'credited') {
      console.log('\n✅ Already credited, nothing to do.');
      process.exit(0);
    }
  }

  console.log(`\n💰 Crediting $${amountUsd.toFixed(2)} USDC to user ${user._id}...`);

  // Credit user balance
  await User.findByIdAndUpdate(user._id, { $inc: { balance: amountUsd } });

  // Create deposit record
  await PendingDeposit.create({
    user: user._id,
    chain: 'polygon-amoy',
    token: 'USDC',
    txHash: normalizedTxHash,
    claimedAmountUsd: amountUsd,
    sender: senderLower,
    status: 'credited',
    creditedAmountUsd: amountUsd,
    source: 'manual-admin',
    reviewedAt: new Date(),
    notes: 'Manually credited by admin (indexer missed this transaction)',
  });

  // Create transaction audit
  await Transaction.create({
    user: user._id,
    type: 'deposit',
    amount: amountUsd,
    method: 'USDC on Polygon Amoy (manual credit)',
    txHash: normalizedTxHash,
    status: 'completed',
  });

  const userAfter = await User.findById(user._id);
  console.log(`   New Balance: $${userAfter.balance?.toFixed(2) || '0.00'}`);
  console.log('\n✅ Successfully credited!');

  await mongoose.disconnect();
}

main().catch(console.error);
