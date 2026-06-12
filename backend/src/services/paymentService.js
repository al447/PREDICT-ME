/**
 * Payment Service
 * Handles payment provider operations and webhook processing
 */

const Deposit = require('../models/Deposit');
const Withdrawal = require('../models/Withdrawal');
const User = require('../models/User');
const { updateBalance } = require('./userService');

/**
 * Fun.xyz webhook handler
 * @param {Object} event - Webhook event from Fun.xyz
 */
async function funWebhookHandler(event) {
  const { type, data } = event;

  switch (type) {
    case 'deposit.completed':
      await handleDepositCompleted(data);
      break;
    
    case 'deposit.failed':
      await handleDepositFailed(data);
      break;
    
    case 'withdrawal.completed':
      await handleWithdrawalCompleted(data);
      break;
    
    case 'withdrawal.failed':
      await handleWithdrawalFailed(data);
      break;
    
    default:
      console.log('Unhandled webhook type:', type);
  }
}

/**
 * Handle successful deposit
 */
async function handleDepositCompleted(data) {
  const {
    sessionId,
    userId,
    amount,
    currency,
    network,
    txHash,
    walletAddress
  } = data;

  try {
    // Update deposit record
    const deposit = await Deposit.findOneAndUpdate(
      { sessionId },
      {
        status: 'completed',
        txHash,
        completedAt: new Date()
      },
      { new: true }
    );

    if (!deposit) {
      console.error('Deposit not found for session:', sessionId);
      return;
    }

    // Update user balance
    await updateBalance(userId, amount, 'deposit', {
      txHash,
      currency,
      network,
      sessionId
    });

    console.log(`Deposit completed: ${amount} ${currency} for user ${userId}`);
  } catch (error) {
    console.error('Handle deposit completed error:', error);
  }
}

/**
 * Handle failed deposit
 */
async function handleDepositFailed(data) {
  const { sessionId, reason } = data;

  try {
    await Deposit.findOneAndUpdate(
      { sessionId },
      {
        status: 'failed',
        failureReason: reason,
        completedAt: new Date()
      }
    );

    console.log(`Deposit failed: ${sessionId} - ${reason}`);
  } catch (error) {
    console.error('Handle deposit failed error:', error);
  }
}

/**
 * Handle successful withdrawal
 */
async function handleWithdrawalCompleted(data) {
  const {
    sessionId,
    userId,
    amount,
    currency,
    network,
    txHash
  } = data;

  try {
    // Update withdrawal record
    await Withdrawal.findOneAndUpdate(
      { sessionId },
      {
        status: 'completed',
        txHash,
        completedAt: new Date()
      }
    );

    // Update user balance (already deducted when created)
    console.log(`Withdrawal completed: ${amount} ${currency} for user ${userId}`);
  } catch (error) {
    console.error('Handle withdrawal completed error:', error);
  }
}

/**
 * Handle failed withdrawal
 */
async function handleWithdrawalFailed(data) {
  const { sessionId, reason, amount, userId } = data;

  try {
    // Update withdrawal record
    await Withdrawal.findOneAndUpdate(
      { sessionId },
      {
        status: 'failed',
        failureReason: reason,
        completedAt: new Date()
      }
    );

    // Refund user balance since withdrawal failed
    await updateBalance(userId, amount, 'refund', {
      reason: 'withdrawal_failed',
      sessionId
    });

    console.log(`Withdrawal failed: ${sessionId} - ${reason}`);
  } catch (error) {
    console.error('Handle withdrawal failed error:', error);
  }
}

/**
 * Create deposit record
 */
async function createDepositRecord(params) {
  const {
    userId,
    sessionId,
    amount,
    currency,
    network,
    walletAddress,
    provider
  } = params;

  const deposit = await Deposit.create({
    userId,
    sessionId,
    amount,
    currency,
    network,
    walletAddress,
    provider,
    status: 'pending'
  });

  return deposit;
}

/**
 * Get user's deposit history
 */
async function getUserDeposits(userId, limit = 50, offset = 0) {
  const deposits = await Deposit.find({ userId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .skip(offset);

  return deposits;
}

/**
 * Get user's withdrawal history
 */
async function getUserWithdrawals(userId, limit = 50, offset = 0) {
  const withdrawals = await Withdrawal.find({ userId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .skip(offset);

  return withdrawals;
}

module.exports = {
  funWebhookHandler,
  createDepositRecord,
  getUserDeposits,
  getUserWithdrawals
};
