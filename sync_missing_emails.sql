-- ==============================================================================
-- SCRIPT DE SINCRONIZACIÓN DE EMAILS
-- ==============================================================================
-- Este script copia los correos electrónicos desde el sistema de autenticación
-- (auth.users) hacia la tabla de perfiles (public.profiles), para que sean
-- visibles en el panel de Superadministrador.

UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE p.id = u.id AND p.email IS NULL;

-- Devuelve el número de perfiles actualizados
SELECT count(*) as "Perfiles con email actualizado"
FROM public.profiles p
JOIN auth.users u ON p.id = u.id
WHERE p.email = u.email;
