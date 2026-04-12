const Razorpay = require('razorpay');
const crypto = require('crypto');

let razorpayInstance = null;

/**
 * Get or create the Razorpay client instance.
 */
function getRazorpay() {
  if (!razorpayInstance) {
    razorpayInstance = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
  }
  return razorpayInstance;
}

/**
 * Subscription plan configurations.
 */
function getPlans() {
  return {
    weekly: {
      name: 'Weekly',
      amount: parseInt(process.env.PRICE_WEEKLY || '9900'),
      duration: 7,
      description: '7 days of unlimited streaming',
    },
    monthly: {
      name: 'Monthly',
      amount: parseInt(process.env.PRICE_MONTHLY || '29900'),
      duration: 30,
      description: '30 days of unlimited streaming',
    },
    yearly: {
      name: 'Yearly',
      amount: parseInt(process.env.PRICE_YEARLY || '199900'),
      duration: 365,
      description: '365 days of unlimited streaming',
    },
  };
}

/**
 * Create a Razorpay order for a subscription plan.
 */
async function createOrder(plan, userId) {
  const plans = getPlans();
  const selectedPlan = plans[plan];

  if (!selectedPlan) {
    throw new Error(`Invalid plan: ${plan}`);
  }

  const rz = getRazorpay();
  const order = await rz.orders.create({
    amount: selectedPlan.amount,
    currency: 'INR',
    receipt: `sub_${userId}_${plan}_${Date.now()}`,
    notes: {
      userId: userId.toString(),
      plan: plan,
    },
  });

  return {
    orderId: order.id,
    amount: selectedPlan.amount,
    currency: 'INR',
    plan: plan,
    planName: selectedPlan.name,
    description: selectedPlan.description,
    keyId: process.env.RAZORPAY_KEY_ID,
  };
}

/**
 * Verify the Razorpay payment signature.
 */
function verifySignature(orderId, paymentId, signature) {
  const body = orderId + '|' + paymentId;
  const expectedSignature = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(body)
    .digest('hex');

  return expectedSignature === signature;
}

/**
 * Verify webhook signature from Razorpay.
 */
function verifyWebhookSignature(body, signature) {
  const expectedSignature = crypto
    .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
    .update(JSON.stringify(body))
    .digest('hex');

  return expectedSignature === signature;
}

module.exports = {
  getRazorpay,
  getPlans,
  createOrder,
  verifySignature,
  verifyWebhookSignature,
};
