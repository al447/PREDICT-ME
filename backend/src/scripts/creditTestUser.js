require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const User = require('../models/User');

// Usage: node src/scripts/creditTestUser.js <walletOrEmail> <amount>
(async () => {
  const [, , identifier, amountStr] = process.argv;
  if (!identifier || !amountStr) {
    console.log('Usage: node src/scripts/creditTestUser.js <walletAddressOrEmail> <amount>');
    console.log('Example: node src/scripts/creditTestUser.js 0x123... 500');
    process.exit(1);
  }
  const amount = parseFloat(amountStr);

  await mongoose.connect(process.env.MONGODB_URI);

  const query = identifier.startsWith('0x')
    ? { walletAddress: identifier.toLowerCase() }
    : { email: identifier };

  const user = await User.findOneAndUpdate(query, { $inc: { balance: amount } }, { new: true });
  if (!user) {
    console.error('❌ User not found:', identifier);
    process.exit(1);
  }

  console.log(`✅ Credited $${amount} to ${user.username || user.email || user.walletAddress}`);
  console.log(`New balance: $${user.balance.toFixed(2)}`);
  await mongoose.disconnect();
})().catch(err => { console.error(err); process.exit(1); });
