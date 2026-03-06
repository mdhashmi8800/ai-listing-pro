-- ============================================================
--  MEESHO AI TOOL — Supabase Database Setup (v2)
--  Run this in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- ═══════════════════════════════════════════════════════════
--  1. USERS TABLE
--     Stores user profile, credits, plan, ban status + IP
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.users (
  id               UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email            TEXT,
  phone            TEXT,
  name             TEXT,
  avatar_url       TEXT,

  -- Credits & Plan
  credits          INTEGER     NOT NULL DEFAULT 10,
  plan             TEXT        NOT NULL DEFAULT 'free',    -- 'free' | 'pro' | 'enterprise'
  unlimited_until  TIMESTAMPTZ,                            -- NULL = not unlimited

  -- Ban
  is_banned        BOOLEAN     NOT NULL DEFAULT FALSE,
  ban_reason       TEXT,

  -- IP Tracking
  signup_ip        TEXT,
  last_ip          TEXT,

  -- Timestamps
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════
--  2. CREDIT TRANSACTIONS — Full audit log
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.credit_transactions (
  id          BIGSERIAL   PRIMARY KEY,
  user_id     UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  delta       INTEGER     NOT NULL,        -- +ve = added, -ve = consumed
  reason      TEXT        NOT NULL,        -- 'signup_bonus' | 'ai_run' | 'topup' | 'manual'
  meta        JSONB,                       -- optional context
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════
--  3. ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════════════════

ALTER TABLE public.users              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;

-- Users: can read & update own row; insert own row (first login)
DROP POLICY IF EXISTS "users_select_own" ON public.users;
DROP POLICY IF EXISTS "users_update_own" ON public.users;
DROP POLICY IF EXISTS "users_insert_own" ON public.users;

CREATE POLICY "users_select_own" ON public.users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "users_update_own" ON public.users
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "users_insert_own" ON public.users
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Transactions: read own only
DROP POLICY IF EXISTS "txns_select_own" ON public.credit_transactions;

CREATE POLICY "txns_select_own" ON public.credit_transactions
  FOR SELECT USING (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════
--  4. AUTO-UPDATED TIMESTAMP TRIGGER
-- ═══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_updated_at ON public.users;
CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ═══════════════════════════════════════════════════════════
--  5. SIGNUP TRIGGER — Auto-creates user row + logs bonus
--     Fires automatically when a new auth.user is created.
--     NOTE: popup.js also calls syncUserToDB() which does
--     INSERT ... ON CONFLICT DO NOTHING, so no double-insert.
-- ═══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, email, phone, name, avatar_url, credits, plan)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.phone,
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      SPLIT_PART(COALESCE(NEW.email, ''), '@', 1)
    ),
    NEW.raw_user_meta_data->>'avatar_url',
    15,       -- signup bonus credits
    'free'
  )
  ON CONFLICT (id) DO NOTHING;

  -- Log signup bonus (only if user was actually inserted)
  IF FOUND THEN
    INSERT INTO public.credit_transactions (user_id, delta, reason, meta)
    VALUES (NEW.id, 15, 'signup_bonus', '{"note":"Welcome gift"}');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ═══════════════════════════════════════════════════════════
--  6. use_credit() — Safe credit deduction (atomic)
--     Called by Supabase Edge Functions for AI actions
-- ═══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.use_credit(
  p_user_id UUID,
  p_reason   TEXT,
  p_amount   INTEGER DEFAULT 1
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  new_credits INTEGER;
BEGIN
  -- Only deduct if enough balance AND not in unlimited period
  UPDATE public.users
  SET
    credits    = credits - p_amount,
    updated_at = NOW()
  WHERE
    id         = p_user_id
    AND credits >= p_amount
    AND (unlimited_until IS NULL OR unlimited_until < NOW())
    AND is_banned = FALSE
  RETURNING credits INTO new_credits;

  IF NOT FOUND THEN
    -- Get current state to give useful error
    DECLARE
      v_credits   INTEGER;
      v_unlimited TIMESTAMPTZ;
      v_banned    BOOLEAN;
    BEGIN
      SELECT credits, unlimited_until, is_banned
        INTO v_credits, v_unlimited, v_banned
        FROM public.users
       WHERE id = p_user_id;

      IF v_banned THEN
        RAISE EXCEPTION 'account_banned';
      ELSIF v_unlimited IS NOT NULL AND v_unlimited > NOW() THEN
        -- Unlimited user — don't deduct, return current credits
        RETURN v_credits;
      ELSE
        RAISE EXCEPTION 'insufficient_credits';
      END IF;
    END;
  END IF;

  -- Log transaction
  INSERT INTO public.credit_transactions (user_id, delta, reason)
  VALUES (p_user_id, -p_amount, p_reason);

  RETURN new_credits;
END;
$$;

-- ═══════════════════════════════════════════════════════════
--  7. add_credits() — Admin function to add credits manually
-- ═══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.add_credits(
  p_user_id UUID,
  p_amount   INTEGER,
  p_reason   TEXT DEFAULT 'manual_topup'
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  new_credits INTEGER;
BEGIN
  UPDATE public.users
  SET credits    = credits + p_amount,
      updated_at = NOW()
  WHERE id = p_user_id
  RETURNING credits INTO new_credits;

  INSERT INTO public.credit_transactions (user_id, delta, reason)
  VALUES (p_user_id, p_amount, p_reason);

  RETURN new_credits;
END;
$$;

-- ═══════════════════════════════════════════════════════════
--  DONE! Summary (original tables):
--  ✅ users table   — id, email, phone, name, credits, plan
--                     unlimited_until, is_banned, signup_ip, last_ip
--  ✅ credit_transactions — full audit log
--  ✅ RLS — users see only their own data
--  ✅ handle_new_user trigger — auto-creates row + signup bonus
--  ✅ use_credit() — atomic deduction with ban/unlimited checks
--  ✅ add_credits() — admin credit topup
-- ═══════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════
--  8. PROMO CODES TABLE
--     Stores promo/coupon codes for credits or unlimited access
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.promo_codes (
  id          BIGSERIAL   PRIMARY KEY,
  code        TEXT        NOT NULL UNIQUE,
  type        TEXT        NOT NULL DEFAULT 'credits',  -- 'credits' | 'unlimited'
  credits     INTEGER     DEFAULT 0,                   -- credits to add (if type='credits')
  days        INTEGER     DEFAULT 30,                  -- days of unlimited (if type='unlimited')
  max_uses    INTEGER,                                 -- NULL = unlimited uses
  used_count  INTEGER     NOT NULL DEFAULT 0,
  is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ                              -- NULL = never expires
);

-- ═══════════════════════════════════════════════════════════
--  9. PROMO USAGE TABLE
--     Tracks which user has used which promo code
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.promo_usage (
  id          BIGSERIAL   PRIMARY KEY,
  user_id     UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  promo_id    BIGINT      NOT NULL REFERENCES public.promo_codes(id) ON DELETE CASCADE,
  used_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, promo_id)  -- each user can use a promo only once
);

-- ═══════════════════════════════════════════════════════════
--  10. USAGE LOGS TABLE
--     Analytics for credit consumption
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.usage_logs (
  id           BIGSERIAL   PRIMARY KEY,
  user_id      UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  credits_used INTEGER     NOT NULL DEFAULT 1,
  action       TEXT        NOT NULL DEFAULT 'optimization',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════
--  11. RLS FOR NEW TABLES
-- ═══════════════════════════════════════════════════════════

ALTER TABLE public.promo_codes  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promo_usage  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_logs   ENABLE ROW LEVEL SECURITY;

-- Promo codes: anyone authenticated can READ active promos
DROP POLICY IF EXISTS "promo_codes_select_active" ON public.promo_codes;
CREATE POLICY "promo_codes_select_active" ON public.promo_codes
  FOR SELECT USING (is_active = TRUE);

-- Promo usage: users can read own, insert own
DROP POLICY IF EXISTS "promo_usage_select_own" ON public.promo_usage;
DROP POLICY IF EXISTS "promo_usage_insert_own" ON public.promo_usage;

CREATE POLICY "promo_usage_select_own" ON public.promo_usage
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "promo_usage_insert_own" ON public.promo_usage
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Promo codes: users can update used_count (for increment)
DROP POLICY IF EXISTS "promo_codes_update_count" ON public.promo_codes;
CREATE POLICY "promo_codes_update_count" ON public.promo_codes
  FOR UPDATE USING (TRUE);

-- Usage logs: users can insert own, read own
DROP POLICY IF EXISTS "usage_logs_select_own" ON public.usage_logs;
DROP POLICY IF EXISTS "usage_logs_insert_own" ON public.usage_logs;

CREATE POLICY "usage_logs_select_own" ON public.usage_logs
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "usage_logs_insert_own" ON public.usage_logs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════
--  12. SAMPLE PROMO CODES (optional — remove in production)
-- ═══════════════════════════════════════════════════════════

-- INSERT INTO public.promo_codes (code, type, credits, days, max_uses) VALUES
--   ('WELCOME50',  'credits',   50,  NULL, 100),   -- 50 credits, max 100 uses
--   ('UNLIMITED30', 'unlimited', NULL, 30,  50),     -- 30 days unlimited, max 50 uses
--   ('VIP90',      'unlimited', NULL, 90,  10);      -- 90 days unlimited, max 10 uses

-- ═══════════════════════════════════════════════════════════
--  COMPLETE SETUP SUMMARY:
--  ✅ users               — profile, credits, plan, ban, IP
--  ✅ credit_transactions  — full audit log
--  ✅ promo_codes          — promo/coupon system
--  ✅ promo_usage          — per-user promo tracking
--  ✅ usage_logs           — analytics
--  ✅ RLS on all tables
--  ✅ handle_new_user()    — auto signup bonus
--  ✅ use_credit()         — atomic credit deduction
--  ✅ add_credits()        — admin credit topup
-- ═══════════════════════════════════════════════════════════
