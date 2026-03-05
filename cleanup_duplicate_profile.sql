-- Limpiar perfil duplicado del usuario con error
-- REEMPLAZA el user_id con el ID del usuario que tiene el error

-- Paso 1: Ver qué perfiles existen para este user
SELECT id, full_name, tenant_id, role, dni, contract_type
FROM profiles
WHERE id = 'USER_ID_AQUI'; -- Cambia por el user_id real

-- Paso 2: Ver las invitaciones pendientes
SELECT id, email, full_name, status, tenant_id
FROM pending_invitations
WHERE status = 'pending'
ORDER BY created_at DESC;

-- Paso 3: Si necesitas eliminar el perfil duplicado:
-- DELETE FROM profiles WHERE id = 'USER_ID_AQUI';

-- Paso 4: Después de limpiar, el usuario puede volver a iniciar sesión
-- y el perfil se creará correctamente desde la invitación
