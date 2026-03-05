-- =====================================================
-- VERIFICAR Y ARREGLAR REALTIME PARA NOTIFICATIONS
-- =====================================================

-- Paso 1: Verificar que la tabla esté en la publicación realtime
SELECT schemaname, tablename 
FROM pg_publication_tables 
WHERE tablename = 'notifications' 
AND pubname = 'supabase_realtime';

-- Paso 2: Si no aparece, agregarla manualmente
-- ALTER PUBLICATION supabase_realtime ADD TABLE notifications;

-- Paso 3: Verificar que existe la réplica de identidad
SELECT relreplident 
FROM pg_class 
WHERE relname = 'notifications';
-- Debe devolver 'd' (default) o 'f' (full)

-- Paso 4: Si es necesario, establecer réplica de identidad
-- ALTER TABLE notifications REPLICA IDENTITY FULL;

-- Paso 5: Verificar las políticas RLS activas
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual
FROM pg_policies
WHERE tablename = 'notifications';
