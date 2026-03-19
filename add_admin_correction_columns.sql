-- Add columns to track administrative modifications directly on time entries
ALTER TABLE public.time_entries
ADD COLUMN IF NOT EXISTS admin_modified_at timestamptz,
ADD COLUMN IF NOT EXISTS admin_modifier_id uuid REFERENCES public.profiles(id),
ADD COLUMN IF NOT EXISTS admin_modification_reason text;

-- Add a policy to ensure admins can explicitly update any open or closed entry
-- Note: 'Users update own open entries' already exists for employees. 
-- For admins, we need a policy allowing them to update ANY entry in their tenant.
-- The definitive_security_hardening.sql script might already have this or rely on superadmin.
-- Let's ensure a robust, scoped admin update policy exists:
DROP POLICY IF EXISTS "Admins/Managers update tenant entries" ON public.time_entries;
CREATE POLICY "Admins/Managers update tenant entries" ON public.time_entries
FOR UPDATE USING (
  tenant_id = public.get_auth_tenant() 
  AND public.get_auth_role() IN ('admin', 'manager')
);
