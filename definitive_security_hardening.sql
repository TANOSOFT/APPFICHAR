-- ====================================================================
-- DEFINITIVE SECURITY HARDENING: SUPABASE RLS AUDIT FIX
-- ====================================================================

-- 1. CLEANUP: Disable all legacy permissive access and recursion
-- --------------------------------------------------------------------

-- helper functions with SECURITY DEFINER to bypass recursion
CREATE OR REPLACE FUNCTION public.get_auth_role()
RETURNS text AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.get_auth_tenant()
RETURNS uuid AS $$
  SELECT tenant_id FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

-- 2. ENFORCE RLS ON ALL TABLES
-- --------------------------------------------------------------------
DO $$ 
DECLARE
    t text;
BEGIN
    FOR t IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    END LOOP;
END $$;

-- 3. WIPE ALL EXISTING POLICIES
-- --------------------------------------------------------------------
DO $$ 
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT policyname, tablename 
        FROM pg_policies 
        WHERE schemaname = 'public'
    )
    LOOP
        EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(r.policyname) || ' ON public.' || quote_ident(r.tablename);
    END LOOP;
END $$;

-- 4. IMPLEMENT SYSTEM POLICIES
-- --------------------------------------------------------------------

-- UNIVERSAL SUPERADMIN ACCESS
DO $$ 
DECLARE
    t text;
BEGIN
    FOR t IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
        EXECUTE format('CREATE POLICY "superadmin_access_%I" ON public.%I FOR ALL USING (public.get_auth_role() = ''super_admin'')', t, t);
    END LOOP;
END $$;

-- --- TENANTS ---
CREATE POLICY "tenants_select" ON public.tenants FOR SELECT USING (id = public.get_auth_tenant());
CREATE POLICY "tenants_update_admin" ON public.tenants FOR UPDATE USING (id = public.get_auth_tenant() AND public.get_auth_role() = 'admin');
CREATE POLICY "tenants_insert_onboarding" ON public.tenants FOR INSERT WITH CHECK (auth.role() = 'authenticated'); -- Crucial for signup

-- --- TENANT BRANDING ---
CREATE POLICY "branding_select" ON public.tenant_branding FOR SELECT USING (tenant_id = public.get_auth_tenant());
CREATE POLICY "branding_manage_admin" ON public.tenant_branding FOR ALL USING (tenant_id = public.get_auth_tenant() AND public.get_auth_role() = 'admin');
CREATE POLICY "branding_insert_onboarding" ON public.tenant_branding FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- --- PROFILES ---
CREATE POLICY "profiles_select_own" ON public.profiles FOR SELECT USING (id = auth.uid());
CREATE POLICY "profiles_select_tenant" ON public.profiles FOR SELECT USING (tenant_id = public.get_auth_tenant());
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE USING (id = auth.uid());
CREATE POLICY "profiles_manage_admin" ON public.profiles FOR ALL USING (tenant_id = public.get_auth_tenant() AND public.get_auth_role() = 'admin');
CREATE POLICY "profiles_insert_init" ON public.profiles FOR INSERT WITH CHECK (id = auth.uid());

-- --- TIME ENTRIES ---
CREATE POLICY "time_entries_own" ON public.time_entries FOR ALL USING (user_id = auth.uid());
CREATE POLICY "time_entries_admin" ON public.time_entries FOR ALL USING (tenant_id = public.get_auth_tenant() AND public.get_auth_role() = 'admin');

-- --- BREAK ENTRIES ---
CREATE POLICY "break_entries_own" ON public.break_entries FOR ALL USING (time_entry_id IN (SELECT id FROM public.time_entries WHERE user_id = auth.uid()));
CREATE POLICY "break_entries_admin" ON public.break_entries FOR ALL USING (tenant_id = public.get_auth_tenant() AND public.get_auth_role() = 'admin');

-- --- CORRECTION REQUESTS ---
CREATE POLICY "corrections_own" ON public.correction_requests FOR ALL USING (user_id = auth.uid());
CREATE POLICY "corrections_admin" ON public.correction_requests FOR ALL USING (tenant_id = public.get_auth_tenant() AND public.get_auth_role() = 'admin');

-- --- ABSENCE REQUESTS ---
CREATE POLICY "absences_own" ON public.absence_requests FOR ALL USING (user_id = auth.uid());
CREATE POLICY "absences_admin" ON public.absence_requests FOR ALL USING (tenant_id = public.get_auth_tenant() AND public.get_auth_role() = 'admin');

-- --- NOTIFICATIONS ---
CREATE POLICY "notifications_own" ON public.notifications FOR ALL USING (user_id = auth.uid());
CREATE POLICY "notifications_system_insert" ON public.notifications FOR INSERT WITH CHECK (true); -- Allow triggers to notify

-- --- PENDING INVITATIONS ---
CREATE POLICY "invitations_own_email" ON public.pending_invitations FOR SELECT USING (email = (select email from auth.users where id = auth.uid()));
CREATE POLICY "invitations_manage_admin" ON public.pending_invitations FOR ALL USING (tenant_id = public.get_auth_tenant() AND public.get_auth_role() = 'admin');

-- --- AUDIT LOG ---
CREATE POLICY "audit_log_admin" ON public.audit_log FOR SELECT USING (tenant_id = public.get_auth_tenant() AND public.get_auth_role() = 'admin');
CREATE POLICY "audit_log_insert" ON public.audit_log FOR INSERT WITH CHECK (true);

-- --- CENTERS ---
CREATE POLICY "centers_select" ON public.centers FOR SELECT USING (tenant_id = public.get_auth_tenant());
CREATE POLICY "centers_manage_admin" ON public.centers FOR ALL USING (tenant_id = public.get_auth_tenant() AND public.get_auth_role() = 'admin');

-- --- COMPANY HOLIDAYS ---
CREATE POLICY "holidays_select" ON public.company_holidays FOR SELECT USING (tenant_id = public.get_auth_tenant());
CREATE POLICY "holidays_manage_admin" ON public.company_holidays FOR ALL USING (tenant_id = public.get_auth_tenant() AND public.get_auth_role() = 'admin');

-- 5. VERIFICATION
-- --------------------------------------------------------------------
SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;
