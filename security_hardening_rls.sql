-- ========================================================
-- SECURITY HARDENING: DEFINITIVE RLS SETTINGS
-- This script ensures ALL tables have RLS enabled and
-- uses non-recursive helper functions for robust security.
-- ========================================================

-- 1. ROBUST HELPER FUNCTIONS (SECURITY DEFINER)
-- These bypass RLS checks to prevent infinite recursion
CREATE OR REPLACE FUNCTION public.get_auth_role()
RETURNS text AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.get_auth_tenant()
RETURNS uuid AS $$
  SELECT tenant_id FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

-- 2. ENABLE RLS ON ALL TABLES
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_branding ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.centers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.break_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.correction_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.absence_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pending_invitations ENABLE ROW LEVEL SECURITY;

-- 3. CLEANUP OLD POLICIES
-- This function drops all existing policies to ensure no legacy holes exist
DO $$ 
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT policyname, tablename 
        FROM pg_policies 
        WHERE schemaname = 'public' 
        AND schemaname NOT IN ('auth', 'storage', 'realtime')
    )
    LOOP
        EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(r.policyname) || ' ON public.' || quote_ident(r.tablename);
    END LOOP;
END $$;

-- 4. UNIVERSAL SUPERADMIN ACCESS (Tier 0)
-- SuperAdmins can do everything on any table
DO $$ 
DECLARE
    t text;
BEGIN
    FOR t IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
        EXECUTE format('CREATE POLICY "superadmin_full_access_%I" ON public.%I FOR ALL USING (public.get_auth_role() = ''super_admin'') WITH CHECK (public.get_auth_role() = ''super_admin'')', t, t);
    END LOOP;
END $$;

-- 5. CONTENT POLICIES (Tier 1 & 2)

-- --- TENANTS ---
CREATE POLICY "tenants_select" ON public.tenants FOR SELECT USING (id = public.get_auth_tenant());

-- --- TENANT BRANDING ---
CREATE POLICY "branding_select" ON public.tenant_branding FOR SELECT USING (tenant_id = public.get_auth_tenant());
CREATE POLICY "branding_update" ON public.tenant_branding FOR UPDATE USING (tenant_id = public.get_auth_tenant() AND public.get_auth_role() = 'admin');

-- --- PROFILES ---
CREATE POLICY "profiles_select" ON public.profiles FOR SELECT USING (id = auth.uid() OR (tenant_id = public.get_auth_tenant() AND public.get_auth_role() IN ('admin', 'manager', 'rep')));
CREATE POLICY "profiles_update" ON public.profiles FOR UPDATE USING (id = auth.uid() OR (tenant_id = public.get_auth_tenant() AND public.get_auth_role() = 'admin'));

-- --- CENTERS ---
CREATE POLICY "centers_select" ON public.centers FOR SELECT USING (tenant_id = public.get_auth_tenant());
CREATE POLICY "centers_manage" ON public.centers FOR ALL USING (tenant_id = public.get_auth_tenant() AND public.get_auth_role() = 'admin');

-- --- TIME ENTRIES ---
CREATE POLICY "time_entries_select" ON public.time_entries FOR SELECT USING (user_id = auth.uid() OR (tenant_id = public.get_auth_tenant() AND public.get_auth_role() IN ('admin', 'manager', 'rep')));
CREATE POLICY "time_entries_insert" ON public.time_entries FOR INSERT WITH CHECK (user_id = auth.uid() AND tenant_id = public.get_auth_tenant());
CREATE POLICY "time_entries_update" ON public.time_entries FOR UPDATE USING (user_id = auth.uid() OR (tenant_id = public.get_auth_tenant() AND public.get_auth_role() = 'admin'));

-- --- BREAK ENTRIES ---
CREATE POLICY "break_entries_select" ON public.break_entries FOR SELECT USING (tenant_id = public.get_auth_tenant());
CREATE POLICY "break_entries_insert" ON public.break_entries FOR INSERT WITH CHECK (tenant_id = public.get_auth_tenant());
CREATE POLICY "break_entries_update" ON public.break_entries FOR UPDATE USING (tenant_id = public.get_auth_tenant());

-- --- CORRECTION REQUESTS ---
CREATE POLICY "correction_requests_select" ON public.correction_requests FOR SELECT USING (user_id = auth.uid() OR (tenant_id = public.get_auth_tenant() AND public.get_auth_role() IN ('admin', 'manager', 'rep')));
CREATE POLICY "correction_requests_insert" ON public.correction_requests FOR INSERT WITH CHECK (user_id = auth.uid() AND tenant_id = public.get_auth_tenant());
CREATE POLICY "correction_requests_manage" ON public.correction_requests FOR UPDATE USING (tenant_id = public.get_auth_tenant() AND public.get_auth_role() = 'admin');

-- --- ABSENCE REQUESTS ---
CREATE POLICY "absence_requests_select" ON public.absence_requests FOR SELECT USING (user_id = auth.uid() OR (tenant_id = public.get_auth_tenant() AND public.get_auth_role() IN ('admin', 'manager', 'rep')));
CREATE POLICY "absence_requests_insert" ON public.absence_requests FOR INSERT WITH CHECK (user_id = auth.uid() AND tenant_id = public.get_auth_tenant());
CREATE POLICY "absence_requests_manage" ON public.absence_requests FOR UPDATE USING (tenant_id = public.get_auth_tenant() AND public.get_auth_role() = 'admin');

-- --- COMPANY HOLIDAYS ---
CREATE POLICY "holidays_select" ON public.company_holidays FOR SELECT USING (tenant_id = public.get_auth_tenant());
CREATE POLICY "holidays_manage" ON public.company_holidays FOR ALL USING (tenant_id = public.get_auth_tenant() AND public.get_auth_role() = 'admin');

-- --- NOTIFICATIONS ---
CREATE POLICY "notifications_select" ON public.notifications FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "notifications_update" ON public.notifications FOR UPDATE USING (user_id = auth.uid());

-- --- PENDING INVITATIONS ---
CREATE POLICY "invitations_select" ON public.pending_invitations FOR SELECT USING (tenant_id = public.get_auth_tenant() AND public.get_auth_role() = 'admin');
CREATE POLICY "invitations_manage" ON public.pending_invitations FOR ALL USING (tenant_id = public.get_auth_tenant() AND public.get_auth_role() = 'admin');

-- --- AUDIT LOG ---
CREATE POLICY "audit_log_select" ON public.audit_log FOR SELECT USING (tenant_id = public.get_auth_tenant() AND public.get_auth_role() = 'admin');
CREATE POLICY "audit_log_insert" ON public.audit_log FOR INSERT WITH CHECK (true); -- Allow system triggered logs

-- 6. SPECIAL: SELF-SERVICE TENANT CREATION
-- Allow authenticated users to create a tenant (e.g. for self-signup)
CREATE POLICY "tenant_insert_self_signup" ON public.tenants FOR INSERT WITH CHECK (auth.role() = 'authenticated');
-- Allow authenticated users to insert their branding if they just created the tenant
CREATE POLICY "branding_insert_self_signup" ON public.tenant_branding FOR INSERT WITH CHECK (auth.role() = 'authenticated');
-- Allow initial profile creation
CREATE POLICY "profile_insert_self_signup" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- 7. CLEANUP ROLE CONSTRAINTS
-- Ensure the simplified roles are enforced
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('super_admin', 'admin', 'employee'));

ALTER TABLE public.pending_invitations DROP CONSTRAINT IF EXISTS pending_invitations_role_check;
ALTER TABLE public.pending_invitations ADD CONSTRAINT pending_invitations_role_check CHECK (role IN ('admin', 'employee'));

-- Migrate any leftover roles
UPDATE public.profiles SET role = 'admin' WHERE role = 'manager';
UPDATE public.profiles SET role = 'employee' WHERE role = 'rep';
UPDATE public.pending_invitations SET role = 'admin' WHERE role = 'manager';
UPDATE public.pending_invitations SET role = 'employee' WHERE role = 'rep';

SELECT 'Security hardening and role migration complete.' as message;
