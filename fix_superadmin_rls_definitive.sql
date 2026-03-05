-- 1. DROP old policies that might be recursive or causing issues
DROP POLICY IF EXISTS "Admins/Managers view tenant profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins/Managers/Reps view tenant profiles" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_policy" ON public.profiles;

-- 2. CREATE robust helper functions with SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.get_auth_role()
RETURNS text AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.get_auth_tenant()
RETURNS uuid AS $$
  SELECT tenant_id FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER;

-- 3. NEW PROFILES POLICIES (No recursion)
CREATE POLICY "profiles_global_select" ON public.profiles
FOR SELECT USING (
  auth.uid() = id OR 
  public.get_auth_role() = 'super_admin' OR
  (public.get_auth_tenant() = tenant_id AND public.get_auth_role() IN ('admin', 'manager', 'rep'))
);

CREATE POLICY "profiles_global_update" ON public.profiles
FOR UPDATE USING (
  auth.uid() = id OR 
  public.get_auth_role() = 'super_admin' OR
  (public.get_auth_tenant() = tenant_id AND public.get_auth_role() = 'admin')
);

CREATE POLICY "profiles_global_insert" ON public.profiles
FOR INSERT WITH CHECK (
  public.get_auth_role() = 'super_admin' OR
  (public.get_auth_tenant() = tenant_id AND public.get_auth_role() = 'admin')
);

-- 4. UPDATE OTHER TABLES to use these non-recursive helpers
-- TIME ENTRIES
DROP POLICY IF EXISTS "Admins/Managers view tenant entries" ON public.time_entries;
DROP POLICY IF EXISTS "Admins/Managers/Reps view tenant entries" ON public.time_entries;
CREATE POLICY "time_entries_global_select" ON public.time_entries
FOR SELECT USING (
  auth.uid() = user_id OR 
  public.get_auth_role() = 'super_admin' OR
  (public.get_auth_tenant() = tenant_id AND public.get_auth_role() IN ('admin', 'manager', 'rep'))
);

-- ABSENCE REQUESTS
DROP POLICY IF EXISTS "Admins can view and update all absence requests in their tenant" ON public.absence_requests;
DROP POLICY IF EXISTS "Admins/Managers/Reps view tenant absences" ON public.absence_requests;
DROP POLICY IF EXISTS "Admins manage tenant absences" ON public.absence_requests;

CREATE POLICY "absence_requests_global_select" ON public.absence_requests
FOR SELECT USING (
  auth.uid() = user_id OR 
  public.get_auth_role() = 'super_admin' OR
  (public.get_auth_tenant() = tenant_id AND public.get_auth_role() IN ('admin', 'manager', 'rep'))
);

CREATE POLICY "absence_requests_global_all" ON public.absence_requests
FOR ALL USING (
  auth.uid() = user_id OR 
  public.get_auth_role() = 'super_admin' OR
  (public.get_auth_tenant() = tenant_id AND public.get_auth_role() = 'admin')
);

-- 5. RE-INSERT SuperAdmin Profile if needed (just in case they were lost or checking)
-- Note: Replace with actual ID if known, or let user do it.
-- UPDATE public.profiles SET role = 'super_admin' WHERE email = '...';
