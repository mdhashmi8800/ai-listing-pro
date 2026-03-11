-- Create payments table to log Razorpay transactions
CREATE TABLE IF NOT EXISTS public.payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    plan TEXT NOT NULL DEFAULT 'trial',
    amount DECIMAL NOT NULL,
    currency TEXT DEFAULT 'INR',
    razorpay_order_id TEXT UNIQUE NOT NULL,
    razorpay_payment_id TEXT UNIQUE,
    razorpay_signature TEXT,
    status TEXT DEFAULT 'pending', -- 'pending', 'captured', 'failed'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.payments DROP COLUMN IF EXISTS credits_added;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS first_purchase;

-- Row Level Security for payments table
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- Users can view their own payments
CREATE POLICY "Users can view their own payments"
ON public.payments FOR SELECT
USING (auth.uid() = user_id);

-- Note: Service role bypasses RLS automatically.
-- No open policy needed — only Edge Functions (service_role) should insert/update payments.
