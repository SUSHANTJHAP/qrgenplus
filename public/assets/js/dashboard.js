document.addEventListener('DOMContentLoaded', async () => {
  const loadingState = document.getElementById('loading-state');
  const unsubscribedState = document.getElementById('unsubscribed-state');
  const dashboardState = document.getElementById('dashboard-state');
  const btnLogout = document.getElementById('btn-logout');
  const btnSubscribeRazorpay = document.getElementById('btn-subscribe-razorpay');
  const btnSubscribePaddle = document.getElementById('btn-subscribe-paddle');
  const btnSubscribeUpi = document.getElementById('btn-subscribe-upi');
  const inputUpiId = document.getElementById('input-upi-id');
  let user = null;
  
  // Auth Check
  try {
    const res = await fetch('/api/me');
    if (!res.ok) {
      // Redirect to login page
      window.location.href = '/login.html';
      return;
    }
    
    // Protect against generic HTML responses
    const contentType = res.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
      console.error('Invalid API response type:', contentType);
      window.location.href = '/login.html';
      return;
    }

    const data = await res.json();
    if (!data || !data.user) {
      window.location.href = '/login.html';
      return;
    }

    user = data.user;
    
    if (btnLogout) btnLogout.classList.remove('hidden');
    if (loadingState) loadingState.classList.add('hidden');
    
    if (!user.subscribed) {
      if (unsubscribedState) unsubscribedState.classList.remove('hidden');
    } else {
      if (dashboardState) dashboardState.classList.remove('hidden');
      loadLinks();
    }

    // Initialize Paddle dynamically
    const confRes = await fetch('/api/config');
    if (confRes.ok) {
      const confData = await confRes.json();
      if (window.Paddle && confData.paddleToken && confData.paddleToken !== 'dummy_paddle_client_token') {
        Paddle.Environment.set(confData.paddleEnv);
        Paddle.Initialize({ 
          token: confData.paddleToken,
          eventCallback: function(data) {
            if (data.name === 'checkout.completed') {
              alert('Payment successful! Your account is being upgraded.');
              setTimeout(() => window.location.reload(), 2000);
            }
          }
        });
      }
    }
  } catch (err) {
    console.error('Dashboard init error:', err);
    if (loadingState) {
      loadingState.innerHTML = '<span class="text-red-500 font-semibold">Error connecting to server. Please try again.</span><br><br><a href="/login.html" class="text-indigo hover:underline mt-4 inline-block">Go to Login</a>';
    }
  }

  // Logout
  btnLogout.addEventListener('click', async () => {
    await fetch('/api/logout', { method: 'POST' });
    window.location.href = '/';
  });

  // Billing Toggle UI Update Logic
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
          priceId: isYearly ? 'pri_01kvc33wehnhamrmw663xmw2jv' : 'pri_01kvaqaen51n5nws6tpdcd1f4z',
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
  }

  window.subscribePremium = handlePaddleSubscribe; // Default action

  // Modal logic
  const editModal = document.getElementById('edit-modal');
  const btnCloseModal = document.getElementById('btn-close-modal');
  const btnCancelEdit = document.getElementById('btn-cancel-edit');
  const btnSaveEdit = document.getElementById('btn-save-edit');
  const inputEditUrl = document.getElementById('input-edit-url');
  const inputEditTitle = document.getElementById('input-edit-title');
  const inputEditShortId = document.getElementById('input-edit-short-id');
  const inputEditId = document.getElementById('input-edit-id');
  const inputEditPassword = document.getElementById('input-edit-password');
  const inputEditIos = document.getElementById('input-edit-ios');
  const inputEditAndroid = document.getElementById('input-edit-android');

  const closeModal = () => {
    editModal.classList.add('hidden');
    inputEditUrl.value = '';
    inputEditTitle.value = '';
    inputEditShortId.value = '';
    inputEditId.value = '';
    inputEditPassword.value = '';
    inputEditIos.value = '';
    inputEditAndroid.value = '';
  };

  btnCloseModal.addEventListener('click', closeModal);
  btnCancelEdit.addEventListener('click', closeModal);

  window.openEditModal = (shortId, currentUrl, currentTitle, password, iosUrl, androidUrl) => {
    inputEditId.value = shortId;
    inputEditUrl.value = currentUrl;
    inputEditTitle.value = currentTitle;
    inputEditShortId.value = shortId;
    inputEditPassword.value = password === 'null' || !password ? '' : password;
    inputEditIos.value = iosUrl === 'null' || !iosUrl ? '' : iosUrl;
    inputEditAndroid.value = androidUrl === 'null' || !androidUrl ? '' : androidUrl;
    editModal.classList.remove('hidden');
  };

  btnSaveEdit.addEventListener('click', async () => {
    const shortId = inputEditId.value;
    const targetUrl = inputEditUrl.value;
    const newTitle = inputEditTitle.value;
    if (!targetUrl) return alert('Target URL cannot be empty');

    try {
      new URL(targetUrl);
    } catch (_) {
      return alert('Please enter a valid URL (must start with http:// or https://)');
    }

    btnSaveEdit.innerText = 'Saving...';
    try {
      const res = await fetch(`/api/links/${shortId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          target_url: targetUrl, 
          original_title: newTitle, 
          new_short_id: inputEditShortId.value,
          password: inputEditPassword.value,
          ios_url: inputEditIos.value,
          android_url: inputEditAndroid.value
        })
      });
      if (res.ok) {
        closeModal();
        loadLinks(); // reload table
      } else {
        const d = await res.json();
        alert(d.error || 'Failed to update link');
      }
    } catch (err) {
      console.error(err);
    } finally {
      btnSaveEdit.innerText = 'Save Changes';
    }
  });
});

async function loadLinks() {
  const tbody = document.getElementById('links-tbody');
  tbody.innerHTML = '<tr><td colspan="5" class="px-6 py-4 text-center text-slate-500">Loading links...</td></tr>';
  
  try {
    const res = await fetch('/api/links');
    if (!res.ok) throw new Error('Failed to fetch');
    const data = await res.json();
    
    if (data.links.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="px-6 py-4 text-center text-slate-500">No dynamic links yet. Go create one!</td></tr>';
      return;
    }

    tbody.innerHTML = '';
    data.links.forEach(link => {
      const date = new Date(link.created_at).toLocaleDateString();
      const tr = document.createElement('tr');
      tr.className = "hover:bg-slate-50 transition";
      tr.innerHTML = `
        <td class="px-6 py-4">
          <div class="font-semibold text-navy">${link.original_title}</div>
          <div class="text-xs text-slate-400">${date}</div>
        </td>
        <td class="px-6 py-4">
          <a href="${link.short_url}" target="_blank" class="text-indigo hover:underline font-medium">${link.short_url.replace(/^https?:\/\//, '')}</a>
        </td>
        <td class="px-6 py-4 max-w-xs truncate text-slate-600" title="${link.target_url}">
          ${link.target_url}
        </td>
        <td class="px-6 py-4">
          <div class="flex flex-col gap-1 items-end">
            <span class="font-semibold text-navy">${link.scan_count} <span class="text-xs text-slate-400 font-normal">Scans</span></span>
            <div class="w-24 h-1.5 bg-slate-200 rounded-full overflow-hidden" title="Engagement metrics">
              <div class="h-full bg-indigo transition-all duration-500" style="width: ${Math.min((link.scan_count / 100) * 100, 100)}%"></div>
            </div>
          </div>
        </td>
        <td class="px-6 py-4">
          <div class="flex justify-center items-center gap-3">
            <button onclick="openEditModal('${link.short_id}', '${link.target_url}', '${link.original_title ? link.original_title.replace(/'/g, "\\'") : ''}', '${link.password}', '${link.ios_url}', '${link.android_url}')" title="Prevent printing mistakes. Update this URL anytime without changing your physical printed QR code." class="text-slate-500 hover:text-indigo transition font-medium text-sm border border-slate-200 px-3 py-1.5 rounded hover:border-indigo">Edit</button>
            <button onclick="openAnalyticsModal('${link.short_id}', '${link.original_title ? link.original_title.replace(/'/g, "\\'") : 'Link Analytics'}')" class="bg-indigo hover:bg-indigo-dark text-white px-3 py-1.5 rounded text-xs font-bold shadow-md transition transform hover:scale-105">Analytics</button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error(err);
    tbody.innerHTML = '<tr><td colspan="5" class="px-6 py-4 text-center text-red-500">Error loading links.</td></tr>';
  }
}

// -----------------------------------------------------------------------------
// ANALYTICS MODAL
// -----------------------------------------------------------------------------
let chartInstance = null;

window.openAnalyticsModal = async (shortId, title) => {
  const modal = document.getElementById('analytics-modal');
  const subtitle = document.getElementById('analytics-subtitle');
  const tbody = document.getElementById('analytics-locations-tbody');
  const noLoc = document.getElementById('analytics-no-locations');
  const osBody = document.getElementById('analytics-os-tbody');
  const noOs = document.getElementById('analytics-no-os');
  const browserBody = document.getElementById('analytics-browser-tbody');
  const noBrowser = document.getElementById('analytics-no-browser');
  
  subtitle.innerText = title;
  modal.classList.remove('hidden');
  
  try {
    const res = await fetch(`/api/analytics/${shortId}`);
    if (!res.ok) throw new Error('Failed to fetch analytics');
    const data = await res.json();
    
    // Draw Chart
    const ctx = document.getElementById('scansChart').getContext('2d');
    if (chartInstance) chartInstance.destroy();
    
    const labels = data.timeData.map(d => d.date);
    const counts = data.timeData.map(d => d.count);
    
    chartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'Scans',
          data: counts,
          borderColor: '#6366F1',
          backgroundColor: 'rgba(99, 102, 241, 0.1)',
          tension: 0.4,
          fill: true
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, ticks: { stepSize: 1 } }
        }
      }
    });
    
    // Render Locations
    tbody.innerHTML = '';
    if (data.countryData.length === 0) {
      noLoc.classList.remove('hidden');
      tbody.parentElement.classList.add('hidden');
    } else {
      noLoc.classList.add('hidden');
      tbody.parentElement.classList.remove('hidden');
      data.countryData.forEach(loc => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td class="px-4 py-2 font-medium text-navy">${loc.country}</td>
          <td class="px-4 py-2 text-right text-slate-600">${loc.count}</td>
        `;
        tbody.appendChild(tr);
      });
    }

    // Render OS
    osBody.innerHTML = '';
    if (!data.osData || data.osData.length === 0) {
      noOs.classList.remove('hidden');
      osBody.parentElement.classList.add('hidden');
    } else {
      noOs.classList.add('hidden');
      osBody.parentElement.classList.remove('hidden');
      data.osData.forEach(os => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td class="px-4 py-2 font-medium text-navy">${os.os}</td>
          <td class="px-4 py-2 text-right text-slate-600">${os.count}</td>
        `;
        osBody.appendChild(tr);
      });
    }

    // Render Browser
    browserBody.innerHTML = '';
    if (!data.browserData || data.browserData.length === 0) {
      noBrowser.classList.remove('hidden');
      browserBody.parentElement.classList.add('hidden');
    } else {
      noBrowser.classList.add('hidden');
      browserBody.parentElement.classList.remove('hidden');
      data.browserData.forEach(b => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td class="px-4 py-2 font-medium text-navy">${b.browser}</td>
          <td class="px-4 py-2 text-right text-slate-600">${b.count}</td>
        `;
        browserBody.appendChild(tr);
      });
    }
    
    
  } catch (err) {
    console.error(err);
    alert('Error loading analytics');
  }
};

document.getElementById('btn-close-analytics').addEventListener('click', () => {
  document.getElementById('analytics-modal').classList.add('hidden');
});
