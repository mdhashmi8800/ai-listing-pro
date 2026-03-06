// ============================================================
//  supabaseClient.js — Lightweight Supabase Client
//  Auth is handled entirely by background.js (service worker).
//  This client is only used for non-auth Supabase calls from
//  the popup / dashboard UI.
// ============================================================

// ✅ CONFIG se lega (config.js pehle load hoti hai)
// Fallback bhi same correct project ki taraf point karta hai
const SUPABASE_URL = (typeof CONFIG !== 'undefined') ? CONFIG.SUPABASE_URL : "https://zxborvqzttyofyrksznw.supabase.co";
const SUPABASE_ANON_KEY = (typeof CONFIG !== 'undefined') ? CONFIG.SUPABASE_ANON_KEY : "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp4Ym9ydnF6dHR5b2Z5cmtzem53Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2NTEwOTIsImV4cCI6MjA4NzIyNzA5Mn0.xM7RBHGrb7tKP2kCqCui0-3gSXQKi11jbG8s92C5cw4";

// ── Initialize Supabase Client ───────────────────────────────

try {
    const _sb = (typeof supabase !== "undefined" && supabase.createClient)
        ? supabase
        : window.supabase;

    window.supabaseClient = _sb.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
            autoRefreshToken: false,            // ← background.js handles token refresh
            persistSession: false,              // ← background.js owns session persistence
            detectSessionInUrl: false           // ← NOT a web page, skip URL detection
        }
    });

    console.log("✅ Supabase client initialized (auth managed by background.js)");
} catch (e) {
    console.error("❌ Supabase init failed:", e);
    window.supabaseClient = null;
}


