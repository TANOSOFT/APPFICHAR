-- Verificar estructura de time_entries
SELECT 
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'time_entries'
ORDER BY ordinal_position;
