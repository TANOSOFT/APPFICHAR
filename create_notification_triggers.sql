-- =====================================================
-- TRIGGERS PARA AUTO-GENERACIÓN DE NOTIFICACIONES
-- =====================================================

-- =====================================================
-- TRIGGER 1: Nueva solicitud de corrección
-- Notifica a todos los admins/managers del tenant
-- =====================================================

CREATE OR REPLACE FUNCTION notify_admins_new_correction_request()
RETURNS TRIGGER AS $$
DECLARE
    admin_record RECORD;
    requester_name TEXT;
BEGIN
    -- Obtener nombre del solicitante
    SELECT full_name INTO requester_name
    FROM profiles
    WHERE id = NEW.user_id;

    -- Notificar a todos los admins y managers del tenant
    FOR admin_record IN 
        SELECT id 
        FROM profiles 
        WHERE tenant_id = NEW.tenant_id 
        AND role IN ('admin', 'manager')
        AND id != NEW.user_id -- No notificar al propio solicitante si es admin
    LOOP
        INSERT INTO notifications (user_id, tenant_id, type, title, message, correction_request_id)
        VALUES (
            admin_record.id,
            NEW.tenant_id,
            'correction_request_created',
            '🔔 Nueva Solicitud de Corrección',
            COALESCE(requester_name, 'Un empleado') || ' ha solicitado una corrección de fichaje',
            NEW.id
        );
    END LOOP;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Eliminar trigger existente si existe
DROP TRIGGER IF EXISTS trigger_notify_new_correction ON correction_requests;

-- Crear trigger
CREATE TRIGGER trigger_notify_new_correction
    AFTER INSERT ON correction_requests
    FOR EACH ROW
    EXECUTE FUNCTION notify_admins_new_correction_request();


-- =====================================================
-- TRIGGER 2: Solicitud aprobada/rechazada
-- Notifica al empleado solicitante
-- =====================================================

CREATE OR REPLACE FUNCTION notify_employee_correction_status()
RETURNS TRIGGER AS $$
DECLARE
    reviewer_name TEXT;
BEGIN
    -- Solo notificar cuando cambia de pending a approved/rejected
    IF OLD.status = 'pending' AND NEW.status IN ('approved', 'rejected') THEN
        
        -- Obtener nombre del revisor
        SELECT full_name INTO reviewer_name
        FROM profiles
        WHERE id = NEW.reviewed_by;
        
        INSERT INTO notifications (user_id, tenant_id, type, title, message, correction_request_id)
        VALUES (
            NEW.user_id,
            NEW.tenant_id,
            CASE 
                WHEN NEW.status = 'approved' THEN 'correction_approved'
                ELSE 'correction_rejected'
            END,
            CASE 
                WHEN NEW.status = 'approved' THEN '✅ Solicitud Aprobada'
                ELSE '❌ Solicitud Rechazada'
            END,
            CASE 
                WHEN NEW.status = 'approved' THEN 
                    'Tu solicitud de corrección ha sido aprobada' || 
                    COALESCE(' por ' || reviewer_name, '')
                ELSE 
                    'Tu solicitud de corrección ha sido rechazada' ||
                    COALESCE(' por ' || reviewer_name, '') ||
                    CASE 
                        WHEN NEW.review_notes IS NOT NULL THEN 
                            '. Motivo: ' || NEW.review_notes
                        ELSE ''
                    END
            END,
            NEW.id
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Eliminar trigger existente si existe
DROP TRIGGER IF EXISTS trigger_notify_correction_status ON correction_requests;

-- Crear trigger
CREATE TRIGGER trigger_notify_correction_status
    AFTER UPDATE ON correction_requests
    FOR EACH ROW
    EXECUTE FUNCTION notify_employee_correction_status();


-- =====================================================
-- VERIFICAR TRIGGERS
-- =====================================================

SELECT 
    trigger_name,
    event_manipulation,
    event_object_table,
    action_statement
FROM information_schema.triggers
WHERE event_object_table = 'correction_requests'
AND trigger_name LIKE '%notify%';
