-- =====================================================
-- RLS POLICIES PARA NOTIFICATIONS
-- =====================================================

-- Habilitar RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- DROP policies existentes si existen
DROP POLICY IF EXISTS "Users can view own notifications" ON notifications;
DROP POLICY IF EXISTS "System can create notifications" ON notifications;
DROP POLICY IF EXISTS "Users can update own notifications" ON notifications;
DROP POLICY IF EXISTS "Users can delete own notifications" ON notifications;

-- POLICY: Los usuarios solo ven sus propias notificaciones
CREATE POLICY "Users can view own notifications"
    ON notifications
    FOR SELECT
    USING (auth.uid() = user_id);

-- POLICY: El sistema puede crear notificaciones (via triggers)
-- Importante: Esto permite que los triggers inserten notificaciones
CREATE POLICY "System can create notifications"
    ON notifications
    FOR INSERT
    WITH CHECK (true);

-- POLICY: Los usuarios pueden actualizar (marcar como leídas) sus propias notificaciones
CREATE POLICY "Users can update own notifications"
    ON notifications
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- POLICY: Los usuarios pueden eliminar sus propias notificaciones
CREATE POLICY "Users can delete own notifications"
    ON notifications
    FOR DELETE
    USING (auth.uid() = user_id);

-- Verificar policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'notifications';
