-- ============================================================
--  deduct_credit — Supabase RPC Function
--  Atomically deducts credits from the authenticated user and
--  returns the remaining balance. Uses auth.uid() so no user ID
--  needs to be passed from the client.
--
--  Run this SQL in your Supabase SQL Editor to create the function.
--
--  Prerequisites:
--    1. A "profiles" table with columns: id (uuid PK), credits (int),
--       unlimited_until (timestamptz), is_banned (bool), updated_at (timestamptz)
--    2. A "credit_transactions" table with columns:
--         user_id (uuid), delta (int), reason (text)
-- ============================================================

CREATE OR REPLACE FUNCTION public.deduct_credit(amount INT DEFAULT 1)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id   UUID := auth.uid();
  new_credits INTEGER;
  v_credits   INTEGER;
  v_unlimited TIMESTAMPTZ;
  v_banned    BOOLEAN;
BEGIN
  -- Atomic deduct: only succeeds when balance is sufficient,
  -- the user is not banned, and not in an unlimited period.
  UPDATE public.profiles
  SET
    credits    = credits - amount,
    updated_at = NOW()
  WHERE
    id         = v_user_id
    AND credits >= amount
    AND (unlimited_until IS NULL OR unlimited_until < NOW())
    AND is_banned = FALSE
  RETURNING credits INTO new_credits;

  IF NOT FOUND THEN
    -- Determine the specific reason for failure
    SELECT credits, unlimited_until, is_banned
      INTO v_credits, v_unlimited, v_banned
      FROM public.profiles
     WHERE id = v_user_id;

    IF v_banned THEN
      RAISE EXCEPTION 'account_banned';
    ELSIF v_unlimited IS NOT NULL AND v_unlimited > NOW() THEN
      -- Unlimited user — don't deduct, return current credits
      RETURN v_credits;
    ELSE
      RAISE EXCEPTION 'insufficient_credits';
    END IF;
  END IF;

  -- Log transaction
  INSERT INTO public.credit_transactions (user_id, delta, reason)
  VALUES (v_user_id, -amount, 'optimization');

  RETURN new_credits;
END;
$$;
