// ============================================================
//  config.js — Central Configuration
//  Edit this file to change keys, credit amounts, etc.
// ============================================================

// ================= PAYMENT CONFIG =================

// Supabase Edge Function - Create Razorpay Order
const CREATE_ORDER_URL =
    "https://zxborvqzttyofyrksznw.supabase.co/functions/v1/create-order";

// Supabase Edge Function - Verify Payment
const VERIFY_PAYMENT_URL =
    "https://zxborvqzttyofyrksznw.supabase.co/functions/v1/verify-payment";

// Hosted checkout page (Vercel)
const CHECKOUT_URL = "https://meesho-ai-tool.vercel.app/checkout.html";


const CONFIG = {
    // ── Supabase ───────────────────────────────────────────────
    // ✅ CONFIRMED: Yahi actual working project hai (meesho-ai)
    SUPABASE_URL: 'https://zxborvqzttyofyrksznw.supabase.co',
    SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp4Ym9ydnF6dHR5b2Z5cmtzem53Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2NTEwOTIsImV4cCI6MjA4NzIyNzA5Mn0.xM7RBHGrb7tKP2kCqCui0-3gSXQKi11jbG8s92C5cw4',

    // ── Extension Info ──────────────────────────────────────────
    EXTENSION_ID: 'mabegbmfmmlmgphgfblcjcalgfepldkm',

    // ── Backend API ────────────────────────────────────────────
    API_URL: 'https://meesho-credits-api.vercel.app',

    // ── Credits ────────────────────────────────────────────────
    DEFAULT_SIGNUP_CREDITS: 15,          // Free credits every new user gets on signup
    DAILY_LOGIN_BONUS: 2,                // +2 credits every 24h login bonus
    DAILY_LOGIN_BONUS_HOURS: 24,         // Bonus cooldown in hours
    CREDITS_PER_OPTIMIZATION: 1,         // Credits per AI Optimizer run
    CREDIT_COST_AI_RUN: 1,              // Credits per AI Optimizer run (alias)
    CREDIT_COST_SHIPPING: 0,            // Shipping check is always free
    LOW_CREDITS_THRESHOLD: 5,           // Warning when credits <= this

    // ── Abuse Protection ────────────────────────────────────────
    MAX_RUNS_PER_HOUR: 50,              // Max optimization runs per hour per user

    // ── Feature Flags ───────────────────────────────────────────
    FEATURE_DAILY_BONUS: true,
    FEATURE_FIRST_PURCHASE_BONUS: true,
    FIRST_PURCHASE_BONUS_CREDITS: 25,   // Bonus credits on first-ever purchase

    // ── Plans ──────────────────────────────────────────────────
    PLANS: {
        free: { label: 'Free', color: '#64748B' },
        starter: { label: 'Starter', color: '#3b82f6' },
        growth: { label: 'Growth', color: '#7c3aed' },
        pro: { label: 'Pro Monthly', color: '#10b981' },
    },

    // ── Pricing Plans (shown in upgrade / buy-credits modal) ───
    // NO unlimited plans — credits are always finite.
    PRICING: {
        STARTER: {
            id: 'starter',
            name: 'Starter',
            price: 79,
            credits: 50,
            bonus: 25,              // 25 bonus credits on FIRST purchase only
            oneTime: true,
            popular: false,
            badge: null,
            tagline: 'Great for beginners',
            features: [
                '50 Credits',
                '+25 Bonus on First Buy',
                'One-time payment',
                'Shipping Check Free',
            ],
        },
        GROWTH: {
            id: 'growth',
            name: 'Growth',
            price: 149,
            credits: 200,
            bonus: 0,
            oneTime: true,
            popular: true,
            badge: 'Most Popular',
            tagline: 'Best value for active sellers',
            features: [
                '200 Credits',
                'One-time payment',
                'Shipping Check Free',
                'Priority Processing',
            ],
        },
        PRO: {
            id: 'pro',
            name: 'Pro Monthly',
            price: 249,
            credits: 500,
            bonus: 0,
            oneTime: false,
            popular: false,
            badge: 'Best for Power Sellers',
            tagline: 'Auto-renew every billing cycle',
            features: [
                '500 Credits / month',
                'Credits reset each cycle',
                'Auto-renewal subscription',
                'Priority Support',
            ],
        },
    },

    // ── Razorpay Payment ────────────────────────────────────────
    // Always verify payment server-side. Never trust frontend callbacks.
    RAZORPAY_KEY_ID: 'rzp_test_SJq4OiveTIA30C',   // Razorpay Test Key ID (must match checkout.html)
    CREATE_ORDER_URL: CREATE_ORDER_URL,
    VERIFY_PAYMENT_URL: VERIFY_PAYMENT_URL,
    CHECKOUT_URL: CHECKOUT_URL,

    // ── WhatsApp Support ───────────────────────────────────────
    OWNER_NAME: 'Hashmi Akbar',
    WHATSAPP_NUMBER: '917257843883',
    PAYMENT_CONTACT_URL: 'https://wa.me/917257843883',

    // ── App ────────────────────────────────────────────────────
    EXTENSION_NAME: 'AI Listing Pro',
    VERSION: '2.0.0',
    APP_VERSION: '2.0.0',
    PRICING_URL: 'https://meesho-ai-tool.vercel.app/pricing',
    SUPPORT_URL: 'https://meesho-ai-tool.vercel.app/support',

    // ── Performance / UX ────────────────────────────────────────
    LOADING_STATE_DELAY_MS: 250,        // Show loading state < 300ms
    POWERED_BY_LABEL: 'Powered by Ultra-Fast AI',

    // ── Helpers ────────────────────────────────────────────────
    isConfigured() {
        return (
            this.SUPABASE_ANON_KEY &&
            this.SUPABASE_ANON_KEY !== 'YOUR_SUPABASE_ANON_KEY' &&
            this.SUPABASE_ANON_KEY.length > 20
        );
    }
};

// Make available globally across all extension pages
window.CONFIG = CONFIG;

// ── Safe HTML escaping utility ──────────────────────────────
function escapeHTML(str) {
    if (typeof str !== 'string') return String(str ?? '');
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}
window.escapeHTML = escapeHTML;

console.log('📋 Config loaded - AI Listing Pro v' + CONFIG.VERSION);
