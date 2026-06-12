/**
 * Manually credit a deposit (admin tool)
 * Usage: node src/scripts/creditDeposit.js <txHash> [amountUsd]
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const PendingDeposit = require('../models/PendingDeposit');
const User = require('../models/User');
const Transaction = require('../models/Transaction');

const txHash = process.argv[2];
const amountUsd = parseFloat(process.argv[3]);

if (!txHash) {
  console.log('Usage: node src/scripts/creditDeposit.js <txHash> [amountUsd]');
  console.log('Example: node src/scripts/creditDeposit.js 0x32a2f7fe... 5.00');
  process.exit(1);
}

const normalizedTxHash = txHash.toLowerCase();

async function main() {
  await mongoose.connect(process.env.MONGODB_URI || process.env.MONGODB_URL);
  console.log('Connected to MongoDB\n');

  // Find the deposit
  const deposit = await PendingDeposit.findOne({ txHash: normalizedTxHash });

  if (!deposit) {
    console.log('❌ Deposit not found:', txHash);
    process.exit(1);
  }

  console.log('📋 Deposit Found:');
  console.log(`  Current Status: ${deposit.status}`);
  console.log(`  User: ${deposit.user}`);
  console.log(`  Chain: ${deposit.chain}`);
  console.log(`  Token: ${deposit.token}`);
  console.log(`  Amount: ${deposit.claimedAmountUsd}`);
  console.log(`  Current Credited: ${deposit.creditedAmountUsd || 0}`);

  const creditAmount = amountUsd || deposit.creditedAmountUsd || deposit.claimedAmountUsd || 0;

  if (creditAmount <= 0) {
    console.log('\n❌ Error: Cannot determine credit amount');
    console.log('Please provide amountUsd as second argument');
    process.exit(1);
  }

  console.log(`\n💰 Crediting $${creditAmount.toFixed(2)} to user ${deposit.user}...`);

  // Credit user balance
  const userBefore = await User.findById(deposit.user);
  console.log(`  Balance before: $${userBefore.balance?.toFixed(2) || '0.00'}`);

  await User.findByIdAndUpdate(deposit.user, { $inc: { balance: creditAmount } });

  // Update deposit record
  deposit.status = 'credited';
  deposit.creditedAmountUsd = creditAmount;
  deposit.reviewedAt = new Date();
  deposit.notes = (deposit.notes || '') + '\n[Manual credit by admin script]';
  await deposit.save();

  // Create transaction audit
  try {
    await Transaction.create({
      user: deposit.user,
      type: 'deposit',
      amount: creditAmount,
      method: `${deposit.token} on ${deposit.chain} (manual credit)`,
      txHash: normalizedTxHash,
      status: 'completed',
    });
  } catch (err) {
    console.log('  ⚠️  Transaction audit record failed (non-fatal):', err.message);
  }

  const userAfter = await User.findById(deposit.user);
  console.log(`  Balance after: $${userAfter.balance?.toFixed(2)}`);

  console.log('\n✅ Successfully credited deposit!');

  await mongoose.disconnect();
}

main().catch(console.error);
