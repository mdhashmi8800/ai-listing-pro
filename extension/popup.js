// Popup script for AI Listing Pro v2.0.0
// Subscription-based model with 4 UI states:
//   1. Loading  2. Signed Out  3. Subscribed  4. Not Subscribed

// ── Global OAuth Lock (prevents duplicate clicks) ──
let isOAuthInProgress = false;

// ── Proxy all external fetch calls through the background service worker ──
async function bgFetch(url, options = {}) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { action: 'PROXY_FETCH', payload: { url, options } },
      (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!response || !response.success) {
          reject(new Error(response?.error || 'Background fetch proxy failed'));
          return;
        }
        resolve({
          ok: response.ok,
          status: response.status,
          json: async () => (typeof response.body === 'object' ? response.body : JSON.parse(response.body)),
          text: async () => (typeof response.body === 'string' ? response.body : JSON.stringify(response.body))
        });
      }
    );
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  // ── DOM refs ──
  const loadingState = document.getElementById('loading-state');
  const authSection = document.getElementById('auth-section');
  const userSection = document.getElementById('user-section');
  const pricingSection = document.getElementById('pricing-section');
  const googleLoginBtn = document.getElementById('google-login-btn');
  const headerBadge = document.getElementById('header-badge');

  // ── Session restoration from chrome.storage.local ──
  const SUPABASE_SESSION_KEY = 'sbSession';

  async function restoreSessionFromStorage() {
    const sbClient = window.supabaseClient;
    if (!sbClient) return null;

    try {
      const stored = await chrome.storage.local.get([SUPABASE_SESSION_KEY]);
      const session = stored[SUPABASE_SESSION_KEY];
      if (!session || !session.access_token) return null;

      const { data, error } = await sbClient.auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token
      });

      if (error) {
        await chrome.storage.local.remove([SUPABASE_SESSION_KEY]);
        return null;
      }
      return data?.session;
    } catch (e) {
      console.error('[SESSION_RESTORE] Error:', e);
      return null;
    }
  }

  // ── Helper: Get current access token ──
  async function getAccessToken() {
    if (window.supabaseClient) {
      try {
        const { data } = await window.supabaseClient.auth.getSession();
        if (data?.session?.access_token) return data.session.access_token;
      } catch (_) { }
    }
    return null;
  }

  // Fetch dynamic settings
  if (typeof SettingsManager !== 'undefined') {
    await SettingsManager.fetch();
  }

  // ════════════════════════════════════════════════════════════
  //  STATE MANAGEMENT — Show exactly one state at a time
  // ════════════════════════════════════════════════════════════
  function showState(state) {
    loadingState.classList.add('hidden');
    authSection.classList.add('hidden');
    userSection.classList.add('hidden');
    pricingSection.classList.add('hidden');

    if (state === 'loading') loadingState.classList.remove('hidden');
    else if (state === 'auth') authSection.classList.remove('hidden');
    else if (state === 'subscribed') userSection.classList.remove('hidden');
    else if (state === 'pricing') pricingSection.classList.remove('hidden');
  }

  // Start with loading
  showState('loading');

  // ════════════════════════════════════════════════════════════
  //  GOOGLE LOGIN
  // ════════════════════════════════════════════════════════════
  if (googleLoginBtn) {
    googleLoginBtn.addEventListener('click', async () => {
      if (isOAuthInProgress) return;
      isOAuthInProgress = true;

      googleLoginBtn.disabled = true;
      googleLoginBtn.innerHTML = '<span class="btn-spinner"></span> Opening Google...';

      try {
        // Wake background service worker
        await new Promise((resolve) => {
          chrome.runtime.sendMessage({ action: 'PING' }, () => resolve());
        });
        await new Promise(r => setTimeout(r, 300));

        const response = await new Promise((resolve, reject) => {
          chrome.runtime.sendMessage({ action: 'GOOGLE_LOGIN' }, (res) => {
            if (chrome.runtime.lastError) {
              const portClosed = chrome.runtime.lastError.message?.includes('The message port closed');
              if (portClosed) { resolve({ success: true, deferred: true }); return; }
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve(res);
            }
          });
        });

        if (response?.deferred) {
          showMessage('Google login in progress. Reopen popup after completion.', 'info');
          return;
        }

        if (response && response.error) {
          if (response.code === 'USER_CANCELLED') {
            showMessage('Login cancelled.', 'info');
            return;
          }
          throw new Error(response.error);
        }

        if (!response || !response.success) {
          throw new Error(response?.error || 'OAuth failed');
        }

        const sbClient = window.supabaseClient;
        if (!sbClient) throw new Error('Supabase client not initialized');

        await new Promise(r => setTimeout(r, 200));
        const restoredSession = await restoreSessionFromStorage();

        if (!restoredSession?.access_token) {
          throw new Error('OAuth finished but no session found');
        }

        await chrome.storage.local.set({ supabaseSession: restoredSession });
        chrome.runtime.sendMessage({ type: 'AUTH_SUCCESS', session: restoredSession });

        const supaUser = restoredSession?.user;
        if (!supaUser) throw new Error('No user data');

        const user = {
          id: supaUser.id,
          email: supaUser.email,
          name: supaUser.user_metadata?.full_name || supaUser.email.split('@')[0]
        };

        await chrome.storage.local.set({ user });
        await createUserInDatabase(user, restoredSession.access_token);

        showMessage('Login successful! Welcome!', 'success');
        setTimeout(() => checkLoginStatus(), 500);

      } catch (error) {
        console.error('Login error:', error);
        showMessage('Login failed: ' + error.message, 'error');
      } finally {
        isOAuthInProgress = false;
        if (googleLoginBtn) {
          googleLoginBtn.disabled = false;
          googleLoginBtn.innerHTML = getGoogleButtonHTML();
        }
      }
    });
  }

  function getGoogleButtonHTML() {
    return `
      <svg width="18" height="18" viewBox="0 0 18 18">
        <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"/>
        <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"/>
        <path fill="#FBBC05" d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707s.102-1.167.282-1.707V4.961H.957C.347 6.175 0 7.55 0 9s.348 2.825.957 4.039l3.007-2.332z"/>
        <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.961L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/>
      </svg>
      Continue with Google`;
  }

  // ════════════════════════════════════════════════════════════
  //  DATABASE: Create/sync user
  // ════════════════════════════════════════════════════════════
  async function createUserInDatabase(user, accessToken) {
    try {
      const checkResponse = await bgFetch(
        `${CONFIG.SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}&select=credits`,
        {
          headers: {
            'apikey': CONFIG.SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${accessToken}`
          }
        }
      );

      if (!checkResponse.ok) return;
      const existingUsers = await checkResponse.json();

      if (!existingUsers || existingUsers.length === 0) {
        const userData = {
          id: user.id,
          email: user.email,
          name: user.name,
          credits: CONFIG.DEFAULT_SIGNUP_CREDITS
        };
        const createResponse = await bgFetch(`${CONFIG.SUPABASE_URL}/rest/v1/profiles`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': CONFIG.SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${accessToken}`,
            'Prefer': 'return=representation'
          },
          body: JSON.stringify(userData)
        });

        if (createResponse.ok) {
          user.credits = CONFIG.DEFAULT_SIGNUP_CREDITS;
          await chrome.storage.local.set({ user });
        }
      } else {
        user.credits = existingUsers[0].credits;
        await chrome.storage.local.set({ user });
      }
    } catch (e) {
      console.error('Create user error:', e);
    }
  }

  // ════════════════════════════════════════════════════════════
  //  SUBSCRIPTION: Fetch subscription status from Supabase
  // ════════════════════════════════════════════════════════════
  async function fetchSubscription(userId, token) {
    try {
      const response = await bgFetch(
        `${CONFIG.SUPABASE_URL}/rest/v1/subscriptions?user_id=eq.${userId}&status=eq.active&select=*&order=end_date.desc&limit=1`,
        {
          headers: {
            'apikey': CONFIG.SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${token}`
          }
        }
      );

      if (!response.ok) return null;
      const data = await response.json();
      return data && data.length > 0 ? data[0] : null;
    } catch (e) {
      console.error('[SUB] Fetch subscription error:', e);
      return null;
    }
  }

  function formatDate(dateStr) {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function getRemainingTime(expiresAt) {
    const now = new Date();
    const exp = new Date(expiresAt);
    const diffMs = exp - now;
    if (diffMs <= 0) return 'Expired';

    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

    if (days > 0) return `${days} day${days > 1 ? 's' : ''} ${hours}h`;
    return `${hours} hour${hours > 1 ? 's' : ''}`;
  }

  // ════════════════════════════════════════════════════════════
  //  CHECK LOGIN + SUBSCRIPTION STATUS
  // ════════════════════════════════════════════════════════════
  async function checkLoginStatus() {
    const sbClient = window.supabaseClient;

    await restoreSessionFromStorage();

    if (sbClient) {
      try {
        const { data: sessionCheck, error: sessionError } = await sbClient.auth.getSession();
        if (sessionError) console.error('getSession error:', sessionError);

        const session = sessionCheck?.session;

        if (session) {
          const token = session.access_token;
          const supaUser = session.user;

          const stored = await chrome.storage.local.get(['user']);
          const user = stored.user || {
            id: supaUser.id,
            email: supaUser.email,
            name: supaUser.user_metadata?.full_name || supaUser.email?.split('@')[0] || 'User'
          };

          if (!stored.user) await chrome.storage.local.set({ user });

          await ensureUserInDatabase(user, token);

          // Check subscription status
          const subscription = await fetchSubscription(user.id, token);

          if (subscription && new Date(subscription.end_date) > new Date()) {
            // STATE 3: Subscribed
            showSubscribedState(user, subscription);
            headerBadge.textContent = 'PRO';
            headerBadge.style.background = 'rgba(16, 185, 129, 0.15)';
            headerBadge.style.color = '#10b981';
            headerBadge.style.borderColor = 'rgba(16, 185, 129, 0.3)';
          } else {
            // STATE 4: Not Subscribed
            showPricingState(user);
            headerBadge.textContent = 'FREE';
            headerBadge.style.background = 'rgba(245, 158, 11, 0.15)';
            headerBadge.style.color = '#f59e0b';
            headerBadge.style.borderColor = 'rgba(245, 158, 11, 0.3)';
          }
          return;
        }
      } catch (e) {
        console.warn('getSession exception:', e);
      }
    }

    // STATE 2: Signed Out
    showState('auth');
  }

  async function ensureUserInDatabase(user, token) {
    try {
      const checkResponse = await bgFetch(
        `${CONFIG.SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}&select=id`,
        {
          headers: {
            'apikey': CONFIG.SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${token}`
          }
        }
      );

      if (checkResponse.ok) {
        const existingUsers = await checkResponse.json();
        if (!existingUsers || existingUsers.length === 0) {
          await createUserInDatabase(user, token);
        }
      }
    } catch (e) {
      console.error('Ensure user check error:', e);
    }
  }

  // ════════════════════════════════════════════════════════════
  //  STATE 3: Show Subscribed State
  // ════════════════════════════════════════════════════════════
  function showSubscribedState(user, subscription) {
    showState('subscribed');

    document.getElementById('user-avatar').textContent = user.name?.charAt(0).toUpperCase() || 'U';
    document.getElementById('user-name').textContent = user.name || 'User';
    document.getElementById('user-email').textContent = user.email;

    const planName = document.getElementById('sub-plan-name');
    const expiry = document.getElementById('sub-expiry');
    const remaining = document.getElementById('sub-remaining');

    if (subscription) {
      planName.textContent = subscription.plan_name || 'Active';
      planName.className = 'sub-value active';

      expiry.textContent = formatDate(subscription.end_date);
      const rem = getRemainingTime(subscription.end_date);
      remaining.textContent = rem;

      // Warn if less than 3 days remaining
      const daysLeft = (new Date(subscription.end_date) - new Date()) / (1000 * 60 * 60 * 24);
      if (daysLeft <= 3) {
        remaining.className = 'sub-value expiring';
      }
    }
  }

  // ════════════════════════════════════════════════════════════
  //  STATE 4: Show Pricing State (Not Subscribed)
  // ════════════════════════════════════════════════════════════
  function showPricingState(user) {
    showState('pricing');

    document.getElementById('pricing-avatar').textContent = user.name?.charAt(0).toUpperCase() || 'U';
    document.getElementById('pricing-user-name').textContent = user.name || 'User';
    document.getElementById('pricing-user-email').textContent = user.email;
  }

  // ════════════════════════════════════════════════════════════
  //  PAYMENT: Razorpay checkout inline (inside popup iframe)
  // ════════════════════════════════════════════════════════════
  let pricingPaymentContext = null; // Track payment for verification

  async function startPayment(plan) {
    try {
      const stored = await chrome.storage.local.get(['user']);
      const token = await getAccessToken();
      if (!stored.user || !token) {
        showMessage('Please login first', 'error');
        return;
      }

      // Validate phone number
      const phoneInput = document.getElementById('phone-input');
      const phone = phoneInput?.value?.replace(/\D/g, '') || '';
      if (phone.length !== 10) {
        showMessage('Please enter a valid 10-digit phone number', 'warning');
        phoneInput?.focus();
        return;
      }

      showMessage('Creating order...', 'info');

      const res = await bgFetch(CONFIG.CREATE_ORDER_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": CONFIG.SUPABASE_ANON_KEY,
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          amount: plan.price,
          plan_id: plan.id,
          user_id: stored.user.id,
          phone: phone,
          duration_days: plan.duration_days
        })
      });

      if (!res.ok) throw new Error("Order creation failed");
      const order = await res.json();

      // Save payment context for verification after checkout
      pricingPaymentContext = {
        orderId: order.id,
        amount: order.amount,
        phone: phone,
        plan: plan,
        user: stored.user,
        token: token
      };

      const checkoutUrl =
        CONFIG.CHECKOUT_URL +
        "?order_id=" + order.id +
        "&amount=" + order.amount +
        "&key=" + encodeURIComponent(CONFIG.RAZORPAY_KEY_ID) +
        "&user_id=" + encodeURIComponent(stored.user.id) +
        "&plan=" + encodeURIComponent(plan.id) +
        "&phone=" + encodeURIComponent(phone) +
        "&duration_days=" + encodeURIComponent(plan.duration_days);

      // Open checkout inside the same popup using the dashboard iframe
      const dView = document.getElementById('dashboard-view');
      const dIframe = document.getElementById('dashboard-iframe');
      const appCont = document.getElementById('app');

      savedDashboardUrl = ''; // No dashboard to restore — came from pricing
      dIframe.src = checkoutUrl;
      appCont.classList.add('hidden');
      dView.classList.remove('hidden');

      showMessage("Opening secure checkout...", "info");

    } catch (err) {
      showMessage("Payment failed: " + err.message, "error");
      console.error(err);
    }
  }

  // Poll for subscription after payment
  async function pollSubscriptionAfterPayment(user, token) {
    let attempts = 0;
    const maxAttempts = 10;

    const poll = setInterval(async () => {
      attempts++;
      try {
        const sub = await fetchSubscription(user.id, token);
        if (sub && new Date(sub.end_date) > new Date()) {
          clearInterval(poll);
          showMessage('Payment successful! Subscription activated.', 'success');
          showSubscribedState(user, sub);
          return;
        }
      } catch (_) { }

      if (attempts >= maxAttempts) {
        clearInterval(poll);
        showMessage('Payment processing — subscription will update shortly.', 'info');
      }
    }, 3000);
  }

  // ════════════════════════════════════════════════════════════
  //  PLAN BUTTON CLICKS
  // ════════════════════════════════════════════════════════════
  document.querySelectorAll('.plan-card').forEach(btn => {
    btn.addEventListener('click', async () => {
      const planId = btn.dataset.plan;
      const plan = CONFIG.SUBSCRIPTION_PLANS?.[planId];
      if (!plan) return;

      const stored = await chrome.storage.local.get(['user']);
      const token = await getAccessToken();
      if (!stored.user || !token) {
        showMessage('Please login to subscribe', 'info');
        return;
      }

      await startPayment(plan);
    });
  });

  // ════════════════════════════════════════════════════════════
  //  AI TOOL CARDS — Open dashboard at specific tool page
  // ════════════════════════════════════════════════════════════
  document.querySelectorAll('.tool-card').forEach(card => {
    card.addEventListener('click', () => {
      const tool = card.dataset.tool;
      openDashboardInPopup(tool ? `#${tool}` : '');
    });
  });

  // ════════════════════════════════════════════════════════════
  //  OPEN DASHBOARD BUTTON
  // ════════════════════════════════════════════════════════════
  const openDashboardBtn = document.getElementById('open-dashboard-btn');
  if (openDashboardBtn) {
    openDashboardBtn.addEventListener('click', () => {
      openDashboardInPopup();
    });
  }

  // ════════════════════════════════════════════════════════════
  //  DASHBOARD VIEW SWITCHING (iframe inside popup)
  // ════════════════════════════════════════════════════════════
  const dashboardView = document.getElementById('dashboard-view');
  const dashboardIframe = document.getElementById('dashboard-iframe');
  const dashboardBackBtn = document.getElementById('dashboard-back-btn');
  const appContainer = document.getElementById('app');

  let savedDashboardUrl = '';  // Remember dashboard URL for restoring after checkout

  function openDashboardInPopup(hash = '') {
    const url = chrome.runtime.getURL('dashboard.html') + hash;
    dashboardIframe.src = url;
    savedDashboardUrl = url;
    appContainer.classList.add('hidden');
    dashboardView.classList.remove('hidden');
  }

  if (dashboardBackBtn) {
    dashboardBackBtn.addEventListener('click', () => {
      dashboardView.classList.add('hidden');
      appContainer.classList.remove('hidden');
      dashboardIframe.src = '';
      savedDashboardUrl = '';
      pricingPaymentContext = null;
    });
  }

  // ── Checkout flow: dashboard sends OPEN_CHECKOUT, we swap the iframe ──
  const CHECKOUT_ORIGIN = 'https://meesho-ai-tool.vercel.app';

  window.addEventListener('message', (event) => {
    if (!event.data?.type) return;

    // Only accept messages from our extension pages or the checkout origin
    const fromExtension = event.origin.startsWith('chrome-extension://');
    const fromCheckout = event.origin === CHECKOUT_ORIGIN;
    if (!fromExtension && !fromCheckout) return;

    // Dashboard requests to open checkout page
    if (event.data.type === 'OPEN_CHECKOUT' && event.data.url) {
      savedDashboardUrl = dashboardIframe.src || savedDashboardUrl;
      dashboardIframe.src = event.data.url;
      return;
    }

    // Checkout page reports payment success — forward to dashboard & restore
    if (event.data.type === 'PAYMENT_SUCCESS') {
      const paymentData = event.data.data || {};

      // If checkout was opened from pricing section (no savedDashboardUrl),
      // close the iframe view, restore app view and poll for subscription
      if (!savedDashboardUrl) {
        dashboardIframe.src = '';
        dashboardView.classList.add('hidden');
        appContainer.classList.remove('hidden');

        if (pricingPaymentContext) {
          showMessage('Payment successful! Verifying...', 'success');
          pollSubscriptionAfterPayment(pricingPaymentContext.user, pricingPaymentContext.token);
          pricingPaymentContext = null;
        } else {
          showMessage('Payment successful! Subscription will update shortly.', 'success');
        }
        return;
      }

      // Restore dashboard
      dashboardIframe.src = savedDashboardUrl;
      // Forward result to dashboard iframe once it loads
      dashboardIframe.addEventListener('load', function onLoad() {
        dashboardIframe.removeEventListener('load', onLoad);
        setTimeout(() => {
          dashboardIframe.contentWindow?.postMessage({
            type: 'PAYMENT_SUCCESS',
            data: paymentData,
          }, '*');
        }, 500);
      });
      return;
    }

    // Checkout page reports payment cancelled — restore dashboard or pricing
    if (event.data.type === 'PAYMENT_CANCELLED') {
      // If checkout was opened from pricing section, just go back to app view
      if (!savedDashboardUrl) {
        dashboardIframe.src = '';
        dashboardView.classList.add('hidden');
        appContainer.classList.remove('hidden');
        showMessage('Payment cancelled. You can choose another plan.', 'info');
        pricingPaymentContext = null;
        return;
      }

      dashboardIframe.src = savedDashboardUrl;
      dashboardIframe.addEventListener('load', function onLoad() {
        dashboardIframe.removeEventListener('load', onLoad);
        setTimeout(() => {
          dashboardIframe.contentWindow?.postMessage({
            type: 'PAYMENT_CANCELLED',
          }, '*');
        }, 500);
      });
      return;
    }
  });

  // ════════════════════════════════════════════════════════════
  //  LOGOUT (both logged-in sections)
  // ════════════════════════════════════════════════════════════
  function setupLogout(btnId) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    btn.addEventListener('click', async () => {
      if (window.supabaseClient) {
        try { await window.supabaseClient.auth.signOut(); } catch (_) { }
      }
      await chrome.storage.local.remove(['user', 'sbSession', 'supabaseSession']);
      showMessage('Logged out', 'success');
      showState('auth');
      headerBadge.textContent = 'v2.0';
      headerBadge.style.background = 'rgba(16, 185, 129, 0.15)';
      headerBadge.style.color = '#10b981';
      headerBadge.style.borderColor = 'rgba(16, 185, 129, 0.3)';
    });
  }

  setupLogout('logout-btn');
  setupLogout('pricing-logout-btn');

  // ════════════════════════════════════════════════════════════
  //  TOAST HELPER
  // ════════════════════════════════════════════════════════════
  function showMessage(text, type) {
    const existing = document.querySelector('.message');
    if (existing) existing.remove();

    const msg = document.createElement('div');
    msg.className = `message ${type}`;
    msg.textContent = text;
    document.body.appendChild(msg);
    setTimeout(() => msg.remove(), 4500);
  }

  // ════════════════════════════════════════════════════════════
  //  INITIALIZE — Check login on popup open
  // ════════════════════════════════════════════════════════════
  await checkLoginStatus();
});

