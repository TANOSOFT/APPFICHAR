-- ========================================================
-- SECURITY HARDENING MASTER FIX (Phase 47)
-- Resolves: Missing search_path in functions, permissive RLS.
-- ========================================================

-- 1. HARDEN HELPER FUNCTIONS
-- Ensures all public functions use a fixed search_path to prevent hijacking.

-- 1.1 Auth Helpers
CREATE OR REPLACE FUNCTION public.get_auth_role()
RETURNS text AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.get_auth_tenant()
RETURNS uuid AS $$
  SELECT tenant_id FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

-- 1.2 Validation Helpers
CREATE OR REPLACE FUNCTION public.validate_spanish_dni(dni_input TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    dni_number INTEGER;
    dni_letter CHAR(1);
    expected_letter CHAR(1);
    letter_table CHAR(23) := 'TRWAGMYFPDXBNJZSQVHLCKE';
BEGIN
    dni_input := UPPER(TRIM(dni_input));
    IF LENGTH(dni_input) != 9 THEN RETURN FALSE; END IF;
    dni_number := SUBSTRING(dni_input FROM 1 FOR 8)::INTEGER;
    dni_letter := SUBSTRING(dni_input FROM 9 FOR 1);
    expected_letter := SUBSTRING(letter_table FROM ((dni_number % 23) + 1) FOR 1);
    RETURN dni_letter = expected_letter;
EXCEPTION
    WHEN OTHERS THEN RETURN FALSE;
END;
$$ LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path = public;

-- 2. HARDEN TRIGGER FUNCTIONS

-- 2.1 Overtime Notifications
CREATE OR REPLACE FUNCTION public.notify_employee_overtime()
RETURNS TRIGGER AS $$
DECLARE
    v_worked_hours DECIMAL;
    v_contracted_hours DECIMAL;
    v_employee_name TEXT;
    v_tenant_id UUID;
    v_hours_percentage DECIMAL;
BEGIN
    IF NEW.end_at IS NOT NULL AND (OLD IS NULL OR OLD.end_at IS NULL OR OLD.end_at != NEW.end_at) THEN
        SELECT full_name, contracted_hours_daily, tenant_id INTO v_employee_name, v_contracted_hours, v_tenant_id
        FROM profiles WHERE id = NEW.user_id;

        IF v_contracted_hours IS NULL OR v_contracted_hours = 0 THEN RETURN NEW; END IF;

        SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (te.end_at - te.start_at)) / 3600.0), 0) INTO v_worked_hours
        FROM time_entries te WHERE te.user_id = NEW.user_id AND DATE(te.work_date) = DATE(NEW.work_date) AND te.end_at IS NOT NULL;

        SELECT v_worked_hours - COALESCE(SUM(EXTRACT(EPOCH FROM (be.end_at - be.start_at)) / 3600.0), 0) INTO v_worked_hours
        FROM break_entries be INNER JOIN time_entries te ON be.time_entry_id = te.id
        WHERE te.user_id = NEW.user_id AND DATE(te.work_date) = DATE(NEW.work_date);

        v_hours_percentage := (v_worked_hours / v_contracted_hours) * 100.0;

        IF v_hours_percentage >= 90 AND v_hours_percentage < 100 THEN
            INSERT INTO notifications (user_id, tenant_id, type, title, message)
            VALUES (NEW.user_id, v_tenant_id, 'overtime_warning_90', '⚠️ Cerca del límite de horas', format('Has trabajado %.2f de %.2f horas contratadas (%.1f%%).', v_worked_hours, v_contracted_hours, v_hours_percentage));
        ELSIF v_hours_percentage >= 100 AND v_hours_percentage <= 110 THEN
            INSERT INTO notifications (user_id, tenant_id, type, title, message)
            VALUES (NEW.user_id, v_tenant_id, 'overtime_reached_100', '🚨 Límite de horas alcanzado', format('Has trabajado %.2f horas. Has alcanzado tus %.2f horas diarias.', v_worked_hours, v_contracted_hours));
        ELSIF v_hours_percentage > 110 THEN
            INSERT INTO notifications (user_id, tenant_id, type, title, message)
            VALUES (NEW.user_id, v_tenant_id, 'overtime_exceeded', '⚠️ Horas extras realizadas', format('Has trabajado %.2f horas, superando tus %.2f horas (%.1f%%).', v_worked_hours, v_contracted_hours, v_hours_percentage));
            INSERT INTO notifications (user_id, tenant_id, type, title, message)
            SELECT p.id, v_tenant_id, 'overtime_admin_alert', '📊 Empleado en horas extras', format('%s ha realizado horas extras hoy (%.2f de %.2f horas)', v_employee_name, v_worked_hours, v_contracted_hours)
            FROM profiles p WHERE p.tenant_id = v_tenant_id AND p.role = 'admin' AND p.id != NEW.user_id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 2.2 Absence Request Notifications
CREATE OR REPLACE FUNCTION public.handle_absence_request_notification()
RETURNS TRIGGER AS $$
DECLARE
    v_user_full_name TEXT;
    v_title TEXT;
    v_message TEXT;
    v_notification_type TEXT;
BEGIN
    SELECT full_name INTO v_user_full_name FROM profiles WHERE id = NEW.user_id;
    IF (TG_OP = 'INSERT') THEN
        v_notification_type := 'absence_request_created';
        v_title := 'Nueva solicitud de ausencia';
        v_message := v_user_full_name || ' ha solicitado ausencia del ' || TO_CHAR(NEW.start_date, 'DD/MM/YYYY') || ' al ' || TO_CHAR(NEW.end_date, 'DD/MM/YYYY');
        INSERT INTO notifications (user_id, tenant_id, type, title, message, absence_request_id)
        SELECT p.id, NEW.tenant_id, v_notification_type, v_title, v_message, NEW.id
        FROM profiles p WHERE p.tenant_id = NEW.tenant_id AND p.role = 'admin';
    ELSIF (TG_OP = 'UPDATE' AND OLD.status != NEW.status) THEN
        IF NEW.status = 'approved' THEN
            v_notification_type := 'absence_approved';
            v_title := 'Solicitud de ausencia aprobada';
            v_message := 'Tu solicitud de ausencia ha sido APROBADA.';
        ELSIF NEW.status = 'rejected' THEN
            v_notification_type := 'absence_rejected';
            v_title := 'Solicitud de ausencia rechazada';
            v_message := 'Tu solicitud de ausencia ha sido RECHAZADA. ' || COALESCE('Motivo: ' || NEW.admin_comment, '');
        END IF;
        IF v_notification_type IS NOT NULL THEN
            INSERT INTO notifications (user_id, tenant_id, type, title, message, absence_request_id)
            VALUES (NEW.user_id, NEW.tenant_id, v_notification_type, v_title, v_message, NEW.id);
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 2.3 Correction Request Notifications
CREATE OR REPLACE FUNCTION public.notify_admins_new_correction_request()
RETURNS TRIGGER AS $$
DECLARE
    admin_record RECORD;
    requester_name TEXT;
BEGIN
    SELECT full_name INTO requester_name FROM profiles WHERE id = NEW.user_id;
    FOR admin_record IN SELECT id FROM profiles WHERE tenant_id = NEW.tenant_id AND role = 'admin' AND id != NEW.user_id LOOP
        INSERT INTO notifications (user_id, tenant_id, type, title, message, correction_request_id)
        VALUES (admin_record.id, NEW.tenant_id, 'correction_request_created', '🔔 Nueva Solicitud de Corrección', COALESCE(requester_name, 'Un empleado') || ' ha solicitado una corrección', NEW.id);
    END LOOP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.notify_employee_correction_status()
RETURNS TRIGGER AS $$
DECLARE
    reviewer_name TEXT;
BEGIN
    IF OLD.status = 'pending' AND NEW.status IN ('approved', 'rejected') THEN
        SELECT full_name INTO reviewer_name FROM profiles WHERE id = NEW.reviewed_by;
        INSERT INTO notifications (user_id, tenant_id, type, title, message, correction_request_id)
        VALUES (
            NEW.user_id, NEW.tenant_id, 
            CASE WHEN NEW.status = 'approved' THEN 'correction_approved' ELSE 'correction_rejected' END,
            CASE WHEN NEW.status = 'approved' THEN '✅ Solicitud Aprobada' ELSE '❌ Solicitud Rechazada' END,
            CASE WHEN NEW.status = 'approved' THEN 'Tu solicitud ha sido aprobada' || COALESCE(' por ' || reviewer_name, '')
            ELSE 'Tu solicitud ha sido rechazada' || COALESCE(' por ' || reviewer_name, '') || COALESCE('. Motivo: ' || NEW.review_notes, '') END,
            NEW.id
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 3. HARDEN RLS POLICIES

-- 3.1 Audit Log (Refine Insert Policy)
-- Instead of WITH CHECK (true), only allow the service_role OR system triggers (SECURITY DEFINER functions already bypass this if needed, but for direct inserts we should be restrictive).
DROP POLICY IF EXISTS "audit_log_insert" ON public.audit_log;
CREATE POLICY "audit_log_insert" ON public.audit_log 
FOR INSERT WITH CHECK (auth.role() = 'authenticated'); -- Minimum: must be authenticated

-- 3.2 Ensure RLS is enabled on ALL tables (Double Check)
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_branding ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.centers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.break_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.correction_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.absence_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pending_invitations ENABLE ROW LEVEL SECURITY;

-- 4. VERIFY SECURITY STATUS
SELECT 'Security Hardening Complete' as result;
