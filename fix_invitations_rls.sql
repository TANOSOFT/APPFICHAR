-- Fix RLS policy on pending_invitations to allow users to update their own invitation
CREATE POLICY "invitations_update_own" ON public.pending_invitations 
FOR UPDATE 
USING (email = (select email from auth.users where id = auth.uid()));
