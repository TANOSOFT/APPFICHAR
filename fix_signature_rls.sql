-- Fix RLS policies to allow employees to sign their documents

-- 1. Allow employees to UPDATE their own document records (to mark as signed)
CREATE POLICY "Employees can update their own documents to sign them"
ON public.employee_documents
FOR UPDATE
TO authenticated
USING (employee_id = auth.uid())
WITH CHECK (employee_id = auth.uid());

-- 2. Allow employees to UPLOAD (INSERT/UPDATE) to their own folder in storage
-- This is necessary to save the signed version of the PDF
CREATE POLICY "Employees can upload their signed documents"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'employee-docs'
    AND (storage.foldername(name))[2] = auth.uid()::text
);

CREATE POLICY "Employees can update their signed documents"
ON storage.objects FOR UPDATE
TO authenticated
USING (
    bucket_id = 'employee-docs'
    AND (storage.foldername(name))[2] = auth.uid()::text
);
