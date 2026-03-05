-- Test manual: Crear notificación directamente desde SQL
-- REEMPLAZA 'TU_USER_ID_AQUI' con tu user_id real (el del empleado)
-- REEMPLAZA 'TU_TENANT_ID_AQUI' con tu tenant_id real

-- Primero, obtén tu user_id y tenant_id:
SELECT id as user_id, tenant_id, full_name 
FROM profiles 
WHERE email = 'tu-email-aqui@ejemplo.com'; -- Cambia por el email del empleado

-- Luego ejecuta esto (reemplazando los valores):
/*
INSERT INTO notifications (user_id, tenant_id, type, title, message)
VALUES (
    'TU_USER_ID_AQUI',
    'TU_TENANT_ID_AQUI',
    'correction_approved',
    '🧪 Test Manual',
    'Esta es una notificación de prueba creada manualmente desde SQL'
);
*/

-- Ahora ve a la aplicación (sin recargar) y observa:
-- 1. ¿Aparece la notificación automáticamente?
-- 2. ¿Ves logs en consola que digan "🔔 Notification realtime update:"?
