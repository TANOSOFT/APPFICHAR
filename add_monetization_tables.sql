-- =========================================================
-- EXPANSIÓN DE MONETIZACIÓN: TENANTS, PLANES Y FACTURAS
-- =========================================================

-- 1. Crear tabla de planes (Subscription Tiers)
CREATE TABLE IF NOT EXISTS public.subscription_plans (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    price_monthly DECIMAL(10,2) NOT NULL,
    max_employees INTEGER, -- NULL for unlimited
    features JSONB,
    created_at TIMESTAMPTZ DEFAULT timezone('UTC', now())
);

-- Insertar planes iniciales
INSERT INTO public.subscription_plans (id, name, price_monthly, max_employees, features)
VALUES 
('starter', 'Starter', 29.00, 10, '{"reporting": true, "mobile": true}'),
('business', 'Business', 79.00, 50, '{"reporting": true, "mobile": true, "support": "priority"}'),
('enterprise', 'Enterprise', 199.00, NULL, '{"reporting": true, "mobile": true, "support": "dedicated", "api": true}')
ON CONFLICT (id) DO NOTHING;

-- 2. Ampliar tabla de tenants
ALTER TABLE public.tenants 
ADD COLUMN IF NOT EXISTS subscription_status TEXT CHECK (subscription_status IN ('active', 'expired', 'trial', 'suspended')) DEFAULT 'trial',
ADD COLUMN IF NOT EXISTS plan_id TEXT REFERENCES public.subscription_plans(id) DEFAULT 'starter',
ADD COLUMN IF NOT EXISTS next_billing_date DATE DEFAULT (CURRENT_DATE + INTERVAL '30 days'),
ADD COLUMN IF NOT EXISTS trial_end_date DATE DEFAULT (CURRENT_DATE + INTERVAL '14 days'),
ADD COLUMN IF NOT EXISTS total_mrr DECIMAL(10,2) DEFAULT 0;

-- 3. Crear tabla de facturas
CREATE TABLE IF NOT EXISTS public.invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
    invoice_number TEXT UNIQUE NOT NULL,
    amount_base DECIMAL(10,2) NOT NULL,
    tax_percent DECIMAL(5,2) DEFAULT 21.00,
    amount_total DECIMAL(10,2) NOT NULL,
    status TEXT CHECK (status IN ('paid', 'pending', 'overdue', 'cancelled')) DEFAULT 'pending',
    billing_date TIMESTAMPTZ DEFAULT timezone('UTC', now()),
    due_date DATE,
    pdf_url TEXT,
    billing_details JSONB, -- { name, address, cif }
    created_at TIMESTAMPTZ DEFAULT timezone('UTC', now())
);

-- 4. Habilitar RLS para nuevas tablas
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

-- 5. Políticas: Solo Super Admin puede ver/gestionar globalmente
-- (Asumiendo que identificamos Super Admin por su rol en profiles)

CREATE POLICY "Super Admins can manage everything in plans" 
ON public.subscription_plans 
FOR ALL 
USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin'));

CREATE POLICY "Super Admins can manage everything in invoices" 
ON public.invoices 
FOR ALL 
USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin'));

-- Permitir a empleados ver el plan de su propio inquilino (solo lectura selectiva)
CREATE POLICY "Tenants can view their own available plans"
ON public.subscription_plans
FOR SELECT
USING (true);

CREATE POLICY "Tenants can view their own invoices"
ON public.invoices
FOR SELECT
USING (tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));

-- 6. Trigger para actualizar total_mrr en tenant basado en el plan
CREATE OR REPLACE FUNCTION public.update_tenant_mrr()
RETURNS TRIGGER AS $$
BEGIN
    NEW.total_mrr = (SELECT price_monthly FROM public.subscription_plans WHERE id = NEW.plan_id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_mrr
BEFORE INSERT OR UPDATE OF plan_id ON public.tenants
FOR EACH ROW EXECUTE FUNCTION public.update_tenant_mrr();
