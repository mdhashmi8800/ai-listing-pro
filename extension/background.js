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
        this.initializeListeners();
    }

    // ── Setup all event listeners ─────────────────────────────
    initializeListeners() {
        // Extension install handler
        chrome.runtime.onInstalled.addListener((details) => {
            if (details.reason === 'install') {
                this.onInstall();
            }
        });

        // Message listener — OAuth handled separately (needs async callback)
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            console.log("[BACKGROUND] Message received:", message); // User requested log

            // ── Warmup ping — wakes the service worker so the next message succeeds ──
            if (message.type === 'PING') {
                console.log('[SW_READY] Service worker alive and responding to PING');
                sendResponse({ ok: true });
                return true;
            }

            if (message.type === 'GOOGLE_LOGIN') { // Changed to type: GOOGLE_LOGIN
                console.log("[BACKGROUND] GOOGLE_LOGIN received");
                this.handleGoogleOAuth(sendResponse);
                return true; // Keep channel open for async response
            }

            this.handleMessage(message, sender, sendResponse);
            return true; // Keep channel open for all async responses
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

    // ── Central message handler ───────────────────────────────
    async handleMessage(message, sender, sendResponse) {
        try {
            switch (message.type) {

                // Check if user is logged in
                case 'GET_USER_STATUS': {
                    const stored = await chrome.storage.local.get(['user']);
                    // Check for Supabase SDK session key only (SDK manages persistence)
                    const sbSessionKey = `sb-zxborvqzttyofyrksznw-auth-token`;
                    const sessionCheck = await chrome.storage.local.get([sbSessionKey]);
                    const hasSession = !!sessionCheck[sbSessionKey];
                    sendResponse({
                        success: true,
                        isLoggedIn: !!(stored.user && hasSession),
                        user: stored.user
                    });
                    break;
                }

                // Logout — clear user data (Supabase SDK handles session cleanup)
                case 'LOGOUT': {
                    await chrome.storage.local.remove(['user']);
                    sendResponse({ success: true });
                    break;
                }

                // Fetch current credit balance
                case 'GET_CREDITS': {
                    const userData = await chrome.storage.local.get(['user']);
                    sendResponse({
                        success: true,
                        credits: userData.user?.credits || 0,
                        unlimitedUntil: userData.user?.unlimitedUntil
                    });
                    break;
                }

                // ── Generic fetch proxy (popup → service worker → Supabase) ──
                case 'PROXY_FETCH': {
                    console.log('[SW_FETCH_START]', message.url);
                    try {
                        const res = await fetch(message.url, message.options || {});
                        const text = await res.text();
                        console.log('[SW_FETCH_SUCCESS]', message.url, '→', res.status);
                        let json = null;
                        try { json = JSON.parse(text); } catch (_) {}
                        sendResponse({
                            success: true,
                            status: res.status,
                            ok: res.ok,
                            body: json !== null ? json : text
                        });
                    } catch (err) {
                        console.error('[SW_FETCH_ERROR]', message.url, err.message);
                        sendResponse({ success: false, error: err.message });
                    }
                    break;
                }

                default:
                    sendResponse({ success: false, error: 'Unknown message type' });
            }
        } catch (error) {
            console.error('handleMessage error:', error);
            sendResponse({ success: false, error: error.message });
        }
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
                            const sbSessionKey = 'sb-zxborvqzttyofyrksznw-auth-token';
                            const sessionPayload = {
                                access_token: tokenData.access_token,
                                refresh_token: tokenData.refresh_token || '',
                                expires_at: Math.floor(Date.now() / 1000) + (tokenData.expires_in || 3600),
                                expires_in: tokenData.expires_in || 3600,
                                token_type: tokenData.token_type || 'bearer',
                                user: tokenData.user || null
                            };
                            await chrome.storage.local.set({ [sbSessionKey]: sessionPayload });
                            console.log('[SESSION] Stored successfully');

                            // Also persist user profile object
                            if (tokenData.user) {
                                const userProfile = {
                                    id: tokenData.user.id,
                                    email: tokenData.user.email,
                                    name: tokenData.user.user_metadata?.full_name || tokenData.user.email?.split('@')[0] || 'User'
                                };
                                await chrome.storage.local.set({ user: userProfile });
                                console.log('[OAUTH_PERSIST] User profile saved:', userProfile.email);
                            }

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
                                    type: 'SUPABASE_SESSION',
                                    session: {
                                        access_token: tokenData.access_token,
                                        refresh_token: tokenData.refresh_token
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
                            const sbSessionKey2 = 'sb-zxborvqzttyofyrksznw-auth-token';
                            const implicitSession = {
                                access_token: hashAccessToken,
                                refresh_token: hashParams.get('refresh_token') || '',
                                expires_at: Math.floor(Date.now() / 1000) + parseInt(hashParams.get('expires_in') || '3600', 10),
                                expires_in: parseInt(hashParams.get('expires_in') || '3600', 10),
                                token_type: hashParams.get('token_type') || 'bearer',
                                user: null
                            };
                            await chrome.storage.local.set({ [sbSessionKey2]: implicitSession });
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

// ── Bootstrap ─────────────────────────────────────────────────
new BackgroundService();
