-- Add column for email data protection text to tenant_branding
ALTER TABLE public.tenant_branding 
ADD COLUMN IF NOT EXISTS email_data_protection_text TEXT;

-- Comment on column
COMMENT ON COLUMN public.tenant_branding.email_data_protection_text IS 'Texto personalizado de protección de datos (LOPD/GDPR) para el pie de los correos electrónicos.';
