-- 1. Update PROFILES policy to allow 'rep' to view others in the same tenant
DROP POLICY IF EXISTS "Admins/Managers view tenant profiles" ON public.profiles;
CREATE POLICY "Admins/Managers/Reps view tenant profiles" ON public.profiles
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() 
      AND (
        (p.tenant_id = public.profiles.tenant_id AND p.role IN ('admin', 'manager', 'rep'))
        OR p.role = 'super_admin'
      )
  )
);

-- 2. Update TIME ENTRIES policy to allow 'rep' to view others
DROP POLICY IF EXISTS "Admins/Managers view tenant entries" ON public.time_entries;
CREATE POLICY "Admins/Managers/Reps view tenant entries" ON public.time_entries
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND (
        (tenant_id = public.time_entries.tenant_id AND role IN ('admin', 'manager', 'rep'))
        OR role = 'super_admin'
      )
  )
);

-- 3. Update ABSENCE REQUESTS policy to allow 'rep' to view (Select)
DROP POLICY IF EXISTS "Admins can view and update all absence requests in their tenant" ON public.absence_requests;
CREATE POLICY "Admins/Managers/Reps view tenant absences" ON public.absence_requests
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND (
        (tenant_id = public.absence_requests.tenant_id AND role IN ('admin', 'manager', 'rep'))
        OR role = 'super_admin'
      )
  )
);

-- Keep the admin/superadmin-only ALL policy for updates/deletes in absence_requests
CREATE POLICY "Admins manage tenant absences" ON public.absence_requests
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

-- 4. Ensure NOTIFICATIONS are viewable (though usually individual)
-- (Already handled by "Users can view their own notifications" or super_admin)
