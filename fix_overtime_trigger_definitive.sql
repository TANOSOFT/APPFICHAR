-- =====================================================
-- DEFINITIVE FIX: OVERTIME TRIGGER & NOTIFICATIONS
-- Fixes: unrecognized format() type specifier "."
-- Fixes: system_auto_close constraint error
-- =====================================================

-- 1. FIX NOTIFICATION CONSTRAINTS
-- Ensures all notification types are allowed, including system_auto_close
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
        'absence_rejected',
        'overtime_warning_90', 
        'overtime_reached_100', 
        'overtime_exceeded', 
        'overtime_admin_alert',
        'system_auto_close'
    ));

-- 2. FIX OVERTIME TRIGGER FUNCTION
-- Replaces unsupported Precision Specifiers (%.2f) with (%) and ROUND()
CREATE OR REPLACE FUNCTION notify_employee_overtime()
RETURNS TRIGGER AS $$
DECLARE
    v_worked_hours DECIMAL;
    v_contracted_hours DECIMAL;
    v_hours_percentage DECIMAL;
    v_employee_name TEXT;
    v_tenant_id UUID;
BEGIN
    -- Only check when a time entry is completed (end_at set)
    IF NEW.end_at IS NOT NULL AND (OLD IS NULL OR OLD.end_at IS NULL OR OLD.end_at != NEW.end_at) THEN
        
        -- Get employee info
        SELECT full_name, contracted_hours_daily, tenant_id
        INTO v_employee_name, v_contracted_hours, v_tenant_id
        FROM profiles
        WHERE id = NEW.user_id;
        
        -- Skip if no contracted hours set
        IF v_contracted_hours IS NULL OR v_contracted_hours = 0 THEN
            RETURN NEW;
        END IF;
        
        -- Calculate total worked hours for today
        SELECT COALESCE(SUM(
            EXTRACT(EPOCH FROM (te.end_at - te.start_at)) / 3600.0
        ), 0)
        INTO v_worked_hours
        FROM time_entries te
        WHERE te.user_id = NEW.user_id
          AND DATE(te.work_date) = DATE(NEW.work_date)
          AND te.end_at IS NOT NULL;
        
        -- Subtract break time
        SELECT v_worked_hours - COALESCE(SUM(
            EXTRACT(EPOCH FROM (be.end_at - be.start_at)) / 3600.0
        ), 0)
        INTO v_worked_hours
        FROM break_entries be
        INNER JOIN time_entries te ON be.time_entry_id = te.id
        WHERE te.user_id = NEW.user_id
          AND DATE(te.work_date) = DATE(NEW.work_date);
        
        -- Calculate percentage
        v_hours_percentage := (v_worked_hours / v_contracted_hours) * 100.0;
        
        -- Notify based on percentage (90%, 100%, >100%)
        -- USE %s instead of %.2f (Postgres format does not support precision specifiers)
        IF v_hours_percentage >= 90 AND v_hours_percentage < 100 THEN
            INSERT INTO notifications (user_id, tenant_id, type, title, message)
            VALUES (
                NEW.user_id,
                v_tenant_id,
                'overtime_warning_90',
                '⚠️ Cerca del límite de horas',
                format('Has trabajado %s de %s horas contratadas (%s%%). Te estás acercando al límite diario.',
                    ROUND(v_worked_hours, 2), ROUND(v_contracted_hours, 2), ROUND(v_hours_percentage, 1))
            );
            
        ELSIF v_hours_percentage >= 100 AND v_hours_percentage <= 110 THEN
            INSERT INTO notifications (user_id, tenant_id, type, title, message)
            VALUES (
                NEW.user_id,
                v_tenant_id,
                'overtime_reached_100',
                '🚨 Límite de horas alcanzado',
                format('Has trabajado %s horas. Has alcanzado tus %s horas contratadas para hoy.',
                    ROUND(v_worked_hours, 2), ROUND(v_contracted_hours, 2))
            );
            
        ELSIF v_hours_percentage > 110 THEN
            INSERT INTO notifications (user_id, tenant_id, type, title, message)
            VALUES (
                NEW.user_id,
                v_tenant_id,
                'overtime_exceeded',
                '⚠️ Horas extras realizadas',
                format('Has trabajado %s horas, superando tus %s horas contratadas (%s%%). Son %s horas extras.',
                    ROUND(v_worked_hours, 2), ROUND(v_contracted_hours, 2), ROUND(v_hours_percentage, 1), ROUND(v_worked_hours - v_contracted_hours, 2))
            );
            
            -- Also notify admins
            INSERT INTO notifications (user_id, tenant_id, type, title, message)
            SELECT 
                p.id,
                v_tenant_id,
                'overtime_admin_alert',
                '📊 Empleado en horas extras',
                format('%s ha realizado %s horas extras hoy (%s de %s horas)',
                    v_employee_name, ROUND(v_worked_hours - v_contracted_hours, 2), ROUND(v_worked_hours, 2), ROUND(v_contracted_hours, 2))
            FROM profiles p
            WHERE p.tenant_id = v_tenant_id
              AND p.role IN ('admin', 'owner')
              AND p.id != NEW.user_id;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. RECREATE THE TRIGGER
DROP TRIGGER IF EXISTS trigger_notify_overtime ON time_entries;
CREATE TRIGGER trigger_notify_overtime
    AFTER INSERT OR UPDATE OF end_at
    ON time_entries
    FOR EACH ROW
    EXECUTE FUNCTION notify_employee_overtime();

COMMENT ON FUNCTION notify_employee_overtime IS 'Notifica al empleado y admin cuando se alcanzan o superan las horas contratadas (Fixed format() and constraints)';
