// ============================================================
//  background.js — Service Worker (Manifest V3)
//  Meesho Credits Extension v2.0.0
//
//  Why background? In MV3, chrome.identity.launchWebAuthFlow
//  works most reliably from service workers, not popup pages.
// ============================================================

// ✅ CONFIRMED: Yahi actual working Supabase project hai (ID: zxborvqzttyofyrksznw)
// NOTE: Background service worker mein CONFIG object available nahi hota
const SUPABASE_URL = "https://zxborvqzttyofyrksznw.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp4Ym9ydnF6dHR5b2Z5cmtzem53Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2NTEwOTIsImV4cCI6MjA4NzIyNzA5Mn0.xM7RBHGrb7tKP2kCqCui0-3gSXQKi11jbG8s92C5cw4";
const SUPABASE_SESSION_KEY = 'sbSession';
const LEGACY_SUPABASE_SESSION_KEY = 'sb-zxborvqzttyofyrksznw-auth-token';
const LEGACY_SUPABASE_SESSION_KEY_2 = 'supabaseSession';

// ── OAuth In-Progress Lock (prevents duplicate flows) ──
let oauthInProgress = false;
let lastOAuthAttempt = 0;
const OAUTH_COOLDOWN_MS = 3000; // 3 second cooldown between attempts

// ── PKCE Helpers ──────────────────────────────────────────────
// Generate cryptographically random code verifier (43-128 chars, URL-safe base64)
function generateCodeVerifier() {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return base64UrlEncode(array);
}

// Base64 URL encode (RFC 7636)
function base64UrlEncode(buffer) {
    const bytes = new Uint8Array(buffer);
    let str = '';
    for (let i = 0; i < bytes.length; i++) {
        str += String.fromCharCode(bytes[i]);
    }
    return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Generate S256 code challenge from verifier
async function generateCodeChallenge(verifier) {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return base64UrlEncode(digest);
}

// ── Supabase Token Exchange (runs in service worker ONLY) ─────
async function exchangeCodeForSession(code, verifier) {
    console.log('[SW_FETCH_START] exchangeCodeForSession — requesting token from Supabase');
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=pkce`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_ANON_KEY
        },
        body: JSON.stringify({
            auth_code: code,
            code_verifier: verifier
        })
    });

    if (!res.ok) {
        const errBody = await res.text();
        console.error('[SW_FETCH_ERROR] Token exchange failed:', res.status, errBody);
        throw new Error(`Token exchange failed (${res.status}): ${errBody}`);
    }

    const data = await res.json();
    console.log('[SW_FETCH_SUCCESS] exchangeCodeForSession — tokens received');
    return data;
}

// ── Supabase-style exchange result wrapper ─────────────────────
async function supabaseExchangeCodeForSession(code, verifier) {
    try {
        const session = await exchangeCodeForSession(code, verifier);
        return { data: { session, user: session?.user || null }, error: null };
    } catch (error) {
        return { data: null, error };
    }
}

// ── BackgroundService Class ───────────────────────────────────
class BackgroundService {
    constructor() {
        this.restoreSessionPromise = this.restoreSession();
        this.initializeListeners();
    }

    async handleSupabaseAuthStateChange(event, session) {
        if (session) {
            await chrome.storage.local.set({ [SUPABASE_SESSION_KEY]: session });
            await chrome.storage.local.remove(LEGACY_SUPABASE_SESSION_KEY);
        } else {
            await chrome.storage.local.remove([SUPABASE_SESSION_KEY, LEGACY_SUPABASE_SESSION_KEY, LEGACY_SUPABASE_SESSION_KEY_2]);
        }
        console.log('[AUTH_STATE]', event, '| hasSession:', !!session);
    }

    async fetchProfileFromSession(session) {
        if (!session?.access_token) return null;

        const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
            method: 'GET',
            headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${session.access_token}`
            }
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Failed to fetch profile (${response.status}): ${errText}`);
        }

        const user = await response.json();
        const userProfile = {
            id: user.id,
            email: user.email,
            name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'User'
        };

        await chrome.storage.local.set({ user: userProfile });
        return userProfile;
    }

    async refreshSupabaseSession(refreshToken) {
        const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': SUPABASE_ANON_KEY
            },
            body: JSON.stringify({ refresh_token: refreshToken })
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Refresh session failed (${response.status}): ${errText}`);
        }

        const refreshed = await response.json();
        return {
            access_token: refreshed.access_token,
            refresh_token: refreshed.refresh_token || refreshToken,
            expires_at: Math.floor(Date.now() / 1000) + (refreshed.expires_in || 3600),
            expires_in: refreshed.expires_in || 3600,
            token_type: refreshed.token_type || 'bearer',
            user: refreshed.user || null
        };
    }

    async restoreSession() {
        try {
            const stored = await chrome.storage.local.get([SUPABASE_SESSION_KEY, LEGACY_SUPABASE_SESSION_KEY, LEGACY_SUPABASE_SESSION_KEY_2]);
            let session = stored[SUPABASE_SESSION_KEY] || stored[LEGACY_SUPABASE_SESSION_KEY] || stored[LEGACY_SUPABASE_SESSION_KEY_2] || null;

            if (!session) {
                console.log('[SESSION] No stored Supabase session to restore');
                return;
            }

            // Migrate from legacy keys to new key
            if (!stored[SUPABASE_SESSION_KEY] && (stored[LEGACY_SUPABASE_SESSION_KEY] || stored[LEGACY_SUPABASE_SESSION_KEY_2])) {
                const legacySession = stored[LEGACY_SUPABASE_SESSION_KEY] || stored[LEGACY_SUPABASE_SESSION_KEY_2];
                await chrome.storage.local.set({ [SUPABASE_SESSION_KEY]: legacySession });
                await chrome.storage.local.remove([LEGACY_SUPABASE_SESSION_KEY, LEGACY_SUPABASE_SESSION_KEY_2]);
            }

            const now = Math.floor(Date.now() / 1000);
            const isExpired = session.expires_at ? session.expires_at <= (now + 30) : false;

            if (isExpired) {
                if (!session.refresh_token) {
                    await this.handleSupabaseAuthStateChange('SIGNED_OUT', null);
                    await chrome.storage.local.remove(['user']);
                    return;
                }
                session = await this.refreshSupabaseSession(session.refresh_token);
            }

            await this.handleSupabaseAuthStateChange('INITIAL_SESSION', session);
            await this.fetchProfileFromSession(session);
            console.log('[SESSION] Supabase session restored successfully');
        } catch (error) {
            console.error('[SESSION] Restore failed:', error);
            await this.handleSupabaseAuthStateChange('SIGNED_OUT', null);
            await chrome.storage.local.remove(['user']);
        }
    }

    // ── Setup all event listeners ─────────────────────────────
    initializeListeners() {
        // Extension install handler
        chrome.runtime.onInstalled.addListener((details) => {
            if (details.reason === 'install') {
                this.onInstall();
            }
        });

        // Single unified message router — all actions use message.action (or message.type as fallback)
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            console.log("[BACKGROUND] Message received:", message);

            const actionKey = message.action || message.type;

            if (!actionKey) {
                console.warn("[BACKGROUND] Missing action/type in message:", message);
                return;
            }

            const payload = message.payload || {};

            switch (actionKey) {
                // ── Warmup ping — wakes the service worker ──
                case 'PING':
                    console.log('[SW_READY] Service worker alive and responding to PING');
                    sendResponse({ ok: true });
                    return true;

                // ── Google OAuth ──
                case 'GOOGLE_LOGIN':
                    console.log("[BACKGROUND] GOOGLE_LOGIN received");
                    this.handleGoogleOAuth(sendResponse);
                    return true;

                // ── Get user profile / login status ──
                case 'GET_PROFILE':
                case 'GET_USER_STATUS': {
                    (async () => {
                        try {
                            await this.restoreSessionPromise;
                            const stored = await chrome.storage.local.get(['user']);
                            const sessionCheck = await chrome.storage.local.get([SUPABASE_SESSION_KEY]);
                            const hasSession = !!sessionCheck[SUPABASE_SESSION_KEY];
                            sendResponse({
                                success: true,
                                isLoggedIn: !!(stored.user && hasSession),
                                user: stored.user
                            });
                        } catch (error) {
                            console.error('GET_PROFILE error:', error);
                            sendResponse({ success: false, error: error.message });
                        }
                    })();
                    return true;
                }

                // ── Auth success from popup ──
                case 'AUTH_SUCCESS': {
                    // message uses { type: 'AUTH_SUCCESS', session } — handle both .action and .type
                    const authSession = message.session || payload.session;
                    if (authSession?.user) {
                        console.log('[AUTH_SUCCESS] User logged in:', authSession.user.email);
                        chrome.storage.local.set({
                            user: {
                                id: authSession.user.id,
                                email: authSession.user.email,
                                name: authSession.user.user_metadata?.full_name || authSession.user.email?.split('@')[0] || 'User'
                            },
                            isLoggedIn: true
                        });
                    }
                    sendResponse({ ok: true });
                    return true;
                }

                // ── Logout ──
                case 'LOGOUT': {
                    (async () => {
                        try {
                            await this.handleSupabaseAuthStateChange('SIGNED_OUT', null);
                            await chrome.storage.local.remove(['user']);
                            sendResponse({ success: true });
                        } catch (error) {
                            console.error('LOGOUT error:', error);
                            sendResponse({ success: false, error: error.message });
                        }
                    })();
                    return true;
                }

                // ── Get / refresh credits (live from profiles table) ──
                case 'REFRESH_CREDITS':
                case 'GET_CREDITS': {
                    (async () => {
                        try {
                            // Ensure any pending session restore completes first
                            await this.restoreSessionPromise;

                            // 1. Get the stored session to obtain access_token
                            const sessionStore = await chrome.storage.local.get([SUPABASE_SESSION_KEY]);
                            const session = sessionStore[SUPABASE_SESSION_KEY];
                            if (!session?.access_token) {
                                console.warn('[GET_CREDITS] No session found in storage');
                                sendResponse({ success: false, allowed: false, credits: 0, error: 'No session' });
                                return;
                            }

                            // 2. Identify the current user via Supabase auth
                            const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
                                headers: {
                                    apikey: SUPABASE_ANON_KEY,
                                    Authorization: `Bearer ${session.access_token}`
                                }
                            });
                            if (!userRes.ok) {
                                const authErrText = await userRes.text().catch(() => '');
                                console.error('[GET_CREDITS] Auth failed:', userRes.status, authErrText);
                                sendResponse({ success: false, allowed: false, credits: 0, error: `Auth failed (${userRes.status})` });
                                return;
                            }
                            const authUser = await userRes.json();
                            console.log('[GET_CREDITS] authUser.id:', authUser.id);

                            // 3. Fetch live credits from profiles table
                            const profileUrl = `${SUPABASE_URL}/rest/v1/profiles?id=eq.${authUser.id}&select=credits`;
                            console.log('[GET_CREDITS] Fetching:', profileUrl);

                            const profileRes = await fetch(profileUrl, {
                                headers: {
                                    apikey: SUPABASE_ANON_KEY,
                                    Authorization: `Bearer ${session.access_token}`
                                }
                            });

                            if (!profileRes.ok) {
                                const profileErrText = await profileRes.text().catch(() => '');
                                console.error('[GET_CREDITS] Profile fetch failed:', profileRes.status, profileErrText);
                                sendResponse({ success: false, allowed: false, credits: 0, error: `Profile fetch failed (${profileRes.status})` });
                                return;
                            }

                            const profiles = await profileRes.json();
                            console.log('[GET_CREDITS] Raw profiles response:', JSON.stringify(profiles));

                            // 4. Handle empty array (RLS policy may be blocking access)
                            if (!Array.isArray(profiles) || profiles.length === 0) {
                                console.warn('[GET_CREDITS] Empty profiles array — RLS may be blocking access for user:', authUser.id);
                                sendResponse({
                                    success: false,
                                    allowed: false,
                                    credits: 0,
                                    error: 'Profile not found — check RLS policies on profiles table'
                                });
                                return;
                            }

                            // 5. Parse credits
                            const credits = profiles[0].credits ?? 0;

                            console.log('[GET_CREDITS] credits:', credits, '| allowed:', credits > 0);
                            sendResponse({
                                success: true,
                                allowed: credits > 0,
                                credits: credits
                            });
                        } catch (error) {
                            console.error('[GET_CREDITS] Unexpected error:', error);
                            sendResponse({ success: false, allowed: false, credits: 0, error: error.message });
                        }
                    })();
                    return true;
                }

                // ── Deduct credits via Supabase RPC ──
                case 'DEDUCT_CREDITS': {
                    const deductAmount = payload.amount || message.amount || 1;
                    (async () => {
                        try {
                            await this.restoreSessionPromise;

                            const sessionStore = await chrome.storage.local.get([SUPABASE_SESSION_KEY]);
                            const session = sessionStore[SUPABASE_SESSION_KEY];
                            if (!session?.access_token) {
                                sendResponse({ success: false, remaining: 0, error: 'No session' });
                                return;
                            }

                            // Call the deduct_credit RPC (handles balance check + deduction atomically)
                            const rpcRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/deduct_credit`, {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                    apikey: SUPABASE_ANON_KEY,
                                    Authorization: `Bearer ${session.access_token}`
                                },
                                body: JSON.stringify({ amount: deductAmount })
                            });

                            if (!rpcRes.ok) {
                                const errBody = await rpcRes.json().catch(() => ({}));
                                const errMsg = errBody?.message || errBody?.error || 'Deduct RPC failed';
                                sendResponse({ success: false, remaining: 0, error: errMsg });
                                return;
                            }

                            const remaining = await rpcRes.json();

                            console.log('[DEDUCT_CREDITS] Deducted', deductAmount, '→ remaining:', remaining);
                            sendResponse({ success: true, remaining });
                        } catch (error) {
                            console.error('DEDUCT_CREDITS error:', error);
                            sendResponse({ success: false, remaining: 0, error: error.message });
                        }
                    })();
                    return true;
                }

                // ── Run AI Shipping Optimizer (deduct 1 credit) ──
                case 'RUN_OPTIMIZER': {
                    (async () => {
                        try {
                            await this.restoreSessionPromise;

                            const sessionStore = await chrome.storage.local.get([SUPABASE_SESSION_KEY]);
                            const session = sessionStore[SUPABASE_SESSION_KEY];
                            if (!session?.access_token) {
                                sendResponse({ success: false, error: 'No session — please login' });
                                return;
                            }

                            // Deduct 1 credit via the existing deduct_credit RPC
                            const rpcRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/deduct_credit`, {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                    apikey: SUPABASE_ANON_KEY,
                                    Authorization: `Bearer ${session.access_token}`
                                },
                                body: JSON.stringify({ amount: 1 })
                            });

                            if (!rpcRes.ok) {
                                const errBody = await rpcRes.json().catch(() => ({}));
                                const errMsg = errBody?.message || errBody?.error || 'Credit deduction failed';
                                console.error('[RUN_OPTIMIZER] Deduction failed:', errMsg);
                                sendResponse({ success: false, error: errMsg });
                                return;
                            }

                            const remaining = await rpcRes.json();
                            console.log('[RUN_OPTIMIZER] 1 credit deducted → remaining:', remaining);
                            sendResponse({ success: true, remaining });
                        } catch (error) {
                            console.error('[RUN_OPTIMIZER] Error:', error);
                            sendResponse({ success: false, error: error.message });
                        }
                    })();
                    return true;
                }

                // ── Generic fetch proxy (popup → service worker → Supabase) ──
                case 'PROXY_FETCH': {
                    const fetchUrl = payload.url || message.url;
                    const fetchOptions = payload.options || message.options || {};
                    (async () => {
                        console.log('[SW_FETCH_START]', fetchUrl);
                        try {
                            // Auto-inject Authorization header from stored session
                            // so content.js proxied calls are authenticated
                            if (!fetchOptions.headers) fetchOptions.headers = {};
                            if (!fetchOptions.headers['Authorization'] && !fetchOptions.headers['authorization']) {
                                const sessionStore = await chrome.storage.local.get([SUPABASE_SESSION_KEY]);
                                const sess = sessionStore[SUPABASE_SESSION_KEY];
                                if (sess?.access_token) {
                                    fetchOptions.headers['Authorization'] = `Bearer ${sess.access_token}`;
                                }
                            }
                            const res = await fetch(fetchUrl, fetchOptions);
                            const text = await res.text();
                            console.log('[SW_FETCH_SUCCESS]', fetchUrl, '→', res.status);
                            let json = null;
                            try { json = JSON.parse(text); } catch (_) {}
                            sendResponse({
                                success: true,
                                status: res.status,
                                ok: res.ok,
                                body: json !== null ? json : text
                            });
                        } catch (err) {
                            console.error('[SW_FETCH_ERROR]', fetchUrl, err.message);
                            sendResponse({ success: false, error: err.message });
                        }
                    })();
                    return true;
                }

                default:
                    console.warn("[BACKGROUND] Unknown action:", message.action);
                    sendResponse({ success: false, error: 'Unknown action: ' + message.action });
                    return true;
            }
        });
    }

    // ── On first install ──────────────────────────────────────
    onInstall() {
        console.log('Meesho Credits Extension v2.0.0 installed');
        chrome.storage.local.set({
            settings: {
                maxVariations: 100,
                preferredImageFormat: 'jpeg',
                compressionLevel: 0.85
            }
        });
    }

    // ── Google OAuth Flow (with PKCE support) ────────────────────────────────
    async handleGoogleOAuth(sendResponse) {
        console.log("[OAUTH] Starting OAuth flow");
        // Helper to respond and ALWAYS release the lock
        const respond = (response) => {
            oauthInProgress = false;
            try { sendResponse(response); } catch (_) { /* port may be closed */ }
        };

        try {
            console.log('[OAUTH_START] Google OAuth flow initiated from background.js');
            console.log("[OAUTH] Starting OAuth flow"); // User required log

            // ── Prevent duplicate OAuth flows ──
            const now = Date.now();
            if (oauthInProgress) {
                // Safety: auto-release lock if stuck for >2 minutes
                if (now - lastOAuthAttempt > 120000) {
                    console.warn('[OAUTH_LOCK] Force-releasing stale lock after 2 min');
                    oauthInProgress = false;
                } else {
                    console.log('[OAUTH_BLOCKED] OAuth already in progress, rejecting duplicate');
                    sendResponse({
                        success: false,
                        error: 'Login already in progress. Please wait...',
                        code: 'OAUTH_IN_PROGRESS'
                    });
                    return;
                }
            }

            if (now - lastOAuthAttempt < OAUTH_COOLDOWN_MS) {
                console.log('[OAUTH_BLOCKED] Cooldown active, please wait');
                sendResponse({
                    success: false,
                    error: 'Please wait a moment before trying again.',
                    code: 'OAUTH_COOLDOWN'
                });
                return;
            }

            oauthInProgress = true;
            lastOAuthAttempt = now;

            // Safety: auto-release lock after 2 minutes regardless
            setTimeout(() => {
                if (oauthInProgress) {
                    console.warn('[OAUTH_LOCK] Auto-releasing lock after 2 min timeout');
                    oauthInProgress = false;
                }
            }, 120000);

            const redirectUri = chrome.identity.getRedirectURL();
            const extensionId = chrome.runtime.id;
            console.log('[OAUTH_CONFIG] Redirect URL:', redirectUri);
            console.log('[OAUTH_CONFIG] Extension ID:', extensionId);
            console.log('[OAUTH_CONFIG] Supabase URL:', SUPABASE_URL);

            // ── Check extension ID matches expected ──
            const expectedId = 'mabegbmfmmlmgphgfblcjcalgfepldkm';
            if (extensionId !== expectedId) {
                console.warn(`[OAUTH_CONFIG] Extension ID mismatch! Current: ${extensionId}, Expected: ${expectedId}`);
                console.warn(`[OAUTH_CONFIG] Ensure this redirect URL is in Supabase Dashboard → Auth → Redirect URLs: ${redirectUri}`);
            }

            // ── Generate PKCE code verifier + challenge ──
            const codeVerifier = generateCodeVerifier();
            const codeChallenge = await generateCodeChallenge(codeVerifier);
            console.log('[OAUTH_PKCE] Code challenge generated successfully');

            // Build Supabase OAuth URL with PKCE
            const supabaseOAuthUrl =
                `${SUPABASE_URL}/auth/v1/authorize` +
                `?provider=google` +
                `&redirect_to=${encodeURIComponent(redirectUri)}` +
                `&code_challenge=${encodeURIComponent(codeChallenge)}` +
                `&code_challenge_method=S256`;

            console.log('[OAUTH_LAUNCH] Opening Google OAuth via launchWebAuthFlow...');
            console.log("[OAUTH] Launching WebAuthFlow:", supabaseOAuthUrl);
            console.log("[OAUTH] Auth URL:", supabaseOAuthUrl); // User required log
            console.log('[OAUTH_LAUNCH] Full Supabase OAuth URL:', supabaseOAuthUrl);

            // Open Google login popup via Chrome identity API
            chrome.identity.launchWebAuthFlow(
                { url: supabaseOAuthUrl, interactive: true },
                async (responseUrl) => {
                    console.log('[OAUTH_CALLBACK] launchWebAuthFlow callback fired');
                    console.log('[OAUTH] Redirect received:', responseUrl);

                    if (!responseUrl) {
                        if (chrome.runtime.lastError) {
                            const errMsg = chrome.runtime.lastError.message || '';
                            console.error('[OAUTH_ERROR] chrome.runtime.lastError:', errMsg);
                            console.error('[OAUTH_ERROR] Redirect URL was:', responseUrl);

                            if (errMsg.includes('Authorization page could not be loaded')) {
                                console.error('[OAUTH_ERROR] Troubleshooting:');
                                console.error('   1. Supabase → Providers → Google ENABLED with Client ID & Secret');
                                console.error(`   2. Google Console redirect URI: ${SUPABASE_URL}/auth/v1/callback`);
                                console.error(`   3. Supabase Redirect URLs includes: ${redirectUri}`);
                                respond({
                                    success: false,
                                    error: `Google login failed. Check:\n1. Supabase → Providers → Google enabled\n2. Google Console redirect: ${SUPABASE_URL}/auth/v1/callback\n3. Supabase Dashboard → Auth → Redirect URLs must include:\n${redirectUri}`,
                                    code: 'OAUTH_SETUP_ERROR'
                                });
                            } else if (errMsg.includes('canceled') || errMsg.includes('cancelled') || errMsg.includes('user closed')) {
                                respond({
                                    success: false,
                                    error: 'Login cancelled by user.',
                                    code: 'USER_CANCELLED'
                                });
                            } else {
                                respond({ success: false, error: errMsg });
                            }
                            return;
                        }

                        console.warn('[OAUTH_CALLBACK] responseUrl is null with no runtime error');
                        respond({ success: false, error: 'Login cancelled by user' });
                        return;
                    }

                    // ── User cancelled or Chrome error
                    if (chrome.runtime.lastError) {
                        const errMsg = chrome.runtime.lastError.message || '';
                        console.error('[OAUTH_ERROR] chrome.runtime.lastError:', errMsg);
                        console.error('[OAUTH_ERROR] Redirect URL was:', responseUrl);

                        if (errMsg.includes('Authorization page could not be loaded')) {
                            console.error('[OAUTH_ERROR] Troubleshooting:');
                            console.error('   1. Supabase → Providers → Google ENABLED with Client ID & Secret');
                            console.error(`   2. Google Console redirect URI: ${SUPABASE_URL}/auth/v1/callback`);
                            console.error(`   3. Supabase Redirect URLs includes: ${redirectUri}`);
                            respond({
                                success: false,
                                error: `Google login failed. Check:\n1. Supabase → Providers → Google enabled\n2. Google Console redirect: ${SUPABASE_URL}/auth/v1/callback\n3. Supabase Dashboard → Auth → Redirect URLs must include:\n${redirectUri}`,
                                code: 'OAUTH_SETUP_ERROR'
                            });
                        } else if (errMsg.includes('canceled') || errMsg.includes('cancelled') || errMsg.includes('user closed')) {
                            respond({
                                success: false,
                                error: 'Login cancelled by user.',
                                code: 'USER_CANCELLED'
                            });
                        } else {
                            respond({ success: false, error: errMsg });
                        }
                        return;
                    }

                    try {
                        console.log('[OAUTH_REDIRECT] Full redirect URL:', responseUrl);

                        const url = new URL(responseUrl);
                        const params = url.searchParams;
                        const hashParams = url.hash
                            ? new URLSearchParams(url.hash.substring(1))
                            : new URLSearchParams();

                        // Surface any OAuth error from provider
                        const errorCode = params.get('error') || hashParams.get('error');
                        if (errorCode) {
                            const desc = params.get('error_description') || hashParams.get('error_description') || errorCode;
                            console.error('[OAUTH_REDIRECT] Error from provider:', desc);
                            respond({ success: false, error: desc });
                            return;
                        }

                        // ── PKCE Flow: Exchange authorization code for tokens ──
                        const authCode = params.get('code');
                        console.log('[OAUTH] Parsed code:', authCode);
                        if (authCode) {
                            console.log('[OAUTH_TOKEN] Authorization code extracted, length:', authCode.length);

                            console.log('[OAUTH_TOKEN] Exchanging code via PKCE...');
                            const { data, error } = await supabaseExchangeCodeForSession(authCode, codeVerifier);

                            if (error) {
                                console.error('[SUPABASE ERROR]', error);
                                respond({ success: false, error: error.message || 'Code exchange failed' });
                                return;
                            }

                            const tokenData = data?.session;

                            console.log('[OAUTH_TOKEN] Token exchange response keys:', Object.keys(tokenData));
                            console.log('[OAUTH_TOKEN] has access_token:', !!tokenData.access_token);
                            console.log('[OAUTH_TOKEN] has refresh_token:', !!tokenData.refresh_token);
                            console.log('[OAUTH_TOKEN] has user:', !!tokenData.user);
                            console.log('[OAUTH_TOKEN] token_type:', tokenData.token_type, '| expires_in:', tokenData.expires_in);

                            if (!tokenData.access_token) {
                                console.error('[OAUTH_TOKEN] No access_token in response');
                                respond({ success: false, error: 'No access token in token exchange response' });
                                return;
                            }

                            // ── Persist session to chrome.storage.local ──
                            const sessionPayload = {
                                access_token: tokenData.access_token,
                                refresh_token: tokenData.refresh_token || '',
                                expires_at: Math.floor(Date.now() / 1000) + (tokenData.expires_in || 3600),
                                expires_in: tokenData.expires_in || 3600,
                                token_type: tokenData.token_type || 'bearer',
                                user: tokenData.user || null
                            };
                            await this.handleSupabaseAuthStateChange('SIGNED_IN', sessionPayload);
                            await this.fetchProfileFromSession(sessionPayload);
                            console.log('[SESSION] Stored successfully');

                            const responsePayload = {
                                success: true,
                                access_token: tokenData.access_token,
                                refresh_token: tokenData.refresh_token || null,
                                expires_in: tokenData.expires_in,
                                token_type: tokenData.token_type,
                                user: tokenData.user || null
                            };
                            console.log('[OAUTH_SUCCESS] PKCE exchange successful — sending tokens to popup');
                            console.log('[OAUTH_SUCCESS] access_token length:', tokenData.access_token?.length);
                            respond(responsePayload);

                            // Broadcast session to any other extension pages
                            try {
                                chrome.runtime.sendMessage({
                                    action: 'SUPABASE_SESSION',
                                    payload: {
                                        session: {
                                            access_token: tokenData.access_token,
                                            refresh_token: tokenData.refresh_token
                                        }
                                    }
                                });
                            } catch (_) { /* no receivers is OK */ }
                            return;
                        }

                        // ── Implicit flow fallback: check for access_token in hash ──
                        const hashAccessToken = hashParams.get('access_token');
                        console.log('[OAUTH] Parsed token:', hashAccessToken);
                        if (hashAccessToken) {
                            console.log('[OAUTH_TOKEN] access_token found in hash (implicit flow)');

                            // Persist implicit flow session too
                            const implicitSession = {
                                access_token: hashAccessToken,
                                refresh_token: hashParams.get('refresh_token') || '',
                                expires_at: Math.floor(Date.now() / 1000) + parseInt(hashParams.get('expires_in') || '3600', 10),
                                expires_in: parseInt(hashParams.get('expires_in') || '3600', 10),
                                token_type: hashParams.get('token_type') || 'bearer',
                                user: null
                            };
                            await this.handleSupabaseAuthStateChange('SIGNED_IN', implicitSession);
                            await this.fetchProfileFromSession(implicitSession).catch(() => { });
                            console.log('[SESSION] Stored successfully');

                            const responsePayload = {
                                success: true,
                                access_token: hashAccessToken,
                                refresh_token: hashParams.get('refresh_token') || null,
                                expires_in: parseInt(hashParams.get('expires_in') || '3600', 10),
                                token_type: hashParams.get('token_type') || 'bearer',
                                user: null
                            };
                            console.log('[OAUTH_SUCCESS] Implicit token received — sending to popup');
                            respond(responsePayload);
                            return;
                        }

                        // ── No code or token found ──
                        console.error('[OAUTH_REDIRECT] No code or access_token in callback URL');
                        console.error('   Query params:', url.search);
                        console.error('   Hash:', url.hash);
                        respond({ success: false, error: 'No authorization code or token received from Google.' });

                    } catch (parseError) {
                        console.error('[OAUTH_PARSE] Error parsing callback URL:', parseError);
                        respond({ success: false, error: 'Failed to parse OAuth response: ' + parseError.message });
                    }
                }
            );

        } catch (e) {
            console.error('[OAUTH_EXCEPTION] handleGoogleOAuth exception:', e);
            respond({ success: false, error: e.message });
        }
    }
}

// ── Keep Service Worker Alive ──────────────────────────────────
chrome.runtime.onInstalled.addListener(() => {
    console.log("Extension Installed");
});

chrome.runtime.onStartup.addListener(() => {
    console.log("Extension Started");
});

// keep service worker alive when messages come
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg?.action === "PING") {
        sendResponse({ ok: true });
        return true;
    }
});

// ── Restore session from supabaseSession on extension load ──
chrome.storage.local.get(['supabaseSession'], async (result) => {
    if (result.supabaseSession) {
        try {
            // Sync supabaseSession → sbSession so BackgroundService picks it up
            const existing = await chrome.storage.local.get([SUPABASE_SESSION_KEY]);
            if (!existing[SUPABASE_SESSION_KEY]) {
                await chrome.storage.local.set({ [SUPABASE_SESSION_KEY]: result.supabaseSession });
                console.log('[SESSION_RESTORE] supabaseSession synced to sbSession');
            }
            console.log('[SESSION_RESTORE] Session restored from supabaseSession');
        } catch (e) {
            console.error('[SESSION_RESTORE] Error restoring supabaseSession:', e);
        }
    }
});

// ── Bootstrap ─────────────────────────────────────────────────
new BackgroundService();
