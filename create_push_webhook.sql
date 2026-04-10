-- =====================================================
-- WEBHOOK PARA NOTIFICACIONES PUSH (VERSIÓN CORREGIDA)
-- =====================================================

-- 1. Habilitar extensiones necesarias (pg_net es la oficial para llamadas async)
CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "net";

-- 2. Función que llama a la Edge Function de Supabase
CREATE OR REPLACE FUNCTION public.trigger_push_notification()
RETURNS TRIGGER AS $$
DECLARE
    payload JSONB;
    request_url TEXT;
BEGIN
    -- Construir el payload JSON para la Edge Function
    payload := jsonb_build_object(
        'type', 'INSERT',
        'table', 'notifications',
        'record', json_build_object(
            'id', NEW.id,
            'user_id', NEW.user_id,
            'title', NEW.title,
            'message', NEW.message,
            'type', NEW.type
        )
    );

    -- URL de tu Edge Function (Hardcoded para evitar errores de contexto de headers)
    request_url := 'https://dkhvjwuffjjnrtujsrnm.supabase.co/functions/v1/push-sender';

    BEGIN
        PERFORM
          net.http_post(
            url := request_url,
            headers := jsonb_build_object(
              'Content-Type', 'application/json',
              'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRraHZqd3ZmZmpqbnJ0dWpzcm5tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxODg1MzQsImV4cCI6MjA4NTc2NDUzNH0.kOcauFrVZgsBw-YjlYnqdQgho81I3AvZLLDCSbrCBd0'
            ),
            body := payload
          );
    EXCEPTION WHEN OTHERS THEN
        -- Opcional: Registrar el error en una tabla de logs o simplemente ignorar
        RAISE WARNING 'Error al enviar notificación push: %', SQLERRM;
    END;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Crear el trigger en la tabla notifications
DROP TRIGGER IF EXISTS on_notification_created ON public.notifications;

CREATE TRIGGER on_notification_created
    AFTER INSERT ON public.notifications
    FOR EACH ROW
    EXECUTE FUNCTION public.trigger_push_notification();

-- Comentarios
COMMENT ON FUNCTION public.trigger_push_notification IS 'Trigger que reenvía las notificaciones a la Edge Function de Push sin bloquear la transacción principal.';
