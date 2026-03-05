-- =====================================================
-- TEST: Probar trigger manualmente
-- =====================================================

-- PASO 1: Ver el estado actual de una solicitud
SELECT id, user_id, status, reviewed_by, review_notes
FROM correction_requests
WHERE status = 'pending'
ORDER BY created_at DESC
LIMIT 1;

-- PASO 2: Actualizar manualmente una solicitud (simular aprobación)
-- IMPORTANTE: Reemplaza 'REQUEST_ID_AQUI' con un ID real de la query anterior
-- IMPORTANTE: Reemplaza 'ADMIN_USER_ID_AQUI' con el ID del admin que aprueba

-- Ejemplo de UPDATE (DESCOMENTAR Y AJUSTAR):
/*
UPDATE correction_requests
SET 
    status = 'approved',
    reviewed_by = 'ADMIN_USER_ID_AQUI',
    reviewed_at = NOW(),
    review_notes = 'Aprobado para prueba de trigger'
WHERE id = 'REQUEST_ID_AQUI';
*/

-- PASO 3: Verificar que se creó la notificación
SELECT 
    n.*,
    p.full_name as recipient_name
FROM notifications n
LEFT JOIN profiles p ON n.user_id = p.id
WHERE n.type IN ('correction_approved', 'correction_rejected')
ORDER BY n.created_at DESC
LIMIT 5;

-- PASO 4: Si no se creó, verificar errores en logs
-- Comprobar que el trigger existe:
SELECT 
    trigger_name,
    event_manipulation,
    action_timing,
    action_statement
FROM information_schema.triggers
WHERE trigger_name = 'trigger_notify_correction_status';
