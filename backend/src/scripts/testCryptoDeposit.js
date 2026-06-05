/**
 * Test script to simulate a crypto deposit and credit user balance
 * Usage: node src/scripts/testCryptoDeposit.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const PendingDeposit = require('../models/PendingDeposit');
const { getUsdPrice } = require('../services/priceFeed');

const TEST_USER_EMAIL = 'playestates2022@gmail.com';
const DEPOSIT_AMOUNT_USD = 200;
const TOKEN = 'ETH';
const CHAIN = 'ethereum';

async function main() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Find user
    const user = await User.findOne({ email: TEST_USER_EMAIL });
    if (!user) {
      console.error(`User not found: ${TEST_USER_EMAIL}`);
      process.exit(1);
    }
    console.log(`Found user: ${user.email} (ID: ${user._id})`);
    console.log(`Current balance: $${user.balance?.toFixed(2) || '0.00'}`);

    // Get ETH price
    const ethPrice = await getUsdPrice('ETH');
    console.log(`Current ETH price: $${ethPrice}`);

    // Calculate ETH amount
    const ethAmount = DEPOSIT_AMOUNT_USD / ethPrice;
    console.log(`ETH amount for $${DEPOSIT_AMOUNT_USD}: ${ethAmount.toFixed(6)} ETH`);

    // Ensure user has deposit addresses
    const { ensureUserDepositAddresses } = require('../services/depositAddresses');
    const addresses = await ensureUserDepositAddresses(user);
    console.log(`User deposit address: ${addresses.evm}`);

    // Create pending deposit
    const deposit = await PendingDeposit.create({
      user: user._id,
      chain: CHAIN,
      token: TOKEN,
      txHash: `0xtest_${Date.now()}`,
      claimedAmountUsd: DEPOSIT_AMOUNT_USD,
      sender: '0xTestSender1234567890',
      status: 'credited',
      creditedAmountUsd: DEPOSIT_AMOUNT_USD,
      reviewedBy: null,
      reviewedAt: new Date(),
      source: 'manual',
      provider: 'manual',
      notes: 'Test deposit via script',
    });
    console.log(`Created deposit: ${deposit._id}`);

    // Credit user balance
    const oldBalance = user.balance || 0;
    await User.findByIdAndUpdate(user._id, {
      $inc: { balance: DEPOSIT_AMOUNT_USD },
    });

    // Create transaction record
    try {
      const Transaction = require('../models/Transaction');
      await Transaction.create({
        user: user._id,
        type: 'deposit',
        amount: DEPOSIT_AMOUNT_USD,
        method: `${TOKEN} on ${CHAIN} (Test)`,
        txHash: deposit.txHash,
        status: 'completed',
      });
      console.log('Transaction record created');
    } catch {
      console.log('Transaction model not available (non-fatal)');
    }

    // Get updated balance
    const updatedUser = await User.findById(user._id);
    console.log('\n✅ Test deposit completed successfully!');
    console.log(`Old balance: $${oldBalance.toFixed(2)}`);
    console.log(`Added: $${DEPOSIT_AMOUNT_USD.toFixed(2)}`);
    console.log(`New balance: $${updatedUser.balance.toFixed(2)}`);
    console.log(`\nDeposit details:`);
    console.log(`  - Token: ${TOKEN}`);
    console.log(`  - Chain: ${CHAIN}`);
    console.log(`  - ETH Amount: ${ethAmount.toFixed(6)} ETH`);
    console.log(`  - USD Value: $${DEPOSIT_AMOUNT_USD.toFixed(2)}`);
    console.log(`  - Deposit ID: ${deposit._id}`);

    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

main();
