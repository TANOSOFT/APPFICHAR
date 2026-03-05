-- Disable RLS for tenant_branding table (MVP)
-- This allows any authenticated user to manage branding
-- In production, you should create proper RLS policies

ALTER TABLE public.tenant_branding DISABLE ROW LEVEL SECURITY;

-- Also ensure tenants table has proper access
-- (Should already be done, but just in case)
ALTER TABLE public.tenants DISABLE ROW LEVEL SECURITY;
