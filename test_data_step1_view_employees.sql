-- ============================================
-- PASO 1: EJECUTAR ESTO PRIMERO (OPCIONAL)
-- Ver los empleados disponibles
-- ============================================
SELECT 
    id,
    full_name,
    employee_code,
    role,
    tenant_id
FROM profiles
ORDER BY full_name;
