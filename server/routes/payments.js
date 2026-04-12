const express = require('express');
const { get, run } = require('../database/init');
const { authenticate } = require('../middleware/auth');
const { createOrder, verifySignature, verifyWebhookSignature, getPlans } = require('../services/razorpay');

const router = express.Router();

/**
 * GET /api/payments/plans
 */
router.get('/plans', (req, res) => {
  const plans = getPlans();
  res.json({ plans });
});

/**
 * POST /api/payments/create-order
 */
router.post('/create-order', authenticate, async (req, res) => {
  try {
    const { plan } = req.body;

    if (!plan || !['weekly', 'monthly', 'yearly'].includes(plan)) {
      return res.status(400).json({ error: 'Invalid plan. Choose weekly, monthly, or yearly.' });
    }

    const orderData = await createOrder(plan, req.user.id);

    run(
      `INSERT INTO subscriptions (user_id, plan, amount, status, razorpay_order_id)
       VALUES (?, ?, ?, 'pending', ?)`,
      [req.user.id, plan, orderData.amount, orderData.orderId]
    );

    res.json(orderData);
  } catch (err) {
    console.error('Create order error:', err);
    res.status(500).json({ error: 'Failed to create order' });
  }
});

/**
 * POST /api/payments/verify
 */
router.post('/verify', authenticate, async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ error: 'Missing payment details' });
    }

    const isValid = verifySignature(razorpay_order_id, razorpay_payment_id, razorpay_signature);

    if (!isValid) {
      return res.status(400).json({ error: 'Invalid payment signature' });
    }

    const subscription = get(
      `SELECT * FROM subscriptions
       WHERE razorpay_order_id = ? AND user_id = ? AND status = 'pending'`,
      [razorpay_order_id, req.user.id]
    );

    if (!subscription) {
      return res.status(404).json({ error: 'Subscription not found' });
    }

    const plans = getPlans();
    const planConfig = plans[subscription.plan];
    const now = new Date();
    const expiresAt = new Date(now);

    const existingActive = get(
      `SELECT expires_at FROM subscriptions
       WHERE user_id = ? AND status = 'active' AND expires_at > datetime('now')
       ORDER BY expires_at DESC
       LIMIT 1`,
      [req.user.id]
    );

    let startsAt;
    if (existingActive) {
      startsAt = new Date(existingActive.expires_at);
      expiresAt.setTime(startsAt.getTime());
    } else {
      startsAt = now;
    }

    expiresAt.setDate(expiresAt.getDate() + planConfig.duration);

    run(
      `UPDATE subscriptions
       SET status = 'active',
           razorpay_payment_id = ?,
           razorpay_signature = ?,
           starts_at = ?,
           expires_at = ?
       WHERE id = ?`,
      [razorpay_payment_id, razorpay_signature, startsAt.toISOString(), expiresAt.toISOString(), subscription.id]
    );

    res.json({
      message: 'Subscription activated successfully',
      subscription: {
        plan: subscription.plan,
        startsAt: startsAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
      },
    });
  } catch (err) {
    console.error('Payment verify error:', err);
    res.status(500).json({ error: 'Failed to verify payment' });
  }
});

/**
 * POST /api/payments/webhook
 */
router.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  try {
    const signature = req.headers['x-razorpay-signature'];

    if (!signature) {
      return res.status(400).json({ error: 'Missing signature' });
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const isValid = verifyWebhookSignature(body, signature);

    if (!isValid) {
      return res.status(400).json({ error: 'Invalid webhook signature' });
    }

    const event = body.event;
    const payload = body.payload;

    switch (event) {
      case 'payment.captured': {
        const orderId = payload.payment?.entity?.order_id;
        if (orderId) {
          run(
            `UPDATE subscriptions SET status = 'active'
             WHERE razorpay_order_id = ? AND status = 'pending'`,
            [orderId]
          );
        }
        break;
      }

      case 'payment.failed': {
        const orderId = payload.payment?.entity?.order_id;
        if (orderId) {
          run(
            `UPDATE subscriptions SET status = 'cancelled'
             WHERE razorpay_order_id = ? AND status = 'pending'`,
            [orderId]
          );
        }
        break;
      }

      default:
        console.log(`Unhandled webhook event: ${event}`);
    }

    res.json({ status: 'ok' });
  } catch (err) {
    console.error('Webhook error:', err);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

module.exports = router;
