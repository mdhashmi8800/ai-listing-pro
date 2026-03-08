-- ============================================================
--  FIX: Add missing columns to payments & subscriptions tables
--  Run this in: Supabase Dashboard → SQL Editor → New Query
--  This fixes the PGRST204 error in the razorpay-webhook
-- ============================================================

-- ═══════════════════════════════════════════════════════════
--  1. FIX PAYMENTS TABLE — Add missing columns
-- ═══════════════════════════════════════════════════════════

-- Change amount from int4 to numeric to support decimal amounts
ALTER TABLE public.payments
  ALTER COLUMN amount TYPE NUMERIC USING amount::NUMERIC;

-- Add missing columns
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS plan TEXT DEFAULT 'trial',
  ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'INR',
  ADD COLUMN IF NOT EXISTS razorpay_order_id TEXT,
  ADD COLUMN IF NOT EXISTS razorpay_payment_id TEXT,
  ADD COLUMN IF NOT EXISTS razorpay_signature TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.payments
  DROP COLUMN IF EXISTS credits_added;

ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS first_purchase;

-- Add unique constraints for deduplication (ignore if already exist)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payments_razorpay_order_id_key'
  ) THEN
    ALTER TABLE public.payments ADD CONSTRAINT payments_razorpay_order_id_key UNIQUE (razorpay_order_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payments_razorpay_payment_id_key'
  ) THEN
    ALTER TABLE public.payments ADD CONSTRAINT payments_razorpay_payment_id_key UNIQUE (razorpay_payment_id);
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════
--  2. FIX SUBSCRIPTIONS TABLE — Add missing columns
-- ═══════════════════════════════════════════════════════════

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS plan_name TEXT DEFAULT 'trial',
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS razorpay_payment_id TEXT,
  ADD COLUMN IF NOT EXISTS razorpay_order_id TEXT,
  ADD COLUMN IF NOT EXISTS amount NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'subscriptions' AND column_name = 'plan'
  ) THEN
    EXECUTE 'UPDATE public.subscriptions SET plan_name = COALESCE(plan_name, plan, ''trial'') WHERE plan_name IS NULL';
  END IF;
END $$;

-- Add unique constraint on razorpay_order_id for upsert support
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'subscriptions_razorpay_order_id_key'
  ) THEN
    ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_razorpay_order_id_key UNIQUE (razorpay_order_id);
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════
--  3. RLS POLICIES for payments (if not already set)
-- ═══════════════════════════════════════════════════════════

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can view their own payments
DROP POLICY IF EXISTS "Users can view their own payments" ON public.payments;
CREATE POLICY "Users can view their own payments"
  ON public.payments FOR SELECT
  USING (auth.uid() = user_id);

-- Users can view their own subscriptions
DROP POLICY IF EXISTS "Users can view their own subscriptions" ON public.subscriptions;
CREATE POLICY "Users can view their own subscriptions"
  ON public.subscriptions FOR SELECT
  USING (auth.uid() = user_id);

-- 4. BACKFILL active profile access from subscriptions
WITH latest_active_subscription AS (
  SELECT DISTINCT ON (user_id)
    user_id,
    COALESCE(plan_name, plan, 'trial') AS effective_plan,
    end_date
  FROM public.subscriptions
  WHERE status = 'active'
    AND end_date IS NOT NULL
    AND end_date > NOW()
  ORDER BY user_id, end_date DESC
)
INSERT INTO public.profiles (
  id,
  email,
  phone,
  name,
  avatar_url,
  plan,
  unlimited_until,
  created_at,
  updated_at
)
SELECT
  au.id,
  au.email,
  au.phone,
  COALESCE(
    au.raw_user_meta_data->>'full_name',
    au.raw_user_meta_data->>'name',
    SPLIT_PART(COALESCE(au.email, ''), '@', 1)
  ),
  au.raw_user_meta_data->>'avatar_url',
  las.effective_plan,
  las.end_date,
  NOW(),
  NOW()
FROM latest_active_subscription las
JOIN auth.users au ON au.id = las.user_id
ON CONFLICT (id) DO UPDATE
SET
  plan = EXCLUDED.plan,
  unlimited_until = EXCLUDED.unlimited_until,
  updated_at = NOW();

-- ═══════════════════════════════════════════════════════════
--  DONE! Payments/subscriptions schema now matches subscription-only code.
-- ═══════════════════════════════════════════════════════════
