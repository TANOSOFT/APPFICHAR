-- Deshabilitar temporalmente el trigger de overtime
-- Esto permite fichar sin errores mientras lo arreglamos

DROP TRIGGER IF EXISTS trigger_notify_overtime ON time_entries;

-- Para verificar que se eliminó correctamente:
SELECT * FROM pg_trigger WHERE tgname = 'trigger_notify_overtime';
