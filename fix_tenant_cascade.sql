-- 1. Correct PROFILES table to allow cascading deletion when a tenant is deleted
ALTER TABLE public.profiles 
DROP CONSTRAINT IF EXISTS profiles_tenant_id_fkey;

ALTER TABLE public.profiles
ADD CONSTRAINT profiles_tenant_id_fkey 
FOREIGN KEY (tenant_id) 
REFERENCES public.tenants(id) 
ON DELETE CASCADE;

-- 2. Ensure ABSENCE_REQUESTS table has a foreign key to tenant with cascade
-- Double-check if it exists first to avoid errors
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE table_name='absence_requests' AND constraint_name='absence_requests_tenant_id_fkey'
    ) THEN
        ALTER TABLE public.absence_requests
        ADD CONSTRAINT absence_requests_tenant_id_fkey 
        FOREIGN KEY (tenant_id) 
        REFERENCES public.tenants(id) 
        ON DELETE CASCADE;
    END IF;
END $$;

-- 3. Ensure other tables that might have been created without cascade are updated (Safety Check)
-- Correction Requests
ALTER TABLE public.correction_requests 
DROP CONSTRAINT IF EXISTS correction_requests_tenant_id_fkey;
ALTER TABLE public.correction_requests
ADD CONSTRAINT correction_requests_tenant_id_fkey 
FOREIGN KEY (tenant_id) 
REFERENCES public.tenants(id) 
ON DELETE CASCADE;

-- Company Holidays
ALTER TABLE public.company_holidays 
DROP CONSTRAINT IF EXISTS unique_holiday_per_tenant; -- Keep unique but ensure FK is correct
ALTER TABLE public.company_holidays
DROP CONSTRAINT IF EXISTS company_holidays_tenant_id_fkey;
ALTER TABLE public.company_holidays
ADD CONSTRAINT company_holidays_tenant_id_fkey 
FOREIGN KEY (tenant_id) 
REFERENCES public.tenants(id) 
ON DELETE CASCADE;
