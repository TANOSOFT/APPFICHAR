-- Fix for the silent failing update on time_entries
-- The previous policy didn't account for super_admin or other edge cases
-- And since Supabase update on 0 matching rows returns no error, the UI thought it worked!

DROP POLICY IF EXISTS "Admins/Managers update tenant entries" ON public.time_entries;

CREATE POLICY "Admins/Managers update tenant entries" ON public.time_entries
FOR UPDATE USING (
  tenant_id = public.get_auth_tenant() 
  AND public.get_auth_role() IN ('admin', 'manager', 'super_admin')
);

-- Also, just in case they are completely bypassing get_auth_tenant() due to being super_admin:
-- Let's add a pure super_admin policy to ensure it ALWAYS works for them.
CREATE POLICY "SuperAdmins update ANY time entries" ON public.time_entries
FOR UPDATE USING (
  public.get_auth_role() = 'super_admin'
);
