-- =====================================================
-- OVERTIME DETECTION: Check Employee Daily Hours
-- =====================================================

-- Function to calculate total hours worked for an employee on a specific date
CREATE OR REPLACE FUNCTION calculate_daily_hours(
    employee_id UUID,
    check_date DATE DEFAULT CURRENT_DATE
)
RETURNS DECIMAL AS $$
DECLARE
    total_hours DECIMAL;
BEGIN
    -- Calculate total hours from time_entries for the given date
    SELECT COALESCE(
        SUM(
            EXTRACT(EPOCH FROM (te.end_at - te.start_at)) / 3600
        ) - COALESCE(
            (
                SELECT SUM(EXTRACT(EPOCH FROM (be.end_at - be.start_at)) / 3600)
                FROM break_entries be
                WHERE be.time_entry_id = te.id
            ), 0
        ), 0
    )
    INTO total_hours
    FROM time_entries te
    WHERE te.user_id = employee_id
      AND DATE(te.work_date) = check_date
      AND te.end_at IS NOT NULL;  -- Only count completed entries
    
    RETURN total_hours;
END;
$$ LANGUAGE plpgsql;

-- Function to check if employee is approaching or exceeding overtime
CREATE OR REPLACE FUNCTION check_employee_overtime(
    employee_id UUID,
    check_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
    user_id UUID,
    full_name TEXT,
    email TEXT,
    worked_hours DECIMAL,
    contracted_hours DECIMAL,
    hours_percentage DECIMAL,
    should_notify_90 BOOLEAN,
    should_notify_100 BOOLEAN,
    is_overtime BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.id as user_id,
        p.full_name,
        CAST(NULL AS TEXT) as email,
        calculate_daily_hours(p.id, check_date) as worked_hours,
        p.contracted_hours_daily as contracted_hours,
        ROUND((calculate_daily_hours(p.id, check_date) / NULLIF(p.contracted_hours_daily, 0)) * 100, 2) as hours_percentage,
        (calculate_daily_hours(p.id, check_date) / NULLIF(p.contracted_hours_daily, 0)) >= 0.9 
            AND (calculate_daily_hours(p.id, check_date) / NULLIF(p.contracted_hours_daily, 0)) < 1.0 as should_notify_90,
        (calculate_daily_hours(p.id, check_date) / NULLIF(p.contracted_hours_daily, 0)) >= 1.0 
            AND (calculate_daily_hours(p.id, check_date) / NULLIF(p.contracted_hours_daily, 0)) < 1.1 as should_notify_100,
        (calculate_daily_hours(p.id, check_date) / NULLIF(p.contracted_hours_daily, 0)) > 1.0 as is_overtime
    FROM profiles p
    WHERE p.id = employee_id
      AND p.contracted_hours_daily IS NOT NULL
      AND p.contracted_hours_daily > 0;
END;
$$ LANGUAGE plpgsql;

-- Test query (reemplazar con user_id real):
-- SELECT * FROM check_employee_overtime('tu-user-id-aqui');

COMMENT ON FUNCTION calculate_daily_hours IS 'Calcula las horas trabajadas por un empleado en una fecha específica';
COMMENT ON FUNCTION check_employee_overtime IS 'Verifica si un empleado está cerca o ha excedido sus horas contratadas';
