-- =====================================================
-- ENABLE REALTIME FOR NOTIFICATIONS
-- =====================================================

-- Habilitar realtime para la tabla notifications
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;

-- Verificar que está habilitado
SELECT schemaname, tablename 
FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime' 
AND tablename = 'notifications';
