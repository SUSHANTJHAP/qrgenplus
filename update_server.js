const fs = require('fs');
const path = require('path');

const serverPath = path.join(__dirname, 'server.js');
let serverCode = fs.readFileSync(serverPath, 'utf8');

const oldPlanInit = `let globalPlanId = null;
async function ensurePlan() {
  try {
    const plans = await razorpay.plans.all();
    if (plans.items.length > 0) {
      globalPlanId = plans.items[0].id;
    } else {
      const plan = await razorpay.plans.create({
        period: 'monthly',
        interval: 1,
        item: {
          name: 'Premium Subscription',
          amount: 40000,
          currency: 'INR',
          description: 'Monthly premium subscription for QR Gen Plus'
        }
      });
      globalPlanId = plan.id;
    }
    console.log('Razorpay Plan ID ready:', globalPlanId);
  } catch (err) {
    console.error('Failed to ensure Razorpay Plan:', err);
  }
}
ensurePlan();`;

const newPlanInit = `let globalMonthlyPlanId = null;
let globalYearlyPlanId = null;

async function ensurePlan() {
  try {
    const plans = await razorpay.plans.all();
    
    // Look for existing plans by amount to assign correctly
    const existingMonthly = plans.items.find(p => p.item.amount === 49900 && p.period === 'monthly');
    const existingYearly = plans.items.find(p => p.item.amount === 479900 && p.period === 'yearly');

    if (existingMonthly) {
      globalMonthlyPlanId = existingMonthly.id;
    } else {
      const planM = await razorpay.plans.create({
        period: 'monthly', interval: 1,
        item: { name: 'Pro Monthly', amount: 49900, currency: 'INR', description: 'Monthly Pro subscription' }
      });
      globalMonthlyPlanId = planM.id;
    }

    if (existingYearly) {
      globalYearlyPlanId = existingYearly.id;
    } else {
      const planY = await razorpay.plans.create({
        period: 'yearly', interval: 1,
        item: { name: 'Pro Yearly', amount: 479900, currency: 'INR', description: 'Yearly Pro subscription' }
      });
      globalYearlyPlanId = planY.id;
    }
    
    console.log('Razorpay Plans ready - Monthly:', globalMonthlyPlanId, '| Yearly:', globalYearlyPlanId);
  } catch (err) {
    console.error('Failed to ensure Razorpay Plans:', err);
  }
}
ensurePlan();`;

const oldRoute = `app.post('/api/create-subscription', verifyAuth, async (req, res) => {
  try {
    if (!globalPlanId) {
      return res.status(500).json({ error: 'Razorpay Plan not initialized yet' });
    }
    const subscription = await razorpay.subscriptions.create({
      plan_id: globalPlanId,
      customer_notify: 1,
      total_count: 12,
      notes: {
        user_id: req.user.id.toString()
      }
    });
    res.json({ success: true, subscription_id: subscription.id, key_id: process.env.RAZORPAY_KEY_ID });
  } catch (err) {
    console.error('Subscription creation failed:', err);
    res.status(500).json({ error: 'Failed to create subscription' });
  }
});`;

const newRoute = `app.post('/api/create-subscription', verifyAuth, async (req, res) => {
  try {
    const { interval } = req.body;
    const isYearly = interval === 'yearly';
    const planId = isYearly ? globalYearlyPlanId : globalMonthlyPlanId;

    if (!planId) {
      return res.status(500).json({ error: 'Razorpay Plan not initialized yet' });
    }
    
    const subscription = await razorpay.subscriptions.create({
      plan_id: planId,
      customer_notify: 1,
      total_count: isYearly ? 5 : 12, // Arbitrary future renewals
      notes: {
        user_id: req.user.id.toString()
      }
    });
    res.json({ success: true, subscription_id: subscription.id, key_id: process.env.RAZORPAY_KEY_ID });
  } catch (err) {
    console.error('Subscription creation failed:', err);
    res.status(500).json({ error: 'Failed to create subscription' });
  }
});`;

serverCode = serverCode.replace(oldPlanInit, newPlanInit);
serverCode = serverCode.replace(oldRoute, newRoute);

fs.writeFileSync(serverPath, serverCode);
console.log("server.js updated successfully.");
