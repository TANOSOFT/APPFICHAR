-- Script SEGURO para cargar fichajes de prueba
-- Genera datos solo para empleados específicos sin duplicar

-- PASO 1: Ver los empleados disponibles (EJECUTAR PRIMERO PARA CONFIRMAR)
SELECT 
    id,
    full_name,
    employee_code,
    role,
    tenant_id
FROM profiles
ORDER BY full_name;

-- PASO 2: Limpiar fichajes de prueba anteriores (OPCIONAL - solo si quieres empezar de cero)
-- DESCOMENTA ESTAS LÍNEAS SI QUIERES BORRAR DATOS EXISTENTES:
/*
DELETE FROM break_entries 
WHERE time_entry_id IN (
    SELECT id FROM time_entries 
    WHERE work_date >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '2 months')::DATE
);

DELETE FROM time_entries 
WHERE work_date >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '2 months')::DATE;
*/

-- PASO 3: Generar fichajes de prueba
DO $$
DECLARE
    current_date_iter DATE;
    start_date DATE := DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')::DATE; -- Solo 1 mes
    end_date DATE := CURRENT_DATE;
    employee_record RECORD;
    random_start_hour INT;
    random_start_minute INT;
    random_end_hour INT;
    random_end_minute INT;
    start_timestamp TIMESTAMP;
    end_timestamp TIMESTAMP;
    should_have_break BOOLEAN;
    break_start TIMESTAMP;
    break_end TIMESTAMP;
    time_entry_id UUID;
    entry_exists BOOLEAN;
BEGIN
    RAISE NOTICE '=== INICIANDO GENERACIÓN DE DATOS DE PRUEBA ===';
    
    -- Generar para cada empleado
    FOR employee_record IN 
        SELECT id, full_name, employee_code, tenant_id
        FROM profiles
        WHERE role = 'employee' OR role = 'admin'  -- Incluye admins también
        ORDER BY full_name
    LOOP
        RAISE NOTICE '';
        RAISE NOTICE '>>> Generando fichajes para: % (código: %)', 
            employee_record.full_name, 
            COALESCE(employee_record.employee_code, 'N/A');
        
        current_date_iter := start_date;
        
        -- Generar fichajes día por día
        WHILE current_date_iter <= end_date LOOP
            -- Solo días laborables (Lunes=1 a Viernes=5)
            IF EXTRACT(DOW FROM current_date_iter) BETWEEN 1 AND 5 THEN
                -- Verificar si ya existe un fichaje para este día
                SELECT EXISTS(
                    SELECT 1 FROM time_entries 
                    WHERE user_id = employee_record.id 
                    AND work_date = current_date_iter
                ) INTO entry_exists;
                
                IF NOT entry_exists THEN
                    -- 90% de probabilidad de asistir
                    IF RANDOM() < 0.9 THEN
                        -- Hora de entrada: 8:00 - 9:15
                        random_start_hour := 8;
                        random_start_minute := FLOOR(RANDOM() * 75)::INT; -- 0-75 minutos
                        
                        -- Hora de salida: 17:00 - 18:30
                        random_end_hour := 17;
                        random_end_minute := FLOOR(RANDOM() * 90)::INT; -- 0-90 minutos
                        
                        start_timestamp := current_date_iter + 
                            MAKE_INTERVAL(hours => random_start_hour, mins => random_start_minute);
                        end_timestamp := current_date_iter + 
                            MAKE_INTERVAL(hours => random_end_hour, mins => random_end_minute);
                        
                        -- Insertar fichaje
                        INSERT INTO time_entries (user_id, tenant_id, work_date, start_at, end_at)
                        VALUES (
                            employee_record.id,
                            employee_record.tenant_id,
                            current_date_iter,
                            start_timestamp,
                            end_timestamp
                        )
                        RETURNING id INTO time_entry_id;
                        
                        -- 75% de probabilidad de pausa de comida
                        should_have_break := RANDOM() < 0.75;
                        
                        IF should_have_break THEN
                            -- Pausa entre 13:00 y 14:30, duración 30-60 min
                            break_start := current_date_iter + 
                                MAKE_INTERVAL(hours => 13, mins => FLOOR(RANDOM() * 90)::INT);
                            break_end := break_start + 
                                MAKE_INTERVAL(mins => 30 + FLOOR(RANDOM() * 30)::INT);
                            
                            INSERT INTO break_entries (time_entry_id, tenant_id, break_type, start_at, end_at)
                            VALUES (
                                time_entry_id,
                                employee_record.tenant_id,
                                'lunch',
                                break_start,
                                break_end
                            );
                        END IF;
                        
                        -- Log más limpio
                        IF MOD(EXTRACT(DAY FROM current_date_iter)::INT, 7) = 1 THEN
                            RAISE NOTICE '  ✓ Semana del % al %', 
                                current_date_iter,
                                current_date_iter + 6;
                        END IF;
                    END IF;
                ELSE
                    RAISE NOTICE '  ⊘ Saltando % (ya existe)', current_date_iter;
                END IF;
            END IF;
            
            current_date_iter := current_date_iter + 1;
        END LOOP;
        
        RAISE NOTICE '>>> Completado para %', employee_record.full_name;
    END LOOP;
    
    RAISE NOTICE '';
    RAISE NOTICE '=== GENERACIÓN COMPLETADA ===';
END $$;

-- PASO 4: Verificar resultado
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

-- PASO 5: Ver distribución por semana
SELECT 
    p.full_name as "Empleado",
    TO_CHAR(DATE_TRUNC('week', te.work_date), 'DD/MM') as "Semana",
    COUNT(*) as "Fichajes",
    ROUND(SUM(EXTRACT(EPOCH FROM (te.end_at - te.start_at)) / 3600), 1) as "Horas"
FROM profiles p
JOIN time_entries te ON te.user_id = p.id
WHERE te.work_date >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')::DATE
GROUP BY p.full_name, DATE_TRUNC('week', te.work_date)
ORDER BY p.full_name, DATE_TRUNC('week', te.work_date);
