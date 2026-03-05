-- 1. Update notifications table to support absence requests
ALTER TABLE notifications 
    DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE notifications 
    ADD CONSTRAINT notifications_type_check 
    CHECK (type IN (
        'correction_request_created', 
        'correction_approved', 
        'correction_rejected',
        'absence_request_created',
        'absence_approved',
        'absence_rejected'
    ));

ALTER TABLE notifications 
    ADD COLUMN IF NOT EXISTS absence_request_id UUID REFERENCES absence_requests(id) ON DELETE CASCADE;

-- 2. Trigger function for absence request notifications
CREATE OR REPLACE FUNCTION handle_absence_request_notification()
RETURNS TRIGGER AS $$
DECLARE
    v_user_full_name TEXT;
    v_title TEXT;
    v_message TEXT;
    v_notification_type TEXT;
    v_target_user_id UUID;
BEGIN
    -- Get requester name
    SELECT full_name INTO v_user_full_name FROM profiles WHERE id = NEW.user_id;

    -- If NEW request is created -> notify admins
    IF (TG_OP = 'INSERT') THEN
        v_notification_type := 'absence_request_created';
        v_title := 'Nueva solicitud de ausencia';
        v_message := v_user_full_name || ' ha solicitado ' || 
                     CASE NEW.type 
                        WHEN 'vacation' THEN 'vacaciones'
                        WHEN 'sick_leave' THEN 'baja médica'
                        WHEN 'personal_days' THEN 'asuntos propios'
                        ELSE 'una ausencia'
                     END || ' del ' || TO_CHAR(NEW.start_date, 'DD/MM/YYYY') || ' al ' || TO_CHAR(NEW.end_date, 'DD/MM/YYYY');
        
        -- Find all admins in the tenant
        INSERT INTO notifications (user_id, tenant_id, type, title, message, absence_request_id)
        SELECT p.id, NEW.tenant_id, v_notification_type, v_title, v_message, NEW.id
        FROM profiles p
        WHERE p.tenant_id = NEW.tenant_id AND p.role = 'admin';

    -- If status changes -> notify the user
    ELSIF (TG_OP = 'UPDATE' AND OLD.status != NEW.status) THEN
        IF NEW.status = 'approved' THEN
            v_notification_type := 'absence_approved';
            v_title := 'Solicitud de ausencia aprobada';
            v_message := 'Tu solicitud de ' || 
                         CASE NEW.type 
                            WHEN 'vacation' THEN 'vacaciones'
                            WHEN 'sick_leave' THEN 'baja médica'
                            WHEN 'personal_days' THEN 'asuntos propios'
                            ELSE 'ausencia'
                         END || ' ha sido APROBADA.';
        ELSIF NEW.status = 'rejected' THEN
            v_notification_type := 'absence_rejected';
            v_title := 'Solicitud de ausencia rechazada';
            v_message := 'Tu solicitud de ' || 
                         CASE NEW.type 
                            WHEN 'vacation' THEN 'vacaciones'
                            WHEN 'sick_leave' THEN 'baja médica'
                            WHEN 'personal_days' THEN 'asuntos propios'
                            ELSE 'ausencia'
                         END || ' ha sido RECHAZADA.' || 
                         CASE WHEN NEW.admin_comment IS NOT NULL THEN ' Motivo: ' || NEW.admin_comment ELSE '' END;
        END IF;

        IF v_notification_type IS NOT NULL THEN
            INSERT INTO notifications (user_id, tenant_id, type, title, message, absence_request_id)
            VALUES (NEW.user_id, NEW.tenant_id, v_notification_type, v_title, v_message, NEW.id);
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Create triggers
DROP TRIGGER IF EXISTS tr_absence_request_notification ON absence_requests;
CREATE TRIGGER tr_absence_request_notification
AFTER INSERT OR UPDATE OF status ON absence_requests
FOR EACH ROW
EXECUTE FUNCTION handle_absence_request_notification();
