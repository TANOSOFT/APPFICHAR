-- ============================================
-- PASO 2: GENERAR DATOS DE PRUEBA
-- Ejecuta TODO este bloque completo
-- ============================================
DO $$
DECLARE
    current_date_iter DATE;
    start_date DATE := DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')::DATE;
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
    
    FOR employee_record IN 
        SELECT id, full_name, employee_code, tenant_id
        FROM profiles
        WHERE role = 'employee' OR role = 'admin'
        ORDER BY full_name
    LOOP
        RAISE NOTICE '';
        RAISE NOTICE '>>> Generando fichajes para: % (código: %)', 
            employee_record.full_name, 
            COALESCE(employee_record.employee_code, 'N/A');
        
        current_date_iter := start_date;
        
        WHILE current_date_iter <= end_date LOOP
            IF EXTRACT(DOW FROM current_date_iter) BETWEEN 1 AND 5 THEN
                SELECT EXISTS(
                    SELECT 1 FROM time_entries 
                    WHERE user_id = employee_record.id 
                    AND work_date = current_date_iter
                ) INTO entry_exists;
                
                IF NOT entry_exists THEN
                    IF RANDOM() < 0.9 THEN
                        random_start_hour := 8;
                        random_start_minute := FLOOR(RANDOM() * 75)::INT;
                        
                        random_end_hour := 17;
                        random_end_minute := FLOOR(RANDOM() * 90)::INT;
                        
                        start_timestamp := current_date_iter + 
                            MAKE_INTERVAL(hours => random_start_hour, mins => random_start_minute);
                        end_timestamp := current_date_iter + 
                            MAKE_INTERVAL(hours => random_end_hour, mins => random_end_minute);
                        
                        INSERT INTO time_entries (user_id, tenant_id, work_date, start_at, end_at)
                        VALUES (
                            employee_record.id,
                            employee_record.tenant_id,
                            current_date_iter,
                            start_timestamp,
                            end_timestamp
                        )
                        RETURNING id INTO time_entry_id;
                        
                        should_have_break := RANDOM() < 0.75;
                        
                        IF should_have_break THEN
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
