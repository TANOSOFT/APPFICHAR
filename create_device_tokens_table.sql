-- =====================================================
-- TABLA DE TOKENS DE DISPOSITIVO (Para Notificaciones Push)
-- =====================================================

CREATE TABLE IF NOT EXISTS device_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    token TEXT NOT NULL,
    platform TEXT NOT NULL, -- 'android' | 'ios' | 'web'
    last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    UNIQUE(user_id, token)
);

-- Habilitar RLS
ALTER TABLE device_tokens ENABLE ROW LEVEL SECURITY;

-- Políticas de Seguridad
CREATE POLICY "Users can manage their own device tokens"
    ON device_tokens
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Índice para búsquedas rápidas por usuario
CREATE INDEX IF NOT EXISTS idx_device_tokens_user_id ON device_tokens(user_id);

-- Función para limpiar tokens antiguos si fuera necesario
COMMENT ON TABLE device_tokens IS 'Almacena los tokens de registro de Firebase/Capacitor para enviar notificaciones push.';
