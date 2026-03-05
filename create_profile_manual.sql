-- SOLUCIÓN: Crear el profile manualmente para tu usuario

-- Primero, vamos a obtener tu user ID de auth.users
-- Ejecuta esto primero para ver tu ID:
SELECT id, email FROM auth.users ORDER BY created_at DESC LIMIT 5;

-- Luego, con tu user_id, ejecuta esto (reemplaza USER_ID_AQUI con tu UUID):
-- INSERT INTO public.profiles (id, tenant_id, full_name, role)
-- VALUES (
--   'USER_ID_AQUI',  -- Reemplaza con tu ID de arriba
--   (SELECT id FROM public.tenants ORDER BY created_at DESC LIMIT 1),  -- Usa el último tenant creado
--   'Admin User',
--   'admin'
-- );

-- ALTERNATIVA: Deshabilitar temporalmente RLS en profiles para testing
ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;

-- Luego recarga tu app y prueba Clock In
-- Cuando funcione, puedes volver a habilitar RLS:
-- ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
