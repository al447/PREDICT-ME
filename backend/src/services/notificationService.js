const Notification = require('../models/Notification');

class NotificationService {
  async createNotification(userId, type, title, message, data = {}) {
    try {
      const notification = new Notification({
        user: userId,
        type,
        title,
        message,
        data,
        read: false
      });
      await notification.save();
      return notification;
    } catch (error) {
      console.error('Failed to create notification:', error);
      return null;
    }
  }

  // Trade-related notifications
  async tradeExecuted(userId, trade, market) {
    return this.createNotification(
      userId,
      'trade',
      'Trade Executed',
      `You ${trade.type === 'buy' ? 'bought' : 'sold'} $${trade.amount} of "${market.title?.substring(0, 40)}${market.title?.length > 40 ? '...' : ''}"`,
      { tradeId: trade._id, marketId: market._id, amount: trade.amount, type: trade.type }
    );
  }

  // Deposit-related notifications
  async depositReceived(userId, deposit) {
    const methodNames = {
      card: 'Credit Card',
      bank: 'Bank Transfer',
      crypto: 'Crypto'
    };
    return this.createNotification(
      userId,
      'deposit',
      'Deposit Received',
      `Your ${methodNames[deposit.method] || deposit.method} deposit of $${deposit.amountUSD} has been credited to your account.`,
      { depositId: deposit._id, amount: deposit.amountUSD, method: deposit.method }
    );
  }

  async depositPending(userId, deposit) {
    return this.createNotification(
      userId,
      'deposit',
      'Deposit Pending',
      `Your deposit of $${deposit.amountUSD} is being processed.`,
      { depositId: deposit._id, amount: deposit.amountUSD }
    );
  }

  // Withdrawal notifications
  async withdrawalProcessed(userId, withdrawal) {
    return this.createNotification(
      userId,
      'withdrawal',
      'Withdrawal Processed',
      `Your withdrawal of $${withdrawal.amount} has been processed.`,
      { withdrawalId: withdrawal._id, amount: withdrawal.amount }
    );
  }

  // Market notifications
  async marketResolved(userId, market, outcome) {
    return this.createNotification(
      userId,
      'market',
      'Market Resolved',
      `"${market.title?.substring(0, 40)}${market.title?.length > 40 ? '...' : ''}" resolved to ${outcome}.`,
      { marketId: market._id, outcome }
    );
  }

  async marketWon(userId, market, winnings) {
    return this.createNotification(
      userId,
      'trade',
      'You Won!',
      `You won $${winnings.toFixed(2)} on "${market.title?.substring(0, 40)}${market.title?.length > 40 ? '...' : ''}"`,
      { marketId: market._id, winnings }
    );
  }

  // Price alerts
  async priceAlert(userId, market, priceChange) {
    const direction = priceChange >= 0 ? 'up' : 'down';
    return this.createNotification(
      userId,
      'price',
      'Price Movement',
      `"${market.title?.substring(0, 40)}${market.title?.length > 40 ? '...' : ''}" moved ${direction} ${Math.abs(priceChange).toFixed(1)}%`,
      { marketId: market._id, priceChange }
    );
  }

  // System notifications
  async systemNotification(userId, title, message) {
    return this.createNotification(
      userId,
      'system',
      title,
      message,
      {}
    );
  }

  // Welcome notification for new users
  async welcomeNotification(userId, username) {
    return this.createNotification(
      userId,
      'system',
      'Welcome to PolyBet365!',
      `Hi ${username}, welcome to the platform! Start exploring markets and make your first prediction.`,
      {}
    );
  }
}

module.exports = new NotificationService();
