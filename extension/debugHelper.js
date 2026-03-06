// ============================================================
//  debugHelper.js — Debug Utility for Troubleshooting
//  User Registration / Account Issues
//
//  Usage (in DevTools console):
//    DebugHelper.checkUserStatus()  → full diagnosis
//    DebugHelper.fixMyAccount()     → auto-create user if missing
//
//  Show the hidden debug button via console:
//    document.getElementById('debug-btn').style.display='block'
// ============================================================

const DebugHelper = {

    /** Full diagnosis: checks local storage, auth token & DB record */
    async checkUserStatus() {
        console.log('🔍 === USER DEBUG INFO ===');

        // ── 1. Check local storage ────────────────────────────
        const stored = await chrome.storage.local.get(['user', 'session']);
        console.log('📦 Local Storage:', {
            hasUser: !!stored.user,
            hasSession: !!stored.session,
            user: stored.user,
            sessionType: typeof stored.session
        });

        if (!stored.user || !stored.session) {
            console.log('❌ No user or session found in local storage');
            return;
        }

        const token = stored.session?.accessToken || stored.session;
        console.log('🔑 Token:', token ? token.substring(0, 20) + '...' : 'MISSING');

        // ── 2. Verify token against Supabase auth ────────────
        try {
            const authResponse = await fetch(`${CONFIG.SUPABASE_URL}/auth/v1/user`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'apikey': CONFIG.SUPABASE_ANON_KEY
                }
            });

            console.log('👤 Auth User Status:', authResponse.status);

            if (authResponse.ok) {
                const authUser = await authResponse.json();
                console.log('✅ Auth User:', {
                    id: authUser.id,
                    email: authUser.email,
                    created_at: authUser.created_at
                });
            } else {
                console.log('❌ Auth check failed:', await authResponse.text());
            }
        } catch (e) {
            console.error('❌ Auth check error:', e);
        }

        // ── 3. Check users table ──────────────────────────────
        try {
            const usersResponse = await fetch(
                `${CONFIG.SUPABASE_URL}/rest/v1/profiles?id=eq.${stored.user.id}&select=*`,
                {
                    headers: {
                        'apikey': CONFIG.SUPABASE_ANON_KEY,
                        'Authorization': `Bearer ${token}`
                    }
                }
            );

            console.log('💾 Profiles Table Status:', usersResponse.status);

            if (usersResponse.ok) {
                const users = await usersResponse.json();
                if (users && users.length > 0) {
                    console.log('✅ User in database:', users[0]);
                } else {
                    console.log('❌ User NOT found in profiles table!');
                    console.log('🔧 Attempting to create user...');
                    await this.forceCreateUser(stored.user, token);
                }
            } else {
                console.log('❌ Profiles table check failed:', await usersResponse.text());
            }
        } catch (e) {
            console.error('❌ Profiles table check error:', e);
        }

        console.log('🔍 === END DEBUG INFO ===');
    },

    /** Force-create a user record in the DB (use when user is missing from profiles table) */
    async forceCreateUser(user, token) {
        try {
            const createResponse = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/profiles`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': CONFIG.SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${token}`,
                    'Prefer': 'return=representation'
                },
                body: JSON.stringify({
                    id: user.id,
                    email: user.email || null,
                    name: user.name || null,
                    credits: CONFIG.DEFAULT_SIGNUP_CREDITS,
                    plan: 'free',
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                })
            });

            if (createResponse.ok) {
                const created = await createResponse.json();
                console.log('✅ User created successfully!', created);

                // Sync credits back to local user object
                user.credits = CONFIG.DEFAULT_SIGNUP_CREDITS;
                await chrome.storage.local.set({ user });

                alert('✅ Account fixed! You now have ' + CONFIG.DEFAULT_SIGNUP_CREDITS + ' credits. Please refresh the popup.');
            } else {
                const error = await createResponse.text();
                console.error('❌ Failed to create user:', createResponse.status, error);
                alert('❌ Failed to fix account. Please contact support with this error:\n' + error);
            }
        } catch (e) {
            console.error('❌ Force create error:', e);
            alert('❌ Error: ' + e.message);
        }
    },

    /** Quick fix shortcut — reads session & calls forceCreateUser */
    async fixMyAccount() {
        console.log('🔧 Attempting to fix account...');
        const stored = await chrome.storage.local.get(['user', 'session']);

        if (!stored.user || !stored.session) {
            alert('❌ Please login first');
            return;
        }

        const token = stored.session?.accessToken || stored.session;
        await this.forceCreateUser(stored.user, token);
    }
};

// ── Expose globally so it can be called from DevTools ────────
window.DebugHelper = DebugHelper;

// ── Inject hidden debug button when running inside the popup ─
if (window.location.href.includes('popup.html')) {
    document.addEventListener('DOMContentLoaded', () => {
        const debugBtn = document.createElement('button');
        debugBtn.id = 'debug-btn';
        debugBtn.textContent = '🔧 Debug Account';
        debugBtn.style.cssText =
            'display:none;position:fixed;bottom:10px;right:10px;' +
            'padding:8px 12px;background:#ff4444;color:white;' +
            'border:none;border-radius:6px;cursor:pointer;' +
            'z-index:9999;font-size:12px;';
        debugBtn.onclick = () => DebugHelper.checkUserStatus();
        document.body.appendChild(debugBtn);

        console.log('💡 Debug mode available.');
        console.log('   → Run: DebugHelper.checkUserStatus()');
        console.log('   → Run: DebugHelper.fixMyAccount()');
        console.log('   → Or show button: document.getElementById("debug-btn").style.display="block"');
    });
}
