-- =====================================================
-- MIGRATION: Add Employee Fields to Pending Invitations
-- =====================================================
-- Actualizar tabla pending_invitations para incluir campos laborales

ALTER TABLE pending_invitations 
ADD COLUMN IF NOT EXISTS dni VARCHAR(20),
ADD COLUMN IF NOT EXISTS social_security_number VARCHAR(50),
ADD COLUMN IF NOT EXISTS contract_type VARCHAR(50) DEFAULT 'indefinido',
ADD COLUMN IF NOT EXISTS contracted_hours_daily DECIMAL(4,2) DEFAULT 8.00,
ADD COLUMN IF NOT EXISTS contracted_hours_weekly DECIMAL(5,2) DEFAULT 40.00,
ADD COLUMN IF NOT EXISTS contract_start_date DATE,
ADD COLUMN IF NOT EXISTS contract_end_date DATE;

-- Verificar estructura
SELECT column_name, data_type 
FROM information_schema.columns
WHERE table_name = 'pending_invitations'
ORDER BY ordinal_position;
