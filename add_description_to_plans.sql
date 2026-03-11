-- Add description column to subscription_plans
ALTER TABLE public.subscription_plans 
ADD COLUMN IF NOT EXISTS description TEXT;

-- Update existing plans with a basic description
UPDATE public.subscription_plans SET description = 'Plan básico para pequeñas empresas.' WHERE id = 'starter' AND description IS NULL;
UPDATE public.subscription_plans SET description = 'Plan intermedio para empresas en crecimiento.' WHERE id = 'business' AND description IS NULL;
UPDATE public.subscription_plans SET description = 'Plan avanzado para grandes corporaciones.' WHERE id = 'enterprise' AND description IS NULL;
