// ============================================================
//  supabaseClient.js — Supabase Client with Chrome Storage
//  Session is persisted in chrome.storage.local
//  Token auto-refreshes before expiry
// ============================================================

// ✅ CONFIG se lega (config.js pehle load hoti hai)
// Fallback bhi same correct project ki taraf point karta hai
const SUPABASE_URL = (typeof CONFIG !== 'undefined') ? CONFIG.SUPABASE_URL : "https://zxborvqzttyofyrksznw.supabase.co";
const SUPABASE_ANON_KEY = (typeof CONFIG !== 'undefined') ? CONFIG.SUPABASE_ANON_KEY : "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp4Ym9ydnF6dHR5b2Z5cmtzem53Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2NTEwOTIsImV4cCI6MjA4NzIyNzA5Mn0.xM7RBHGrb7tKP2kCqCui0-3gSXQKi11jbG8s92C5cw4";

// ── Chrome Storage Adapter for Supabase ──────────────────────
// Supabase JS normally uses localStorage — Chrome extensions can't.
// We replace it with chrome.storage.local via a custom adapter.

const chromeStorageAdapter = {
    getItem: (key) => {
        return new Promise((resolve) => {
            chrome.storage.local.get([key], (result) => {
                resolve(result[key] ?? null);
            });
        });
    },
    setItem: (key, value) => {
        return new Promise((resolve) => {
            chrome.storage.local.set({ [key]: value }, resolve);
        });
    },
    removeItem: (key) => {
        return new Promise((resolve) => {
            chrome.storage.local.remove([key], resolve);
        });
    }
};

// ── Initialize Supabase Client ───────────────────────────────
try {
    const _sb = (typeof supabase !== "undefined" && supabase.createClient)
        ? supabase
        : window.supabase;

    window.supabaseClient = _sb.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
            storage: chromeStorageAdapter,       // ← persists in chrome.storage.local
            autoRefreshToken: true,              // ← auto-refresh before expiry
            persistSession: true,               // ← keep session across popups
            detectSessionInUrl: false           // ← NOT a web page, skip URL detection
        }
    });

    console.log("✅ Supabase client initialized with Chrome storage");
} catch (e) {
    console.error("❌ Supabase init failed:", e);
    window.supabaseClient = null;
}


