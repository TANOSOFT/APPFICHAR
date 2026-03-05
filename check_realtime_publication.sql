-- Verificar estado actual de realtime para notifications
SELECT 
    'Publicación realtime' as categoria,
    schemaname,
    tablename,
    pubname
FROM pg_publication_tables 
WHERE tablename = 'notifications';

-- Si NO aparece nada arriba, la tabla NO está en realtime
-- En ese caso, ejecuta esto:

-- ALTER PUBLICATION supabase_realtime ADD TABLE notifications;

-- Luego verifica de nuevo:
-- SELECT * FROM pg_publication_tables WHERE tablename = 'notifications';
