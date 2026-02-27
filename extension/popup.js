// Popup script for AI Listing Pro v2.0.0
// Growth-first SaaS model: Retention > Volume Usage > Conversion > High Pricing

// Payment URLs from CONFIG (loaded via config.js as a regular script)
// ACCESS: CONFIG.CREATE_ORDER_URL, CONFIG.VERIFY_PAYMENT_URL, CONFIG.CHECKOUT_URL

// ── Global OAuth Lock (prevents duplicate clicks) ──
let isOAuthInProgress = false;

// ── Proxy all external fetch calls through the background service worker ──
// Chrome extension popups cannot reliably call external APIs directly.
// This helper sends fetch requests to background.js which executes them.
async function bgFetch(url, options = {}) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { type: 'PROXY_FETCH', url, options },
      (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!response || !response.success) {
          reject(new Error(response?.error || 'Background fetch proxy failed'));
          return;
        }
        // Return a fetch-Response-like object so callers stay unchanged
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
  const authSection = document.getElementById('auth-section');

  // ── Helper: Get current access token (Supabase SDK only) ──
  async function getAccessToken() {
    if (window.supabaseClient) {
      try {
        const { data } = await window.supabaseClient.auth.getSession();
        if (data?.session?.access_token) return data.session.access_token;
      } catch (_) { }
    }
    return null;
  }
  const userSection = document.getElementById('user-section');
  const googleLoginBtn = document.getElementById('google-login-btn');

  // Fetch dynamic settings from admin panel (if SettingsManager exists)
  if (typeof SettingsManager !== 'undefined') {
    await SettingsManager.fetch();
  }

  // Render pricing plan cards from CONFIG
  updatePlanUI();

  // ── Update Plan Cards ──────────────────────────────────────
  function updatePlanUI() {
    const starter = CONFIG.PRICING.STARTER;
    const growth = CONFIG.PRICING.GROWTH;
    const pro = CONFIG.PRICING.PRO;
    const bonus = starter.bonus || 25;

    const el = (id) => document.getElementById(id);

    // Starter
    if (el('plan-starter-name')) el('plan-starter-name').innerHTML = starter.name;
    if (el('plan-starter-credits')) el('plan-starter-credits').innerHTML = `${starter.credits} Credits (+${bonus} Bonus on 1st Buy)`;
    if (el('plan-starter-price')) el('plan-starter-price').innerHTML = `₹${starter.price}`;

    // Growth
    if (el('plan-growth-name')) el('plan-growth-name').innerHTML = growth.name;
    if (el('plan-growth-credits')) el('plan-growth-credits').innerHTML = `${growth.credits} Credits`;
    if (el('plan-growth-price')) el('plan-growth-price').innerHTML = `₹${growth.price}`;

    // Pro Monthly
    if (el('plan-pro-name')) el('plan-pro-name').innerHTML = pro.name;
    if (el('plan-pro-credits')) el('plan-pro-credits').innerHTML = `${pro.credits} Credits/month`;
    if (el('plan-pro-price')) el('plan-pro-price').innerHTML = `₹${pro.price}/mo`;

    // Signup bonus line
    if (el('signup-bonus-text')) el('signup-bonus-text').innerHTML = `${CONFIG.DEFAULT_SIGNUP_CREDITS} FREE credits`;
    if (el('daily-bonus-text')) el('daily-bonus-text').innerHTML = `+${CONFIG.DAILY_LOGIN_BONUS} credits every 24h`;
  }

  // ── Google Login ───────────────────────────────────────────
  if (googleLoginBtn) {
    googleLoginBtn.addEventListener('click', async () => {
      console.log("[POPUP] Google button clicked"); // User requested log

      // ── Prevent duplicate clicks ──
      if (isOAuthInProgress) {
        console.log('[OAUTH_BLOCKED_DUPLICATE] OAuth already in progress, ignoring click');
        return;
      }

      // Set global lock
      isOAuthInProgress = true;

      // Loading State Start (Disable & Show Text)
      googleLoginBtn.disabled = true;
      googleLoginBtn.classList.add('loading');
      googleLoginBtn.innerHTML = '<span class="spinner"></span> Opening Google...';

      try {
        // ── Step 0: Wake up background service worker before OAuth ──
        // MV3 service workers go idle; first message can be lost.
        // A warmup PING forces Chrome to spin the worker up first.
        console.log('[POPUP_OAUTH] Sending PING to wake background service worker...');
        await new Promise((resolve, reject) => {
          chrome.runtime.sendMessage({ type: 'PING' }, (res) => {
            if (chrome.runtime.lastError) {
              console.warn('[POPUP_OAUTH] PING failed:', chrome.runtime.lastError.message);
              // proceed anyway, maybe the next message will work
              resolve(); 
            } else {
              console.log('[POPUP_OAUTH] PING OK — service worker alive');
              resolve(res);
            }
          });
        });

        // 300ms grace period to let service worker fully initialise
        await new Promise(r => setTimeout(r, 300));

        console.log('[POPUP_OAUTH] Sending GOOGLE_LOGIN to background.js...');
        // Note: The popup may close when the OAuth window opens (Chrome behaviour).
        // If that happens, the background still persists the session to chrome.storage.local.
        // When the popup reopens, checkLoginStatus() will find the saved session.
        const response = await new Promise((resolve, reject) => {
          chrome.runtime.sendMessage({ type: 'GOOGLE_LOGIN' }, (res) => { // Changed to type: GOOGLE_LOGIN
            if (chrome.runtime.lastError) {
              console.warn('[POPUP_OAUTH] sendMessage error:', chrome.runtime.lastError.message);
              const portClosed = chrome.runtime.lastError.message?.includes('The message port closed before a response was received');
              if (portClosed) {
                resolve({ success: true, deferred: true });
                return;
              }
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              console.log('[POPUP_OAUTH] Response received from background:', JSON.stringify(res, null, 2));
              resolve(res);
            }
          });
        });

        if (response?.deferred) {
          showMessage('Google login in progress. Reopen popup after completion.', 'info');
          return;
        }

        // Check for specific error codes from background
        if (response && response.error) {
          // User cancellation is not a real error — just reset state
          if (response.code === 'USER_CANCELLED') {
            console.log('[POPUP_OAUTH] User cancelled OAuth');
            showMessage('Login cancelled.', 'info');
            return; // finally block handles cleanup
          }
          throw new Error(response.error);
        }

        if (!response || !response.success) {
          throw new Error(response?.error || 'OAuth failed');
        }

        console.log('[POPUP_OAUTH] OAuth completed successfully');

        // ── Step 1: Read session from Supabase SDK storage ──
        const sbClient = window.supabaseClient;
        if (!sbClient) {
          throw new Error('Supabase client not initialized');
        }

        const { data: verifySessionData } = await sbClient.auth.getSession();
        console.log('[POPUP_SESSION] Verified session:', {
          hasSession: !!verifySessionData?.session,
          email: verifySessionData?.session?.user?.email
        });

        if (!verifySessionData?.session?.access_token) {
          throw new Error('OAuth finished but no session found in storage');
        }

        // ── Step 2: Use user data from background ──
        const supaUser = verifySessionData?.session?.user;
        if (!supaUser) {
          throw new Error('User verification failed: No user data in response');
        }
        console.log('[POPUP_USER] User verified:', supaUser.email, 'id:', supaUser.id);

        // ── Step 3: Build user object for UI/DB ──
        const user = {
          id: supaUser.id,
          email: supaUser.email,
          name: supaUser.user_metadata?.full_name || supaUser.email.split('@')[0]
        };

        // Store user profile
        await chrome.storage.local.set({ user: user });

        // ── Step 4: Create/sync user in database with welcome credits ──
        await createUserInDatabase(user, verifySessionData.session.access_token);

        showMessage('✅ Login successful! Welcome!', 'success');
        
        // Let UI update (which might hide button), but we handle cleanup in finally block
        setTimeout(() => checkLoginStatus(), 500);

      } catch (error) {
        console.error('❌ Login handler error:', error);
        showMessage('Login failed: ' + error.message, 'error');
      } finally {
        // Release global lock
        isOAuthInProgress = false;
        
        if (googleLoginBtn) {
           googleLoginBtn.disabled = false;
           googleLoginBtn.classList.remove('loading');
           // Restore original button content
           googleLoginBtn.innerHTML = getGoogleButtonHTML(); 
        }
      }
    });
  }

  function getGoogleButtonHTML() {
    return `
            <svg width="18" height="18" viewBox="0 0 18 18" style="margin-right: 8px;">
                <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"/>
                <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"/>
                <path fill="#FBBC05" d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707s.102-1.167.282-1.707V4.961H.957C.347 6.175 0 7.55 0 9s.348 2.825.957 4.039l3.007-2.332z"/>
                <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.961L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/>
            </svg>
            Continue with Google
        `;
  }

  // ── Create User in Database with Welcome Credits ───────────
  async function createUserInDatabase(user, accessToken) {
    try {
      console.log('🔄 Creating/syncing user in database:', user.email);

      let userIp = '';
      try {
        const ipRes = await bgFetch('https://api.ipify.org?format=json');
        const ipData = await ipRes.json();
        userIp = ipData.ip || '';
      } catch (e) {
        console.warn('IP fetch failed');
      }

      const checkResponse = await bgFetch(
        `${CONFIG.SUPABASE_URL}/rest/v1/users?id=eq.${user.id}&select=*`,
        {
          headers: {
            'apikey': CONFIG.SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${accessToken}`
          }
        }
      );

      if (!checkResponse.ok) {
        console.error('❌ Check user failed:', checkResponse.status);
        return;
      }

      const existingUsers = await checkResponse.json();

      if (!existingUsers || existingUsers.length === 0) {
        // New user — grant DEFAULT_SIGNUP_CREDITS (15)
        console.log('✨ Creating new user with', CONFIG.DEFAULT_SIGNUP_CREDITS, 'welcome credits');

        try {
          const funcResponse = await bgFetch(`${CONFIG.SUPABASE_URL}/rest/v1/rpc/create_user_with_credits`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': CONFIG.SUPABASE_ANON_KEY,
              'Authorization': `Bearer ${accessToken}`
            },
            body: JSON.stringify({
              user_id: user.id,
              user_email: user.email,
              user_name: user.name,
              initial_credits: CONFIG.DEFAULT_SIGNUP_CREDITS,
              user_ip: userIp || null
            })
          });

          if (funcResponse.ok) {
            const createdUser = await funcResponse.json();
            console.log('✅ User created via function:', createdUser);
            user.credits = CONFIG.DEFAULT_SIGNUP_CREDITS;
            user.is_banned = false;
            user.total_optimizations = 0;
            user.last_daily_bonus = null;
            await chrome.storage.local.set({ user });
            showMessage(`🎉 Welcome! You got ${CONFIG.DEFAULT_SIGNUP_CREDITS} free credits!`, 'success');
            return;
          } else {
            console.warn('⚠️ Function failed, trying direct insert...');
          }
        } catch (funcError) {
          console.warn('⚠️ Function error, trying direct insert...', funcError);
        }

        // Fallback: Direct INSERT
        const userData = {
          id: user.id,
          email: user.email,
          name: user.name,
          credits: CONFIG.DEFAULT_SIGNUP_CREDITS,
          total_optimizations: 0,
          last_daily_bonus: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        if (userIp) {
          userData.signup_ip = userIp;
          userData.last_ip = userIp;
        }

        const createResponse = await bgFetch(`${CONFIG.SUPABASE_URL}/rest/v1/users`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': CONFIG.SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${accessToken}`,
            'Prefer': 'return=representation'
          },
          body: JSON.stringify(userData)
        });

        if (!createResponse.ok) {
          const errorText = await createResponse.text();
          console.error('❌ Create user failed:', createResponse.status, errorText);
          showMessage('⚠️ Account created but credits pending. Contact support if issue persists.', 'warning');
          return;
        }

        user.credits = CONFIG.DEFAULT_SIGNUP_CREDITS;
        user.is_banned = false;
        user.total_optimizations = 0;
        await chrome.storage.local.set({ user });
        showMessage(`🎉 Welcome! You got ${CONFIG.DEFAULT_SIGNUP_CREDITS} free credits!`, 'success');

      } else {
        // Existing user — check daily login bonus
        const existing = existingUsers[0];
        console.log('✅ User exists, checking daily bonus...');

        user.credits = existing.credits;
        user.is_banned = existing.is_banned || false;
        user.ban_reason = existing.ban_reason || null;
        user.total_optimizations = existing.total_optimizations || 0;
        user.last_daily_bonus = existing.last_daily_bonus || null;

        const dailyBonusGranted = await checkAndGrantDailyBonus(user, accessToken);

        if (userIp) {
          bgFetch(`${CONFIG.SUPABASE_URL}/rest/v1/users?id=eq.${user.id}`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              'apikey': CONFIG.SUPABASE_ANON_KEY,
              'Authorization': `Bearer ${accessToken}`
            },
            body: JSON.stringify({ last_ip: userIp, updated_at: new Date().toISOString() })
          }).catch(() => { });
        }

        await chrome.storage.local.set({ user });
      }
    } catch (e) {
      console.error('❌ Create user in database error:', e);
      showMessage('⚠️ Login successful but credits not synced. Try refreshing.', 'warning');
    }
  }

  // ── Daily Login Bonus ──────────────────────────────────────
  // Returns true if bonus was granted this session
  async function checkAndGrantDailyBonus(user, accessToken) {
    if (!CONFIG.FEATURE_DAILY_BONUS) return false;

    const now = Date.now();
    const lastBonus = user.last_daily_bonus ? new Date(user.last_daily_bonus).getTime() : 0;
    const hoursSinceLast = (now - lastBonus) / (1000 * 60 * 60);

    if (hoursSinceLast < CONFIG.DAILY_LOGIN_BONUS_HOURS) {
      console.log(`ℹ️ Daily bonus not yet due. ${(CONFIG.DAILY_LOGIN_BONUS_HOURS - hoursSinceLast).toFixed(1)}h remaining.`);
      return false;
    }

    const bonusAmount = CONFIG.DAILY_LOGIN_BONUS;
    const newCredits = (user.credits || 0) + bonusAmount;
    const nowIso = new Date(now).toISOString();

    try {
      const patchRes = await bgFetch(`${CONFIG.SUPABASE_URL}/rest/v1/users?id=eq.${user.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'apikey': CONFIG.SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          credits: newCredits,
          last_daily_bonus: nowIso,
          updated_at: nowIso
        })
      });

      if (patchRes.ok) {
        user.credits = newCredits;
        user.last_daily_bonus = nowIso;
        console.log(`✅ Daily bonus granted: +${bonusAmount} credits`);
        showMessage(`🌅 Welcome back! +${bonusAmount} daily bonus credits added.`, 'success');

        // Log to credit_transactions if table exists
        bgFetch(`${CONFIG.SUPABASE_URL}/rest/v1/credit_transactions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': CONFIG.SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${accessToken}`
          },
          body: JSON.stringify({
            user_id: user.id,
            amount: bonusAmount,
            type: 'daily',
            description: 'Daily login bonus',
            created_at: nowIso
          })
        }).catch(() => { }); // Non-critical

        return true;
      }
    } catch (e) {
      console.warn('Daily bonus patch failed:', e);
    }
    return false;
  }

  // ── Check Login Status (Supabase SDK-based) ─────────────
  async function checkLoginStatus() {
    const sbClient = window.supabaseClient;

    // ── Primary: Check Supabase SDK session ──
    if (sbClient) {
      try {
        const { data: sessionCheck } = await sbClient.auth.getSession();
        console.log('🔍 checkLoginStatus → getSession():', {
          hasSession: !!sessionCheck?.session,
          email: sessionCheck?.session?.user?.email
        });

        if (sessionCheck?.session) {
          const session = sessionCheck.session;
          const token = session.access_token;
          const supaUser = session.user;

          // Build/update user profile from Supabase session
          const stored = await chrome.storage.local.get(['user']);
          const user = stored.user || {
            id: supaUser.id,
            email: supaUser.email,
            name: supaUser.user_metadata?.full_name || supaUser.email?.split('@')[0] || 'User'
          };

          // Ensure user profile is persisted
          if (!stored.user) {
            await chrome.storage.local.set({ user });
          }

          await ensureUserInDatabase(user, token);
          showUserSection(user);
          await refreshCredits(user.id, token);
          return;
        }
      } catch (e) {
        console.warn('⚠️ Supabase getSession() error:', e);
      }
    }

    // No Supabase session found — show auth section
    console.log('🔍 checkLoginStatus → No Supabase SDK session found, showing auth section');
    showAuthSection();
  }

  async function ensureUserInDatabase(user, token) {
    try {
      const checkResponse = await bgFetch(
        `${CONFIG.SUPABASE_URL}/rest/v1/users?id=eq.${user.id}&select=id`,
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
          console.log('⚠️ User logged in but not in database. Creating entry...');
          await createUserInDatabase(user, token);
        }
      }
    } catch (e) {
      console.error('Ensure user check error:', e);
    }
  }

  function showAuthSection() {
    authSection.classList.remove('hidden');
    userSection.classList.add('hidden');
  }

  function showUserSection(user) {
    authSection.classList.add('hidden');
    userSection.classList.remove('hidden');

    document.getElementById('user-avatar').textContent = user.name?.charAt(0).toUpperCase() || 'U';
    document.getElementById('user-name').textContent = user.name || 'User';
    document.getElementById('user-email').textContent = user.email;

    updateCreditsDisplay(user.credits || 0);
  }

  function updateCreditsDisplay(credits) {
    const creditsValue = document.getElementById('credits-value');
    const creditsCard = document.getElementById('credits-card');

    if (creditsValue) creditsValue.textContent = credits;

    // Low credits warning
    const threshold = CONFIG.LOW_CREDITS_THRESHOLD;
    const lowWarning = document.getElementById('low-credits-warning');
    if (credits <= threshold) {
      if (creditsCard) creditsCard.classList.add('low-credits');
      if (lowWarning) lowWarning.classList.remove('hidden');
    } else {
      if (creditsCard) creditsCard.classList.remove('low-credits');
      if (lowWarning) lowWarning.classList.add('hidden');
    }
  }

  async function refreshCredits(userId, accessToken) {
    // Prefer token from Supabase SDK session if available
    let token = accessToken;
    if (!token && window.supabaseClient) {
      try {
        const { data } = await window.supabaseClient.auth.getSession();
        token = data?.session?.access_token;
      } catch (_) { }
    }
    if (!token) return;

    try {
      const response = await bgFetch(
        `${CONFIG.SUPABASE_URL}/rest/v1/users?id=eq.${userId}&select=credits,total_optimizations,is_banned,ban_reason,last_daily_bonus`,
        {
          headers: {
            'apikey': CONFIG.SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${token}`
          }
        }
      );

      if (response.ok) {
        const data = await response.json();
        if (data && data.length > 0) {
          const stored = await chrome.storage.local.get(['user']);
          stored.user.credits = data[0].credits;
          stored.user.total_optimizations = data[0].total_optimizations || 0;
          stored.user.is_banned = data[0].is_banned || false;
          stored.user.ban_reason = data[0].ban_reason || null;
          stored.user.last_daily_bonus = data[0].last_daily_bonus || null;
          await chrome.storage.local.set({ user: stored.user });
          updateCreditsDisplay(data[0].credits);

          // Check daily bonus on refresh
          await checkAndGrantDailyBonus(stored.user, token);
          await chrome.storage.local.set({ user: stored.user });
          updateCreditsDisplay(stored.user.credits);

          if (data[0].is_banned) {
            showMessage('⚠️ Your account has been suspended: ' + (data[0].ban_reason || 'Contact support'), 'error');
          }
        } else {
          console.warn('⚠️ User not found in database during refresh');
          const stored = await chrome.storage.local.get(['user']);
          await createUserInDatabase(stored.user, token);
        }
      }
    } catch (e) {
      console.error('Refresh credits error:', e);
    }
  }

  // ── Logout ─────────────────────────────────────────────────
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      // Sign out via Supabase SDK (clears its persisted session in chrome.storage.local)
      if (window.supabaseClient) {
        try {
          await window.supabaseClient.auth.signOut();
          console.log('✅ Supabase SDK signOut() complete');
        } catch (e) {
          console.warn('⚠️ SDK signOut error:', e);
        }
      }
      // Clear user profile (Supabase SDK handles session cleanup via signOut)
      await chrome.storage.local.remove(['user']);
      showMessage('Logged out', 'success');
      showAuthSection();
    });
  }

  // ── Open Meesho ────────────────────────────────────────────
  const openMeeshoBtn = document.getElementById('open-meesho');
  if (openMeeshoBtn) {
    openMeeshoBtn.addEventListener('click', () => {
      chrome.tabs.create({ url: 'https://supplier.meesho.com' });
    });
  }

  // ── Apply Promo Code ────────────────────────────────────────
  const applyPromoBtn = document.getElementById('apply-promo');
  if (applyPromoBtn) {
    applyPromoBtn.addEventListener('click', async () => {
      const code = document.getElementById('promo-code').value.trim();
      if (!code) { showMessage('Enter a promo code', 'error'); return; }

      const stored = await chrome.storage.local.get(['user']);
      const token = await getAccessToken();
      if (!stored.user || !token) { showMessage('Please login first', 'error'); return; }

      const promoBtn = document.getElementById('apply-promo');
      promoBtn.disabled = true;
      promoBtn.innerHTML = '...';

      try {
        const response = await bgFetch(
          `${CONFIG.SUPABASE_URL}/rest/v1/promo_codes?code=eq.${code.toUpperCase()}&is_active=eq.true&select=*`,
          {
            headers: {
              'apikey': CONFIG.SUPABASE_ANON_KEY,
              'Authorization': `Bearer ${token}`
            }
          }
        );

        const promos = await response.json();

        if (!promos || promos.length === 0) {
          throw new Error('Invalid or expired promo code');
        }

        const promo = promos[0];

        // Check if already used
        const usageCheck = await bgFetch(
          `${CONFIG.SUPABASE_URL}/rest/v1/promo_usage?user_id=eq.${stored.user.id}&promo_id=eq.${promo.id}&select=id`,
          {
            headers: {
              'apikey': CONFIG.SUPABASE_ANON_KEY,
              'Authorization': `Bearer ${token}`
            }
          }
        );

        const usages = await usageCheck.json();
        if (usages && usages.length > 0) {
          throw new Error('You have already used this promo code');
        }

        // Apply credits (no unlimited promo — only credit-based)
        const newCredits = (stored.user.credits || 0) + (promo.credits || 0);

        await bgFetch(`${CONFIG.SUPABASE_URL}/rest/v1/users?id=eq.${stored.user.id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'apikey': CONFIG.SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ credits: newCredits, updated_at: new Date().toISOString() })
        });

        // Record usage
        await bgFetch(`${CONFIG.SUPABASE_URL}/rest/v1/promo_usage`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': CONFIG.SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            user_id: stored.user.id,
            promo_id: promo.id,
            used_at: new Date().toISOString()
          })
        });

        stored.user.credits = newCredits;
        await chrome.storage.local.set({ user: stored.user });
        updateCreditsDisplay(newCredits);
        document.getElementById('promo-code').value = '';
        showMessage(`🎉 ${promo.credits} credits added!`, 'success');

      } catch (error) {
        showMessage(error.message, 'error');
      }

      promoBtn.disabled = false;
      promoBtn.innerHTML = 'Apply';
    });
  }

  // -- Razorpay Iframe Payment Flow --
  async function startPayment(plan) {
    try {
      const stored = await chrome.storage.local.get(['user']);
      const token = await getAccessToken();
      if (!stored.user || !token) {
        showMessage('Please login first', 'error');
        return;
      }

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
          credits: plan.credits
        })
      });

      if (!res.ok) throw new Error("Order creation failed");
      const order = await res.json();

      const checkoutUrl =
        CONFIG.CHECKOUT_URL +
        "?order_id=" + order.id +
        "&amount=" + order.amount +
        "&user_id=" + encodeURIComponent(stored.user.id) +
        "&plan_type=" + encodeURIComponent(plan.id) +
        "&credits=" + encodeURIComponent(plan.credits);

      // Open checkout window and poll for credit changes after it closes
      chrome.windows.create({
        url: checkoutUrl,
        type: "popup",
        width: 420,
        height: 720
      }, (win) => {
        if (!win) return;
        // Listen for checkout window close to verify payment
        const onRemoved = (windowId) => {
          if (windowId !== win.id) return;
          chrome.windows.onRemoved.removeListener(onRemoved);
          // Poll credits after checkout window closes
          pollCreditsAfterPayment(stored.user, token, plan);
        };
        chrome.windows.onRemoved.addListener(onRemoved);
      });

      showMessage("Opening secure checkout...", "info");

    } catch (err) {
      showMessage("Payment start failed: " + err.message, "error");
      console.error(err);
    }
  }

  // -- Poll for credit update after payment --
  async function pollCreditsAfterPayment(user, token, plan) {
    const originalCredits = user.credits || 0;
    let attempts = 0;
    const maxAttempts = 10;

    const poll = setInterval(async () => {
      attempts++;
      try {
        const userRes = await bgFetch(
          `${CONFIG.SUPABASE_URL}/rest/v1/users?id=eq.${user.id}&select=credits`,
          {
            headers: {
              'apikey': CONFIG.SUPABASE_ANON_KEY,
              'Authorization': `Bearer ${token}`
            }
          }
        );
        if (userRes.ok) {
          const data = await userRes.json();
          const newCredits = data?.[0]?.credits;
          if (newCredits != null && newCredits > originalCredits) {
            clearInterval(poll);
            // Update local storage
            const stored = await chrome.storage.local.get(['user']);
            if (stored.user) {
              stored.user.credits = newCredits;
              await chrome.storage.local.set({ user: stored.user });
            }
            updateCreditsDisplay(newCredits);
            showMessage(`🎉 Payment successful! ${newCredits - originalCredits} credits added.`, 'success');
            return;
          }
        }
      } catch (_) { /* ignore polling errors */ }

      if (attempts >= maxAttempts) {
        clearInterval(poll);
        showMessage('Payment processing — credits will update shortly. Refresh if needed.', 'info');
      }
    }, 3000);
  }

  // -- Buy Plan Buttons --
  document.querySelectorAll('.plan-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const planId = btn.dataset.plan;
      const plan = CONFIG.PRICING[planId?.toUpperCase()];
      if (!plan) return;

      const stored = await chrome.storage.local.get(['user']);
      const token = await getAccessToken();
      if (!stored.user || !token) {
        showMessage('Please login to buy credits', 'info');
        return;
      }

      await startPayment(plan);
    });
  });

  // ── Toast Helper ───────────────────────────────────────────
  function showMessage(text, type) {
    const existing = document.querySelector('.message');
    if (existing) existing.remove();

    const msg = document.createElement('div');
    msg.className = `message ${type}`;
    msg.textContent = text;
    document.body.appendChild(msg);
    setTimeout(() => msg.remove(), 4500);
  }

  // ── Initialize ─────────────────────────────────────────────
  if (window.supabaseClient) {
    try {
      const { data: existingSessionData } = await window.supabaseClient.auth.getSession();
      if (existingSessionData?.session) {
        console.log('[POPUP_INIT] Existing session found on popup open:', existingSessionData.session.user?.email);
      }
    } catch (e) {
      console.warn('[POPUP_INIT] getSession failed during startup:', e);
    }
  }
  await checkLoginStatus();
});


