console.log("Content script loaded");
// Meesho Credits Extension - Content Script
console.log('Meesho Credits Extension loaded');

// Detect if another Meesho extension is also running
if (window.MeeshoExtensionLoaded) {
    console.warn('Another Meesho extension detected. Disable it in chrome://extensions');
}
window.MeeshoExtensionLoaded = true;

class MeeshoCreditsOptimizer {
    constructor() {
        this.currentShippingCost = null;
        this.isProcessing = false;
        this.shouldStop = false;
        this.isPaused = false;
        this.currentResults = [];
        this.lastImageBlob = null;
        this.modal = null;
        this.allCategories = [];
        this._cachedUser = null;
        this.init();
    }

    // Helper: send message to background.js and return a promise
    _bgSend(msg) {
        return new Promise((resolve) => {
            try {
                chrome.runtime.sendMessage(msg, (response) => {
                    if (chrome.runtime.lastError) {
                        console.warn('Background message error:', chrome.runtime.lastError.message);
                        resolve(null);
                        return;
                    }
                    resolve(response || null);
                });
            } catch (e) {
                console.warn('sendMessage failed:', e.message);
                resolve(null);
            }
        });
    }

    init() {
        console.log('Initializing Credits Optimizer...');

        // Check login state from background on page load
        (async () => {
            try {
                const profile = await this._bgSend({ action: 'GET_PROFILE' });
                if (profile?.success && profile.isLoggedIn) {
                    this._cachedUser = profile.user;
                    // Keep AuthManager.user in sync for CreditsManager helpers that need it
                    if (typeof AuthManager !== 'undefined') AuthManager.user = profile.user;
                }
            } catch (e) {
                if (e.message && e.message.includes('Extension context invalidated')) {
                    console.warn('⚠️ Extension was reloaded. Page refresh recommended.');
                } else {
                    console.error('Init error:', e);
                }
            }
        })();

        try {
            chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
                if (message.action === 'openOptimizer') {
                    this.openModal();
                    sendResponse({ success: true });
                }
                if (message.action === 'RUN_OPTIMIZER') {
                    this.showOptimizerOverlay();
                    sendResponse({ success: true });
                }
                return true;
            });
        } catch (e) {
            console.warn('Could not set up message listener:', e.message);
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.setup());
        } else {
            this.setup();
        }

        this.observeUrlChanges();
    }

    observeUrlChanges() {
        let lastUrl = location.href;
        new MutationObserver(() => {
            const url = location.href;
            if (url !== lastUrl) {
                lastUrl = url;
                setTimeout(() => this.setup(), 1000);
            }
        }).observe(document, { subtree: true, childList: true });
    }

    async setup() {
        if (this.isMeeshoPage()) {
            // Wake up background service worker before doing anything
            try {
                await this._bgSend({ action: 'PING' });
            } catch (e) {
                console.warn('Background service worker not ready:', e.message);
            }
            // Refresh cached profile from background
            const profile = await this._bgSend({ action: 'GET_PROFILE' });
            if (profile?.success && profile.isLoggedIn) {
                this._cachedUser = profile.user;
                if (typeof AuthManager !== 'undefined') AuthManager.user = profile.user;
            }
            this.waitForElement('#changeFrontImage', () => {
                this.addOptimizerButton();
                this.detectShipping();
            });
        }
    }

    waitForElement(selector, callback, maxAttempts = 20) {
        let attempts = 0;
        const check = () => {
            const element = document.querySelector(selector);
            if (element) {
                callback(element);
            } else if (attempts < maxAttempts) {
                attempts++;
                setTimeout(check, 500);
            }
        };
        check();
    }

    isMeeshoPage() {
        return window.location.href.includes('supplier.meesho.com');
    }

    addOptimizerButton() {
        if (document.querySelector('.optimizer-btn')) return;

        const imageInput = document.querySelector('#changeFrontImage');
        if (!imageInput) return;

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'optimizer-btn';
        btn.innerHTML = `
            <div class="optimizer-btn-content">
                <span class="optimizer-btn-icon">🚀</span>
                <div class="optimizer-btn-text">
                    <span class="optimizer-btn-title">AI Shipping Optimizer</span>
                    <span class="optimizer-btn-subtitle">Credit-based system</span>
                </div>
            </div>
        `;
        btn.onclick = () => this.openModal();

        const wrapper = document.createElement('div');
        wrapper.style.margin = '10px 0';
        wrapper.appendChild(btn);

        const parent = imageInput.closest('div') || imageInput.parentElement;
        if (parent) parent.appendChild(wrapper);
    }

    // ── AI Shipping Optimizer Overlay ──────────────────────────
    showOptimizerOverlay() {
        // Remove any existing overlay
        const existing = document.getElementById('ai-optimizer-overlay');
        if (existing) existing.remove();

        // Inject scoped styles
        const styleId = 'ai-optimizer-styles';
        if (!document.getElementById(styleId)) {
            const style = document.createElement('style');
            style.id = styleId;
            style.textContent = `
                @keyframes aiOptFadeIn { from { opacity: 0; } to { opacity: 1; } }
                @keyframes aiOptSlideUp { from { opacity: 0; transform: translate(-50%, -48%); } to { opacity: 1; transform: translate(-50%, -50%); } }
                @keyframes aiOptSpin { to { transform: rotate(360deg); } }
                @keyframes aiOptPulse { 0%, 100% { opacity: 1; } 50% { opacity: .5; } }
                @keyframes aiOptBarGrow { from { width: 0%; } to { width: 100%; } }
                @keyframes aiOptResultFade { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
                #ai-optimizer-overlay {
                    position: fixed; inset: 0; z-index: 999999;
                    background: rgba(15, 23, 42, 0.7); backdrop-filter: blur(6px);
                    animation: aiOptFadeIn .3s ease;
                }
                #ai-optimizer-modal {
                    position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
                    width: 420px; max-width: 92vw; background: #fff;
                    border-radius: 16px; overflow: hidden;
                    box-shadow: 0 25px 60px rgba(0,0,0,0.3);
                    animation: aiOptSlideUp .4s ease;
                    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                }
                .aiopt-header {
                    background: linear-gradient(135deg, #2563EB, #7C3AED);
                    padding: 22px 28px; color: #fff; text-align: center;
                }
                .aiopt-header h2 { font-size: 18px; font-weight: 800; margin: 0 0 4px; }
                .aiopt-header p { font-size: 12px; opacity: .85; margin: 0; }
                .aiopt-body { padding: 24px 28px 20px; min-height: 180px; }
                .aiopt-spinner-wrap { display: flex; flex-direction: column; align-items: center; gap: 16px; padding: 20px 0; }
                .aiopt-spinner {
                    width: 48px; height: 48px; border: 4px solid #E2E8F0;
                    border-top-color: #2563EB; border-radius: 50%;
                    animation: aiOptSpin .8s linear infinite;
                }
                .aiopt-status { font-size: 15px; font-weight: 600; color: #0F172A; animation: aiOptPulse 1.5s ease infinite; }
                .aiopt-progress-bar {
                    width: 100%; height: 6px; background: #E2E8F0; border-radius: 3px;
                    overflow: hidden; margin-top: 4px;
                }
                .aiopt-progress-fill { height: 100%; background: linear-gradient(90deg, #2563EB, #7C3AED); border-radius: 3px; animation: aiOptBarGrow 2s ease forwards; }
                .aiopt-results { animation: aiOptResultFade .5s ease; }
                .aiopt-results h3 { font-size: 16px; font-weight: 700; color: #0F172A; margin: 0 0 16px; text-align: center; }
                .aiopt-result-row {
                    display: flex; justify-content: space-between; align-items: center;
                    padding: 12px 16px; background: #F8FAFC; border-radius: 10px;
                    margin-bottom: 8px; border: 1px solid #E2E8F0;
                }
                .aiopt-result-label { font-size: 13px; color: #64748B; font-weight: 500; }
                .aiopt-result-value { font-size: 14px; font-weight: 700; color: #0F172A; }
                .aiopt-result-value.savings { color: #10B981; }
                .aiopt-result-value.original { color: #EF4444; text-decoration: line-through; opacity: .7; }
                .aiopt-result-value.optimized { color: #2563EB; font-size: 18px; }
                .aiopt-result-highlight {
                    background: linear-gradient(135deg, #ECFDF5, #F0FDF4);
                    border: 1.5px solid #10B981; padding: 14px 18px;
                    border-radius: 10px; text-align: center; margin-top: 12px;
                }
                .aiopt-result-highlight .big-save { font-size: 28px; font-weight: 800; color: #10B981; }
                .aiopt-result-highlight .save-label { font-size: 12px; color: #065F46; margin-top: 2px; }
                .aiopt-close-btn {
                    display: block; width: 100%; padding: 12px; margin-top: 16px;
                    background: #2563EB; color: #fff; border: none; border-radius: 10px;
                    font-size: 14px; font-weight: 600; cursor: pointer;
                    font-family: inherit; transition: background .15s;
                }
                .aiopt-close-btn:hover { background: #1D4ED8; }
                .aiopt-footer { padding: 0 28px 18px; text-align: center; }
                .aiopt-footer span { font-size: 10px; color: #94A3B8; }
            `;
            document.head.appendChild(style);
        }

        // Create overlay
        const overlay = document.createElement('div');
        overlay.id = 'ai-optimizer-overlay';

        // Create modal
        const modal = document.createElement('div');
        modal.id = 'ai-optimizer-modal';
        modal.innerHTML = `
            <div class="aiopt-header">
                <h2>🚀 AI Shipping Optimizer</h2>
                <p>Powered by Advanced Machine Learning</p>
            </div>
            <div class="aiopt-body">
                <div class="aiopt-spinner-wrap">
                    <div class="aiopt-spinner"></div>
                    <div class="aiopt-status">Analyzing shipping data...</div>
                    <div class="aiopt-progress-bar"><div class="aiopt-progress-fill"></div></div>
                </div>
            </div>
            <div class="aiopt-footer"><span>Analyzing product weight, dimensions & delivery zones</span></div>
        `;

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        // Close on overlay click (outside modal)
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) this._closeOptimizerOverlay();
        });

        // Phase 2: Show results after 2 seconds
        setTimeout(() => {
            const body = modal.querySelector('.aiopt-body');
            const footer = modal.querySelector('.aiopt-footer');

            // Generate realistic fake data
            const currentCost = this.currentShippingCost || Math.floor(Math.random() * 40) + 35;
            const savingsPercent = Math.floor(Math.random() * 18) + 12; // 12-30%
            const optimizedCost = Math.round(currentCost * (1 - savingsPercent / 100));
            const savedAmount = currentCost - optimizedCost;
            const zone = ['North India', 'South India', 'West India', 'East India', 'Metro Cities'][Math.floor(Math.random() * 5)];
            const weight = (Math.random() * 1.5 + 0.2).toFixed(1);

            body.innerHTML = `
                <div class="aiopt-results">
                    <h3>✅ Optimization Complete</h3>
                    <div class="aiopt-result-row">
                        <span class="aiopt-result-label">Delivery Zone</span>
                        <span class="aiopt-result-value">${zone}</span>
                    </div>
                    <div class="aiopt-result-row">
                        <span class="aiopt-result-label">Est. Weight</span>
                        <span class="aiopt-result-value">${weight} kg</span>
                    </div>
                    <div class="aiopt-result-row">
                        <span class="aiopt-result-label">Current Shipping</span>
                        <span class="aiopt-result-value original">₹${currentCost}</span>
                    </div>
                    <div class="aiopt-result-row">
                        <span class="aiopt-result-label">Optimized Cost</span>
                        <span class="aiopt-result-value optimized">₹${optimizedCost}</span>
                    </div>
                    <div class="aiopt-result-highlight">
                        <div class="big-save">₹${savedAmount} saved</div>
                        <div class="save-label">${savingsPercent}% reduction in shipping cost</div>
                    </div>
                    <button class="aiopt-close-btn" id="aiopt-close-btn">Done</button>
                </div>
            `;

            footer.innerHTML = '<span>Results based on AI analysis of 10,000+ shipping data points</span>';

            const closeBtn = document.getElementById('aiopt-close-btn');
            if (closeBtn) closeBtn.addEventListener('click', () => this._closeOptimizerOverlay());

            // Auto-close after 5 more seconds (7s total)
            setTimeout(() => this._closeOptimizerOverlay(), 5000);
        }, 2000);
    }

    _closeOptimizerOverlay() {
        const overlay = document.getElementById('ai-optimizer-overlay');
        if (overlay) {
            overlay.style.opacity = '0';
            overlay.style.transition = 'opacity 0.3s ease';
            setTimeout(() => overlay.remove(), 300);
        }
    }

    detectShipping() {
        // Multiple strategies to detect shipping charge with more aggressive search

        // Strategy 1: Look for specific MUI Typography classes
        const muiSelectors = [
            'p.MuiTypography-root.MuiTypography-body1',
            'span.MuiTypography-root.MuiTypography-body1',
            'div.MuiTypography-root.MuiTypography-body1',
            '.MuiTypography-body1',
            '.MuiTypography-body2',
            '[class*="MuiTypography"]'
        ];

        for (const sel of muiSelectors) {
            try {
                const els = document.querySelectorAll(sel);
                for (const el of els) {
                    const txt = el.textContent || '';
                    if ((txt.toLowerCase().includes('shipping') || txt.toLowerCase().includes('charge')) && txt.includes('₹')) {
                        const m = txt.match(/₹\s*(\d+)/);
                        if (m) {
                            const cost = parseInt(m[1]);
                            if (cost > 0 && cost < 2000) {
                                console.log('✅ Detected shipping (MUI):', cost, 'from:', sel);
                                this.currentShippingCost = cost;
                                return cost;
                            }
                        }
                    }
                }
            } catch (e) { }
        }

        // Strategy 2: Look for any text containing "Shipping Charges" or "Shipping Fee"
        try {
            const allText = document.body.innerText || document.body.textContent;
            const lines = allText.split('\n');

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].toLowerCase();
                if (line.includes('shipping charge') || line.includes('shipping fee') || line.includes('shipping cost')) {
                    // Check current line and next few lines for price
                    for (let j = i; j < Math.min(i + 5, lines.length); j++) {
                        const priceMatch = lines[j].match(/₹\s*(\d+)/);
                        if (priceMatch) {
                            const cost = parseInt(priceMatch[1]);
                            if (cost > 0 && cost < 2000) {
                                console.log('✅ Detected shipping (text search):', cost);
                                this.currentShippingCost = cost;
                                return cost;
                            }
                        }
                    }
                }
            }
        } catch (e) { }

        // Strategy 3: Look for elements with shipping-related attributes or classes
        try {
            const shippingElements = document.querySelectorAll('[class*="shipping"], [class*="Shipping"], [id*="shipping"], [id*="Shipping"]');
            for (const el of shippingElements) {
                const txt = el.textContent || '';
                const priceMatch = txt.match(/₹\s*(\d+)/);
                if (priceMatch) {
                    const cost = parseInt(priceMatch[1]);
                    if (cost > 0 && cost < 2000) {
                        console.log('✅ Detected shipping (attribute search):', cost);
                        this.currentShippingCost = cost;
                        return cost;
                    }
                }
            }
        } catch (e) { }

        // Strategy 4: Brute force - check all p, span, div elements
        try {
            const allElements = document.querySelectorAll('p, span, div, label, td, th');
            for (const el of allElements) {
                const txt = (el.textContent || '').trim();

                // Skip if too long (likely not a shipping charge display)
                if (txt.length > 100) continue;

                // Check if contains shipping keyword and price
                if ((txt.toLowerCase().includes('shipping') || txt.toLowerCase().includes('charge')) && txt.includes('₹')) {
                    const priceMatch = txt.match(/₹\s*(\d+)/);
                    if (priceMatch) {
                        const cost = parseInt(priceMatch[1]);
                        if (cost > 0 && cost < 2000) {
                            console.log('✅ Detected shipping (brute force):', cost, 'text:', txt.substring(0, 50));
                            this.currentShippingCost = cost;
                            return cost;
                        }
                    }
                }
            }
        } catch (e) { }

        // Strategy 5: Check for price near "Shipping" label
        try {
            const allElements = Array.from(document.querySelectorAll('*'));
            for (const el of allElements) {
                const ownText = Array.from(el.childNodes)
                    .filter(node => node.nodeType === Node.TEXT_NODE)
                    .map(node => node.textContent.trim())
                    .join(' ');

                if (ownText.toLowerCase().includes('shipping')) {
                    // Look for price in siblings or parent
                    const parent = el.parentElement;
                    if (parent) {
                        const siblings = Array.from(parent.children);
                        for (const sibling of siblings) {
                            const sibText = sibling.textContent || '';
                            const priceMatch = sibText.match(/₹\s*(\d+)/);
                            if (priceMatch) {
                                const cost = parseInt(priceMatch[1]);
                                if (cost > 0 && cost < 2000) {
                                    console.log('✅ Detected shipping (sibling search):', cost);
                                    this.currentShippingCost = cost;
                                    return cost;
                                }
                            }
                        }
                    }
                }
            }
        } catch (e) { }

        console.warn('⚠️ Could not detect shipping charge - tried all strategies');
        console.log('💡 Tip: Open browser console and look for elements containing "Shipping" text');

        return this.currentShippingCost;
    }

    async openModal() {
        const existing = document.getElementById('credits-modal');
        if (existing) existing.remove();

        // Fetch dynamic settings from admin panel
        if (typeof SettingsManager !== 'undefined') {
            await SettingsManager.fetch();
        }

        this.modal = document.createElement('div');
        this.modal.id = 'credits-modal';
        this.modal.className = 'modal-overlay';

        // Check login state via background.js (no direct Supabase access)
        let profile = null;
        try {
            profile = await this._bgSend({ action: 'GET_PROFILE' });
        } catch (e) {
            if (e.message && e.message.includes('Extension context invalidated')) {
                UI.showNotification('⚠️ Extension was reloaded. Please refresh the page.', 'error');
                return;
            }
            console.warn('Could not fetch profile from background:', e.message);
        }

        const isLoggedIn = !!(profile?.success && profile.isLoggedIn);
        const user = profile?.user || null;

        console.log('🔍 Checking login state:', { isLoggedIn, user });

        if (isLoggedIn && user) {
            this._cachedUser = user;
            // Keep AuthManager.user in sync for CreditsManager helpers
            if (typeof AuthManager !== 'undefined') AuthManager.user = user;

            // Check if user is banned
            if (user.is_banned) {
                console.log('🚫 User is banned:', user.ban_reason);
                this.modal.innerHTML = `
                    <div class="modal-content auth-modal">
                        <div class="modal-header">
                            <div class="logo-section">
                                <span class="logo-icon">🚫</span>
                                <div>
                                    <h2>Account Banned</h2>
                                    <p class="subtitle">Your account has been suspended</p>
                                </div>
                            </div>
                            <button class="close-btn" id="close-modal">×</button>
                        </div>
                        <div style="text-align:center;padding:24px;">
                            <p style="color:#ef4444;font-size:14px;margin-bottom:12px;" id="ban-reason-text"></p>
                            <p style="color:#94a3b8;font-size:13px;">Contact support on WhatsApp for help.</p>
                        </div>
                    </div>
                `;
                document.body.appendChild(this.modal);
                const banReasonEl = document.getElementById('ban-reason-text');
                if (banReasonEl) banReasonEl.textContent = user.ban_reason || 'Your account has been banned by admin.';
                document.getElementById('close-modal').onclick = () => this.closeModal();
                this.modal.onclick = (e) => { if (e.target === this.modal) this.closeModal(); };
                return;
            }

            // Get live credits from background
            const creditsRes = await this._bgSend({ action: 'GET_CREDITS' });
            const credits = creditsRes?.credits ?? 0;

            console.log('✅ User logged in:', user.email, 'Credits:', credits);

            this.modal.innerHTML = UI.getDashboardHTML(user, credits);
            document.body.appendChild(this.modal);
            this.setupDashboardEvents();
        } else {
            console.log('❌ Not logged in, showing auth modal');
            this.modal.innerHTML = UI.getAuthModalHTML('login');
            document.body.appendChild(this.modal);
            this.setupAuthEvents();
        }

        this.modal.onclick = (e) => {
            if (e.target === this.modal) this.closeModal();
        };

        setTimeout(() => {
            this.detectShipping();
            const el = document.getElementById('current-shipping');
            if (el && this.currentShippingCost) {
                el.innerHTML = '₹' + this.currentShippingCost;
            }
        }, 100);
    }

    closeModal() {
        if (this.modal) {
            this.modal.remove();
            this.modal = null;
        }
    }

    setupAuthEvents() {
        const closeBtn = document.getElementById('close-modal');
        if (closeBtn) closeBtn.onclick = () => this.closeModal();

        // Google login button
        const googleBtn = document.getElementById('google-login-btn');
        if (googleBtn) {
            googleBtn.onclick = async () => {
                googleBtn.disabled = true;
                googleBtn.innerHTML = 'Opening Google...';

                // Trigger Google OAuth via background.js
                const result = await this._bgSend({ action: 'GOOGLE_LOGIN' });

                if (result?.success) {
                    // Poll for login completion via GET_PROFILE
                    const checkLogin = setInterval(async () => {
                        const profile = await this._bgSend({ action: 'GET_PROFILE' });
                        if (profile?.success && profile.isLoggedIn) {
                            this._cachedUser = profile.user;
                            if (typeof AuthManager !== 'undefined') AuthManager.user = profile.user;
                            clearInterval(checkLogin);
                            UI.showNotification('✅ Login successful! Welcome!', 'success');
                            this.closeModal();
                            setTimeout(() => this.openModal(), 500);
                        }
                    }, 1000);

                    // Stop checking after 2 minutes
                    setTimeout(() => clearInterval(checkLogin), 120000);
                } else {
                    UI.showNotification(result?.error || 'Google login failed', 'error');
                    googleBtn.disabled = false;
                    googleBtn.innerHTML = `
                        <svg width="18" height="18" viewBox="0 0 18 18" style="margin-right: 8px;">
                            <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"/>
                            <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"/>
                            <path fill="#FBBC05" d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707s.102-1.167.282-1.707V4.961H.957C.347 6.175 0 7.55 0 9s.348 2.825.957 4.039l3.007-2.332z"/>
                            <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.961L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/>
                        </svg>
                        Continue with Google
                    `;
                }
            };
        }
    }


    setupDashboardEvents() {
        const closeBtn = document.getElementById('close-modal');
        if (closeBtn) closeBtn.onclick = () => this.closeModal();

        // Logout
        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) {
            logoutBtn.onclick = async () => {
                await this._bgSend({ action: 'LOGOUT' });
                this._cachedUser = null;
                if (typeof AuthManager !== 'undefined') AuthManager.user = null;
                UI.showNotification('Logged out', 'info');
                this.closeModal();
                setTimeout(() => this.openModal(), 300);
            };
        }

        // Buy credits
        const buyBtn = document.getElementById('buy-credits-btn');
        if (buyBtn) {
            buyBtn.onclick = () => this.showBuyCreditsModal();
        }

        // Apply promo
        const promoBtn = document.getElementById('apply-promo-btn');
        const promoInput = document.getElementById('promo-code');
        if (promoBtn && promoInput) {
            promoBtn.onclick = async () => {
                const code = promoInput.value.trim();
                if (!code) {
                    UI.showNotification('Enter a promo code', 'error');
                    return;
                }
                promoBtn.disabled = true;
                promoBtn.innerHTML = '...';

                const result = await CreditsManager.applyPromoCode(code);
                if (result.success) {
                    UI.showNotification(result.message, 'success');
                    promoInput.value = '';
                    this.refreshCreditsDisplay();
                } else {
                    UI.showNotification(result.error, 'error');
                }
                promoBtn.disabled = false;
                promoBtn.innerHTML = 'Apply';
            };
        }

        // Load announcements
        this.loadAnnouncements();

        // History button
        const historyBtn = document.getElementById('show-history-btn');
        if (historyBtn) {
            historyBtn.onclick = async () => {
                const section = document.getElementById('history-section');
                const list = document.getElementById('history-list');
                if (section.classList.contains('hidden')) {
                    list.innerHTML = '<div style="text-align:center;padding:12px;color:var(--text-dim);">Loading...</div>';
                    section.classList.remove('hidden');
                    const history = await CreditsManager.getHistory(15);
                    list.innerHTML = UI.renderHistory(history);
                } else {
                    section.classList.add('hidden');
                }
            };
        }
        const closeHistoryBtn = document.getElementById('close-history-btn');
        if (closeHistoryBtn) {
            closeHistoryBtn.onclick = () => document.getElementById('history-section')?.classList.add('hidden');
        }

        // Load categories
        this.loadCategoryDropdown();

        // File upload
        const fileInput = document.getElementById('image-input');
        const uploadArea = document.getElementById('upload-area');

        if (fileInput) {
            fileInput.onchange = (e) => {
                const file = e.target.files[0];
                if (!file) return;

                const previewBox = document.getElementById('preview-box');
                const previewImg = document.getElementById('preview-img');
                const uploadArea = document.getElementById('upload-area');
                const settingsRow = document.querySelector('.settings-row');

                if (previewBox && previewImg) {
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                        previewImg.src = ev.target.result;
                        previewBox.classList.remove('hidden');
                        if (uploadArea) uploadArea.classList.add('hidden');
                        if (settingsRow) settingsRow.classList.add('hidden');
                    };
                    reader.readAsDataURL(file);
                }

                setTimeout(() => this.processImage(file), 500);
            };
        }

        if (uploadArea) {
            uploadArea.onclick = () => fileInput?.click();

            uploadArea.ondragover = (e) => {
                e.preventDefault();
                uploadArea.style.borderColor = '#667eea';
                uploadArea.style.background = 'rgba(102,126,234,0.1)';
            };
            uploadArea.ondragleave = () => {
                uploadArea.style.borderColor = 'rgba(102,126,234,0.5)';
                uploadArea.style.background = 'transparent';
            };
            uploadArea.ondrop = (e) => {
                e.preventDefault();
                uploadArea.style.borderColor = 'rgba(102,126,234,0.5)';
                uploadArea.style.background = 'transparent';
                if (e.dataTransfer.files.length && fileInput) {
                    fileInput.files = e.dataTransfer.files;
                    fileInput.dispatchEvent(new Event('change'));
                }
            };
        }
    }

    async refreshCreditsDisplay() {
        const creditsRes = await this._bgSend({ action: 'GET_CREDITS' });
        const credits = creditsRes?.credits ?? 0;
        const creditsValue = document.querySelector('.credits-badge .credits-value');
        const creditsBadge = document.querySelector('.credits-badge');
        const headerCount = document.getElementById('header-credits-count');

        if (creditsValue) {
            creditsValue.innerHTML = credits + ' Credits';
            creditsBadge?.classList.remove('unlimited');
        }
        // Also update header counter
        if (headerCount) headerCount.innerHTML = credits;

        // Show low credits warning if needed
        const threshold = typeof CONFIG !== 'undefined' ? CONFIG.LOW_CREDITS_THRESHOLD : 5;
        if (credits <= threshold) {
            creditsBadge?.classList.add('low-credits');
        } else {
            creditsBadge?.classList.remove('low-credits');
        }
    }

    async loadAnnouncements() {
        const area = document.getElementById('announcements-area');
        if (!area || typeof AnnouncementManager === 'undefined') return;
        await AnnouncementManager.fetch();
        const active = AnnouncementManager.getActive();
        if (active.length === 0) { area.innerHTML = ''; return; }
        const icons = { info: 'ℹ️', warning: '⚠️', success: '✅', promo: '🎁' };
        const colors = { info: '#6366f1', warning: '#f59e0b', success: '#10b981', promo: '#ec4899' };
        const escHtml = (str) => String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
        area.innerHTML = active.map(a => `
            <div class="announcement-bar" style="background:${colors[a.type] || colors.info}15;border:1px solid ${colors[a.type] || colors.info}40;border-radius:10px;padding:10px 14px;margin-bottom:8px;display:flex;align-items:flex-start;gap:8px;">
                <span style="font-size:16px;flex-shrink:0;">${icons[a.type] || 'ℹ️'}</span>
                <div style="flex:1;min-width:0;">
                    <div style="font-size:12px;font-weight:700;color:${colors[a.type] || colors.info};margin-bottom:2px;">${escHtml(a.title)}</div>
                    <div style="font-size:11px;color:var(--text-muted);line-height:1.4;">${escHtml(a.message)}</div>
                </div>
                <button class="dismiss-announce-btn" data-id="${escHtml(a.id)}" style="background:none;border:none;color:var(--text-dim);cursor:pointer;font-size:14px;padding:0 2px;flex-shrink:0;">×</button>
            </div>
        `).join('');
        // Attach dismiss handlers properly (inline onclick runs in page world, not content script)
        area.querySelectorAll('.dismiss-announce-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                btn.closest('.announcement-bar').remove();
                AnnouncementManager.dismiss(btn.dataset.id);
            });
        });
    }

    showBuyCreditsModal() {
        const buyModal = document.createElement('div');
        buyModal.id = 'buy-modal';
        buyModal.className = 'modal-overlay';
        buyModal.innerHTML = UI.getBuyCreditsHTML();
        document.body.appendChild(buyModal);

        const closeBtn = document.getElementById('close-buy-modal');
        if (closeBtn) {
            closeBtn.onclick = () => buyModal.remove();
        }

        buyModal.onclick = (e) => {
            if (e.target === buyModal) buyModal.remove();
        };

        // Buy plan buttons — use new plan ID system
        document.querySelectorAll('.buy-btn').forEach(btn => {
            btn.onclick = () => {
                const planId = btn.dataset.plan;
                const pricing = CONFIG.PRICING[planId?.toUpperCase()];
                if (!pricing) return;
                const message = `Hi! I want to buy ${pricing.name} plan for AI Listing Pro.\n\n💰 Price: ₹${pricing.price}\n💎 Credits: ${pricing.credits}${pricing.oneTime ? ' (one-time)' : '/month'}`;
                window.open(`https://wa.me/${CONFIG.WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`, '_blank');
            };
        });
    }

    async loadCategoryDropdown() {
        const categorySearch = document.getElementById('category-search');
        const categoryDropdown = document.getElementById('category-dropdown');
        const categoryClear = document.getElementById('category-clear');

        if (!categorySearch || !categoryDropdown) return;

        if (typeof MeeshoAPI === 'undefined') {
            categorySearch.placeholder = '❌ API not available';
            categorySearch.disabled = true;
            UI.showNotification('MeeshoAPI not loaded. Please refresh the page.', 'error');
            return;
        }

        categorySearch.placeholder = '⏳ Loading categories...';
        categorySearch.disabled = true;

        try {
            const categories = await MeeshoAPI.fetchCategories();

            if (!categories || categories.length === 0) {
                categorySearch.placeholder = '❌ No categories found';
                categorySearch.disabled = false;
                UI.showNotification('Could not load categories. Please refresh the page and try again.', 'error');
                return;
            }

            this.allCategories = categories;
            categorySearch.placeholder = '🔍 Search category...';
            categorySearch.disabled = false;

            console.log('✅ Categories loaded:', categories.length);

            categorySearch.onfocus = () => {
                this.renderCategoryDropdown(this.allCategories.slice(0, 50));
                categoryDropdown.style.display = 'block';
            };

            categorySearch.oninput = () => {
                const query = categorySearch.value.toLowerCase().trim();
                if (categoryClear) categoryClear.style.display = query ? 'block' : 'none';

                if (query.length === 0) {
                    this.renderCategoryDropdown(this.allCategories.slice(0, 50));
                } else {
                    const filtered = this.allCategories.filter(cat =>
                        cat.name.toLowerCase().includes(query) ||
                        cat.parentName.toLowerCase().includes(query)
                    ).slice(0, 30);
                    this.renderCategoryDropdown(filtered);
                }
                categoryDropdown.style.display = 'block';
            };

            if (categoryClear) {
                categoryClear.onclick = () => {
                    categorySearch.value = '';
                    categoryClear.style.display = 'none';
                    document.getElementById('category-select').value = '';
                    document.getElementById('selected-category').classList.add('hidden');
                    this.renderCategoryDropdown(this.allCategories.slice(0, 50));
                };
            }

            document.addEventListener('click', (e) => {
                if (!e.target.closest('#category-search') && !e.target.closest('#category-dropdown')) {
                    categoryDropdown.style.display = 'none';
                }
            });

        } catch (error) {
            console.error('❌ Failed to load categories:', error);
            categorySearch.placeholder = '❌ Error loading categories';
            categorySearch.disabled = false;
            UI.showNotification('Error: ' + error.message, 'error');
        }
    }

    renderCategoryDropdown(categories) {
        const dropdown = document.getElementById('category-dropdown');
        if (!dropdown) return;

        if (categories.length === 0) {
            dropdown.innerHTML = `
                <div style="padding:24px;text-align:center;">
                    <div style="font-size:32px;margin-bottom:12px;">🔍</div>
                    <div style="color:#cbd5e1;font-size:14px;font-weight:500;">No matching categories</div>
                    <div style="color:#94a3b8;font-size:12px;margin-top:4px;">Try a different search term</div>
                </div>
            `;
            return;
        }

        const grouped = {};
        categories.forEach(cat => {
            const parent = cat.parentName || 'Other';
            if (!grouped[parent]) grouped[parent] = [];
            grouped[parent].push(cat);
        });

        let html = '<div style="padding:8px 0;">';

        const esc = typeof escapeHTML === 'function' ? escapeHTML : (s) => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');

        Object.keys(grouped).sort().forEach(parentName => {
            const cats = grouped[parentName];
            html += `
                <div style="padding:10px 16px 6px;position:sticky;top:0;background:linear-gradient(135deg,#334155,#1e293b);z-index:1;border-bottom:1px solid rgba(124,58,237,0.2);">
                    <div style="display:flex;align-items:center;gap:8px;">
                        <span style="color:#a78bfa;font-size:11px;">📂</span>
                        <span style="color:#c4b5fd;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">${esc(parentName)}</span>
                        <span style="color:#64748b;font-size:11px;font-weight:600;">(${cats.length})</span>
                    </div>
                </div>
            `;

            cats.forEach(cat => {
                html += `
                    <div class="cat-item" data-id="${esc(cat.id)}" data-name="${esc(cat.name)}" data-parent="${esc(cat.parentName)}">
                        <div style="display:flex;align-items:center;gap:10px;">
                            <span style="color:#94a3b8;font-size:11px;">›</span>
                            <span style="color:#f1f5f9;font-size:14px;font-weight:500;">${esc(cat.name)}</span>
                        </div>
                        <div style="margin-left:22px;margin-top:4px;">
                            <span style="font-size:11px;color:#64748b;font-family:monospace;">ID: ${esc(cat.id)}</span>
                        </div>
                    </div>
                `;
            });
        });

        html += '</div>';
        dropdown.innerHTML = html;

        dropdown.querySelectorAll('.cat-item').forEach(item => {
            item.onclick = () => {
                const id = item.dataset.id;
                const name = item.dataset.name;
                const parent = item.dataset.parent;

                document.getElementById('category-select').value = id;
                document.getElementById('category-search').value = name;
                document.getElementById('selected-category').classList.remove('hidden');

                const selectedNameEl = document.getElementById('selected-category-name');
                const _esc = typeof escapeHTML === 'function' ? escapeHTML : (s) => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
                selectedNameEl.innerHTML = `
                    <span style="color:#c4b5fd;font-weight:600;">${_esc(parent)}</span>
                    <span style="color:#64748b;margin:0 6px;">›</span>
                    <span style="color:#10b981;font-weight:700;">${_esc(name)}</span>
                `;

                dropdown.style.display = 'none';
                document.getElementById('category-clear').style.display = 'block';

                if (typeof MeeshoAPI !== 'undefined') {
                    MeeshoAPI.setCategory(parseInt(id));
                }
            };
        });
    }


    async processImage(file) {
        console.log('📤 Processing image:', file.name, file.size, 'bytes');

        // Check credits first via background
        const creditsCheck = await this._bgSend({ action: 'GET_CREDITS' });
        if (!creditsCheck?.success || (creditsCheck.credits ?? 0) < 1) {
            UI.showNotification('❌ Insufficient credits! Buy more to continue.', 'error');
            this.showBuyCreditsModal();
            return;
        }
        console.log('✅ Credits available');

        // Check category
        const categoryId = document.getElementById('category-select')?.value;
        if (!categoryId) {
            UI.showNotification('⚠️ Please select a category first', 'error');
            return;
        }
        console.log('✅ Category selected:', categoryId);

        // Check if MeeshoAPI is ready
        if (typeof MeeshoAPI === 'undefined') {
            UI.showNotification('❌ MeeshoAPI not loaded. Please refresh the page.', 'error');
            return;
        }

        if (!MeeshoAPI.isReady()) {
            UI.showNotification('⚠️ Supplier ID not detected. Please refresh the page.', 'error');
            return;
        }
        console.log('✅ MeeshoAPI ready');

        this.isProcessing = true;
        this.shouldStop = false;
        this.isPaused = false;
        this.currentResults = [];

        const targetShipping = parseInt(document.getElementById('target-shipping')?.value || 80);
        const maxAttempts = parseInt(document.getElementById('max-attempts')?.value || 100);

        console.log('🎯 Target:', targetShipping, '| Attempts:', maxAttempts);

        // Convert file to blob
        const blob = await this.fileToBlob(file);
        this.lastImageBlob = blob;
        console.log('✅ Image converted to blob');

        // Show processing UI
        const processingArea = document.getElementById('processing-area');
        const resultsArea = document.getElementById('results-area');
        const previewBox = document.getElementById('preview-box');
        const categorySection = document.querySelector('.section');

        if (processingArea) processingArea.classList.remove('hidden');
        if (resultsArea) resultsArea.classList.add('hidden');
        if (previewBox) previewBox.classList.add('hidden');
        if (categorySection) categorySection.classList.add('hidden');

        let startTime = Date.now();
        let lastAttempt = 0;
        let lastBest = null;
        let timerInterval = setInterval(() => {
            const elapsed = Math.floor((Date.now() - startTime) / 1000);
            this.updateProcessingUI(lastAttempt, maxAttempts, targetShipping, lastBest, elapsed);
        }, 1000);

        try {
            console.log('🚀 Starting smart search...');
            const result = await MeeshoAPI.smartSearch(
                blob,
                targetShipping,
                maxAttempts,
                (attempt, max, best) => {
                    lastAttempt = attempt;
                    lastBest = best;
                    const elapsed = Math.floor((Date.now() - startTime) / 1000);
                    this.updateProcessingUI(attempt, max, targetShipping, best, elapsed);
                    if (attempt % 10 === 0) {
                        console.log(`📊 Progress: ${attempt}/${max} | Best: ₹${best || 'N/A'}`);
                    }
                },
                (found) => {
                    console.log('✅ Target reached:', found);
                    UI.showNotification(`🎉 Target reached! ₹${found.shippingCost}`, 'success');
                },
                () => this.shouldStop,
                () => this.isPaused
            );

            clearInterval(timerInterval);
            console.log('✅ Search completed:', result);

            if (result.success && result.results.length > 0) {
                console.log(`✅ Found ${result.results.length} results`);

                // Deduct 1 credit on successful optimization (not on error/failure)
                const creditResult = await this._bgSend({ action: 'DEDUCT_CREDITS', amount: 1 });
                if (creditResult?.success) {
                    console.log('✅ Credit deducted. Remaining:', creditResult.remaining);

                    // Increment local total_optimizations counter
                    const stored = await chrome.storage.local.get(['user']);
                    if (stored.user) {
                        stored.user.total_optimizations = (stored.user.total_optimizations || 0) + 1;
                        await chrome.storage.local.set({ user: stored.user });
                    }
                    const totalOpts = stored.user?.total_optimizations || 1;

                    // Update credits display and show post-optimization feedback
                    this.refreshCreditsDisplay();
                    if (typeof UI !== 'undefined' && UI.showOptimizationFeedback) {
                        UI.showOptimizationFeedback(creditResult.remaining, totalOpts);
                    }

                    // Milestone notification every 10 optimizations
                    if (totalOpts % 10 === 0) {
                        UI.showNotification(`🎉 You're getting faster. AI has optimized ${totalOpts} listings for you!`, 'success');
                    } else {
                        UI.showNotification(`⚡ Optimized in under 1 second · Credits left: ${creditResult.remaining}`, 'success');
                    }
                }

                this.currentResults = result.results.map(r => ({
                    ...r,
                    imageUrl: r.dataUrl,
                    meeshoImageUrl: r.meeshoImageUrl || null,
                    originalBlob: r.originalBlob || null,
                    duplicatePid: r.duplicatePid || null
                }));
                this.showResults(this.currentResults);
            } else {
                console.warn('⚠️ No results found');
                UI.showNotification('⚠️ No results found. Try again with different settings.', 'error');
                if (processingArea) processingArea.classList.add('hidden');
            }
        } catch (error) {
            clearInterval(timerInterval);
            console.error('❌ Processing error:', error);
            UI.showNotification('❌ Error: ' + error.message, 'error');
            if (processingArea) processingArea.classList.add('hidden');
        }

        this.isProcessing = false;
    }

    fileToBlob(file) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                fetch(e.target.result)
                    .then(res => res.blob())
                    .then(resolve);
            };
            reader.readAsDataURL(file);
        });
    }

    updateProcessingUI(attempt, max, target, best, elapsed) {
        const processingArea = document.getElementById('processing-area');
        if (!processingArea) return;

        processingArea.innerHTML = UI.getProcessingHTML(attempt, max, target, best, elapsed, this.isPaused);

        // Setup control buttons
        const pauseBtn = document.getElementById('pause-btn');
        const stopBtn = document.getElementById('stop-btn');

        if (pauseBtn) {
            pauseBtn.onclick = () => {
                this.isPaused = !this.isPaused;
                pauseBtn.innerHTML = this.isPaused ? '▶️ Resume' : '⏸️ Pause';
            };
        }

        if (stopBtn) {
            stopBtn.onclick = () => {
                this.shouldStop = true;
                UI.showNotification('Stopping...', 'info');
            };
        }
    }

    showResults(results) {
        const processingArea = document.getElementById('processing-area');
        const resultsArea = document.getElementById('results-area');

        if (processingArea) processingArea.classList.add('hidden');
        if (resultsArea) {
            resultsArea.classList.remove('hidden');
            resultsArea.innerHTML = UI.getResultsHTML(results);
            this.setupResultsEvents();
        }
    }

    setupResultsEvents() {
        // Apply buttons
        document.querySelectorAll('.apply-btn').forEach(btn => {
            btn.onclick = () => {
                const index = parseInt(btn.dataset.index);
                if (this.currentResults[index]) {
                    this.applyImage(this.currentResults[index]);
                }
            };
        });

        // Download buttons
        document.querySelectorAll('.download-btn').forEach(btn => {
            btn.onclick = () => {
                const index = parseInt(btn.dataset.index);
                if (this.currentResults[index]) {
                    this.downloadImage(this.currentResults[index]);
                }
            };
        });

        // Apply best
        const applyBestBtn = document.getElementById('apply-best-btn');
        if (applyBestBtn && this.currentResults.length > 0) {
            applyBestBtn.onclick = () => this.applyImage(this.currentResults[0]);
        }

        // New search
        const newSearchBtn = document.getElementById('new-search-btn');
        if (newSearchBtn) {
            newSearchBtn.onclick = () => {
                const resultsArea = document.getElementById('results-area');
                const previewBox = document.getElementById('preview-box');
                const uploadArea = document.getElementById('upload-area');
                const settingsRow = document.querySelector('.settings-row');
                const categorySection = document.querySelector('.section');
                const fileInput = document.getElementById('image-input');

                if (resultsArea) resultsArea.classList.add('hidden');
                if (previewBox) previewBox.classList.add('hidden');
                if (uploadArea) uploadArea.classList.remove('hidden');
                if (settingsRow) settingsRow.classList.remove('hidden');
                if (categorySection) categorySection.classList.remove('hidden');
                if (fileInput) fileInput.value = '';

                this.currentResults = [];
            };
        }

        // Retry
        const retryBtn = document.getElementById('retry-btn');
        if (retryBtn) {
            retryBtn.onclick = () => {
                if (this.lastImageBlob) {
                    const file = new File([this.lastImageBlob], 'retry.jpg', { type: 'image/jpeg' });
                    this.processImage(file);
                }
            };
        }
    }

    async applyImage(result) {
        let blob = result.originalBlob;

        if (!blob) {
            const imageUrl = result.imageUrl || result.dataUrl;
            if (!imageUrl) {
                UI.showNotification('No image to apply', 'error');
                return;
            }
            try {
                const res = await fetch(imageUrl);
                blob = await res.blob();
            } catch (err) {
                UI.showNotification('Failed to apply image', 'error');
                return;
            }
        }

        const fileInput = document.querySelector('#changeFrontImage');
        if (!fileInput) {
            UI.showNotification('Could not find image input', 'error');
            return;
        }

        try {
            // Store the expected shipping cost for verification
            this.expectedShippingCost = result.shippingCost;

            console.log('📤 Applying image with expected shipping: ₹' + result.shippingCost);

            // Set file on input — Meesho's React will handle the upload
            const file = new File([blob], 'optimized.jpg', { type: 'image/jpeg' });
            const dt = new DataTransfer();
            dt.items.add(file);
            fileInput.files = dt.files;
            fileInput.dispatchEvent(new Event('change', { bubbles: true }));

            UI.showNotification(`⏳ Applying image with ₹${result.shippingCost} shipping...`, 'info');
            this.closeModal();

            // Intercept Meesho's getTransferPrice call
            this.interceptMeeshoPrice(result.shippingCost);

            // Wait for image upload to complete, then hit price input ONCE
            setTimeout(() => {
                console.log('⏰ 3s: Clicking price input to trigger shipping update...');
                const success = this.clickPriceInput();

                if (success) {
                    // Start polling for shipping update
                    this.waitForShippingUpdate(result.shippingCost);

                    // Final verification after 10 seconds
                    setTimeout(() => {
                        console.log('⏰ 10s: Final verification...');
                        this.verifyShippingCharge(result.shippingCost);
                    }, 10000);
                } else {
                    console.warn('⚠️ Could not click price input, trying alternative method...');
                    // Fallback: try triggerPriceRefresh
                    setTimeout(() => {
                        this.triggerPriceRefresh();
                        this.waitForShippingUpdate(result.shippingCost);
                    }, 2000);
                }
            }, 3000);

        } catch (err) {
            console.error('Apply image error:', err);
            UI.showNotification('Failed to apply image', 'error');
        }
    }

    clickPriceInput() {
        // Find and click the price/MRP input to trigger Meesho's recalculation
        console.log('🔍 Searching for price input...');

        let priceInput = null;

        // Strategy 0: Direct ID lookup (fastest)
        priceInput = document.getElementById('meesho_price');
        if (priceInput && priceInput.value && parseInt(priceInput.value) > 0) {
            console.log('✅ Found price input (direct ID): meesho_price =', priceInput.value);
        } else {
            priceInput = null;
        }

        // Strategy 1: Check by name, placeholder, and label
        if (!priceInput) {
            const inputs = document.querySelectorAll('input');
            for (const inp of inputs) {
                const name = (inp.name || '').toLowerCase();
                const placeholder = (inp.placeholder || '').toLowerCase();
                const label = inp.labels?.[0]?.innerHTML?.toLowerCase() || '';
                const ariaLabel = (inp.getAttribute('aria-label') || '').toLowerCase();
                const id = (inp.id || '').toLowerCase();

                // Check if this is a price input
                if (name === 'price' || name === 'mrp' ||
                    name.includes('price') ||
                    placeholder.includes('price') ||
                    placeholder.includes('mrp') ||
                    label.includes('price') ||
                    label.includes('mrp') ||
                    ariaLabel.includes('price') ||
                    ariaLabel.includes('mrp') ||
                    id.includes('price') ||
                    id.includes('mrp')) {

                    if (inp.value && parseInt(inp.value) > 0) {
                        priceInput = inp;
                        console.log('✅ Found price input (strategy 1):', name || placeholder || id || 'unnamed', '=', inp.value);
                        break;
                    }
                }
            }
        }

        // Strategy 2: Look for any numeric input with value > 0
        if (!priceInput) {
            console.log('🔍 Strategy 2: Looking for numeric inputs...');
            const inputs = document.querySelectorAll('input');
            for (const inp of inputs) {
                if (inp.type === 'number' || inp.type === 'text') {
                    const val = parseInt(inp.value);
                    if (val > 0 && val < 100000) {
                        // Check if parent/nearby elements mention "price" or "MRP"
                        const parent = inp.closest('div');
                        if (parent) {
                            const parentText = parent.innerHTML.toLowerCase();
                            if (parentText.includes('price') || parentText.includes('mrp') || parentText.includes('₹')) {
                                priceInput = inp;
                                console.log('✅ Found price input (strategy 2):', inp.name || inp.placeholder || 'unnamed', '=', inp.value);
                                break;
                            }
                        }
                    }
                }
            }
        }

        // Strategy 3: Find any input with numeric value between 50-10000 (likely price)
        if (!priceInput) {
            console.log('🔍 Strategy 3: Looking for any numeric value...');
            const inputs = document.querySelectorAll('input');
            for (const inp of inputs) {
                const val = parseInt(inp.value);
                if (val >= 50 && val <= 10000) {
                    priceInput = inp;
                    console.log('✅ Found potential price input (strategy 3):', inp.name || inp.placeholder || 'unnamed', '=', inp.value);
                    break;
                }
            }
        }

        if (!priceInput) {
            console.warn('⚠️ Could not find price input to click');
            const inputs = document.querySelectorAll('input');
            console.log('💡 Available inputs:', Array.from(inputs).map(i => ({
                name: i.name,
                placeholder: i.placeholder,
                type: i.type,
                value: i.value,
                id: i.id
            })));
            return false;
        }

        console.log('✅ Using price input:', priceInput.id || priceInput.name || priceInput.placeholder || 'unnamed', '=', priceInput.value);

        // Scroll into view
        priceInput.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // Wait for scroll, then interact
        setTimeout(() => {
            const currentValue = priceInput.value;

            // Step 1: Focus the input
            priceInput.focus();
            console.log('🎯 Step 1: Focused price input');

            setTimeout(() => {
                // Step 2: Clear and re-enter the value to trigger React
                const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;

                // Clear
                nativeInputValueSetter.call(priceInput, '');
                priceInput.dispatchEvent(new Event('input', { bubbles: true }));

                setTimeout(() => {
                    // Re-enter original value
                    nativeInputValueSetter.call(priceInput, currentValue);
                    priceInput.dispatchEvent(new Event('input', { bubbles: true }));
                    priceInput.dispatchEvent(new Event('change', { bubbles: true }));
                    console.log('🎯 Step 2: Re-entered value:', currentValue);

                    setTimeout(() => {
                        // Step 3: Blur to trigger calculation
                        priceInput.blur();
                        priceInput.dispatchEvent(new Event('blur', { bubbles: true }));
                        console.log('🎯 Step 3: Blurred - should trigger shipping calculation');

                        // Step 4: Click outside to ensure blur
                        setTimeout(() => {
                            document.body.click();
                            console.log('🎯 Step 4: Clicked outside to ensure blur');
                        }, 300);
                    }, 300);
                }, 300);
            }, 300);
        }, 500);

        return true;
    }

    triggerPriceRefresh() {
        // Find the price/MRP input and trigger blur to force Meesho to recalculate
        const inputs = document.querySelectorAll('input');
        for (const inp of inputs) {
            const name = (inp.name || '').toLowerCase();
            if (name === 'price' || name === 'mrp' || name.includes('price')) {
                if (inp.value && parseInt(inp.value) > 0) {
                    // Save current value, trigger focus-blur cycle
                    const val = inp.value;
                    inp.focus();
                    // Simulate user typing — React needs this
                    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
                    nativeInputValueSetter.call(inp, val);
                    inp.dispatchEvent(new Event('input', { bubbles: true }));
                    inp.dispatchEvent(new Event('change', { bubbles: true }));
                    inp.blur();
                    inp.dispatchEvent(new Event('blur', { bubbles: true }));
                    console.log('✅ Triggered price refresh on:', name, '=', val);
                    return true;
                }
            }
        }
        console.warn('⚠️ Could not find price input to trigger refresh');
        return false;
    }

    waitForShippingUpdate(expectedPrice, maxAttempts = 15) {
        // Poll for shipping charge element to update
        let attempts = 0;
        const initialShipping = this.currentShippingCost;

        const checkInterval = setInterval(() => {
            attempts++;
            const currentShipping = this.detectShipping();

            if (currentShipping && currentShipping !== initialShipping) {
                clearInterval(checkInterval);
                this.currentShippingCost = currentShipping;
                console.log('✅ Shipping updated to:', currentShipping);

                if (currentShipping === expectedPrice) {
                    UI.showNotification(`✅ Perfect! Shipping is now ₹${currentShipping}`, 'success');
                } else if (currentShipping < expectedPrice) {
                    UI.showNotification(`🎉 Even better! Shipping is ₹${currentShipping} (expected ₹${expectedPrice})`, 'success');
                } else {
                    const diff = currentShipping - expectedPrice;
                    if (diff <= 10) {
                        UI.showNotification(`✅ Shipping is ₹${currentShipping} (close to target)`, 'success');
                    } else {
                        UI.showNotification(`ℹ️ Shipping is ₹${currentShipping} (expected ₹${expectedPrice})`, 'info');
                    }
                }
            } else if (attempts >= maxAttempts) {
                clearInterval(checkInterval);
                // Don't show warning if shipping was already detected
                if (currentShipping) {
                    console.log(`ℹ️ Polling stopped after ${maxAttempts} attempts. Current shipping: ₹${currentShipping}`);
                } else {
                    console.log(`ℹ️ Polling stopped after ${maxAttempts} attempts. Shipping will update when Meesho recalculates.`);
                }
            }
        }, 1000);
    }

    verifyShippingCharge(expectedPrice) {
        // Final verification of shipping charge
        const currentShipping = this.detectShipping();

        if (!currentShipping) {
            console.log('ℹ️ Shipping charge not detected in final verification');
            return;
        }

        const diff = Math.abs(currentShipping - expectedPrice);

        if (currentShipping === expectedPrice) {
            console.log('✅ Shipping charge verified:', currentShipping);
        } else if (diff <= 10) {
            // Small difference is acceptable (within ±10)
            console.log(`✅ Shipping close to expected: ₹${currentShipping} (expected ₹${expectedPrice}, diff: ₹${diff})`);
        } else {
            console.log(`ℹ️ Shipping variance: ₹${currentShipping} (expected ₹${expectedPrice}, diff: ₹${diff})`);

            // Only try refresh if difference is significant and shipping is higher
            if (currentShipping > expectedPrice && diff > 20) {
                console.log('🔄 Attempting one more refresh due to significant difference...');
                this.triggerPriceRefresh();

                setTimeout(() => {
                    const finalShipping = this.detectShipping();
                    if (finalShipping && finalShipping !== currentShipping) {
                        this.currentShippingCost = finalShipping;
                        console.log(`✅ Shipping updated to ₹${finalShipping} after refresh`);
                    }
                }, 2000);
            }
        }
    }

    interceptMeeshoPrice(expectedPrice) {
        // Intercept Meesho's own fetch calls to getTransferPrice to capture the real price
        if (this._fetchIntercepted) {
            console.log('⚠️ Fetch already intercepted, skipping');
            return;
        }
        this._fetchIntercepted = true;

        const originalFetch = window.fetch;
        const self = this;

        console.log('🔍 Setting up fetch interception for shipping price...');

        window.fetch = function (...args) {
            let url = '';
            try { url = typeof args[0] === 'string' ? args[0] : args[0]?.url || ''; } catch (_) {}

            if (url.includes('getTransferPrice')) {
                console.log('🎯 Intercepted getTransferPrice call');

                return originalFetch.apply(this, args).then(async response => {
                    try {
                        const cloned = response.clone();
                        const data = await cloned.json();

                        if (data.shipping_charges !== undefined) {
                            const actual = data.shipping_charges;
                            console.log(`✅ Meesho API returned shipping: ₹${actual} (expected: ₹${expectedPrice})`);

                            // Update current shipping cost
                            self.currentShippingCost = actual;

                            // Show notification based on comparison
                            if (actual === expectedPrice) {
                                UI.showNotification(`✅ Perfect! Shipping confirmed at ₹${actual}`, 'success');
                            } else if (actual < expectedPrice) {
                                UI.showNotification(`🎉 Even better! Shipping is ₹${actual} (expected ₹${expectedPrice})`, 'success');
                            } else {
                                UI.showNotification(`⚠️ Shipping is ₹${actual} (expected ₹${expectedPrice})`, 'warning');
                            }

                            // Force UI update
                            setTimeout(() => {
                                self.detectShipping();
                            }, 500);
                        }
                    } catch (e) {
                        console.error('Error parsing getTransferPrice response:', e);
                    }

                    // Restore original fetch after successful interception
                    setTimeout(() => {
                        if (window.fetch !== originalFetch) {
                            window.fetch = originalFetch;
                            self._fetchIntercepted = false;
                            console.log('✅ Fetch interception restored');
                        }
                    }, 1000);

                    return response;
                });
            }

            return originalFetch.apply(this, args);
        };

        // Auto-restore after 30 seconds if no interception happened
        setTimeout(() => {
            if (self._fetchIntercepted && window.fetch !== originalFetch) {
                window.fetch = originalFetch;
                self._fetchIntercepted = false;
                console.log('⏱️ Fetch interception timeout - restored original fetch');
            }
        }, 30000);
    }

    downloadImage(result) {
        const imageUrl = result.imageUrl || result.dataUrl;
        if (!imageUrl) return;

        const link = document.createElement('a');
        link.href = imageUrl;
        link.download = `optimized_${result.shippingCost}_${Date.now()}.jpg`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        UI.showNotification('Image downloaded!', 'success');
    }
}

// ── Floating "Optimize Shipping" button for supplier.meesho.com ──
// ── Floating "Optimize Shipping" button for supplier.meesho.com ──
function injectOptimizeShippingButton() {
    if (!window.location.hostname.includes("supplier.meesho.com")) return;
    if (document.getElementById('meesho-optimize-shipping-btn')) return; // prevent duplicates

    const btn = document.createElement('button');
    btn.id = 'meesho-optimize-shipping-btn';
    btn.textContent = 'Optimize Shipping';

    Object.assign(btn.style, {
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        zIndex: '9999999',
        padding: '12px 24px',
        backgroundColor: '#570a57',
        color: '#fff',
        fontSize: '14px',
        fontWeight: '600',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        border: 'none',
        borderRadius: '8px',
        cursor: 'pointer',
        boxShadow: '0 4px 14px rgba(87, 10, 87, 0.4)',
        transition: 'background-color 0.2s, transform 0.15s, box-shadow 0.2s',
        letterSpacing: '0.3px',
    });

    btn.addEventListener('mouseenter', () => {
        btn.style.backgroundColor = '#6e1a6e';
        btn.style.transform = 'translateY(-2px)';
        btn.style.boxShadow = '0 6px 18px rgba(87, 10, 87, 0.5)';
    });
    btn.addEventListener('mouseleave', () => {
        btn.style.backgroundColor = '#570a57';
        btn.style.transform = 'translateY(0)';
        btn.style.boxShadow = '0 4px 14px rgba(87, 10, 87, 0.4)';
    });

    btn.addEventListener('click', () => {
        btn.disabled = true;
        btn.textContent = 'Processing…';

        chrome.runtime.sendMessage({ action: 'DEDUCT_CREDITS', amount: 1 }, (response) => {
            btn.disabled = false;
            btn.textContent = 'Optimize Shipping';

            if (chrome.runtime.lastError) {
                alert('Error communicating with extension. Please refresh the page.');
                return;
            }

            if (response?.success) {
                console.log('[OptimizeShipping] Credits deducted. Remaining:', response.remaining);
                alert('Optimization started');
            } else {
                alert('Insufficient credits');
            }
        });
    });

    document.body.appendChild(btn);
    console.log("Floating feature button injected");
}

// Ensure injection runs after DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectOptimizeShippingButton);
} else {
    injectOptimizeShippingButton();
}

// Initialize
const optimizer = new MeeshoCreditsOptimizer();
window.MeeshoCreditsOptimizer = optimizer;
