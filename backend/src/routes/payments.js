/**
 * Payment Routes
 * Handles webhooks and API endpoints for payment providers
 */

const express = require('express');
const crypto = require('crypto');
const router = express.Router();

// Import payment providers
const { funWebhookHandler } = require('../services/paymentService');
const { protect } = require('../middleware/auth');

/**
 * Fun.xyz webhook endpoint
 * Handles deposit/withdrawal status updates
 */
router.post('/fun/webhook', async (req, res) => {
  try {
    const signature = req.headers['x-fun-signature'];
    const payload = JSON.stringify(req.body);

    // Verify webhook signature
    if (!verifyFunSignature(payload, signature)) {
      console.error('Invalid Fun webhook signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // Process webhook event
    await funWebhookHandler(req.body);

    res.json({ received: true });
  } catch (error) {
    console.error('Fun webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

/**
 * Get deposit status
 */
router.get('/deposits/:sessionId', protect, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user.id;

    // Get deposit status from database
    const deposit = await Deposit.findOne({ 
      sessionId, 
      userId 
    });

    if (!deposit) {
      return res.status(404).json({ error: 'Deposit not found' });
    }

    res.json({
      status: deposit.status,
      amount: deposit.amount,
      currency: deposit.currency,
      txHash: deposit.txHash,
      createdAt: deposit.createdAt,
      completedAt: deposit.completedAt
    });
  } catch (error) {
    console.error('Get deposit status error:', error);
    res.status(500).json({ error: 'Failed to get deposit status' });
  }
});

/**
 * Create withdrawal request
 */
router.post('/withdrawals', protect, async (req, res) => {
  try {
    const { amount, destinationAddress, currency } = req.body;
    const userId = req.user.id;
    const walletAddress = req.user.walletAddress;

    // Validate withdrawal
    if (!amount || !destinationAddress) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Create withdrawal record
    const withdrawal = await Withdrawal.create({
      userId,
      walletAddress,
      destinationAddress,
      amount,
      currency: currency || 'USDC',
      network: 'polygon',
      status: 'pending'
    });

    // Process withdrawal via payment manager
    const result = await paymentManager.createWithdrawal({
      userId,
      walletAddress,
      destinationAddress,
      amount,
      currency: currency || 'USDC',
      network: 'polygon'
    });

    // Update withdrawal with provider response
    withdrawal.providerSessionId = result.sessionId;
    await withdrawal.save();

    res.json({
      withdrawalId: withdrawal._id,
      status: withdrawal.status,
      providerSessionId: result.sessionId
    });
  } catch (error) {
    console.error('Create withdrawal error:', error);
    res.status(500).json({ error: 'Failed to create withdrawal' });
  }
});

/**
 * Verify Fun webhook signature
 */
function verifyFunSignature(payload, signature) {
  if (!process.env.FUN_WEBHOOK_SECRET) {
    console.warn('Fun webhook secret not configured');
    return false;
  }

  const expectedSignature = crypto
    .createHmac('sha256', process.env.FUN_WEBHOOK_SECRET)
    .update(payload)
    .digest('hex');

  return signature === expectedSignature;
}

module.exports = router;
