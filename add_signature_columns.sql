-- Add signature columns to employee_documents
ALTER TABLE public.employee_documents
ADD COLUMN IF NOT EXISTS is_signed BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS signed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS signature_id UUID; -- Optional: to link to a specific signature audit trail if needed
