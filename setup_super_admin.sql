-- 1. Update Role constraints in profiles and pending_invitations
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check 
    CHECK (role IN ('super_admin', 'admin', 'manager', 'employee', 'rep'));

ALTER TABLE public.pending_invitations DROP CONSTRAINT IF EXISTS pending_invitations_role_check;
ALTER TABLE public.pending_invitations ADD CONSTRAINT pending_invitations_role_check 
    CHECK (role IN ('super_admin', 'admin', 'manager', 'employee', 'rep'));

-- 2. Create helper function for super_admin check
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'super_admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Update RLS Policies across tables

-- PROFILES
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles
FOR SELECT USING (auth.uid() = id OR public.is_super_admin());

DROP POLICY IF EXISTS "Admins/Managers view tenant profiles" ON public.profiles;
CREATE POLICY "Admins/Managers view tenant profiles" ON public.profiles
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() 
      AND (
        (p.tenant_id = public.profiles.tenant_id AND p.role IN ('admin', 'manager'))
        OR p.role = 'super_admin'
      )
  )
);

-- TENANTS
DROP POLICY IF EXISTS "Users view own tenant" ON public.tenants;
CREATE POLICY "Users view own tenant" ON public.tenants
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND (tenant_id = public.tenants.id OR role = 'super_admin')
  )
);

-- Super-admins can update any tenant
CREATE POLICY "Super-admins can update any tenant" ON public.tenants
FOR UPDATE USING (public.is_super_admin());

-- TIME ENTRIES
DROP POLICY IF EXISTS "Users view own time entries" ON public.time_entries;
CREATE POLICY "Users view own time entries" ON public.time_entries
FOR SELECT USING (auth.uid() = user_id OR public.is_super_admin());

DROP POLICY IF EXISTS "Admins/Managers view tenant entries" ON public.time_entries;
CREATE POLICY "Admins/Managers view tenant entries" ON public.time_entries
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND (
        (tenant_id = public.time_entries.tenant_id AND role IN ('admin', 'manager'))
        OR role = 'super_admin'
      )
  )
);

-- ABSENCE REQUESTS
DROP POLICY IF EXISTS "Users can view their own absence requests" ON public.absence_requests;
CREATE POLICY "Users can view their own absence requests" ON public.absence_requests
FOR SELECT USING (auth.uid() = user_id OR public.is_super_admin());

DROP POLICY IF EXISTS "Admins can view and update all absence requests in their tenant" ON public.absence_requests;
CREATE POLICY "Admins can view and update all absence requests in their tenant" ON public.absence_requests
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND (
        (tenant_id = public.absence_requests.tenant_id AND role = 'admin')
        OR role = 'super_admin'
      )
  )
);

-- COMPANY HOLIDAYS
DROP POLICY IF EXISTS "Anyone in the tenant can view holidays" ON public.company_holidays;
CREATE POLICY "Anyone in the tenant can view holidays" ON public.company_holidays
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND (tenant_id = public.company_holidays.tenant_id OR role = 'super_admin')
  )
);

DROP POLICY IF EXISTS "Admins can manage company holidays" ON public.company_holidays;
CREATE POLICY "Admins can manage company holidays" ON public.company_holidays
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND (
        (tenant_id = public.company_holidays.tenant_id AND role = 'admin')
        OR role = 'super_admin'
      )
  )
);

-- NOTIFICATIONS
DROP POLICY IF EXISTS "Users can view their own notifications" ON public.notifications;
CREATE POLICY "Users can view their own notifications" ON public.notifications
FOR SELECT USING (auth.uid() = user_id OR public.is_super_admin());
