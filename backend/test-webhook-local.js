require('dotenv').config();
const crypto = require('crypto');
const http = require('http');
const mongoose = require('mongoose');

const WEBHOOK_KEY = process.env.MOONPAY_WEBHOOK_KEY;
const LOCAL_URL = 'http://localhost:5000/api/deposits/moonpay/webhook';

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }), 'users');
  const PendingDeposit = mongoose.model('PendingDeposit', new mongoose.Schema({}, { strict: false }), 'pendingdeposits');

  const user = await User.findOne({ email: 'peony.k007@gmail.com' }).lean();
  console.log('User:', user._id, '| balance before:', user.balance);

  const externalTxId = 'pb_' + user._id.toString() + '_local' + Date.now();
  await PendingDeposit.create({
    user: user._id, chain: 'polygon', token: 'USDC', claimedAmountUsd: 50,
    provider: 'moonpay', providerTxId: externalTxId, providerStatus: 'waitingPayment',
    status: 'pending', source: 'moonpay', createdAt: new Date(),
  });
  console.log('PendingDeposit created:', externalTxId);

  const payload = JSON.stringify({
    type: 'transaction_updated',
    data: {
      id: 'local-sim-' + Date.now(),
      status: 'completed',
      externalTransactionId: externalTxId,
      quoteCurrencyAmount: 47.5,
      baseCurrencyAmount: 50,
      baseCurrencyCode: 'usd',
      cryptoTransactionId: '0xlocal_test_tx',
      walletAddress: '0x786d99F5024acE87250544cE56309AEdB97f44cF',
    },
  });

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const sig = crypto.createHmac('sha256', WEBHOOK_KEY).update(timestamp + '.' + payload).digest('hex');
  const signatureHeader = 't=' + timestamp + ',s=' + sig;

  console.log('Firing webhook to localhost:5000...');
  await new Promise((resolve, reject) => {
    const url = new URL(LOCAL_URL);
    const req = http.request({
      hostname: url.hostname, port: 5000, path: url.pathname, method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'moonpay-signature-v2': signatureHeader,
      },
    }, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        console.log('HTTP status:', res.statusCode);
        console.log('Response:', body);
        resolve();
      });
    });
    req.on('error', e => { console.error('Connection error (is local server running?):', e.message); resolve(); });
    req.write(payload);
    req.end();
  });

  await new Promise(r => setTimeout(r, 1000));
  const after = await User.findById(user._id).lean();
  const deposit = await PendingDeposit.findOne({ providerTxId: externalTxId }).lean();
  console.log('\n=== RESULTS ===');
  console.log('Balance before:', user.balance, '| after:', after.balance);
  console.log('Credited:      ', after.balance === (user.balance || 0) + 47.5 ? 'YES ✓' : 'NO ✗');
  console.log('Deposit status:', deposit?.status);

  await mongoose.disconnect();
}
run().catch(e => { console.error('Error:', e.message); process.exit(1); });
