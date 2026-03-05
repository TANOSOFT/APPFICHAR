-- FIX RLS Policies that prevented auto-creation of profiles

-- 1. Tenants: Allow implicit creation during demo/onboarding
-- Note: In a real strict SaaS, only Superadmins create tenants. 
-- For this MVP, we allowed 'authenticated' insert, but let's double check.
-- The existing policy was: create policy " authenticated users can create tenant" on public.tenants for insert with check (auth.role() = 'authenticated');
-- That one is actually fine, but let's make sure it's applied.

-- 2. Profiles: This was MISSING allow-insert policies.
-- We only had "select" policies. We need to allow users to insert their own profile.

create policy "Users can insert own profile" on public.profiles
for insert with check (auth.uid() = id);

-- Allow users to update their own profile
create policy "Users can update own profile" on public.profiles
for update using (auth.uid() = id);

-- 3. Validation
-- Check if the tables exist and RLS is enabled (should be from schema.sql)
