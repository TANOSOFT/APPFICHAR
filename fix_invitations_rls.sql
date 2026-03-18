-- Drop the broken policies that tried to select from auth.users
DROP POLICY IF EXISTS "invitations_own_email" ON public.pending_invitations;
DROP POLICY IF EXISTS "invitations_update_own" ON public.pending_invitations;
DROP POLICY IF EXISTS "invitations_self_select" ON public.pending_invitations;

-- Create working policies using auth.jwt() to get the email securely
CREATE POLICY "invitations_own_email" ON public.pending_invitations 
FOR SELECT 
USING (email = (auth.jwt() ->> 'email'));

CREATE POLICY "invitations_update_own" ON public.pending_invitations 
FOR UPDATE 
USING (email = (auth.jwt() ->> 'email'));

-- Also verify that the manage_admin policy is still there
-- CREATE POLICY "invitations_manage_admin" ON public.pending_invitations FOR ALL USING (tenant_id = public.get_auth_tenant() AND public.get_auth_role() = 'admin');
