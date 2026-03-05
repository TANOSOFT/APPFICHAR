-- Add personal data fields to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS address_personal text;

-- Ensure RLS allows users to update their own profile (already exists, but for clarity)
-- This policy should already be there from security_hardening_rls.sql
-- CREATE POLICY "profiles_update" ON public.profiles FOR UPDATE USING (id = auth.uid());
