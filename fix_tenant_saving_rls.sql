-- Allow admins to update their tenant info (CIF, Address, etc.)
DROP POLICY IF EXISTS "tenants_update" ON public.tenants;
CREATE POLICY "tenants_update" ON public.tenants 
FOR UPDATE USING (id = public.get_auth_tenant() AND public.get_auth_role() = 'admin');

-- Ensure admins have full control over their branding record
DROP POLICY IF EXISTS "branding_update" ON public.tenant_branding;
DROP POLICY IF EXISTS "branding_insert" ON public.tenant_branding;
CREATE POLICY "branding_manage_admin" ON public.tenant_branding 
FOR ALL USING (tenant_id = public.get_auth_tenant() AND public.get_auth_role() = 'admin');
