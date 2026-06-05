require('dotenv').config();
const mongoose = require('mongoose');

const BASE = 'http://localhost:5000/api';

async function get(path) {
  const res = await fetch(`${BASE}${path}`);
  const data = await res.json();
  return { status: res.status, data };
}

async function post(path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
  const data = await res.json();
  return { status: res.status, data };
}

async function run() {
  console.log('\n=== REFERRAL SYSTEM TEST ===\n');

  // 1. Connect to DB to get a real referral code
  await mongoose.connect(process.env.MONGODB_URI);
  require('../models/User');
  require('../models/Referral');
  require('../models/ReferralConfig');
  const ReferralCode = require('../models/ReferralCode');
  const codes = await ReferralCode.find().populate('owner', 'username').limit(5);
  
  if (codes.length === 0) {
    console.log('❌ No referral codes found in DB. Run: npm run seed:referral');
    process.exit(1);
  }

  console.log('📋 Sample referral codes in DB:');
  codes.forEach(c => {
    console.log(`   Code: ${c.code}  Owner: ${c.owner?.username || 'Unknown'}`);
  });

  const testCode = codes[0].code;
  console.log(`\n🔍 Testing with code: ${testCode}`);

  await mongoose.disconnect();

  // 2. Test validate endpoint with invalid code
  console.log('\n--- Test 1: Validate invalid code ---');
  const r1 = await get('/referral/validate/INVALIDCODE999');
  console.log(`Status: ${r1.status} | valid: ${r1.data.valid} | error: ${r1.data.error}`);
  console.log(r1.data.valid === false ? '✅ PASS' : '❌ FAIL');

  // 3. Test validate endpoint with real code
  console.log('\n--- Test 2: Validate real code ---');
  const r2 = await get(`/referral/validate/${testCode}`);
  console.log(`Status: ${r2.status} | valid: ${r2.data.valid} | referrer: ${r2.data.referrerUsername}`);
  console.log(r2.data.valid === true ? '✅ PASS' : '❌ FAIL');

  // 4. Test health endpoint
  console.log('\n--- Test 3: Backend health check ---');
  const r3 = await get('/health');
  console.log(`Status: ${r3.status} | status: ${r3.data.status}`);
  console.log(r3.data.status === 'ok' ? '✅ PASS' : '❌ FAIL');

  // 5. Test /me without auth (should 401)
  console.log('\n--- Test 4: Get referral stats without auth (expect 401) ---');
  const r4 = await get('/referral/me');
  console.log(`Status: ${r4.status}`);
  console.log(r4.status === 401 ? '✅ PASS' : '❌ FAIL');

  // 6. Test admin referral stats without auth (should 401)
  console.log('\n--- Test 5: Admin referral stats without auth (expect 401) ---');
  const r5 = await get('/admin/referral/stats');
  console.log(`Status: ${r5.status}`);
  console.log(r5.status === 401 ? '✅ PASS' : '❌ FAIL');

  // 7. Test referral config without auth (should 401)
  console.log('\n--- Test 6: Admin referral config without auth (expect 401) ---');
  const r6 = await get('/admin/referral/config');
  console.log(`Status: ${r6.status}`);
  console.log(r6.status === 401 ? '✅ PASS' : '❌ FAIL');

  console.log('\n=== TEST COMPLETE ===\n');
  console.log(`Referral link format: http://localhost:5173/?ref=${testCode}`);
  console.log('Use this link to test signup flow in the browser\n');
}

run().catch(err => {
  console.error('Test error:', err.message);
  process.exit(1);
});
