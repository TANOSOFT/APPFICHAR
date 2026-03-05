-- Create pending_invitations table for employee invites
CREATE TABLE IF NOT EXISTS public.pending_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text NOT NULL,
  employee_code text,
  role text CHECK (role IN ('admin', 'manager', 'employee', 'rep')) DEFAULT 'employee',
  invited_by uuid REFERENCES auth.users(id),
  status text CHECK (status IN ('pending', 'accepted', 'expired')) DEFAULT 'pending',
  created_at timestamptz DEFAULT timezone('UTC', now()),
  expires_at timestamptz DEFAULT timezone('UTC', now() + interval '7 days'),
  UNIQUE(tenant_id, email)
);

-- Disable RLS for MVP
ALTER TABLE public.pending_invitations DISABLE ROW LEVEL SECURITY;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_pending_invitations_email ON public.pending_invitations(email);
CREATE INDEX IF NOT EXISTS idx_pending_invitations_tenant ON public.pending_invitations(tenant_id, status);
