-- 1. Create storage bucket for private employee documents
INSERT INTO storage.buckets (id, name, public)
VALUES ('employee-docs', 'employee-docs', false)
ON CONFLICT (id) DO NOTHING;

-- 2. Create the tracking table
CREATE TABLE IF NOT EXISTS public.employee_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT now(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
    employee_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    document_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_type TEXT,
    uploaded_by UUID REFERENCES public.profiles(id),
    
    CONSTRAINT fk_tenant FOREIGN KEY (tenant_id) REFERENCES public.tenants(id)
);

-- 3. Enable RLS
ALTER TABLE public.employee_documents ENABLE ROW LEVEL SECURITY;

-- 4. Database Policies
CREATE POLICY "Admins can manage documents for their tenant"
ON public.employee_documents
FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.tenant_id = employee_documents.tenant_id
        AND (profiles.role = 'admin' OR profiles.role = 'super_admin')
    )
);

CREATE POLICY "Employees can view their own documents"
ON public.employee_documents
FOR SELECT
TO authenticated
USING (
    employee_id = auth.uid()
);

-- 5. Storage Policies for 'employee-docs' bucket

-- Admins can upload files to their tenant's folder
CREATE POLICY "Admins can upload employee documents"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'employee-docs' 
    AND (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND (profiles.role = 'admin' OR profiles.role = 'super_admin')
        )
    )
);

-- Admins can view/delete any file in the bucket (filtered by UI logic usually, but here broad for simplicity)
CREATE POLICY "Admins can manage storage objects"
ON storage.objects FOR ALL
TO authenticated
USING (
    bucket_id = 'employee-docs'
    AND (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND (profiles.role = 'admin' OR profiles.role = 'super_admin')
        )
    )
);

-- Employees can only view their own files
-- Note: File paths should be structured as: {tenant_id}/{employee_id}/{filename}
CREATE POLICY "Employees can read their own documents"
ON storage.objects FOR SELECT
TO authenticated
USING (
    bucket_id = 'employee-docs'
    AND (
        (storage.foldername(name))[2] = auth.uid()::text
    )
);

-- 6. Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE employee_documents;
