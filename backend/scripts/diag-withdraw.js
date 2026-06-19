/**
 * Diagnostic: inspect a user's balance vs on-chain proxy USDC + latest withdrawal.
 * Usage: node scripts/diag-withdraw.js [emailOrUserId]
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const User = require('../src/models/User');
  const BridgeWithdrawal = require('../src/models/BridgeWithdrawal');
  const balSync = require('../src/services/balanceSyncService');

  const arg = process.argv[2];
  let user;
  if (arg) {
    user = await User.findOne(arg.includes('@') ? { email: arg } : { _id: arg });
  } else {
    // Most recently active user with a proxy
    user = await User.findOne({ 'smartWallet.proxy': { $ne: null } }).sort({ updatedAt: -1 });
  }
  if (!user) { console.log('No user found'); return process.exit(0); }

  console.log('\n=== USER ===');
  console.log('id:           ', user._id.toString());
  console.log('email:        ', user.email);
  console.log('balance (DB): ', user.balance);
  console.log('onchainBalance(cache):', user.onchainBalance);
  console.log('proxy:        ', user.smartWallet?.proxy);

  const proxy = user.smartWallet?.proxy;
  if (proxy) {
    const onchain = await balSync.readOnchainBalance(proxy);
    console.log('\n=== ON-CHAIN ===');
    console.log('proxy USDC (live read):', onchain);
  }

  const w = await BridgeWithdrawal.find({ userId: user._id }).sort({ createdAt: -1 }).limit(3).lean();
  console.log('\n=== LATEST WITHDRAWALS ===');
  for (const r of w) {
    console.log(`- $${r.fromAmountUsdc} ${r.toChainType}/${r.toChainId} status=${r.status} safeDebitTxHash=${r.safeDebitTxHash} createdAt=${r.createdAt?.toISOString?.()}`);
  }

  console.log('\n=== ENV ===');
  console.log('BRIDGE_SWEEP_ENABLED raw:', JSON.stringify(process.env.BRIDGE_SWEEP_ENABLED));
  console.log('=== true?:', process.env.BRIDGE_SWEEP_ENABLED === 'true');
  console.log('NETWORK:', JSON.stringify(process.env.NETWORK));

  await mongoose.disconnect();
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
