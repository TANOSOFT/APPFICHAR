-- Fix for existing employee_documents table to support selective signatures and placements
ALTER TABLE public.employee_documents
ADD COLUMN IF NOT EXISTS requires_signature BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS signature_placement TEXT DEFAULT 'right';
