/**
 * Check deposit status by transaction hash
 * Usage: node src/scripts/checkDepositStatus.js <txHash>
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const PendingDeposit = require('../models/PendingDeposit');
const User = require('../models/User');

const txHash = process.argv[2];
if (!txHash) {
  console.log('Usage: node src/scripts/checkDepositStatus.js <txHash>');
  console.log('Example: node src/scripts/checkDepositStatus.js 0x32a2f7fe278588b257c6ffcd73c8d7e926484144fd5345af4c6593ddffc469b2');
  process.exit(1);
}

const normalizedTxHash = txHash.toLowerCase();

async function main() {
  await mongoose.connect(process.env.MONGODB_URI || process.env.MONGODB_URL);
  console.log('Connected to MongoDB');

  // Find the deposit
  const deposit = await PendingDeposit.findOne({ txHash: normalizedTxHash });

  if (!deposit) {
    console.log('\n❌ Deposit not found in database');
    console.log('This transaction has never been submitted.');
    process.exit(0);
  }

  console.log('\n📋 Deposit Found:');
  console.log('==================');
  console.log(`Status: ${deposit.status}`);
  console.log(`User ID: ${deposit.user}`);
  console.log(`Chain: ${deposit.chain}`);
  console.log(`Token: ${deposit.token}`);
  console.log(`Amount: ${deposit.claimedAmountUsd}`);
  console.log(`Credited USD: ${deposit.creditedAmountUsd}`);
  console.log(`Created: ${deposit.createdAt}`);
  console.log(`Notes: ${deposit.notes || 'N/A'}`);

  // Find user
  const user = await User.findById(deposit.user);
  if (user) {
    console.log(`\n👤 User: ${user.email || user.walletAddress || 'Unknown'}`);
    console.log(`Current Balance: $${user.balance?.toFixed(2) || '0.00'}`);
  }

  if (deposit.status === 'rejected') {
    console.log('\n⚠️  Deposit was REJECTED');
    console.log('Reason:', deposit.notes);
    console.log('\nTo re-submit:');
    console.log('1. Check that the transaction was sent to the correct platform wallet');
    console.log('2. Use the DepositModal → "Already sent a deposit?" → submit the tx hash again');
  } else if (deposit.status === 'credited') {
    console.log('\n✅ Deposit was already CREDITED');
    if (!deposit.creditedAmountUsd || deposit.creditedAmountUsd <= 0) {
      console.log('\n⚠️  WARNING: creditedAmountUsd is missing or zero!');
      console.log('This may indicate a bug in the credit process.');
    }
  } else if (deposit.status === 'pending') {
    console.log('\n⏳ Deposit is PENDING (awaiting admin review)');
  }

  await mongoose.disconnect();
}

main().catch(console.error);
