/**
 * User Service
 * Handles user balance operations
 */

const User = require('../models/User');

/**
 * Update a user's balance.
 * @param {string} userId - User identifier
 * @param {number} amount - Amount to apply (positive number)
 * @param {string} type - Operation type: 'deposit' | 'withdrawal' | 'refund'
 * @param {Object} [meta] - Optional metadata for logging/audit
 * @returns {Promise<Object>} Updated user document
 */
async function updateBalance(userId, amount, type, meta = {}) {
  if (typeof amount !== 'number' || Number.isNaN(amount) || amount < 0) {
    throw new Error(`Invalid amount for balance update: ${amount}`);
  }

  // Deposits and refunds credit the balance; withdrawals debit it.
  const delta = type === 'withdrawal' ? -amount : amount;

  const user = await User.findByIdAndUpdate(
    userId,
    { $inc: { balance: delta } },
    { new: true }
  );

  if (!user) {
    throw new Error(`User not found for balance update: ${userId}`);
  }

  console.log(
    `[userService] Balance ${delta >= 0 ? '+' : ''}${delta} (${type}) for user ${userId}`,
    meta
  );

  return user;
}

module.exports = {
  updateBalance,
};
