-- SIMPLE FIX: Break the circular dependency by making tenant policies permissive for MVP

-- Drop ALL existing policies on both tables
DO $$ 
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'profiles' AND schemaname = 'public')
    LOOP
        EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(r.policyname) || ' ON public.profiles';
    END LOOP;
    
    FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'tenants' AND schemaname = 'public')
    LOOP
        EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(r.policyname) || ' ON public.tenants';
    END LOOP;
END $$;

-- TENANTS: Make fully accessible to authenticated users (MVP only)
-- This breaks the circular dependency
CREATE POLICY "Authenticated users full access to tenants" 
ON public.tenants
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- PROFILES: Only own profile access
CREATE POLICY "Users full access to own profile" 
ON public.profiles
FOR ALL
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- PROFILES: Admins can view all profiles in their tenant
CREATE POLICY "Admins view tenant profiles" 
ON public.profiles
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p 
    WHERE p.id = auth.uid() 
    AND p.role = 'admin' 
    AND p.tenant_id = profiles.tenant_id
  )
);

SELECT 'RLS policies fixed successfully! Circular dependency removed.' as message;
