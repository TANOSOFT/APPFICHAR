-- Create table for absence requests (vacations, sick leave, etc.)
CREATE TABLE IF NOT EXISTS absence_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    tenant_id UUID NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('vacation', 'sick_leave', 'personal_days', 'other')),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    reason TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    admin_comment TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT valid_dates CHECK (start_date <= end_date)
);

-- Enable RLS
ALTER TABLE absence_requests ENABLE ROW LEVEL SECURITY;

-- Policies for absence_requests
-- (Assuming auth.uid() corresponds to profiles.id)
DROP POLICY IF EXISTS "Users can view their own absence requests" ON absence_requests;
CREATE POLICY "Users can view their own absence requests"
    ON absence_requests FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create their own absence requests" ON absence_requests;
CREATE POLICY "Users can create their own absence requests"
    ON absence_requests FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can view and update all absence requests in their tenant" ON absence_requests;
CREATE POLICY "Admins can view and update all absence requests in their tenant"
    ON absence_requests FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
              AND profiles.role = 'admin'
              AND profiles.tenant_id = absence_requests.tenant_id
        )
    );

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_absence_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_absence_requests_timestamp ON absence_requests;
CREATE TRIGGER update_absence_requests_timestamp
BEFORE UPDATE ON absence_requests
FOR EACH ROW
EXECUTE FUNCTION update_absence_requests_updated_at();
