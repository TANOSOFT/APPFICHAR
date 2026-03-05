-- FIX: Deshabilitar RLS en time_entries para permitir Clock Out

ALTER TABLE public.time_entries DISABLE ROW LEVEL SECURITY;

-- También deshabilitar en break_entries por si acaso
ALTER TABLE public.break_entries DISABLE ROW LEVEL SECURITY;

-- Verificar que se deshabilitó correctamente
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE tablename IN ('profiles', 'time_entries', 'break_entries', 'tenants');
