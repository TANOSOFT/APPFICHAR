-- ============================================
-- PASO 3: VERIFICAR RESULTADOS
-- Ejecutar después del PASO 2
-- ============================================
SELECT 
    p.full_name as "Empleado",
    p.employee_code as "Código",
    COUNT(te.id) as "Total Fichajes",
    COUNT(DISTINCT te.work_date) as "Días Únicos",
    TO_CHAR(MIN(te.work_date), 'DD/MM/YYYY') as "Primer Fichaje",
    TO_CHAR(MAX(te.work_date), 'DD/MM/YYYY') as "Último Fichaje",
    ROUND(AVG(EXTRACT(EPOCH FROM (te.end_at - te.start_at)) / 3600), 1) as "Promedio Horas"
FROM profiles p
LEFT JOIN time_entries te ON te.user_id = p.id
WHERE te.work_date >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')::DATE
GROUP BY p.full_name, p.employee_code
ORDER BY p.full_name;
