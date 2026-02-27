// ============================================================
//  settings.js — Dynamic Settings & Announcement Managers
//  Depends on: config.js (CONFIG must be loaded before this)
// ============================================================

// ── Dynamic Settings Manager ─────────────────────────────────
//  Fetches settings from admin_settings table and hot-patches
//  CONFIG at runtime. Results are cached for 5 minutes.

const SettingsManager = {
    loaded: false,
    cache: {},
    cacheTime: 0,
    CACHE_TTL: 5 * 60 * 1000, // 5 min cache

    fetch: async function () {
        // Return cache if still fresh
        if (this.loaded && (Date.now() - this.cacheTime) < this.CACHE_TTL) {
            return this.cache;
        }

        try {
            const res = await fetch(
                `${CONFIG.SUPABASE_URL}/rest/v1/admin_settings?select=key,value`,
                { headers: { 'apikey': CONFIG.SUPABASE_ANON_KEY } }
            );

            if (!res.ok) {
                // Table may not exist yet — silently use defaults (not an error)
                if (res.status === 404 || res.status === 400) {
                    console.log('ℹ️ admin_settings table not found, using config defaults');
                } else {
                    console.log('ℹ️ Settings fetch skipped (status ' + res.status + '), using defaults');
                }
                return this.cache;
            }

            const rows = await res.json();
            this.cache = {};
            (rows || []).forEach(r => { this.cache[r.key] = r.value; });
            this.loaded = true;
            this.cacheTime = Date.now();

            // Apply fetched values to CONFIG
            this.applyToConfig();
            console.log('✅ Dynamic settings loaded:', Object.keys(this.cache).length, 'keys');
        } catch (e) {
            // Network error or Supabase unreachable — silently use defaults
            console.log('ℹ️ Settings fetch skipped (network):', e.message);
        }
        return this.cache;
    },

    get: function (key, fallback) {
        return this.cache[key] !== undefined ? this.cache[key] : fallback;
    },

    applyToConfig: function () {
        const s = this.cache;
        if (!s || Object.keys(s).length === 0) return;

        // WhatsApp / payment contact
        if (s.whatsapp_number) CONFIG.PAYMENT_CONTACT_URL = `https://wa.me/${s.whatsapp_number}`;

        // Credits per optimization run
        if (s.credits_per_optimization)
            CONFIG.CREDIT_COST_AI_RUN = parseInt(s.credits_per_optimization, 10) || 1;

        // Signup credits for new users
        if (s.signup_credits)
            CONFIG.DEFAULT_SIGNUP_CREDITS = parseInt(s.signup_credits, 10) || 15;

        // Daily login bonus
        if (s.daily_login_bonus)
            CONFIG.DAILY_LOGIN_BONUS = parseInt(s.daily_login_bonus, 10) || 2;

        // Low credits warning threshold
        if (s.low_credits_threshold)
            CONFIG.LOW_CREDITS_THRESHOLD = parseInt(s.low_credits_threshold, 10) || 5;

        // New pricing plans — admin can override via admin_settings table
        // Keys: starter_price, starter_credits, growth_price, growth_credits,
        //       pro_price, pro_credits
        if (!CONFIG.PRICING) CONFIG.PRICING = {};

        if (s.starter_price || s.starter_credits || s.starter_name) {
            const base = CONFIG.PRICING.STARTER || {};
            CONFIG.PRICING.STARTER = {
                ...base,
                credits: parseInt(s.starter_credits, 10) || base.credits,
                price: parseInt(s.starter_price, 10) || base.price,
                name: s.starter_name || base.name,
            };
        }

        if (s.growth_price || s.growth_credits || s.growth_name) {
            const base = CONFIG.PRICING.GROWTH || {};
            CONFIG.PRICING.GROWTH = {
                ...base,
                credits: parseInt(s.growth_credits, 10) || base.credits,
                price: parseInt(s.growth_price, 10) || base.price,
                name: s.growth_name || base.name,
            };
        }

        if (s.pro_price || s.pro_credits || s.pro_name) {
            const base = CONFIG.PRICING.PRO || {};
            CONFIG.PRICING.PRO = {
                ...base,
                credits: parseInt(s.pro_credits, 10) || base.credits,
                price: parseInt(s.pro_price, 10) || base.price,
                name: s.pro_name || base.name,
            };
        }

        // Legacy key compatibility (old admin_settings rows still working)
        if (s.pack_50_price || s.pack_50_credits) {
            CONFIG.PRICING.STARTER = {
                ...CONFIG.PRICING.STARTER,
                credits: parseInt(s.pack_50_credits, 10) || CONFIG.PRICING.STARTER.credits,
                price: parseInt(s.pack_50_price, 10) || CONFIG.PRICING.STARTER.price,
            };
        }
        if (s.pack_100_price || s.pack_100_credits) {
            CONFIG.PRICING.GROWTH = {
                ...CONFIG.PRICING.GROWTH,
                credits: parseInt(s.pack_100_credits, 10) || CONFIG.PRICING.GROWTH.credits,
                price: parseInt(s.pack_100_price, 10) || CONFIG.PRICING.GROWTH.price,
            };
        }
        // Note: unlimited plan is no longer supported — ignored if present.
    }
};

window.SettingsManager = SettingsManager;

// ── Announcement Manager ─────────────────────────────────────
//  Fetches active admin announcements from announcements table.
//  Tracks per-user dismissals via chrome.storage.local.

const AnnouncementManager = {
    cache: null,
    cacheTime: 0,
    dismissed: new Set(),

    fetch: async function () {
        // Return cache if still fresh
        if (this.cache && (Date.now() - this.cacheTime) < 5 * 60 * 1000) {
            return this.cache;
        }

        try {
            const res = await fetch(
                `${CONFIG.SUPABASE_URL}/rest/v1/announcements` +
                `?is_active=eq.true` +
                `&select=id,title,message,type,expires_at` +
                `&order=created_at.desc` +
                `&limit=5`,
                { headers: { 'apikey': CONFIG.SUPABASE_ANON_KEY } }
            );

            if (!res.ok) return [];

            const data = await res.json();

            // Filter out expired announcements
            this.cache = (data || []).filter(
                a => !a.expires_at || new Date(a.expires_at) > new Date()
            );
            this.cacheTime = Date.now();

            // Load previously dismissed IDs from storage
            try {
                const stored = await chrome.storage.local.get(['dismissed_announcements']);
                if (stored.dismissed_announcements) {
                    this.dismissed = new Set(stored.dismissed_announcements);
                }
            } catch (e) { /* storage unavailable — ignore */ }

            return this.cache;
        } catch (e) {
            return [];
        }
    },

    /** Returns announcements the user hasn't dismissed yet. */
    getActive: function () {
        if (!this.cache) return [];
        return this.cache.filter(a => !this.dismissed.has(a.id));
    },

    /** Dismisses an announcement and persists the choice. */
    dismiss: async function (id) {
        this.dismissed.add(id);
        try {
            await chrome.storage.local.set({
                dismissed_announcements: [...this.dismissed]
            });
        } catch (e) { /* storage unavailable — ignore */ }
    }
};

window.AnnouncementManager = AnnouncementManager;
