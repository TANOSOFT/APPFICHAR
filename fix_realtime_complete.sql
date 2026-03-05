-- =========================================================
-- SOLUCIÓN COMPLETA: REALTIME NOTIFICATIONS
-- =========================================================

-- PASO 1: Asegurar que la REPLICA IDENTITY está configurada
ALTER TABLE notifications REPLICA IDENTITY FULL;

-- PASO 2: Agregar tabla a la publicación realtime
-- Primero intentar eliminarla (puede fallar si no existe, es normal)
DO $$ 
BEGIN
    ALTER PUBLICATION supabase_realtime DROP TABLE notifications;
EXCEPTION 
    WHEN OTHERS THEN 
        NULL; -- Ignorar error si la tabla no estaba en la publicación
END $$;

-- Ahora agregarla
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;

-- PASO 3: Verificar configuración
SELECT 
    'Tabla en publicación realtime' as check_type,
    CASE 
        WHEN COUNT(*) > 0 THEN '✅ Configurado correctamente'
        ELSE '❌ NO encontrado - ejecutar ALTER PUBLICATION'
    END as status
FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime' 
AND tablename = 'notifications'

UNION ALL

SELECT 
    'Réplica de identidad' as check_type,
    CASE relreplident
        WHEN 'd' THEN '⚠️ Default (puede funcionar)'
        WHEN 'f' THEN '✅ Full (óptimo)'
        WHEN 'n' THEN '❌ Nothing (NO funcionará)'
        ELSE '❓ Desconocido'
    END as status
FROM pg_class 
WHERE relname = 'notifications';

-- PASO 4: Verificar políticas RLS
SELECT 
    policyname,
    cmd as comando,
    CASE 
        WHEN cmd = 'SELECT' THEN '✅ Necesario para realtime'
        WHEN cmd = 'INSERT' THEN 'ℹ️ Para crear notificaciones'
        ELSE 'ℹ️ ' || cmd
    END as descripcion
FROM pg_policies
WHERE tablename = 'notifications'
ORDER BY cmd;

-- NOTA: Después de ejecutar esto, refresca la aplicación (F5)
-- y prueba de nuevo el flujo de notificaciones
