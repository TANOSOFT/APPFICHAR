-- =====================================================
-- MIGRATION: Sync Emails from auth.users to public.profiles
-- =====================================================

-- 1. Añadir la columna email a profiles si no existe
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS email TEXT;

-- 2. Actualizar emails existentes desde auth.users
UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE p.id = u.id;

-- 3. Crear función para el trigger de sincronización
CREATE OR REPLACE FUNCTION public.handle_sync_user_email()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.profiles
  SET email = NEW.email
  WHERE id = NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Crear el trigger en auth.users (necesita permisos de superuser en Supabase, 
-- pero en el Editor SQL de Supabase suele funcionar si se tiene acceso)
-- Nota: Si el trigger en auth.users falla por permisos, el paso 2 ya ha arreglado lo actual.
DROP TRIGGER IF EXISTS on_auth_user_updated ON auth.users;
CREATE TRIGGER on_auth_user_updated
  AFTER UPDATE OF email ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_sync_user_email();

-- 5. Asegurar que al crear un nuevo perfil también se guarde el email
-- (Ajustar tu función existente de handle_new_user si la tienes)
-- Buscamos si existe handle_new_user
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'handle_new_user') THEN
        -- Intentamos actualizar la función para incluir el email
        -- Esto es un ejemplo, habría que ver la definición exacta de tu función
        -- de creación automática de perfiles.
    END IF;
END $$;
