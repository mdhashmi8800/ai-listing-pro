// UI Components for Credits Extension v2.0.0
// Growth-first model: Retention > Volume Usage > Conversion > High Pricing
const UI = {

    // Auth Modal HTML
    getAuthModalHTML: function (mode = 'login') {
        const isLogin = mode === 'login';
        return `
            <div class="modal-content auth-modal">
                <div class="modal-header">
                    <div class="logo-section">
                        <span class="logo-icon">🚀</span>
                        <div>
                            <h2>AI Shipping Optimizer</h2>
                            <p class="subtitle">${isLogin ? 'Welcome back!' : 'Get started free'}</p>
                        </div>
                    </div>
                    <button class="close-btn" id="close-modal">×</button>
                </div>

                <button class="btn btn-google btn-full" id="google-login-btn">
                    <svg width="18" height="18" viewBox="0 0 18 18" style="margin-right: 8px;">
                        <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"/>
                        <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"/>
                        <path fill="#FBBC05" d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707s.102-1.167.282-1.707V4.961H.957C.347 6.175 0 7.55 0 9s.348 2.825.957 4.039l3.007-2.332z"/>
                        <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.961L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/>
                    </svg>
                    Continue with Google
                </button>

                <div class="signup-bonus">
                    <span class="bonus-icon">🎁</span>
                    <span>Get <strong>${typeof CONFIG !== 'undefined' ? CONFIG.DEFAULT_SIGNUP_CREDITS : 15} FREE credits</strong> on signup + daily login bonus!</span>
                </div>

                <div style="text-align:center;margin-top:10px;">
                    <span style="font-size:11px;color:#64748B;">${typeof CONFIG !== 'undefined' ? CONFIG.POWERED_BY_LABEL : 'Powered by Ultra-Fast AI'}</span>
                </div>
            </div>
        `;
    },

    // Main Dashboard HTML
    getDashboardHTML: function (user, credits) {
        const creditsNum = typeof credits === 'number' ? credits : 0;
        const isLow = creditsNum <= (typeof CONFIG !== 'undefined' ? CONFIG.LOW_CREDITS_THRESHOLD : 5);

        return `
            <div class="modal-content dashboard-modal">
                <!-- Compact Header with Credits Counter -->
                <div class="compact-header">
                    <div class="header-left">
                        <span class="logo-icon">🚀</span>
                        <div>
                            <h2>AI Optimizer</h2>
                            <p class="subtitle">Reduce shipping costs</p>
                        </div>
                    </div>
                    <div class="header-right">
                        <div class="credits-badge ${isLow ? 'low-credits' : ''}">
                            <span class="credits-label-sm">Credits Left:</span>
                            <span class="credits-value" id="header-credits-count">${creditsNum}</span>
                            <button class="btn-add-credits" id="buy-credits-btn" title="Buy more credits">+</button>
                        </div>
                        <button class="close-btn" id="close-modal">×</button>
                    </div>
                </div>

                ${isLow ? `
                <!-- Low Credits Warning Banner -->
                <div class="low-credit-warning" id="low-credit-banner">
                    <span>⚠️</span>
                    <span>Running low. <button class="link-btn" id="upgrade-from-warning">Upgrade to continue</button> optimizing without interruption.</span>
                </div>
                ` : ''}

                <!-- User Info Compact -->
                <div class="user-bar-compact">
                    <div class="user-info">
                        <div class="user-avatar-sm">${user.name?.charAt(0).toUpperCase() || '👤'}</div>
                        <span class="user-name-sm">${user.name || user.email.split('@')[0]}</span>
                    </div>
                    <button class="btn-logout-sm" id="logout-btn">Logout</button>
                </div>

                <!-- Announcements -->
                <div id="announcements-area"></div>

                <!-- Post-optimization feedback (hidden by default) -->
                <div id="optimization-feedback" class="optimization-feedback hidden"></div>

                <!-- Promo Code Compact -->
                <div class="promo-section-compact">
                    <input type="text" id="promo-code" placeholder="🎁 Promo code" class="promo-input">
                    <button class="btn-promo" id="apply-promo-btn">Apply</button>
                </div>

                <!-- Category Selection -->
                <div class="section">
                    <label class="section-label">📁 Category</label>
                    <div class="category-search-container">
                        <input type="text" id="category-search" placeholder="🔍 Search category..." class="search-input">
                        <input type="hidden" id="category-select">
                        <span class="clear-btn" id="category-clear">×</span>
                        <div id="category-dropdown" class="dropdown"></div>
                    </div>
                    <div id="selected-category" class="selected-category hidden">
                        <span class="check-icon">✅</span>
                        <span id="selected-category-name"></span>
                    </div>
                </div>

                <!-- Upload Area -->
                <div id="upload-area" class="upload-area">
                    <input type="file" id="image-input" accept="image/*" hidden>
                    <div class="upload-icon">📁</div>
                    <p class="upload-text">Click or drag image here</p>
                    <p class="upload-hint">${typeof CONFIG !== 'undefined' ? CONFIG.POWERED_BY_LABEL : 'Powered by Ultra-Fast AI'} • ${typeof CONFIG !== 'undefined' ? CONFIG.CREDITS_PER_OPTIMIZATION : 1} credit per optimization</p>
                </div>

                <!-- Preview -->
                <div id="preview-box" class="preview-box hidden">
                    <img id="preview-img" class="preview-img">
                </div>

                <!-- Settings -->
                <div class="settings-row">
                    <div class="setting">
                        <label>🎯 Target</label>
                        <select id="target-shipping" class="select-input">
                            <option value="30">≤ ₹30</option>
                            <option value="40">≤ ₹40</option>
                            <option value="50">≤ ₹50</option>
                            <option value="60">≤ ₹60</option>
                            <option value="70">≤ ₹70</option>
                            <option value="80" selected>≤ ₹80</option>
                            <option value="90">≤ ₹90</option>
                            <option value="100">≤ ₹100</option>
                        </select>
                    </div>
                    <div class="setting">
                        <label>🔄 Attempts</label>
                        <select id="max-attempts" class="select-input">
                            <option value="50">50</option>
                            <option value="100" selected>100</option>
                            <option value="200">200</option>
                        </select>
                    </div>
                </div>

                <!-- Processing & Results Areas -->
                <div id="processing-area" class="hidden"></div>
                <div id="results-area" class="hidden"></div>

                <!-- History Section -->
                <div id="history-section" class="hidden">
                    <div class="section-label" style="display:flex;justify-content:space-between;align-items:center;">
                        <span>📜 Recent Activity</span>
                        <button class="btn-close-history" id="close-history-btn">×</button>
                    </div>
                    <div id="history-list" class="history-list"></div>
                </div>

                <!-- Footer -->
                <div class="modal-footer">
                    <button class="btn-history" id="show-history-btn">📜 History</button>
                    <span class="footer-text">Current Shipping: <span id="current-shipping" class="highlight">Detecting...</span></span>
                </div>
            </div>
        `;
    },

    // Buy Credits Modal — New Pricing Plans (NO Unlimited)
    getBuyCreditsHTML: function () {
        const starter = CONFIG.PRICING.STARTER;
        const growth = CONFIG.PRICING.GROWTH;
        const pro = CONFIG.PRICING.PRO;

        const checkSvg = `<svg class="feature-icon" width="16" height="16" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/></svg>`;

        const renderCard = (plan, extraClass = '') => {
            const badgeHTML = plan.badge
                ? `<div class="plan-badge ${plan.popular ? 'badge-popular' : 'badge-power'}">${plan.badge}</div>`
                : '';
            const priceLabel = plan.oneTime ? 'One-time' : '/month · Auto-renew';
            return `
                <div class="pricing-card-modern ${plan.popular ? 'featured' : ''} ${extraClass}">
                    ${badgeHTML}
                    <div class="card-icon-badge">${plan.popular ? '🚀' : plan.oneTime ? '⚡' : '💎'}</div>
                    <h3 class="card-title">${plan.name}</h3>
                    <div class="card-tagline">${plan.tagline}</div>
                    <div class="card-price-section">
                        <div class="card-price-main">
                            <span class="currency">₹</span>
                            <span class="amount">${plan.price}</span>
                        </div>
                        <div class="card-price-sub">${priceLabel}</div>
                    </div>
                    <div class="card-features">
                        ${plan.features.map(f => `<div class="feature-item">${checkSvg}<span>${f}</span></div>`).join('')}
                    </div>
                    <button class="card-btn ${plan.popular ? 'featured-btn' : 'standard-btn'} buy-btn" data-plan="${plan.id}">
                        ${plan.popular ? 'Get Growth Plan' : plan.oneTime ? 'Get Started' : 'Subscribe Pro'}
                    </button>
                </div>
            `;
        };

        return `
            <div class="modal-content buy-modal-modern">
                <button class="close-btn-modern" id="close-buy-modal">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>

                <div class="buy-modal-header">
                    <div class="header-icon-wrapper">
                        <div class="header-icon">💎</div>
                    </div>
                    <h2 class="buy-modal-title">Choose Your Plan</h2>
                    <p class="buy-modal-subtitle">Affordable pricing. No hidden limits. Powered by Ultra-Fast AI.</p>
                </div>

                <!-- Free plan reminder -->
                <div class="free-plan-reminder">
                    <span>🎁</span>
                    <span>Free plan: <strong>${CONFIG.DEFAULT_SIGNUP_CREDITS} credits on signup</strong></span>
                </div>

                <div class="pricing-grid">
                    ${renderCard(starter)}
                    ${renderCard(growth, 'popular-card')}
                    ${renderCard(pro)}
                </div>

                <div class="payment-footer">
                    <div class="payment-icon">💬</div>
                    <div class="payment-text">
                        <div class="payment-title">Quick &amp; Easy Payment via Razorpay</div>
                        <div class="payment-subtitle">Credits added instantly after verified payment</div>
                    </div>
                </div>
            </div>
        `;
    },

    // Processing HTML
    getProcessingHTML: function (attempt, max, target, best, elapsed, isPaused) {
        const pct = Math.round((attempt / max) * 100);
        const mins = Math.floor(elapsed / 60);
        const secs = elapsed % 60;
        const timeStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

        return `
            <div class="processing-container">
                <div class="processing-icon">${isPaused ? '⏸️' : '🎯'}</div>
                <h3 class="processing-title ${isPaused ? 'paused' : ''}">${isPaused ? 'Paused' : 'Finding Best Shipping'}</h3>
                <p class="processing-target">Target: ≤ ₹${target}</p>
                <p class="processing-progress">Attempt: ${attempt} / ${max}</p>
                <p class="processing-time">⏱️ ${timeStr}</p>

                ${best !== null && best !== undefined ? `
                    <div class="best-found ${best <= target ? 'target-reached' : ''}">
                        <span class="best-label">Best Found</span>
                        <span class="best-value">₹${best}</span>
                        ${best <= target ? '<span class="target-badge">✅ Target Reached!</span>' : ''}
                    </div>
                ` : attempt > 0 ? `
                    <div class="searching">
                        <span class="search-icon">🔍</span>
                        <span>Searching for results...</span>
                    </div>
                ` : `
                    <div class="searching">
                        <span class="search-icon">⏳</span>
                        <span>Starting optimization...</span>
                    </div>
                `}

                <div class="progress-bar">
                    <div class="progress-fill ${isPaused ? 'paused' : ''}" style="width: ${pct}%"></div>
                </div>
                <span class="progress-pct">${pct}%</span>

                <div class="control-buttons">
                    <button class="btn btn-warning" id="pause-btn">${isPaused ? '▶️ Resume' : '⏸️ Pause'}</button>
                    <button class="btn btn-danger" id="stop-btn">⏹️ Stop</button>
                </div>
            </div>
        `;
    },

    // Results HTML with post-optimization feedback
    getResultsHTML: function (results, totalOptimizations) {
        if (!results || results.length === 0) {
            return `
                <div class="no-results">
                    <span class="no-results-icon">😕</span>
                    <p>No results found</p>
                    <button class="btn btn-primary" id="retry-btn">🔄 Try Again</button>
                </div>
            `;
        }

        const total = totalOptimizations || 1;
        const milestone = total > 0 && total % 10 === 0;

        let html = `
            <div class="results-container">
                <!-- Post-optimization UX Feedback -->
                <div class="post-opt-feedback">
                    <div class="feedback-item">⚡ Optimized in under 1 second</div>
                    <div class="feedback-item">📊 You've optimized ${total} listing${total !== 1 ? 's' : ''} so far</div>
                    <div class="feedback-item">🤖 You saved time using AI automation</div>
                    ${milestone ? `<div class="feedback-milestone">🎉 You're getting faster. AI has optimized ${total} listings for you!</div>` : ''}
                </div>

                <div class="results-header">
                    <h3>✅ ${results.length} Results Found</h3>
                    <button class="btn btn-sm btn-outline" id="new-search-btn">🔄 New Search</button>
                </div>
                <div class="results-list">
        `;

        results.slice(0, 10).forEach((r, i) => {
            const isBest = i === 0;
            html += `
                <div class="result-item ${isBest ? 'best' : ''}">
                    <img src="${r.imageUrl}" class="result-img">
                    <div class="result-info">
                        <div class="result-price">
                            <span class="price-value">₹${r.shippingCost}</span>
                            ${isBest ? '<span class="best-tag">BEST</span>' : ''}
                        </div>
                        <span class="result-name">${r.name}</span>
                    </div>
                    <div class="result-actions">
                        <button class="btn btn-sm btn-primary apply-btn" data-index="${i}">Apply</button>
                        <button class="btn btn-sm btn-outline download-btn" data-index="${i}">⬇</button>
                    </div>
                </div>
            `;
        });

        html += `
                </div>
                <div class="results-footer">
                    <button class="btn btn-success btn-full" id="apply-best-btn">✨ Apply Best (₹${results[0]?.shippingCost})</button>
                </div>
            </div>
        `;

        return html;
    },

    // Show optimization feedback in dashboard (keeps visible between runs)
    showOptimizationFeedback: function (creditsRemaining, totalOptimizations) {
        const area = document.getElementById('optimization-feedback');
        if (!area) return;

        const milestone = totalOptimizations > 0 && totalOptimizations % 10 === 0;
        area.innerHTML = `
            <div class="opt-feedback-bar">
                <span>⚡ Optimized in under 1 second</span>
                <span>•</span>
                <span>You've optimized <strong>${totalOptimizations}</strong> listings so far</span>
                <span>•</span>
                <span>You saved time using AI automation</span>
            </div>
            ${milestone ? `<div class="opt-milestone">🎉 You're getting faster. AI has optimized ${totalOptimizations} listings for you!</div>` : ''}
        `;
        area.classList.remove('hidden');

        // Update header credit counter
        const headerCount = document.getElementById('header-credits-count');
        if (headerCount) headerCount.innerHTML = creditsRemaining;

        // Show low credit warning if needed
        const threshold = typeof CONFIG !== 'undefined' ? CONFIG.LOW_CREDITS_THRESHOLD : 5;
        const banner = document.getElementById('low-credit-banner');
        if (creditsRemaining <= threshold && !banner) {
            const header = document.querySelector('.compact-header');
            if (header) {
                const warn = document.createElement('div');
                warn.className = 'low-credit-warning';
                warn.id = 'low-credit-banner';
                warn.innerHTML = `<span>⚠️</span><span>Running low. <button class="link-btn" id="upgrade-from-warning">Upgrade to continue</button> optimizing without interruption.</span>`;
                header.insertAdjacentElement('afterend', warn);
            }
        }
    },

    // Render history items
    renderHistory: function (transactions) {
        if (!transactions || transactions.length === 0) {
            return '<div style="text-align:center;padding:16px;color:var(--text-dim);font-size:13px;">No activity yet</div>';
        }
        const esc = typeof escapeHTML === 'function' ? escapeHTML : (s => s);
        return transactions.map(t => {
            const delta = typeof t.delta === 'number' ? t.delta : (typeof t.amount === 'number' ? t.amount : 0);
            const reason = t.reason || t.type || 'unknown';
            const isPositive = delta >= 0;
            const icon = reason === 'purchase' || reason === 'topup' ? '💰'
                : reason === 'usage' || reason === 'ai_run' ? '🔄'
                    : reason === 'promo' ? '🎁'
                        : reason === 'bonus' || reason === 'signup' ? '⭐'
                            : reason === 'daily' || reason === 'daily_login' ? '🌅'
                                : reason === 'refund' ? '↩️' : '📋';
            const ago = this.timeAgo(t.created_at);
            const desc = esc(String(t.meta?.description || reason));
            return `<div class="history-item">
                <span class="history-icon">${icon}</span>
                <div class="history-info">
                    <span class="history-desc">${desc}</span>
                    <span class="history-time">${ago}</span>
                </div>
                <span class="history-amount ${isPositive ? 'positive' : 'negative'}">${isPositive ? '+' : ''}${delta}</span>
            </div>`;
        }).join('');
    },

    timeAgo: function (date) {
        const s = Math.floor((Date.now() - new Date(date)) / 1000);
        if (s < 60) return 'just now';
        if (s < 3600) return Math.floor(s / 60) + 'm ago';
        if (s < 86400) return Math.floor(s / 3600) + 'h ago';
        if (s < 604800) return Math.floor(s / 86400) + 'd ago';
        return new Date(date).toLocaleDateString();
    },

    // Show notification toast
    showNotification: function (message, type = 'info') {
        const existing = document.querySelector('.notification');
        if (existing) existing.remove();

        const notif = document.createElement('div');
        notif.className = `notification ${type}`;
        notif.textContent = message;
        document.body.appendChild(notif);

        setTimeout(() => notif.classList.add('show'), 10);
        setTimeout(() => {
            notif.classList.remove('show');
            setTimeout(() => notif.remove(), 300);
        }, 4000);
    },

    // Daily bonus welcome toast
    showDailyBonusToast: function (bonusAmount) {
        this.showNotification(`🌅 Welcome back! +${bonusAmount} daily bonus credits added.`, 'success');
    },

    // First purchase reward toast
    showFirstPurchaseReward: function (bonusAmount) {
        this.showNotification(`🎉 Thank you for trusting us! +${bonusAmount} bonus credits added.`, 'success');
    }
};

window.UI = UI;
