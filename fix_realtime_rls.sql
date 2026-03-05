-- =====================================================
-- FIX: Habilitar realtime broadcasts para notificaciones
-- =====================================================

-- El problema es que RLS puede estar bloqueando los eventos realtime
-- Necesitamos una política que permita SELECT a todos para recibir eventos

-- Primero, eliminar políticas existentes de SELECT si hay conflicto
DROP POLICY IF EXISTS "Users can view own notifications" ON notifications;

-- Crear nueva política de SELECT más permisiva para realtime
CREATE POLICY "Users can view own notifications"
    ON notifications
    FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

-- IMPORTANTE: Verificar que realtime esté habilitado
-- Ejecutar en una query separada:
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;

-- Verificar que la publicación existe
SELECT * FROM pg_publication_tables WHERE tablename = 'notifications';
