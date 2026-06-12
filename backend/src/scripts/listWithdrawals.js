require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const Transaction = require('../models/Transaction');
const User = require('../models/User');

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);

  const txs = await Transaction.find({ type: 'withdrawal' })
    .sort({ createdAt: -1 })
    .limit(20)
    .populate('user', 'username email walletAddress');

  console.log(`\n=== Last ${txs.length} Withdrawal Transactions ===\n`);
  for (const tx of txs) {
    const u = tx.user;
    console.log(`[${tx.createdAt.toISOString()}] ${tx.status.toUpperCase()}`);
    console.log(`  User:    ${u?.username || u?.email || u?.walletAddress}`);
    console.log(`  Amount:  $${Math.abs(tx.amount)}`);
    console.log(`  Balance after: $${tx.balance.toFixed(2)}`);
    console.log(`  To:      ${tx.metadata?.toAddress || '-'}`);
    console.log(`  TxHash:  ${tx.metadata?.txHash || '-'}`);
    if (tx.metadata?.error) console.log(`  Error:   ${tx.metadata.error}`);
    console.log('');
  }

  await mongoose.disconnect();
})().catch(err => { console.error(err); process.exit(1); });
