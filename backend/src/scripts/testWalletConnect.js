require('dotenv').config();
const { ethers } = require('ethers');

const BASE = 'http://localhost:5000/api';

async function post(path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
  const data = await res.json();
  return { status: res.status, data };
}

async function run() {
  console.log('\n=== WALLETCONNECT AUTH TEST ===\n');

  // Frontend WalletConnect Project ID check
  const fs = require('fs');
  const path = require('path');
  const frontendEnv = fs.readFileSync(path.join(__dirname, '../../../frontend/.env'), 'utf8');
  const wcMatch = frontendEnv.match(/VITE_WALLETCONNECT_PROJECT_ID=(.+)/);
  console.log('--- Test 1: WalletConnect Project ID configured ---');
  if (wcMatch && wcMatch[1] && wcMatch[1] !== 'placeholder_walletconnect_project_id') {
    console.log(`✅ PASS - Project ID: ${wcMatch[1].substring(0, 8)}...${wcMatch[1].substring(wcMatch[1].length - 4)}`);
  } else {
    console.log('❌ FAIL - No project ID configured');
  }

  // Generate a test wallet, sign message, send to backend
  console.log('\n--- Test 2: Wallet auth flow (simulated) ---');
  const wallet = ethers.Wallet.createRandom();
  const walletAddress = wallet.address;
  const timestamp = Date.now();
  const message = `Sign in to PolyBet365\nAddress: ${walletAddress}\nTimestamp: ${timestamp}`;
  const signature = await wallet.signMessage(message);

  console.log(`Test wallet: ${walletAddress}`);
  const r1 = await post('/auth/wallet', { walletAddress, signature, message });
  console.log(`Status: ${r1.status} | success: ${r1.data.success}`);
  if (r1.data.success) {
    console.log(`✅ PASS - User created with referralCode: ${r1.data.user.referralCode}`);
  } else {
    console.log(`❌ FAIL - ${r1.data.error}`);
  }

  // Test wallet auth with referral code
  console.log('\n--- Test 3: Wallet auth with referral code ---');
  const wallet2 = ethers.Wallet.createRandom();
  const ts2 = Date.now();
  const msg2 = `Sign in to PolyBet365\nAddress: ${wallet2.address}\nTimestamp: ${ts2}`;
  const sig2 = await wallet2.signMessage(msg2);

  // Use a real referral code from DB
  const mongoose = require('mongoose');
  await mongoose.connect(process.env.MONGODB_URI);
  require('../models/User');
  const ReferralCode = require('../models/ReferralCode');
  const code = await ReferralCode.findOne();
  await mongoose.disconnect();

  if (!code) {
    console.log('❌ FAIL - No referral code in DB');
    process.exit(1);
  }

  const r2 = await post('/auth/wallet', {
    walletAddress: wallet2.address,
    signature: sig2,
    message: msg2,
    referralCode: code.code,
  });
  console.log(`Status: ${r2.status} | success: ${r2.data.success} | code used: ${code.code}`);
  if (r2.data.success) {
    console.log(`✅ PASS - User created with referral attribution`);

    // Verify referral was recorded
    await mongoose.connect(process.env.MONGODB_URI);
    require('../models/Referral');
    const Referral = mongoose.model('Referral');
    const ref = await Referral.findOne({ code: code.code }).sort({ createdAt: -1 });
    if (ref) {
      console.log(`✅ Referral record created: status=${ref.status}, referrer=${ref.referrer}`);
    } else {
      console.log('❌ Referral record not found');
    }
    await mongoose.disconnect();
  } else {
    console.log(`❌ FAIL - ${r2.data.error}`);
  }

  // Test invalid signature
  console.log('\n--- Test 4: Invalid signature rejected ---');
  const r3 = await post('/auth/wallet', {
    walletAddress: ethers.Wallet.createRandom().address,
    signature: '0x' + '0'.repeat(130),
    message: 'fake message',
  });
  console.log(`Status: ${r3.status} | success: ${r3.data.success}`);
  console.log(r3.status >= 400 || !r3.data.success ? '✅ PASS' : '❌ FAIL');

  console.log('\n=== TEST COMPLETE ===\n');
  console.log('Frontend WalletConnect should work. Test in browser:');
  console.log('1. Open http://localhost:5173');
  console.log('2. Click "Login" → Click WalletConnect icon (blue W)');
  console.log('3. Scan QR code with mobile wallet (MetaMask/Trust/Rainbow)');
  console.log('4. Approve connection + sign message');
  console.log('5. You should be logged in\n');
}

run().catch(err => {
  console.error('Test error:', err.message);
  process.exit(1);
});
