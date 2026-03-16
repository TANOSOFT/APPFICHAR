-- ==============================================================================
-- SCRIPT DE RECUPERACIÓN DE SUPERADMINISTRADOR
-- Instrucciones:
-- 1. Copia todo este código.
-- 2. Ve al panel de Supabase -> "SQL Editor"
-- 3. Pégalo en una nueva consulta (New Query).
-- 4. Cambia 'TU_CORREO@AQUI.COM' por tu correo electrónico real (línea 11).
-- 5. Haz clic en "RUN".
-- ==============================================================================

DO $$
DECLARE
    target_email TEXT := 'TU_CORREO@AQUI.COM'; -- >>> ¡CAMBIA ESTO POR TU EMAIL! <<<
    user_id UUID;
BEGIN
    -- 1. Obtener el ID del usuario desde el sistema de autenticación
    SELECT id INTO user_id FROM auth.users WHERE email = target_email;

    IF user_id IS NULL THEN
        RAISE EXCEPTION 'No se encontró un usuario registrado con el correo: %', target_email;
    END IF;

    -- 2. Comprobar si existe el perfil en la tabla public.profiles
    IF EXISTS (SELECT 1 FROM public.profiles WHERE id = user_id) THEN
        -- Si existe, le forzamos el rol 'super_admin' y le quitamos la asignación de empresa (tenant_id = NULL)
        UPDATE public.profiles 
        SET role = 'super_admin', 
            tenant_id = NULL,
            active = true
        WHERE id = user_id;
        
        RAISE NOTICE 'PERFIL ACTUALIZADO: Has vuelto a ser Super Administrador.';
    ELSE
        -- Si al borrar la empresa se borró en cascada el perfil, lo recreamos
        INSERT INTO public.profiles (id, role, tenant_id, full_name, active)
        VALUES (
            user_id, 
            'super_admin', 
            NULL, -- El super_admin no pertenece a ninguna empresa en particular
            'Super Administrador (Recuperado)', 
            true
        );
        
        RAISE NOTICE 'PERFIL RECREADO: Se ha regenerado tu perfil como Super Administrador.';
    END IF;
END $$;
