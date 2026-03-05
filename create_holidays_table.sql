-- Create table for company/national holidays
CREATE TABLE IF NOT EXISTS company_holidays (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
    date DATE NOT NULL,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Ensure same holiday isn't added twice for the same tenant
    CONSTRAINT unique_holiday_per_tenant UNIQUE (tenant_id, date)
);

-- Enable RLS
ALTER TABLE company_holidays ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view holidays in their tenant"
    ON company_holidays FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
              AND profiles.tenant_id = company_holidays.tenant_id
        )
    );

CREATE POLICY "Admins can manage holidays in their tenant"
    ON company_holidays FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
              AND profiles.role = 'admin'
              AND profiles.tenant_id = company_holidays.tenant_id
        )
    );
