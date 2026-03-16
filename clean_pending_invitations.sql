-- ==============================================================================
-- SCRIPT DE LIMPIEZA DE INVITACIONES PENDIENTES (USUARIOS YA REGISTRADOS)
-- ==============================================================================
-- Este script busca invitaciones que están en estado 'pending' pero cuyo
-- email ya pertenece a un perfil activo dentro de la misma empresa (tenant),
-- para marcarlas automáticamente como 'accepted'.

-- 1. Marcar como aceptadas las invitaciones de usuarios que ya existen en la empresa
UPDATE public.pending_invitations pi
SET 
    status = 'accepted',
    accepted_at = timezone('UTC', now())
FROM public.profiles p
WHERE pi.status = 'pending'
  AND pi.email = p.email
  AND pi.tenant_id = p.tenant_id;

-- 2. Devuelve un resumen de lo que ha hecho
SELECT count(*) as "Invitaciones Fantasma Limpiadas"
FROM public.pending_invitations
WHERE status = 'accepted' AND accepted_at >= timezone('UTC', now()) - interval '1 minute';
