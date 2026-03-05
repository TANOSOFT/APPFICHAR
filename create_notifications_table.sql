-- =====================================================
-- TABLA DE NOTIFICACIONES
-- =====================================================

-- Crear tabla notifications
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('correction_request_created', 'correction_approved', 'correction_rejected')),
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    correction_request_id UUID REFERENCES correction_requests(id) ON DELETE CASCADE,
    read BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Crear índices para optimizar consultas
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_tenant_id ON notifications(tenant_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, read) WHERE read = FALSE;

-- Comentarios
COMMENT ON TABLE notifications IS 'Notificaciones del sistema para usuarios';
COMMENT ON COLUMN notifications.type IS 'Tipo de notificación: correction_request_created, correction_approved, correction_rejected';
COMMENT ON COLUMN notifications.read IS 'Indica si la notificación ha sido leída por el usuario';
