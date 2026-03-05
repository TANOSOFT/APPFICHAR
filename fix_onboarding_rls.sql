-- Allow authenticated users to see their own invitations (needed for onboarding)
DROP POLICY IF EXISTS "invitations_self_select" ON public.pending_invitations;
CREATE POLICY "invitations_self_select" ON public.pending_invitations
FOR SELECT USING (email = auth.jwt()->>'email');

-- Also allow initial profile creation (ensure this is redundant but explicit)
DROP POLICY IF EXISTS "profile_insert_self_signup" ON public.profiles;
CREATE POLICY "profile_insert_self_signup" ON public.profiles 
FOR INSERT WITH CHECK (auth.uid() = id);
