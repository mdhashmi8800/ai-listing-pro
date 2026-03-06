-- Create payments table to log Razorpay transactions
CREATE TABLE IF NOT EXISTS public.payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    amount DECIMAL NOT NULL,
    currency TEXT DEFAULT 'INR',
    credits_added INTEGER NOT NULL,
    razorpay_order_id TEXT UNIQUE NOT NULL,
    razorpay_payment_id TEXT UNIQUE,
    razorpay_signature TEXT,
    status TEXT DEFAULT 'pending', -- 'pending', 'captured', 'failed'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add first_purchase flag to users if not present to handle bonus logic
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS first_purchase BOOLEAN DEFAULT TRUE;

-- Row Level Security for payments table
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- Users can view their own payments
CREATE POLICY "Users can view their own payments"
ON public.payments FOR SELECT
USING (auth.uid() = user_id);

-- Note: Service role bypasses RLS automatically.
-- No open policy needed — only Edge Functions (service_role) should insert/update payments.
