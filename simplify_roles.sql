-- 1. MIGRATE legacy roles to new simplified roles
-- Map 'manager' to 'admin'
UPDATE public.profiles SET role = 'admin' WHERE role = 'manager';
UPDATE public.pending_invitations SET role = 'admin' WHERE role = 'manager';

-- Map 'rep' to 'employee'
UPDATE public.profiles SET role = 'employee' WHERE role = 'rep';
UPDATE public.pending_invitations SET role = 'employee' WHERE role = 'rep';

-- 2. UPDATE Check Constraints for Profiles
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check 
    CHECK (role IN ('super_admin', 'admin', 'employee'));

-- 3. UPDATE Check Constraints for Pending Invitations
ALTER TABLE public.pending_invitations DROP CONSTRAINT IF EXISTS pending_invitations_role_check;
ALTER TABLE public.pending_invitations ADD CONSTRAINT pending_invitations_role_check 
    CHECK (role IN ('admin', 'employee'));

-- 4. RE-UPDATE RLS policies to reflect these roles (Removing 'manager' and 'rep' checks)
-- The get_auth_role() and get_auth_tenant() helpers from fix_superadmin_rls_definitive.sql 
-- are already robust, but let's ensure the policies only look for 'admin' or 'super_admin'.

-- Profiles Select
DROP POLICY IF EXISTS "profiles_global_select" ON public.profiles;
CREATE POLICY "profiles_global_select" ON public.profiles
FOR SELECT USING (
  auth.uid() = id OR 
  public.get_auth_role() = 'super_admin' OR
  (public.get_auth_tenant() = tenant_id AND public.get_auth_role() = 'admin')
);

-- Profiles Update
DROP POLICY IF EXISTS "profiles_global_update" ON public.profiles;
CREATE POLICY "profiles_global_update" ON public.profiles
FOR UPDATE USING (
  auth.uid() = id OR 
  public.get_auth_role() = 'super_admin' OR
  (public.get_auth_tenant() = tenant_id AND public.get_auth_role() = 'admin')
);

-- Time Entries Select
DROP POLICY IF EXISTS "time_entries_global_select" ON public.time_entries;
CREATE POLICY "time_entries_global_select" ON public.time_entries
FOR SELECT USING (
  auth.uid() = user_id OR 
  public.get_auth_role() = 'super_admin' OR
  (public.get_auth_tenant() = tenant_id AND public.get_auth_role() = 'admin')
);

-- Absence Requests Select
DROP POLICY IF EXISTS "absence_requests_global_select" ON public.absence_requests;
CREATE POLICY "absence_requests_global_select" ON public.absence_requests
FOR SELECT USING (
  auth.uid() = user_id OR 
  public.get_auth_role() = 'super_admin' OR
  (public.get_auth_tenant() = tenant_id AND public.get_auth_role() = 'admin')
);
