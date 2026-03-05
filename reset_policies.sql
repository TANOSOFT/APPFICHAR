-- Drop ALL existing policies to start fresh
DO $$ 
DECLARE
    r RECORD;
BEGIN
    -- Drop all policies on profiles table
    FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'profiles' AND schemaname = 'public')
    LOOP
        EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(r.policyname) || ' ON public.profiles';
    END LOOP;
    
    -- Drop all policies on tenants table
    FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'tenants' AND schemaname = 'public')
    LOOP
        EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(r.policyname) || ' ON public.tenants';
    END LOOP;
END $$;

-- Now create fresh policies for PROFILES
CREATE POLICY "Allow authenticated users full access to own profile" 
ON public.profiles
FOR ALL
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- Admins can see all profiles in their tenant
CREATE POLICY "Admins see all tenant profiles" 
ON public.profiles
FOR SELECT
TO authenticated
USING (
  tenant_id IN (
    SELECT tenant_id FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  )
);

-- Now create fresh policies for TENANTS
CREATE POLICY "Authenticated users can create tenants" 
ON public.tenants
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Users view own tenant" 
ON public.tenants
FOR SELECT
TO authenticated
USING (
  id IN (
    SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
  )
);

-- Verify success
SELECT 'Policies recreated successfully!' as status;
