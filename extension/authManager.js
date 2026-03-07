// ============================================================
//  authManager.js — Complete Authentication & Credits Manager
//
//  Combines the best of Supabase-JS SDK with manual fetch patterns:
//
//  ✅ Google OAuth via background script (MV3 safe)
//  ✅ Email Magic Link + Phone OTP via Supabase SDK
//  ✅ Session persisted in chrome.storage.local
//  ✅ Token auto-refresh (SDK + manual fallback)
//  ✅ ban system (is_banned / ban_reason)
//  ✅ Unlimited access (unlimited_until timestamp)
//  ✅ IP tracking (signup_ip / last_ip)
//  ✅ DB sync on every login (upsert pattern)
//  ✅ refreshUser() to reload credits anytime
// ============================================================

const AuthManager = {

    // ── Internal State ─────────────────────────────────────────
    user: null,   // { id, email, name, credits }
    _sb: null,   // Supabase SDK client reference
    _authChangeListener: null,

    // ══════════════════════════════════════════════════════════
    //  SETUP
    // ══════════════════════════════════════════════════════════

    /** Call once after DOM ready or background script start */
    init: async function () {
        if (!CONFIG.isConfigured()) {
            console.warn("⚠️ Supabase not configured in config.js");
            return null;
        }

        // Grab the Supabase SDK client (initialised by supabaseClient.js)
        this._sb = window.supabaseClient;

        // ── Listen for SDK auth state changes (handles TOKEN_REFRESHED, SIGNED_OUT…)
        if (this._sb) {
            this._sb.auth.onAuthStateChange(async (event, session) => {
                console.log("🔔 Auth event:", event);

                if (event === "TOKEN_REFRESHED" && session?.access_token) {
                    console.log("🔄 Token refreshed by Supabase SDK");
                }

                if (event === "SIGNED_OUT") {
                    this.user = null;
                    await chrome.storage.local.remove(["user"]);
                }
            });
        }

        // ── Check for OAuth callback hash (fallback for non-background flows)
        if (await this._handleOAuthCallback()) return this.user;

        // ── Restore session: prefer Supabase SDK session ──
        try {
            if (this._sb) {
                const { data: sessionData } = await this._sb.auth.getSession();
                if (sessionData?.session) {
                    console.log("✅ AuthManager: Session found via Supabase SDK");
                    const supaUser = sessionData.session.user;
                    const stored = await chrome.storage.local.get(["user"]);
                    this.user = stored.user || this._buildUserObject(supaUser, null);
                    if (!stored.user) {
                        await chrome.storage.local.set({ user: this.user });
                    }
                    return this.user;
                }
            }

            // Fallback: try legacy chrome.storage.local session
            const stored = await chrome.storage.local.get(["user", "session"]);
            if (stored.user && (stored.session?.accessToken || stored.session?.access_token)) {
                this.user = stored.user;

                const valid = await this.verifySession(stored.session);
                if (!valid) {
                    console.warn("⚠️ Legacy session invalid/expired — logging out");
                    await this.logout();
                } else {
                    // Sync legacy tokens into Supabase SDK
                    if (this._sb) {
                        await this._sb.auth.setSession({
                            access_token: stored.session.accessToken,
                            refresh_token: stored.session.refreshToken || ""
                        }).catch(() => { });
                        console.log("✅ Legacy session synced to Supabase SDK");
                    }
                }
            }
        } catch (e) {
            console.error("Auth init error:", e);
        }

        return this.user;
    },

    // ══════════════════════════════════════════════════════════
    //  GOOGLE OAUTH — Background Script Flow (MV3 safe)
    // ══════════════════════════════════════════════════════════

    loginWithGoogle: async function () {
        if (!CONFIG.isConfigured()) {
            return { success: false, error: "Supabase not configured" };
        }

        try {
            console.log("🔐 Requesting Google OAuth from background script…");

            return new Promise((resolve) => {
                chrome.runtime.sendMessage(
                    { action: "GOOGLE_LOGIN" },
                    async (response) => {

                        // ── Background script unavailable → fallback
                        if (chrome.runtime.lastError) {
                            console.warn("Background error:", chrome.runtime.lastError.message);
                            const fallbackResult = await this._googleOAuthFallback();
                            if (fallbackResult?.success) {
                                await this._syncSessionToStorage();
                            }
                            resolve(fallbackResult);
                            return;
                        }

                        if (response?.success && response?.accessToken) {
                            const ok = await this._processOAuthTokens(
                                response.accessToken,
                                response.refreshToken
                            );
                            if (ok) {
                                await this._syncSessionToStorage();
                            }
                            resolve(ok
                                ? { success: true, user: this.user }
                                : { success: false, error: "Failed to process Google tokens" }
                            );
                        } else {
                            resolve({ success: false, error: response?.error || "Google OAuth failed" });
                        }
                    }
                );
            });

        } catch (e) {
            console.error("Google login error:", e);
            return { success: false, error: e.message };
        }
    },

    /** Fallback: use launchWebAuthFlow with PKCE if background script is unreachable */
    _googleOAuthFallback: async function () {
        try {
            const redirectUrl = chrome.identity.getRedirectURL();

            // Generate PKCE code verifier and challenge
            const codeVerifier = this._generateCodeVerifier();
            const codeChallenge = await this._generateCodeChallenge(codeVerifier);

            const { data, error } = await this._sb.auth.signInWithOAuth({
                provider: "google",
                options: {
                    redirectTo: redirectUrl,
                    skipBrowserRedirect: true
                }
            });

            if (error || !data?.url) {
                return { success: false, error: error?.message || "OAuth URL failed" };
            }

            // Append PKCE params if not already present in the URL
            let oauthUrl = data.url;
            if (!oauthUrl.includes('code_challenge')) {
                const separator = oauthUrl.includes('?') ? '&' : '?';
                oauthUrl += `${separator}code_challenge=${encodeURIComponent(codeChallenge)}&code_challenge_method=S256`;
            }

            return new Promise((resolve) => {
                chrome.identity.launchWebAuthFlow(
                    { url: oauthUrl, interactive: true },
                    async (responseUrl) => {
                        if (chrome.runtime.lastError || !responseUrl) {
                            resolve({ success: false, error: "Google login cancelled" });
                            return;
                        }

                        const url = new URL(responseUrl);
                        const params = url.searchParams;
                        const hashParams = url.hash
                            ? new URLSearchParams(url.hash.substring(1))
                            : new URLSearchParams();

                        // Check for error
                        const errorCode = params.get('error') || hashParams.get('error');
                        if (errorCode) {
                            const desc = params.get('error_description') || hashParams.get('error_description') || errorCode;
                            resolve({ success: false, error: desc });
                            return;
                        }

                        // PKCE flow: exchange code for tokens
                        const authCode = params.get('code');
                        if (authCode) {
                            try {
                                const tokenRes = await fetch(
                                    `${CONFIG.SUPABASE_URL}/auth/v1/token?grant_type=pkce`,
                                    {
                                        method: "POST",
                                        headers: {
                                            "Content-Type": "application/json",
                                            apikey: CONFIG.SUPABASE_ANON_KEY
                                        },
                                        body: JSON.stringify({
                                            auth_code: authCode,
                                            code_verifier: codeVerifier
                                        })
                                    }
                                );

                                if (!tokenRes.ok) {
                                    resolve({ success: false, error: `Token exchange failed (${tokenRes.status})` });
                                    return;
                                }

                                const tokenData = await tokenRes.json();
                                const at = tokenData.access_token;
                                const rt = tokenData.refresh_token;

                                if (!at) {
                                    resolve({ success: false, error: "No access token in PKCE response" });
                                    return;
                                }

                                const ok = await this._processOAuthTokens(at, rt);
                                resolve(ok
                                    ? { success: true, user: this.user }
                                    : { success: false, error: "Failed to process tokens" }
                                );
                            } catch (exchangeErr) {
                                resolve({ success: false, error: "PKCE exchange error: " + exchangeErr.message });
                            }
                            return;
                        }

                        // Implicit flow fallback: tokens in hash
                        const at = hashParams.get("access_token") || params.get("access_token");
                        const rt = hashParams.get("refresh_token") || params.get("refresh_token");

                        if (!at) {
                            resolve({ success: false, error: "No code or access token in response" });
                            return;
                        }

                        const ok = await this._processOAuthTokens(at, rt);
                        resolve(ok
                            ? { success: true, user: this.user }
                            : { success: false, error: "Failed to process tokens" }
                        );
                    }
                );
            });

        } catch (e) {
            return { success: false, error: e.message };
        }
    },

    // ══════════════════════════════════════════════════════════
    //  EMAIL MAGIC LINK
    // ══════════════════════════════════════════════════════════

    loginWithEmail: async function (email) {
        if (!this._sb) return { success: false, error: "SDK not ready" };

        const redirectUrl = chrome.runtime.getURL("popup.html");
        const { error } = await this._sb.auth.signInWithOtp({
            email,
            options: { emailRedirectTo: redirectUrl }
        });

        if (error) return { success: false, error: error.message };
        return { success: true, message: "Magic link sent! Check your inbox." };
    },

    // ══════════════════════════════════════════════════════════
    //  PHONE OTP
    // ══════════════════════════════════════════════════════════

    sendPhoneOtp: async function (phone) {
        if (!this._sb) return { success: false, error: "SDK not ready" };

        const { error } = await this._sb.auth.signInWithOtp({ phone });
        if (error) return { success: false, error: error.message };
        return { success: true };
    },

    verifyPhoneOtp: async function (phone, token) {
        if (!this._sb) return { success: false, error: "SDK not ready" };

        const { data, error } = await this._sb.auth.verifyOtp({
            phone, token, type: "sms"
        });

        if (error) return { success: false, error: error.message };

        if (data?.session) {
            await this._processOAuthTokens(
                data.session.access_token,
                data.session.refresh_token
            );
        } else if (data?.user) {
            this.user = this._buildUserObject(data.user, null);
        }

        return { success: true, user: this.user };
    },

    // ══════════════════════════════════════════════════════════
    //  LOGOUT
    // ══════════════════════════════════════════════════════════

    logout: async function () {
        if (this._sb) await this._sb.auth.signOut().catch(() => { });
        this.user = null;
        await chrome.storage.local.remove(["user", "session"]);
        return { success: true };
    },

    // ══════════════════════════════════════════════════════════
    //  SESSION MANAGEMENT
    // ══════════════════════════════════════════════════════════

    /** Verify token with Supabase auth server */
    verifySession: async function (session) {
        if (!session) return false;

        const token = typeof session === "string"
            ? session
            : (session.accessToken || session.access_token);
        if (!token) return false;

        try {
            const res = await fetch(`${CONFIG.SUPABASE_URL}/auth/v1/user`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    apikey: CONFIG.SUPABASE_ANON_KEY
                }
            });

            if (res.ok) return true;

            // Token expired — try refreshing
            const refreshToken = session.refreshToken || session.refresh_token;
            if (res.status === 401 && refreshToken) {
                console.log("⏰ Token expired, refreshing…");
                return await this._refreshToken(refreshToken);
            }
        } catch (e) {
            console.error("Session verify error:", e);
        }

        return false;
    },

    /** Manually refresh token via Supabase REST */
    _refreshToken: async function (refreshToken) {
        try {
            const res = await fetch(
                `${CONFIG.SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        apikey: CONFIG.SUPABASE_ANON_KEY
                    },
                    body: JSON.stringify({ refresh_token: refreshToken })
                }
            );

            if (res.ok) {
                const data = await res.json();
                // Sync refreshed tokens into Supabase SDK
                if (this._sb) {
                    await this._sb.auth.setSession({
                        access_token: data.access_token,
                        refresh_token: data.refresh_token
                    }).catch(() => { });
                }
                // Also persist as legacy fallback
                await this._persistSession({
                    accessToken: data.access_token,
                    refreshToken: data.refresh_token
                });
                console.log("✅ Token refreshed via REST fallback");
                return true;
            }
        } catch (e) {
            console.error("Token refresh error:", e);
        }
        return false;
    },

    /** Save session tokens to chrome.storage.local (legacy fallback) */
    _persistSession: async function ({ accessToken, refreshToken }) {
        await chrome.storage.local.set({
            session: { accessToken, refreshToken }
        });
    },

    _syncSessionToStorage: async function () {
        if (!this._sb?.auth?.getSession) return;
        try {
            const { data: { session } } = await this._sb.auth.getSession();
            if (!session) throw new Error("No session");

            const user = session.user;

            // 🔥 Ensure user exists in public.profiles table
            await this._sb.from("profiles").upsert({
                id: user.id,
                email: user.email,
                name: user.user_metadata?.full_name || null,
                credits: CONFIG.DEFAULT_SIGNUP_CREDITS
            }, { onConflict: 'id', ignoreDuplicates: true });

            await chrome.storage.local.set({
                user: user,
                session: session
            });
        } catch (e) {
            console.warn("_syncSessionToStorage error:", e.message);
        }
    },

    // ══════════════════════════════════════════════════════════
    //  DATABASE SYNC
    // ══════════════════════════════════════════════════════════

    /** Upsert user record on every login; handles new + returning users */
    syncUserToDB: async function () {
        if (!this.user) return;

        // ── Get access token: prefer Supabase SDK session ──
        let token = null;
        if (this._sb) {
            try {
                const { data } = await this._sb.auth.getSession();
                token = data?.session?.access_token;
            } catch (_) { }
        }
        // Fallback to legacy storage
        if (!token) {
            const stored = await chrome.storage.local.get(["session"]);
            token = stored.session?.accessToken || stored.session;
        }
        if (!token) { console.error("❌ No token for DB sync"); return; }

        try {
            // Check if user already exists
            const checkRes = await fetch(
                `${CONFIG.SUPABASE_URL}/rest/v1/profiles?id=eq.${this.user.id}&select=credits`,
                {
                    headers: {
                        apikey: CONFIG.SUPABASE_ANON_KEY,
                        Authorization: `Bearer ${token}`
                    }
                }
            );

            if (!checkRes.ok) {
                console.error("❌ DB check failed:", checkRes.status);
                return;
            }

            const existing = await checkRes.json();

            if (!existing || existing.length === 0) {
                // ── NEW USER — create with signup credits
                console.log(`✨ New user! Giving ${CONFIG.DEFAULT_SIGNUP_CREDITS} signup credits`);

                const createRes = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/profiles`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        apikey: CONFIG.SUPABASE_ANON_KEY,
                        Authorization: `Bearer ${token}`,
                        Prefer: "return=representation"
                    },
                    body: JSON.stringify({
                        id: this.user.id,
                        email: this.user.email || null,
                        name: this.user.name || null,
                        credits: CONFIG.DEFAULT_SIGNUP_CREDITS
                    })
                });

                if (!createRes.ok) {
                    const err = await createRes.text();
                    console.error("❌ Create user failed:", createRes.status, err);
                    return;
                }

                this.user.credits = CONFIG.DEFAULT_SIGNUP_CREDITS;
                console.log("✅ New user created in DB");

            } else {
                // ── RETURNING USER — read credits from DB
                const dbUser = existing[0];
                console.log("✅ Returning user, credits:", dbUser.credits);

                this.user.credits = dbUser.credits;
            }

            // ── Persist enriched user to chrome.storage.local
            await chrome.storage.local.set({ user: this.user });
            console.log("✅ User synced:", this.user);

        } catch (e) {
            console.error("❌ syncUserToDB error:", e);
        }
    },

    // ══════════════════════════════════════════════════════════
    //  CREDITS
    // ══════════════════════════════════════════════════════════

    /**
     * Refresh credits (and ban/plan status) from DB.
     * Call after any AI action to show updated balance.
     */
    refreshUser: async function () {
        if (!this.user?.id) return this.user;

        // ── Get access token: prefer Supabase SDK session ──
        let token = null;
        if (this._sb) {
            try {
                const { data } = await this._sb.auth.getSession();
                token = data?.session?.access_token;
            } catch (_) { }
        }
        if (!token) {
            const stored = await chrome.storage.local.get(["session"]);
            token = stored.session?.accessToken || stored.session;
        }
        if (!token) return this.user;

        try {
            const res = await fetch(
                `${CONFIG.SUPABASE_URL}/rest/v1/profiles?id=eq.${this.user.id}&select=credits`,
                {
                    headers: {
                        apikey: CONFIG.SUPABASE_ANON_KEY,
                        Authorization: `Bearer ${token}`
                    }
                }
            );

            if (res.ok) {
                const data = await res.json();
                if (data?.[0]) {
                    this.user.credits = data[0].credits;
                    await chrome.storage.local.set({ user: this.user });
                }
            }
        } catch (e) {
            console.warn("refreshUser error:", e);
        }

        return this.user;
    },

    /**
     * Check if user has unlimited access.
     */
    hasUnlimitedAccess: function () {
        if (!this.user?.unlimitedUntil) return false;
        return new Date(this.user.unlimitedUntil) > new Date();
    },

    /**
     * Returns true if user can perform an action.
     * Shows appropriate error if banned or out of credits.
     */
    canUseFeature: async function (showError = true) {
        if (!this.user) {
            if (showError) alert("Please login first.");
            return false;
        }

        if (this.user.is_banned) {
            if (showError) alert(`🚫 Account suspended.\nReason: ${this.user.ban_reason || "Contact support"}`);
            return false;
        }

        if (this.hasUnlimitedAccess()) return true;

        // Live credit check via background.js → profiles table
        const hasCredits = await CreditsManager.hasCredits(1);
        if (!hasCredits) {
            if (showError) alert("⚡ Credits khatam ho gaye!\nUpgrade karo ya credits kharido.");
            return false;
        }

        return true;
    },

    // ══════════════════════════════════════════════════════════
    //  UTILITY
    // ══════════════════════════════════════════════════════════

    isLoggedIn: function () { return this.user !== null; },
    getUser: function () { return this.user; },
    getCredits: function () { return this.user?.credits ?? 0; },
    getPlan: function () { return this.user?.plan ?? "free"; },
    isBanned: function () { return this.user?.is_banned === true; },

    // ══════════════════════════════════════════════════════════
    //  PRIVATE HELPERS
    // ══════════════════════════════════════════════════════════

    /** Process tokens after any OAuth flow and sync to DB */
    _processOAuthTokens: async function (accessToken, refreshToken) {
        try {
            // ── Step 1: Establish session in Supabase SDK (primary persistence) ──
            if (this._sb && accessToken) {
                const { data: sessionData, error: sessionErr } = await this._sb.auth.setSession({
                    access_token: accessToken,
                    refresh_token: refreshToken || ""
                });

                if (sessionErr) {
                    console.error("❌ setSession error:", sessionErr.message);
                } else {
                    console.log("✅ Supabase SDK session established via setSession()");
                }

                // Use SDK to get verified user
                const { data: userData, error: userErr } = await this._sb.auth.getUser();
                if (!userErr && userData?.user) {
                    this.user = this._buildUserObject(userData.user, null);
                    await chrome.storage.local.set({ user: this.user });
                    await this.syncUserToDB();
                    console.log("✅ Login successful:", this.user.email || this.user.phone);
                    return true;
                }
            }

            // ── Fallback: Manual fetch if SDK unavailable ──
            const res = await fetch(`${CONFIG.SUPABASE_URL}/auth/v1/user`, {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    apikey: CONFIG.SUPABASE_ANON_KEY
                }
            });

            if (!res.ok) return false;

            const authUser = await res.json();
            this.user = this._buildUserObject(authUser, null);
            await chrome.storage.local.set({ user: this.user });

            // Legacy persist for fallback path
            await this._persistSession({ accessToken, refreshToken });

            await this.syncUserToDB();
            console.log("✅ Login successful (fallback):", this.user.email || this.user.phone);
            return true;

        } catch (e) {
            console.error("_processOAuthTokens error:", e);
            return false;
        }
    },

    /** Standardise user object structure from any auth source */
    _buildUserObject: function (authUser, dbUser) {
        const meta = authUser.user_metadata || {};
        return {
            id: authUser.id,
            email: authUser.email || null,
            phone: authUser.phone || null,
            name: meta.full_name || meta.name || (authUser.email?.split("@")[0]) || "User",
            avatarUrl: meta.avatar_url || meta.picture || null,
            // DB fields (populated after syncUserToDB)
            credits: dbUser?.credits ?? CONFIG.DEFAULT_SIGNUP_CREDITS,
            plan: dbUser?.plan ?? "free",
            unlimitedUntil: dbUser?.unlimited_until ?? null,
            is_banned: dbUser?.is_banned ?? false,
            ban_reason: dbUser?.ban_reason ?? null
        };
    },

    /** Handle OAuth hash fragment if Supabase redirected back to popup */
    _handleOAuthCallback: async function () {
        if (typeof window === "undefined") return false;

        // Check for PKCE code in query params first
        const urlParams = new URLSearchParams(window.location.search);
        const authCode = urlParams.get("code");
        if (authCode) {
            console.log("🔗 OAuth code detected in URL — exchanging via PKCE…");
            // We don't have the code_verifier here (it was in background script),
            // so this fallback only handles the hash-based implicit flow.
            // PKCE exchange is handled in background.js or _googleOAuthFallback.
        }

        // Check for implicit flow tokens in hash
        const hash = window.location.hash;
        if (!hash || !hash.includes("access_token")) return false;

        const params = new URLSearchParams(hash.substring(1));
        const at = params.get("access_token");
        const rt = params.get("refresh_token");

        if (!at) return false;

        console.log("🔗 OAuth callback hash detected — processing tokens…");

        const ok = await this._processOAuthTokens(at, rt);

        // Clean up URL hash
        try {
            if (window.history?.replaceState) {
                window.history.replaceState({}, document.title,
                    window.location.pathname + window.location.search);
            } else {
                window.location.hash = "";
            }
        } catch (_) { }

        return ok;
    },

    // ══════════════════════════════════════════════════════════
    //  PKCE HELPERS (for fallback OAuth flow)
    // ══════════════════════════════════════════════════════════

    _generateCodeVerifier: function () {
        const array = new Uint8Array(32);
        crypto.getRandomValues(array);
        return this._base64UrlEncode(array);
    },

    _base64UrlEncode: function (buffer) {
        const bytes = new Uint8Array(buffer);
        let str = '';
        for (let i = 0; i < bytes.length; i++) {
            str += String.fromCharCode(bytes[i]);
        }
        return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    },

    _generateCodeChallenge: async function (verifier) {
        const encoder = new TextEncoder();
        const data = encoder.encode(verifier);
        const digest = await crypto.subtle.digest('SHA-256', data);
        return this._base64UrlEncode(digest);
    }
};

// ── Expose globally
window.AuthManager = AuthManager;


// ============================================================
//  CreditsManager — Complete Credit Management System
//
//  ✅ Get/check/use/add credits
//  ✅ Unlimited subscription management
//  ✅ Promo code system
//  ✅ Usage logging for analytics
//  ✅ Transaction history
// ============================================================

const CreditsManager = {

    // ── Helper: send message to background.js and get a promise back ──
    _bgMessage: function (msg) {
        return new Promise((resolve) => {
            try {
                chrome.runtime.sendMessage(msg, (response) => {
                    if (chrome.runtime.lastError) {
                        console.error('❌ Background message error:', chrome.runtime.lastError.message);
                        resolve(null);
                        return;
                    }
                    resolve(response || null);
                });
            } catch (e) {
                console.error('❌ chrome.runtime.sendMessage failed:', e.message);
                resolve(null);
            }
        });
    },

    // Get current credits — always returns a number
    // Fetches LIVE from Supabase session (source of truth)
    getCredits: async function () {
        try {
            const supabase = window.supabaseClient;
            if (!supabase) {
                console.warn('❌ supabaseClient not available, falling back to background');
                const res = await this._bgMessage({ action: 'GET_CREDITS' });
                if (!res || !res.success) return 0;
                return res.credits ?? 0;
            }
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) return 0;
            const userId = session.user.id;

            const { data, error } = await supabase
                .from('profiles')
                .select('credits')
                .eq('id', userId)
                .single();

            if (error || !data) return 0;
            return data.credits ?? 0;
        } catch (e) {
            console.error('getCredits error:', e);
            return 0;
        }
    },

    // Check if user has enough credits (live check via background)
    hasCredits: async function (amount = 1) {
        const res = await this._bgMessage({ action: 'GET_CREDITS' });
        if (!res || !res.success) return false;
        return (res.credits ?? 0) >= amount;
    },

    // Use / deduct credits — via Supabase RPC deduct_credit
    useCredits: async function (amount = 1) {
        try {
            const supabase = window.supabaseClient;
            if (!supabase) {
                console.warn('❌ supabaseClient not available, falling back to background');
                const res = await this._bgMessage({ action: 'DEDUCT_CREDITS', amount });
                if (!res) return { success: false, error: 'Background unreachable', remaining: 0 };
                return { success: !!res.success, remaining: res.remaining ?? 0, error: res.error || null };
            }
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) return { success: false, error: 'No session', remaining: 0 };
            const userId = session.user.id;

            const { data, error } = await supabase.rpc('deduct_credit', {
                uid: userId,
                amount: amount
            });

            if (error) {
                return { success: false, error: error.message, remaining: 0 };
            }
            return { success: true, remaining: data ?? 0, error: null };
        } catch (e) {
            console.error('useCredits error:', e);
            return { success: false, error: e.message, remaining: 0 };
        }
    },

    // Add credits — proxied through background PROXY_FETCH to profiles table
    addCredits: async function (amount, source = 'purchase') {
        // First get current credits
        const current = await this.getCredits();
        const newCredits = current + amount;

        // Use PROXY_FETCH to PATCH profiles (background has the session)
        const res = await this._bgMessage({
            action: 'PROXY_FETCH',
            url: `${CONFIG.SUPABASE_URL}/rest/v1/profiles?id=eq.${AuthManager.getUser()?.id}`,
            options: {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': CONFIG.SUPABASE_ANON_KEY,
                    'Prefer': 'return=representation'
                },
                body: JSON.stringify({ credits: newCredits })
            }
        });

        if (res?.success && res?.ok) {
            const updated = Array.isArray(res.body) ? res.body[0]?.credits : newCredits;
            return { success: true, credits: updated ?? newCredits };
        }
        return { success: false, error: res?.error || 'Failed to add credits' };
    },

    // Set unlimited subscription (proxy through background)
    setUnlimited: async function (days = 30) {
        const user = AuthManager.getUser();
        if (!user) return { success: false, error: 'Not logged in' };

        const unlimitedUntil = new Date();
        unlimitedUntil.setDate(unlimitedUntil.getDate() + days);

        const res = await this._bgMessage({
            action: 'PROXY_FETCH',
            url: `${CONFIG.SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}`,
            options: {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': CONFIG.SUPABASE_ANON_KEY,
                    'Prefer': 'return=representation'
                },
                body: JSON.stringify({ unlimited_until: unlimitedUntil.toISOString() })
            }
        });

        if (res?.success && res?.ok) {
            user.unlimitedUntil = unlimitedUntil.toISOString();
            await chrome.storage.local.set({ user });
            return { success: true, unlimitedUntil: user.unlimitedUntil };
        }
        return { success: false, error: 'Failed to set unlimited' };
    },

    // Apply promo code (proxy all Supabase calls through background)
    applyPromoCode: async function (code) {
        const user = AuthManager.getUser();
        if (!user) return { success: false, error: 'Not logged in' };

        try {
            // Check promo code
            const promoRes = await this._bgMessage({
                action: 'PROXY_FETCH',
                url: `${CONFIG.SUPABASE_URL}/rest/v1/promo_codes?code=eq.${code.toUpperCase()}&is_active=eq.true&select=*`,
                options: {
                    method: 'GET',
                    headers: { 'apikey': CONFIG.SUPABASE_ANON_KEY }
                }
            });

            const promos = promoRes?.body;
            if (!promos || !Array.isArray(promos) || promos.length === 0) {
                return { success: false, error: 'Invalid or expired promo code' };
            }
            const promo = promos[0];

            // Check if already used by this user
            const usageRes = await this._bgMessage({
                action: 'PROXY_FETCH',
                url: `${CONFIG.SUPABASE_URL}/rest/v1/promo_usage?user_id=eq.${user.id}&promo_id=eq.${promo.id}&select=id`,
                options: {
                    method: 'GET',
                    headers: { 'apikey': CONFIG.SUPABASE_ANON_KEY }
                }
            });
            const usages = usageRes?.body;
            if (usages && Array.isArray(usages) && usages.length > 0) {
                return { success: false, error: 'You have already used this promo code' };
            }

            // Check max uses
            if (promo.max_uses && promo.used_count >= promo.max_uses) {
                return { success: false, error: 'Promo code has reached maximum uses' };
            }

            // Apply credits
            const creditGrant = (promo.type === 'unlimited') ? (promo.credits || 100) : promo.credits;
            const result = await this.addCredits(creditGrant, 'promo');

            if (result.success) {
                // Record usage (fire-and-forget)
                this._bgMessage({
                    action: 'PROXY_FETCH',
                    url: `${CONFIG.SUPABASE_URL}/rest/v1/promo_usage`,
                    options: {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'apikey': CONFIG.SUPABASE_ANON_KEY
                        },
                        body: JSON.stringify({
                            user_id: user.id,
                            promo_id: promo.id,
                            used_at: new Date().toISOString()
                        })
                    }
                });

                // Update promo used count (fire-and-forget)
                this._bgMessage({
                    action: 'PROXY_FETCH',
                    url: `${CONFIG.SUPABASE_URL}/rest/v1/promo_codes?id=eq.${promo.id}`,
                    options: {
                        method: 'PATCH',
                        headers: {
                            'Content-Type': 'application/json',
                            'apikey': CONFIG.SUPABASE_ANON_KEY
                        },
                        body: JSON.stringify({ used_count: (promo.used_count || 0) + 1 })
                    }
                });

                return {
                    success: true,
                    message: `🎉 ${creditGrant} credits added!`,
                    credits: creditGrant,
                    type: promo.type
                };
            }
            return result;
        } catch (e) {
            return { success: false, error: e.message };
        }
    },

    // Log usage — no longer needed in content.js, background handles it in DEDUCT_CREDITS
    logUsage: async function (_credits) {
        // No-op: usage logging is handled inside background.js DEDUCT_CREDITS handler
    },

    // Get credits display text
    getCreditsDisplay: async function () {
        const credits = await this.getCredits();
        return `${credits} credits`;
    },

    // Get user transaction history (proxy through background)
    getHistory: async function (limit = 20) {
        const user = AuthManager.getUser();
        if (!user) return [];
        try {
            const res = await this._bgMessage({
                action: 'PROXY_FETCH',
                url: `${CONFIG.SUPABASE_URL}/rest/v1/credit_transactions?user_id=eq.${user.id}&select=delta,reason,meta,created_at&order=created_at.desc&limit=${limit}`,
                options: {
                    method: 'GET',
                    headers: { 'apikey': CONFIG.SUPABASE_ANON_KEY }
                }
            });
            if (res?.success && Array.isArray(res.body)) return res.body;
            return [];
        } catch (e) { return []; }
    }
};

window.CreditsManager = CreditsManager;
