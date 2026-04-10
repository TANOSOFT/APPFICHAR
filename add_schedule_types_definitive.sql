-- =====================================================
-- MIGRACIÓN DEFINITIVA: Tipos de Jornada y Horarios
-- =====================================================

-- 1. Asegurar columnas en la tabla PROFILES
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS schedule_type VARCHAR(20) DEFAULT 'continua',
ADD COLUMN IF NOT EXISTS scheduled_start_time TIME DEFAULT '09:00',
ADD COLUMN IF NOT EXISTS scheduled_end_time TIME DEFAULT '18:00',
ADD COLUMN IF NOT EXISTS scheduled_start_time_2 TIME NULL,
ADD COLUMN IF NOT EXISTS scheduled_end_time_2 TIME NULL;

-- 2. Añadir columnas a PENDING_INVITATIONS para conservar el horario asignado
ALTER TABLE public.pending_invitations 
ADD COLUMN IF NOT EXISTS schedule_type VARCHAR(20) DEFAULT 'continua',
ADD COLUMN IF NOT EXISTS scheduled_start_time TIME DEFAULT '09:00',
ADD COLUMN IF NOT EXISTS scheduled_end_time TIME DEFAULT '18:00',
ADD COLUMN IF NOT EXISTS scheduled_start_time_2 TIME NULL,
ADD COLUMN IF NOT EXISTS scheduled_end_time_2 TIME NULL;

-- 3. Añadir o actualizar constraints para validar tipos de jornada
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS check_schedule_type;
ALTER TABLE public.profiles 
ADD CONSTRAINT check_schedule_type 
CHECK (schedule_type IN ('continua', 'partida', 'flexible', 'otros'));

ALTER TABLE public.pending_invitations DROP CONSTRAINT IF EXISTS check_schedule_type_inv;
ALTER TABLE public.pending_invitations 
ADD CONSTRAINT check_schedule_type_inv 
CHECK (schedule_type IN ('continua', 'partida', 'flexible', 'otros'));

-- 4. Comentarios para documentación
COMMENT ON COLUMN profiles.schedule_type IS 'Tipo de jornada: continua, partida, flexible, otros';
COMMENT ON COLUMN profiles.scheduled_start_time_2 IS 'Hora de inicio del segundo bloque (para jornada partida)';
COMMENT ON COLUMN profiles.scheduled_end_time_2 IS 'Hora de fin del segundo bloque (para jornada partida)';
