-- =====================================================
-- MONETIZACIÓN: TIPOS DE NOTIFICACIÓN
-- =====================================================

-- 1. Actualizar el check de tipos de notificación
ALTER TABLE notifications 
    DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE notifications 
    ADD CONSTRAINT notifications_type_check 
    CHECK (type IN (
        'correction_request_created', 'correction_approved', 'correction_rejected',
        'absence_request_created', 'absence_approved', 'absence_rejected',
        'overtime_warning_90', 'overtime_reached_100', 'overtime_exceeded', 'overtime_admin_alert',
        'system_auto_close',
        -- Nuevos tipos para monetización
        'billing_notice', 
        'license_suspended'
    ));

-- 2. Asegurar que los perfiles tienen acceso a ver estas notificaciones
-- (Las políticas RLS ya deberían permitirlo si el tenant_id coincide)
