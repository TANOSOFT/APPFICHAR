-- Script para verificar que las notificaciones se están creando correctamente

-- 1. Ver todas las notificaciones en la base de datos
SELECT 
    n.id,
    n.type,
    n.title,
    n.message,
    n.read,
    n.created_at,
    p.full_name as recipient_name,
    cr.status as correction_status
FROM notifications n
LEFT JOIN profiles p ON n.user_id = p.id
LEFT JOIN correction_requests cr ON n.correction_request_id = cr.id
ORDER BY n.created_at DESC
LIMIT 20;

-- 2. Ver solicitudes de corrección y su estado
SELECT 
    cr.id,
    cr.status,
    cr.created_at,
    cr.reviewed_at,
    p.full_name as requester,
    reviewer.full_name as reviewed_by
FROM correction_requests cr
LEFT JOIN profiles p ON cr.user_id = p.id
LEFT JOIN profiles reviewer ON cr.reviewed_by = reviewer.id
ORDER BY cr.created_at DESC
LIMIT 10;

-- 3. Verificar que los triggers existen
SELECT 
    trigger_name,
    event_manipulation,
    event_object_table,
    action_statement
FROM information_schema.triggers
WHERE event_object_table = 'correction_requests'
AND trigger_name LIKE '%notify%';
