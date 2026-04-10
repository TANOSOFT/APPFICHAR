-- =====================================================
-- MIGRACIÓN: Tipos de Jornada y Horarios Partidos
-- =====================================================

-- 1. Añadir columnas de horario extendido y tipo de jornada
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS schedule_type VARCHAR(20) DEFAULT 'continua',
ADD COLUMN IF NOT EXISTS scheduled_start_time_2 TIME NULL,
ADD COLUMN IF NOT EXISTS scheduled_end_time_2 TIME NULL;

-- 2. Añadir constraint para validar tipos de jornada
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS check_schedule_type;
ALTER TABLE profiles 
ADD CONSTRAINT check_schedule_type 
CHECK (schedule_type IN ('continua', 'partida', 'flexible', 'otros'));

-- 3. Comentarios para documentación
COMMENT ON COLUMN profiles.schedule_type IS 'Tipo de jornada: continua, partida, flexible, otros';
COMMENT ON COLUMN profiles.scheduled_start_time_2 IS 'Hora de inicio del segundo bloque (para jornada partida)';
COMMENT ON COLUMN profiles.scheduled_end_time_2 IS 'Hora de fin del segundo bloque (para jornada partida)';

-- 4. Actualizar índices (opcional)
CREATE INDEX IF NOT EXISTS idx_profiles_schedule_type ON profiles(schedule_type);
