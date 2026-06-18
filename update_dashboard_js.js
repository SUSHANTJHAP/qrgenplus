const fs = require('fs');
const path = require('path');

const jsPath = path.join(__dirname, 'public', 'assets', 'js', 'dashboard.js');
let code = fs.readFileSync(jsPath, 'utf8');

const oldLogic = `  // Razorpay Subscribe
  const triggerRazorpayCheckout = async (forceUpi = false) => {
    const btn = forceUpi ? btnSubscribeUpi : btnSubscribeRazorpay;
    const defaultText = btn.innerText;
    try {
      btn.innerText = 'Initializing...';
      const res = await fetch('/api/create-subscription', { method: 'POST' });
      if (!res.ok) {
        btn.innerText = defaultText;
        return alert('Failed to initiate subscription');
      }
      const data = await res.json();
      
      let options = {
        key: data.key_id,
        subscription_id: data.subscription_id,
        name: "QR Gen Plus",
        description: "Premium Subscription",
        handler: async function (response) {
          const verifyRes = await fetch('/api/verify-subscription', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_subscription_id: response.razorpay_subscription_id,
              razorpay_signature: response.razorpay_signature
            })
          });
          if (verifyRes.ok) {
            window.location.reload();
          } else {
            alert('Payment verification failed');
            btn.innerText = defaultText;
          }
        },
        theme: {
          color: "#4F46E5"
        }
      };

      if (forceUpi) {
        options.config = {
          display: {
            blocks: {
              upi: {
                name: "Pay via UPI",
                instruments: [{ method: "upi" }]
              }
            },
            sequence: ["block.upi"]
          }
        };

        const upiId = inputUpiId ? inputUpiId.value.trim() : "";
        if (upiId) {
          options.prefill = {
            method: 'upi',
            vpa: upiId
          };
        }
      }

      const rzp1 = new window.Razorpay(options);
      rzp1.on('payment.failed', function (response){
          alert("Payment Failed: " + response.error.description);
          btn.innerText = defaultText;
      });
      rzp1.open();
    } catch (err) {
      console.error(err);
      btn.innerText = defaultText;
    }
  };

  const handleRazorpaySubscribe = () => triggerRazorpayCheckout(false);
  const handleUpiSubscribe = () => triggerRazorpayCheckout(true);

  // Paddle Subscribe

  const handlePaddleSubscribe = () => {
    if (!window.Paddle) return alert('Paddle not loaded');
    Paddle.Checkout.open({
      items: [
        {
          priceId: 'pri_01kvaqaen51n5nws6tpdcd1f4z',
          quantity: 1
        }
      ],
      customData: {
        user_id: user.id.toString()
      }
    });
  };

  if (btnSubscribeRazorpay) {
    btnSubscribeRazorpay.addEventListener('click', handleRazorpaySubscribe);
  }
  if (btnSubscribeUpi) {
    btnSubscribeUpi.addEventListener('click', handleUpiSubscribe);
  }
  if (btnSubscribePaddle) {
    btnSubscribePaddle.addEventListener('click', handlePaddleSubscribe);
  }`;

const newLogic = `  // Billing Toggle UI Update Logic
  const toggleBilling = document.getElementById('toggle-billing');
  const textPaddlePrice = document.getElementById('text-paddle-price');
  const textRazorpayPrice = document.getElementById('text-razorpay-price');

  if (toggleBilling) {
    toggleBilling.addEventListener('change', (e) => {
      const isYearly = e.target.checked;
      if (isYearly) {
        if (textPaddlePrice) textPaddlePrice.innerText = 'Subscribe via Paddle ($58.00 / €53.00 / year)';
        if (textRazorpayPrice) textRazorpayPrice.innerText = 'Subscribe via Razorpay (₹4,799 / year)';
      } else {
        if (textPaddlePrice) textPaddlePrice.innerText = 'Subscribe via Paddle ($6.00 / €5.50 / month)';
        if (textRazorpayPrice) textRazorpayPrice.innerText = 'Subscribe via Razorpay (₹499 / month)';
      }
    });
  }

  // Razorpay Subscribe
  const triggerRazorpayCheckout = async () => {
    const isYearly = toggleBilling && toggleBilling.checked;
    const btn = btnSubscribeRazorpay;
    const defaultText = isYearly ? 'Subscribe via Razorpay (₹4,799 / year)' : 'Subscribe via Razorpay (₹499 / month)';
    
    try {
      if (textRazorpayPrice) textRazorpayPrice.innerText = 'Initializing...';
      const res = await fetch('/api/create-subscription', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interval: isYearly ? 'yearly' : 'monthly' })
      });
      
      if (!res.ok) {
        if (textRazorpayPrice) textRazorpayPrice.innerText = defaultText;
        return alert('Failed to initiate subscription');
      }
      
      const data = await res.json();
      let options = {
        key: data.key_id,
        subscription_id: data.subscription_id,
        name: "QR Gen Plus",
        description: "Premium Subscription",
        handler: async function (response) {
          const verifyRes = await fetch('/api/verify-subscription', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_subscription_id: response.razorpay_subscription_id,
              razorpay_signature: response.razorpay_signature
            })
          });
          if (verifyRes.ok) {
            window.location.reload();
          } else {
            alert('Payment verification failed');
            if (textRazorpayPrice) textRazorpayPrice.innerText = defaultText;
          }
        },
        theme: {
          color: "#4F46E5"
        }
      };

      const rzp1 = new window.Razorpay(options);
      rzp1.on('payment.failed', function (response){
          alert("Payment Failed: " + response.error.description);
          if (textRazorpayPrice) textRazorpayPrice.innerText = defaultText;
      });
      rzp1.open();
    } catch (err) {
      console.error(err);
      if (textRazorpayPrice) textRazorpayPrice.innerText = defaultText;
    }
  };

  // Paddle Subscribe
  const handlePaddleSubscribe = () => {
    if (!window.Paddle) return alert('Paddle not loaded');
    const isYearly = toggleBilling && toggleBilling.checked;
    
    Paddle.Checkout.open({
      items: [
        {
          priceId: isYearly ? 'pri_yearly_placeholder' : 'pri_01kvaqaen51n5nws6tpdcd1f4z',
          quantity: 1
        }
      ],
      customData: {
        user_id: user.id.toString()
      }
    });
  };

  if (btnSubscribeRazorpay) {
    btnSubscribeRazorpay.addEventListener('click', triggerRazorpayCheckout);
  }
  if (btnSubscribePaddle) {
    btnSubscribePaddle.addEventListener('click', handlePaddleSubscribe);
  }`;

code = code.replace(oldLogic, newLogic);
fs.writeFileSync(jsPath, code);
console.log("dashboard.js updated successfully");
