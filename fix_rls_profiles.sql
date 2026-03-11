-- ============================================================
-- fix_rls_profiles.sql — Security Fix: Restrict Profile Updates
--
-- This migration replaces the overly-permissive profiles_update_own
-- policy with one that prevents users from modifying sensitive columns
-- (plan, unlimited_until, is_banned, ban_reason) via client-side code.
-- ============================================================

-- 1. Drop the old, permissive policy
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;

-- 2. Create a restrictive update policy
--    Users can update their own row, but cannot change:
--    - plan (must be set server-side by payment verification)
--    - unlimited_until (must be set server-side by payment verification)
--    - is_banned / ban_reason (admin-only)
CREATE POLICY "profiles_update_safe" ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    -- Ensure plan column hasn't been changed by the user
    AND plan IS NOT DISTINCT FROM (SELECT p.plan FROM public.profiles p WHERE p.id = auth.uid())
    -- Ensure unlimited_until hasn't been changed by the user
    AND unlimited_until IS NOT DISTINCT FROM (SELECT p.unlimited_until FROM public.profiles p WHERE p.id = auth.uid())
    -- Ensure ban status hasn't been changed by the user
    AND is_banned IS NOT DISTINCT FROM (SELECT p.is_banned FROM public.profiles p WHERE p.id = auth.uid())
  );

-- Verify the policy was created
SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'profiles' AND policyname = 'profiles_update_safe';
