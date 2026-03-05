-- Create correction_requests table for time entry corrections
CREATE TABLE IF NOT EXISTS correction_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    time_entry_id UUID REFERENCES time_entries(id) ON DELETE CASCADE,
    
    -- Request details
    request_type VARCHAR(50) NOT NULL, -- 'modify', 'add_missing', 'delete'
    reason TEXT NOT NULL,
    
    -- Original values (for modify type)
    original_date DATE,
    original_start_at TIMESTAMPTZ,
    original_end_at TIMESTAMPTZ,
    
    -- Requested new values
    requested_date DATE,
    requested_start_at TIMESTAMPTZ,
    requested_end_at TIMESTAMPTZ,
    
    -- Status and approval
    status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
    reviewed_by UUID REFERENCES auth.users(id),
    reviewed_at TIMESTAMPTZ,
    review_notes TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_correction_requests_tenant ON correction_requests(tenant_id);
CREATE INDEX idx_correction_requests_user ON correction_requests(user_id);
CREATE INDEX idx_correction_requests_status ON correction_requests(status);
CREATE INDEX idx_correction_requests_time_entry ON correction_requests(time_entry_id);

-- Add trigger to update updated_at
CREATE OR REPLACE FUNCTION update_correction_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER correction_requests_updated_at
    BEFORE UPDATE ON correction_requests
    FOR EACH ROW
    EXECUTE FUNCTION update_correction_requests_updated_at();
