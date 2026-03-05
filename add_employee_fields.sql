-- =====================================================
-- MIGRATION: Add Employee Labor Fields to Profiles
-- =====================================================
-- Añade campos laborales esenciales para empleados:
-- - DNI/NIF
-- - Número Seguridad Social
-- - Tipo de contrato
-- - Horas contratadas (diarias y semanales)
-- - Fechas de contrato

-- PASO 1: Añadir columnas a la tabla profiles
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS dni VARCHAR(20) UNIQUE,
ADD COLUMN IF NOT EXISTS social_security_number VARCHAR(50),
ADD COLUMN IF NOT EXISTS contract_type VARCHAR(50) DEFAULT 'indefinido',
ADD COLUMN IF NOT EXISTS contracted_hours_daily DECIMAL(4,2) DEFAULT 8.00,
ADD COLUMN IF NOT EXISTS contracted_hours_weekly DECIMAL(5,2) DEFAULT 40.00,
ADD COLUMN IF NOT EXISTS contract_start_date DATE,
ADD COLUMN IF NOT EXISTS contract_end_date DATE;

-- PASO 2: Añadir comentarios para documentación
COMMENT ON COLUMN profiles.dni IS 'Documento Nacional de Identidad / NIF';
COMMENT ON COLUMN profiles.social_security_number IS 'Número de afiliación a la Seguridad Social';
COMMENT ON COLUMN profiles.contract_type IS 'Tipo de contrato: indefinido, temporal, practicas, freelance';
COMMENT ON COLUMN profiles.contracted_hours_daily IS 'Horas de trabajo diarias según contrato';
COMMENT ON COLUMN profiles.contracted_hours_weekly IS 'Horas de trabajo semanales según contrato';
COMMENT ON COLUMN profiles.contract_start_date IS 'Fecha de inicio del contrato';
COMMENT ON COLUMN profiles.contract_end_date IS 'Fecha de fin del contrato (NULL para indefinidos)';

-- PASO 3: Crear índices para búsqueda eficiente
CREATE INDEX IF NOT EXISTS idx_profiles_dni ON profiles(dni);
CREATE INDEX IF NOT EXISTS idx_profiles_ssn ON profiles(social_security_number);
CREATE INDEX IF NOT EXISTS idx_profiles_contract_type ON profiles(contract_type);

-- PASO 4: Añadir constraint para validar tipos de contrato
-- Primero eliminar si existe
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS check_contract_type;
ALTER TABLE profiles 
ADD CONSTRAINT check_contract_type 
CHECK (contract_type IN ('indefinido', 'temporal', 'practicas', 'freelance', 'otros'));

-- PASO 5: Añadir constraint para validar horas (deben ser positivas)
-- Primero eliminar si existe
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS check_hours_positive;
ALTER TABLE profiles 
ADD CONSTRAINT check_hours_positive 
CHECK (
    contracted_hours_daily > 0 AND contracted_hours_daily <= 24 AND
    contracted_hours_weekly > 0 AND contracted_hours_weekly <= 168
);

-- PASO 6: Verificar la estructura actualizada
SELECT 
    column_name,
    data_type,
    character_maximum_length,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'profiles'
AND column_name IN (
    'dni', 
    'social_security_number', 
    'contract_type', 
    'contracted_hours_daily',
    'contracted_hours_weekly',
    'contract_start_date',
    'contract_end_date'
)
ORDER BY ordinal_position;

-- NOTA: Después de ejecutar esta migración:
-- 1. Los empleados existentes tendrán valores NULL en estos campos
-- 2. Los admins podrán completar esta información desde el panel
-- 3. Los nuevos empleados se registrarán con estos datos
