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
  ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'INR',
  ADD COLUMN IF NOT EXISTS credits_added INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS razorpay_order_id TEXT,
  ADD COLUMN IF NOT EXISTS razorpay_payment_id TEXT,
  ADD COLUMN IF NOT EXISTS razorpay_signature TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

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
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS razorpay_payment_id TEXT,
  ADD COLUMN IF NOT EXISTS razorpay_order_id TEXT,
  ADD COLUMN IF NOT EXISTS amount NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

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

-- ═══════════════════════════════════════════════════════════
--  DONE! Now redeploy the webhook code to Vercel.
-- ═══════════════════════════════════════════════════════════
