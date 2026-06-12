require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const users = await User.find({ 'smartWallet.proxy': { $ne: null } })
    .select('email authProvider smartWallet').lean();
  console.log(`Users with proxy wallets: ${users.length}`);
  for (const u of users) {
    const sw = u.smartWallet;
    console.log(
      (u.email || String(u._id)).slice(0, 30).padEnd(32),
      '| auth:', (u.authProvider || 'unknown').padEnd(8),
      '| type:', (sw.proxyType || 'N/A').padEnd(5),
      '| sigType:', sw.signatureType ?? 'N/A',
      '| proxy:', sw.proxy?.slice(0, 14) + '...'
    );
  }
  await mongoose.disconnect();
});
