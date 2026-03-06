// AI Listing Pro — Dashboard Logic
// Credits are NOT deducted on page open. Only deducted when user runs an analysis.

(async function () {
  'use strict';

  // ── State ──
  let currentUser = null;
  let userProfile = null;
  let analysisHistory = [];

  // ── DOM References ──
  const DOM = {
    // Sidebar
    sidebarCredits: document.getElementById('sidebar-credits'),
    sidebarCreditsCount: document.getElementById('sidebar-credits-count'),
    sidebarName: document.getElementById('sidebar-name'),
    sidebarEmail: document.getElementById('sidebar-email'),
    sidebarAvatar: document.getElementById('sidebar-avatar'),
    // Top bar
    topBarTitle: document.getElementById('top-bar-title'),
    // Overview stats
    ovCredits: document.getElementById('ov-credits'),
    ovOptimizations: document.getElementById('ov-optimizations'),
    ovPlan: document.getElementById('ov-plan'),
    ovSaved: document.getElementById('ov-saved'),
    // Buttons
    btnRefresh: document.getElementById('btn-refresh'),
    btnBuyCredits: document.getElementById('btn-buy-credits'),
    btnLoginRedirect: document.getElementById('btn-login-redirect'),
    // Login overlay
    loginOverlay: document.getElementById('login-overlay'),
    // Activity
    activityList: document.getElementById('activity-list'),
    // History
    historyContent: document.getElementById('history-content'),
    // Run buttons
    btnRunShipping: document.getElementById('btn-run-shipping'),
    btnRunProfit: document.getElementById('btn-run-profit'),
    btnRunReturns: document.getElementById('btn-run-returns'),
    btnRunBulk: document.getElementById('btn-run-bulk'),
    // Results
    resultShipping: document.getElementById('result-shipping'),
    resultProfit: document.getElementById('result-profit'),
    resultReturns: document.getElementById('result-returns'),
    resultBulk: document.getElementById('result-bulk'),
  };

  // ── Page Title Map ──
  const PAGE_TITLES = {
    overview: 'Overview',
    shipping: 'Shipping Optimizer',
    profit: 'Profit Calculator',
    returns: 'Return Analyzer',
    bulk: 'Bulk Optimization',
    history: 'History',
  };

  // ══════════════════════════════════════
  //  SUPABASE SESSION RESTORE
  // ══════════════════════════════════════
  async function initSession() {
    const sbClient = window.supabaseClient;
    if (!sbClient) {
      showLogin();
      return false;
    }

    // Restore session from chrome.storage.local
    try {
      const stored = await chrome.storage.local.get(['sbSession']);
      const session = stored.sbSession;
      if (session && session.access_token) {
        await sbClient.auth.setSession({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
        });
      }
    } catch (e) {
      console.error('[DASHBOARD] Session restore error:', e);
    }

    // Get current user
    const { data: { user }, error } = await sbClient.auth.getUser();
    if (error || !user) {
      showLogin();
      return false;
    }

    currentUser = user;

    // Fetch profile
    const { data: profile, error: profileErr } = await sbClient
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    if (profileErr || !profile) {
      showLogin();
      return false;
    }

    userProfile = profile;
    updateUI();
    return true;
  }

  function showLogin() {
    DOM.loginOverlay.classList.remove('hidden');
  }

  // ══════════════════════════════════════
  //  UI UPDATE
  // ══════════════════════════════════════
  function updateUI() {
    if (!userProfile || !currentUser) return;

    const credits = userProfile.credits || 0;
    const totalOpts = userProfile.total_optimizations || 0;
    const name = currentUser.user_metadata?.full_name || currentUser.email?.split('@')[0] || 'User';
    const email = currentUser.email || '—';
    const initial = name.charAt(0).toUpperCase();
    const plan = credits > 100 ? 'Growth' : credits > 0 ? 'Starter' : 'Free';

    // Sidebar
    DOM.sidebarCreditsCount.textContent = credits;
    DOM.sidebarName.textContent = name;
    DOM.sidebarEmail.textContent = email;
    DOM.sidebarAvatar.textContent = initial;

    if (credits <= 5) {
      DOM.sidebarCredits.classList.add('low');
    } else {
      DOM.sidebarCredits.classList.remove('low');
    }

    // Overview
    DOM.ovCredits.textContent = credits;
    DOM.ovOptimizations.textContent = totalOpts;
    DOM.ovPlan.textContent = plan;
  }

  // ══════════════════════════════════════
  //  SIDEBAR NAVIGATION
  // ══════════════════════════════════════
  function setupNavigation() {
    const navItems = document.querySelectorAll('.nav-item[data-page]');
    const pages = document.querySelectorAll('.page-panel');

    navItems.forEach((item) => {
      item.addEventListener('click', () => {
        const page = item.dataset.page;

        // Update active nav
        navItems.forEach((n) => n.classList.remove('active'));
        item.classList.add('active');

        // Show target page
        pages.forEach((p) => p.classList.remove('active'));
        const target = document.getElementById('page-' + page);
        if (target) target.classList.add('active');

        // Update top bar
        DOM.topBarTitle.textContent = PAGE_TITLES[page] || 'Dashboard';
      });
    });

    // Quick action cards navigation
    document.querySelectorAll('[data-navigate]').forEach((card) => {
      card.addEventListener('click', () => {
        const page = card.dataset.navigate;
        const navBtn = document.querySelector(`.nav-item[data-page="${page}"]`);
        if (navBtn) navBtn.click();
      });
    });
  }

  // ══════════════════════════════════════
  //  CREDIT DEDUCTION (only on analysis)
  // ══════════════════════════════════════
  async function deductCredits(amount = 1) {
    const sbClient = window.supabaseClient;
    if (!sbClient || !currentUser) return false;

    const currentCredits = userProfile?.credits || 0;
    if (currentCredits < amount) {
      showToast('Not enough credits! Please upgrade your plan.', 'error');
      return false;
    }

    const { error } = await sbClient
      .from('profiles')
      .update({
        credits: currentCredits - amount,
        total_optimizations: (userProfile.total_optimizations || 0) + 1,
      })
      .eq('id', currentUser.id);

    if (error) {
      console.error('[DASHBOARD] Credit deduction failed:', error);
      showToast('Failed to deduct credits. Try again.', 'error');
      return false;
    }

    userProfile.credits = currentCredits - amount;
    userProfile.total_optimizations = (userProfile.total_optimizations || 0) + 1;
    updateUI();
    return true;
  }

  // ══════════════════════════════════════
  //  ANALYSIS RUNNERS
  // ══════════════════════════════════════

  // -- Shipping Optimizer (FREE — no credit deduction) --
  DOM.btnRunShipping.addEventListener('click', async () => {
    const product = document.getElementById('ship-product').value.trim();
    const weight = document.getElementById('ship-weight').value.trim();
    const pincode = document.getElementById('ship-pincode').value.trim();
    const cost = document.getElementById('ship-cost').value.trim();

    if (!product || !weight) {
      showToast('Please fill in product name and weight.', 'error');
      return;
    }

    DOM.btnRunShipping.disabled = true;
    DOM.btnRunShipping.textContent = '⏳ Analyzing...';

    // Simulate AI analysis (no credit deduction for shipping)
    await simulateDelay(1500);

    const weightNum = parseFloat(weight) || 250;
    const costNum = parseFloat(cost) || 45;
    const optimizedCost = Math.max(costNum * 0.7, 25).toFixed(0);
    const savings = (costNum - optimizedCost).toFixed(0);

    const result = `<h4>📊 Shipping Analysis Results</h4>
<strong>Product:</strong> ${escapeHtml(product)}
<strong>Weight:</strong> ${weightNum}g | <strong>Origin:</strong> ${pincode || 'N/A'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
<strong>Current Cost:</strong> ₹${costNum}
<strong>Optimized Cost:</strong> ₹${optimizedCost}
<strong>Potential Savings:</strong> ₹${savings} per order
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

<strong>💡 AI Recommendations:</strong>
• Consider lightweight packaging to reduce volumetric weight
• Negotiate with logistics partners for bulk shipping rates
• Use zone-based pricing for nearby delivery areas
• Bundle products to reduce per-unit shipping cost
• Set up a regional warehouse for high-demand areas`;

    DOM.resultShipping.innerHTML = result;
    DOM.resultShipping.classList.add('active');
    addHistoryEntry('Shipping Optimizer', product, 'Free');

    DOM.btnRunShipping.disabled = false;
    DOM.btnRunShipping.textContent = '🚀 Run Shipping Analysis — Free';
    showToast('Shipping analysis complete!', 'success');
  });

  // -- Profit Calculator (1 Credit) --
  DOM.btnRunProfit.addEventListener('click', async () => {
    const selling = parseFloat(document.getElementById('profit-selling').value) || 0;
    const cost = parseFloat(document.getElementById('profit-cost').value) || 0;
    const shipping = parseFloat(document.getElementById('profit-shipping').value) || 0;
    const commission = parseFloat(document.getElementById('profit-commission').value) || 15;
    const gst = parseFloat(document.getElementById('profit-gst').value) || 5;

    if (!selling || !cost) {
      showToast('Please enter selling price and product cost.', 'error');
      return;
    }

    DOM.btnRunProfit.disabled = true;
    DOM.btnRunProfit.textContent = '⏳ Calculating...';

    // Deduct credit
    const success = await deductCredits(1);
    if (!success) {
      DOM.btnRunProfit.disabled = false;
      DOM.btnRunProfit.textContent = '📊 Calculate Profit — 1 Credit';
      return;
    }

    await simulateDelay(1200);

    const commissionAmt = (selling * commission / 100).toFixed(2);
    const gstAmt = (selling * gst / 100).toFixed(2);
    const totalDeductions = (parseFloat(commissionAmt) + parseFloat(gstAmt) + shipping).toFixed(2);
    const netProfit = (selling - cost - parseFloat(totalDeductions)).toFixed(2);
    const margin = ((netProfit / selling) * 100).toFixed(1);
    const profitStatus = netProfit > 0 ? '✅ Profitable' : '❌ Loss';

    const result = `<h4>💰 Profit Breakdown</h4>
<strong>Selling Price:</strong> ₹${selling}
<strong>Product Cost:</strong> ₹${cost}

━━━ Deductions ━━━━━━━━━━━━━━━
<strong>Commission (${commission}%):</strong> -₹${commissionAmt}
<strong>GST (${gst}%):</strong> -₹${gstAmt}
<strong>Shipping:</strong> -₹${shipping}
<strong>Total Deductions:</strong> -₹${totalDeductions}

━━━ Result ━━━━━━━━━━━━━━━━━━━
<strong>Net Profit:</strong> ₹${netProfit} ${profitStatus}
<strong>Profit Margin:</strong> ${margin}%

<strong>💡 AI Recommendations:</strong>
${netProfit < 0 ? '• Consider increasing selling price by ₹' + Math.abs(Math.ceil(netProfit)) + ' to break even' : '• Good margin! Consider reinvesting in ads for higher sales volume'}
• Negotiate with suppliers for ₹${Math.ceil(cost * 0.1)} cost reduction
• Test bundled offers to increase average order value`;

    DOM.resultProfit.innerHTML = result;
    DOM.resultProfit.classList.add('active');
    addHistoryEntry('Profit Calculator', `₹${selling} product`, '1 Credit');

    DOM.btnRunProfit.disabled = false;
    DOM.btnRunProfit.textContent = '📊 Calculate Profit — 1 Credit';
    showToast('Profit analysis complete! 1 credit used.', 'success');
  });

  // -- Return Analyzer (1 Credit) --
  DOM.btnRunReturns.addEventListener('click', async () => {
    const category = document.getElementById('return-category').value;
    const orders = parseInt(document.getElementById('return-orders').value) || 0;
    const returns = parseInt(document.getElementById('return-returns').value) || 0;
    const reasons = document.getElementById('return-reasons').value.trim();

    if (!category || !orders) {
      showToast('Please select a category and enter order count.', 'error');
      return;
    }

    DOM.btnRunReturns.disabled = true;
    DOM.btnRunReturns.textContent = '⏳ Analyzing...';

    const success = await deductCredits(1);
    if (!success) {
      DOM.btnRunReturns.disabled = false;
      DOM.btnRunReturns.textContent = '🔍 Analyze Returns — 1 Credit';
      return;
    }

    await simulateDelay(1500);

    const returnRate = orders > 0 ? ((returns / orders) * 100).toFixed(1) : 0;
    const rateStatus = returnRate > 15 ? '🔴 High' : returnRate > 8 ? '🟡 Moderate' : '🟢 Low';
    const industryAvg = category === 'clothing' ? '12-18%' : category === 'electronics' ? '8-12%' : '10-15%';

    const result = `<h4>📦 Return Analysis Report</h4>
<strong>Category:</strong> ${escapeHtml(category)}
<strong>Period:</strong> Last 30 days

━━━ Metrics ━━━━━━━━━━━━━━━━━━
<strong>Total Orders:</strong> ${orders}
<strong>Total Returns:</strong> ${returns}
<strong>Return Rate:</strong> ${returnRate}% ${rateStatus}
<strong>Industry Average:</strong> ${industryAvg}

━━━ AI Insights ━━━━━━━━━━━━━━━
${reasons ? '<strong>Reported Reasons:</strong> ' + escapeHtml(reasons) + '\n' : ''}
<strong>💡 Recommendations to Reduce Returns:</strong>
• Add detailed size charts with actual measurements
• Use high-quality images from multiple angles
• Write accurate product descriptions (avoid exaggeration)
• Include fabric/material compositions clearly
• Add customer reviews & photos section
• Set up quality check before dispatch
• Consider video demonstrations for complex products

<strong>📈 Estimated Improvement:</strong>
Implementing these changes can reduce returns by 25-40%, saving approximately ₹${Math.ceil(returns * 120)} per month.`;

    DOM.resultReturns.innerHTML = result;
    DOM.resultReturns.classList.add('active');
    addHistoryEntry('Return Analyzer', `${category} — ${returnRate}% rate`, '1 Credit');

    DOM.btnRunReturns.disabled = false;
    DOM.btnRunReturns.textContent = '🔍 Analyze Returns — 1 Credit';
    showToast('Return analysis complete! 1 credit used.', 'success');
  });

  // -- Bulk Optimization (1 credit per product) --
  DOM.btnRunBulk.addEventListener('click', async () => {
    const productsRaw = document.getElementById('bulk-products').value.trim();
    const focus = document.getElementById('bulk-focus').value;

    if (!productsRaw) {
      showToast('Please paste at least one product title.', 'error');
      return;
    }

    const products = productsRaw.split('\n').map((p) => p.trim()).filter(Boolean);
    if (products.length === 0) {
      showToast('No valid product titles found.', 'error');
      return;
    }

    const creditCost = products.length;
    if ((userProfile?.credits || 0) < creditCost) {
      showToast(`Need ${creditCost} credits for ${products.length} products. You have ${userProfile?.credits || 0}.`, 'error');
      return;
    }

    DOM.btnRunBulk.disabled = true;
    DOM.btnRunBulk.textContent = `⏳ Optimizing ${products.length} products...`;

    const success = await deductCredits(creditCost);
    if (!success) {
      DOM.btnRunBulk.disabled = false;
      DOM.btnRunBulk.textContent = '⚡ Run Bulk Optimization — 1 Credit per product';
      return;
    }

    await simulateDelay(2000 + products.length * 300);

    let resultHTML = `<h4>⚡ Bulk Optimization Results</h4>
<strong>Products Processed:</strong> ${products.length}
<strong>Focus:</strong> ${focus.charAt(0).toUpperCase() + focus.slice(1)}
<strong>Credits Used:</strong> ${creditCost}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;

    products.forEach((product, i) => {
      const optimized = generateOptimizedTitle(product, focus);
      resultHTML += `\n<strong>${i + 1}. Original:</strong> ${escapeHtml(product)}\n   <strong>Optimized:</strong> ${escapeHtml(optimized)}\n`;
    });

    resultHTML += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
<strong>💡 Tip:</strong> Copy these optimized titles back to your Meesho listings for better search visibility.`;

    DOM.resultBulk.innerHTML = resultHTML;
    DOM.resultBulk.classList.add('active');
    addHistoryEntry('Bulk Optimization', `${products.length} products`, `${creditCost} Credits`);

    DOM.btnRunBulk.disabled = false;
    DOM.btnRunBulk.textContent = '⚡ Run Bulk Optimization — 1 Credit per product';
    showToast(`Bulk optimization complete! ${creditCost} credits used.`, 'success');
  });

  // ══════════════════════════════════════
  //  HISTORY
  // ══════════════════════════════════════
  function addHistoryEntry(tool, detail, cost) {
    const entry = {
      tool,
      detail,
      cost,
      time: new Date().toLocaleString(),
    };
    analysisHistory.unshift(entry);

    // Save to chrome.storage
    chrome.storage.local.set({ dashboardHistory: analysisHistory.slice(0, 50) });

    renderHistory();
    renderActivity();
  }

  function renderHistory() {
    if (analysisHistory.length === 0) return;

    let html = `<table class="dash-table">
      <thead><tr>
        <th>Tool</th><th>Detail</th><th>Cost</th><th>Time</th>
      </tr></thead><tbody>`;

    analysisHistory.forEach((entry) => {
      html += `<tr>
        <td><strong>${escapeHtml(entry.tool)}</strong></td>
        <td>${escapeHtml(entry.detail)}</td>
        <td><span class="status-badge ${entry.cost === 'Free' ? 'success' : 'pending'}">${escapeHtml(entry.cost)}</span></td>
        <td>${escapeHtml(entry.time)}</td>
      </tr>`;
    });

    html += '</tbody></table>';
    DOM.historyContent.innerHTML = html;
  }

  function renderActivity() {
    if (analysisHistory.length === 0) return;

    const recent = analysisHistory.slice(0, 5);
    const colors = ['blue', 'green', 'purple', 'orange'];

    let html = '';
    recent.forEach((entry, i) => {
      html += `<div class="activity-item">
        <div class="activity-dot ${colors[i % colors.length]}"></div>
        <div class="activity-text"><strong>${escapeHtml(entry.tool)}</strong> — ${escapeHtml(entry.detail)}</div>
        <div class="activity-time">${escapeHtml(entry.time)}</div>
      </div>`;
    });

    DOM.activityList.innerHTML = html;
  }

  async function loadHistory() {
    try {
      const stored = await chrome.storage.local.get(['dashboardHistory']);
      if (stored.dashboardHistory && Array.isArray(stored.dashboardHistory)) {
        analysisHistory = stored.dashboardHistory;
        renderHistory();
        renderActivity();
      }
    } catch (e) {
      console.warn('[DASHBOARD] Could not load history:', e);
    }
  }

  // ══════════════════════════════════════
  //  HELPERS
  // ══════════════════════════════════════
  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `dash-toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(40px)';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  function escapeHtml(str) {
    const el = document.createElement('span');
    el.textContent = str;
    return el.innerHTML;
  }

  function simulateDelay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function generateOptimizedTitle(title, focus) {
    // Simple title optimizer simulation
    const words = title.split(' ').filter(Boolean);
    const keywords = {
      titles: ['Premium', 'Latest', 'Trending', 'Best Selling'],
      seo: ['for Men', 'for Women', 'Online', 'India', 'Best Price'],
      pricing: ['Value Pack', 'Combo', 'Offer'],
      all: ['Premium Quality', 'Free Delivery', 'Trending'],
    };
    const additions = keywords[focus] || keywords.titles;
    const addition = additions[Math.floor(Math.random() * additions.length)];

    // Capitalize first letter of each word and add keyword
    const optimized = words
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');

    return `${optimized} | ${addition}`;
  }

  // ══════════════════════════════════════
  //  TOP BAR ACTIONS
  // ══════════════════════════════════════
  DOM.btnRefresh.addEventListener('click', async () => {
    DOM.btnRefresh.disabled = true;
    DOM.btnRefresh.textContent = '⏳ Refreshing...';

    await initSession();

    DOM.btnRefresh.disabled = false;
    DOM.btnRefresh.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg> Refresh`;
    showToast('Data refreshed!', 'success');
  });

  DOM.btnBuyCredits.addEventListener('click', () => {
    // Open popup pricing — send message to background
    chrome.runtime.sendMessage({ action: 'OPEN_POPUP' });
    showToast('Opening credits purchase…', 'info');
  });

  if (DOM.btnLoginRedirect) {
    DOM.btnLoginRedirect.addEventListener('click', () => {
      chrome.runtime.sendMessage({ action: 'OPEN_POPUP' });
    });
  }

  // ══════════════════════════════════════
  //  INIT
  // ══════════════════════════════════════
  setupNavigation();
  await loadHistory();
  await initSession();
})();
