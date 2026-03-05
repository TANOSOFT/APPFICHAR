-- COMPLETE FIX: Temporarily disable RLS to allow MVP testing
-- WARNING: This is ONLY for MVP/testing. In production, keep RLS enabled.

-- Alternative approach: Create a simpler onboarding flow

-- Option 1: Disable RLS on profiles temporarily (NOT RECOMMENDED FOR PRODUCTION)
-- ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.tenants DISABLE ROW LEVEL SECURITY;

-- Option 2: Add more permissive policies for MVP
-- Drop existing policies and recreate

-- First, let's drop the problematic policies and add fresh ones
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins/Managers view tenant profiles" ON public.profiles;

-- Recreate profiles policies (more permissive for MVP)
CREATE POLICY "Allow authenticated users full access to own profile" 
ON public.profiles
FOR ALL
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- Admin access to all profiles in tenant
CREATE POLICY "Admins see all tenant profiles" 
ON public.profiles
FOR SELECT
TO authenticated
USING (
  tenant_id IN (
    SELECT tenant_id FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  )
);

-- For tenants: ensure authenticated users can create
DROP POLICY IF EXISTS " authenticated users can create tenant" ON public.tenants;
CREATE POLICY "Authenticated users can create tenants" 
ON public.tenants
FOR INSERT
TO authenticated
WITH CHECK (true); -- Allow any authenticated user to create a tenant (MVP only)

-- Allow users to view their tenant
DROP POLICY IF EXISTS "Users view own tenant" ON public.tenants;
CREATE POLICY "Users view own tenant" 
ON public.tenants
FOR SELECT
TO authenticated
USING (
  id IN (
    SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
  )
);
