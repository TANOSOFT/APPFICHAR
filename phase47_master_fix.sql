-- =========================================================
-- PHASE 47: MASTER FIX - REALTIME, RLS & OVERTIME TRIGGER
-- =========================================================

-- 1. NOTIFICATIONS REALTIME CONFIGURATION
ALTER TABLE notifications REPLICA IDENTITY FULL;

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'notifications'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
    END IF;
EXCEPTION 
    WHEN OTHERS THEN 
        NULL;
END $$;

-- 2. NOTIFICATIONS TYPE CHECK CONSTRAINT FIX
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
        'overtime_admin_alert'
    ));

-- 3. TIME ENTRIES RLS FIX
ALTER TABLE public.time_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users update own open entries" ON public.time_entries;
CREATE POLICY "Users update own open entries" ON public.time_entries
FOR UPDATE 
USING (auth.uid() = user_id AND status = 'open')
WITH CHECK (auth.uid() = user_id);

-- 3. BREAK ENTRIES RLS FIX
ALTER TABLE public.break_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users update own breaks" ON public.break_entries;
CREATE POLICY "Users update own breaks" ON public.break_entries
FOR UPDATE
USING (
    EXISTS (
        SELECT 1 FROM public.time_entries
        WHERE id = public.break_entries.time_entry_id
        AND user_id = auth.uid()
        AND status = 'open'
    )
)
WITH CHECK (auth.uid() IS NOT NULL);

-- 4. OVERTIME TRIGGER FIX (unrecognized format() type specifier ".")
CREATE OR REPLACE FUNCTION notify_employee_overtime()
RETURNS TRIGGER AS $$
DECLARE
    v_worked_hours DECIMAL;
    v_contracted_hours DECIMAL;
    v_hours_percentage DECIMAL;
    v_employee_name TEXT;
    v_tenant_id UUID;
BEGIN
    IF NEW.end_at IS NOT NULL AND (OLD IS NULL OR OLD.end_at IS NULL OR OLD.end_at != NEW.end_at) THEN
        SELECT full_name, contracted_hours_daily, tenant_id
        INTO v_employee_name, v_contracted_hours, v_tenant_id
        FROM profiles
        WHERE id = NEW.user_id;
        
        IF v_contracted_hours IS NULL OR v_contracted_hours = 0 THEN
            RETURN NEW;
        END IF;
        
        SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (te.end_at - te.start_at)) / 3600.0), 0) INTO v_worked_hours
        FROM time_entries te WHERE te.user_id = NEW.user_id AND DATE(te.work_date) = DATE(NEW.work_date) AND te.end_at IS NOT NULL;
        
        SELECT v_worked_hours - COALESCE(SUM(EXTRACT(EPOCH FROM (be.end_at - be.start_at)) / 3600.0), 0) INTO v_worked_hours
        FROM break_entries be INNER JOIN time_entries te ON be.time_entry_id = te.id
        WHERE te.user_id = NEW.user_id AND DATE(te.work_date) = DATE(NEW.work_date) AND be.end_at IS NOT NULL;
        
        v_hours_percentage := (v_worked_hours / v_contracted_hours) * 100.0;
        
        IF v_hours_percentage >= 90 AND v_hours_percentage < 100 THEN
            INSERT INTO notifications (user_id, tenant_id, type, title, message)
            VALUES (NEW.user_id, v_tenant_id, 'overtime_warning_90', '⚠️ Cerca del límite de horas',
                format('Has trabajado %s de %s horas contratadas (%s%%). Te estás acercando al límite diario.',
                    ROUND(v_worked_hours, 2), ROUND(v_contracted_hours, 2), ROUND(v_hours_percentage, 1)));
        ELSIF v_hours_percentage >= 100 AND v_hours_percentage <= 110 THEN
            INSERT INTO notifications (user_id, tenant_id, type, title, message)
            VALUES (NEW.user_id, v_tenant_id, 'overtime_reached_100', '🚨 Límite de horas alcanzado',
                format('Has trabajado %s horas. Has alcanzado tus %s horas contratadas para hoy.',
                    ROUND(v_worked_hours, 2), ROUND(v_contracted_hours, 2)));
        ELSIF v_hours_percentage > 110 THEN
            INSERT INTO notifications (user_id, tenant_id, type, title, message)
            VALUES (NEW.user_id, v_tenant_id, 'overtime_exceeded', '⚠️ Horas extras realizadas',
                format('Has trabajado %s horas, superando tus %s horas contratadas (%s%%). Son %s horas extras.',
                    ROUND(v_worked_hours, 2), ROUND(v_contracted_hours, 2), ROUND(v_hours_percentage, 1), ROUND(v_worked_hours - v_contracted_hours, 2)));
            
            INSERT INTO notifications (user_id, tenant_id, type, title, message)
            SELECT p.id, v_tenant_id, 'overtime_admin_alert', '📊 Empleado en horas extras',
                format('%s ha realizado %s horas extras hoy (%s de %s horas)',
                    v_employee_name, ROUND(v_worked_hours - v_contracted_hours, 2), ROUND(v_worked_hours, 2), ROUND(v_contracted_hours, 2))
            FROM profiles p WHERE p.tenant_id = v_tenant_id AND p.role IN ('admin', 'owner') AND p.id != NEW.user_id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
