-- Create storage bucket for company assets (logos, etc.)
INSERT INTO storage.buckets (id, name, public)
VALUES ('company-assets', 'company-assets', true)
ON CONFLICT (id) DO NOTHING;

-- Set up storage policies for company-assets bucket
-- Allow authenticated users to upload files
CREATE POLICY "Authenticated users can upload company assets"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'company-assets');

-- Allow public read access to company assets
CREATE POLICY "Public can view company assets"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'company-assets');

-- Allow authenticated users to update their own tenant's assets
CREATE POLICY "Users can update their tenant assets"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'company-assets');

-- Allow authenticated users to delete their own tenant's assets
CREATE POLICY "Users can delete their tenant assets"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'company-assets');
