-- =====================================================
-- OVERTIME NOTIFICATIONS: Auto-notify on clock-out
-- =====================================================

-- Function to check and notify overtime after clock-out
CREATE OR REPLACE FUNCTION notify_employee_overtime()
RETURNS TRIGGER AS $$
DECLARE
    worked_hours DECIMAL;
    contracted_hours DECIMAL;
    hours_percentage DECIMAL;
    notification_title TEXT;
    notification_message TEXT;
    notification_type TEXT;
    employee_name TEXT;
    employee_tenant UUID;
BEGIN
    -- Only check when a time entry is completed (end_at set)
    IF NEW.end_at IS NOT NULL AND (OLD.end_at IS NULL OR OLD.end_at != NEW.end_at) THEN
        
        -- Get employee info
        SELECT full_name, contracted_hours_daily, tenant_id
        INTO employee_name, contracted_hours, employee_tenant
        FROM profiles
        WHERE id = NEW.user_id;
        
        -- Skip if no contracted hours set
        IF contracted_hours IS NULL OR contracted_hours = 0 THEN
            RETURN NEW;
        END IF;
        
        -- Calculate worked hours for today
        worked_hours := calculate_daily_hours(NEW.user_id, DATE(NEW.work_date));
        
        -- Calculate percentage
        hours_percentage := (worked_hours / contracted_hours) * 100;
        
        -- Determine notification type based on percentage
        IF hours_percentage >= 90 AND hours_percentage < 100 THEN
            notification_type := 'overtime_warning_90';
            notification_title := '⚠️ Cerca del límite de horas';
            notification_message := format(
                'Has trabajado %.2f de %.2f horas contratadas (%.1f%%). Te estás acercando al límite diario.',
                worked_hours,
                contracted_hours,
                hours_percentage
            );
        ELSIF hours_percentage >= 100 AND hours_percentage < 110 THEN
            notification_type := 'overtime_reached_100';
            notification_title := '🚨 Límite de horas alcanzado';
            notification_message := format(
                'Has trabajado %.2f horas. Has alcanzado tus %.2f horas contratadas para hoy.',
                worked_hours,
                contracted_hours
            );
        ELSIF hours_percentage > 100 THEN
            notification_type := 'overtime_exceeded';
            notification_title := '⚠️ Horas extras realizadas';
            notification_message := format(
                'Has trabajado %.2f horas, superando tus %.2f horas contratadas (%.1f%%). Son %.2f horas extras.',
                worked_hours,
                contracted_hours,
                hours_percentage,
                worked_hours - contracted_hours
            );
        ELSE
            -- No overtime, no notification needed
            RETURN NEW;
        END IF;
        
        -- Create notification for employee
        INSERT INTO notifications (user_id, tenant_id, type, title, message)
        VALUES (
            NEW.user_id,
            employee_tenant,
            notification_type,
            notification_title,
            notification_message
        );
        
        -- Also notify admin if overtime exceeded
        IF hours_percentage > 100 THEN
            INSERT INTO notifications (user_id, tenant_id, type, title, message)
            SELECT 
                p.id,
                p.tenant_id,
                'overtime_admin_alert',
                '📊 Empleado en horas extras',
                format(
                    '%s ha realizado %.2f horas extras hoy (%.2f de %.2f horas)',
                    employee_name,
                    worked_hours - contracted_hours,
                    worked_hours,
                    contracted_hours
                )
            FROM profiles p
            WHERE p.tenant_id = employee_tenant
              AND p.role IN ('admin', 'owner');
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on time_entries
DROP TRIGGER IF EXISTS trigger_notify_overtime ON time_entries;
CREATE TRIGGER trigger_notify_overtime
    AFTER INSERT OR UPDATE OF end_at
    ON time_entries
    FOR EACH ROW
    EXECUTE FUNCTION notify_employee_overtime();

COMMENT ON FUNCTION notify_employee_overtime IS 'Notifica al empleado y admin cuando se alcanzan o superan las horas contratadas';
COMMENT ON TRIGGER trigger_notify_overtime ON time_entries IS 'Dispara notificación de horas extra al finalizar fichaje';
