-- Create Tenants table
create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  legal_name text,
  cif text,
  address text,
  city text,
  province text,
  postal_code text,
  timezone text default 'Europe/Madrid',
  created_at timestamptz default timezone('UTC', now())
);

-- Enable RLS for tenants
alter table public.tenants enable row level security;

-- Create Tenant Branding table (1:1 with tenants)
create table public.tenant_branding (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  logo_path text,
  primary_color text default '#3b82f6', -- default blue
  secondary_color text default '#10b981', -- default green
  report_header_text text,
  report_footer_text text,
  updated_at timestamptz default timezone('UTC', now())
);

-- Enable RLS for branding
alter table public.tenant_branding enable row level security;

-- Create Profiles table (extends auth.users)
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  tenant_id uuid references public.tenants(id) on delete restrict,
  role text check (role in ('admin', 'manager', 'employee', 'rep')) default 'employee',
  full_name text,
  employee_code text,
  department_id uuid, -- skipping separate table for simplicity in MVP
  center_id uuid, -- skipping separate table for simplicity in MVP
  active boolean default true,
  created_at timestamptz default timezone('UTC', now()),
  updated_at timestamptz default timezone('UTC', now())
);

-- Enable RLS for profiles
alter table public.profiles enable row level security;

-- Create Centers table (Work locations)
create table public.centers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade not null,
  name text not null,
  address text,
  geo_required boolean default false,
  qr_secret text
);

-- Enable RLS for centers
alter table public.centers enable row level security;

-- Create Time Entries table (Core)
create table public.time_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  work_date date not null default CURRENT_DATE,
  start_at timestamptz not null default timezone('UTC', now()),
  end_at timestamptz, -- null means actively working
  source text check (source in ('web', 'terminal', 'mobile', 'api')) default 'web',
  center_id uuid references public.centers(id),
  status text check (status in ('open', 'closed', 'corrected', 'pending_approval', 'approved')) default 'open',
  notes text,
  created_at timestamptz default timezone('UTC', now()),
  updated_at timestamptz default timezone('UTC', now())
);

-- Enable RLS for time_entries
alter table public.time_entries enable row level security;

-- Create Break Entries table
create table public.break_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade not null,
  time_entry_id uuid references public.time_entries(id) on delete cascade not null,
  break_type text check (break_type in ('lunch', 'rest', 'custom')) default 'rest',
  start_at timestamptz not null default timezone('UTC', now()),
  end_at timestamptz, -- null means on break
  created_at timestamptz default timezone('UTC', now())
);

-- Enable RLS for break_entries
alter table public.break_entries enable row level security;

-- Create Correction Requests table
create table public.correction_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  time_entry_id uuid references public.time_entries(id), -- nullable if creating new entry
  requested_changes jsonb, -- structural change details
  reason text,
  status text check (status in ('pending', 'approved', 'rejected')) default 'pending',
  decided_by uuid references public.profiles(id),
  decided_at timestamptz,
  created_at timestamptz default timezone('UTC', now())
);

-- Enable RLS for correction_requests
alter table public.correction_requests enable row level security;

-- Create Audit Log table (Immutable)
create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade not null,
  actor_user_id uuid references public.profiles(id),
  entity text not null, -- table name e.g. 'time_entries'
  entity_id uuid not null,
  action text check (action in ('insert', 'update', 'delete', 'approve', 'reject', 'export')),
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz default timezone('UTC', now()),
  ip_address text, -- optional
  user_agent text -- optional
);

-- Enable RLS for audit_log
alter table public.audit_log enable row level security;

-- VIEW: Daily Totals (Calculating duration)
-- This is a complex view, simplified for initial schema
create or replace view public.daily_totals_v as
select
  te.id as time_entry_id,
  te.tenant_id,
  te.user_id,
  te.work_date,
  te.start_at,
  te.end_at,
  -- Calculate total minutes worked: (end - start) - breaks
  -- Note: This requires careful handling of NULLs and intervals.
  -- Simplified logic: Just raw duration for now.
  extract(epoch from (coalesce(te.end_at, timezone('UTC', now())) - te.start_at)) / 60 as raw_duration_minutes,
  (
    select coalesce(sum(extract(epoch from (coalesce(be.end_at, timezone('UTC', now())) - be.start_at)) / 60), 0)
    from public.break_entries be
    where be.time_entry_id = te.id
  ) as total_break_minutes
from public.time_entries te;


-- RLS POLICIES -----------------------------------------------------------

-- 1. Profiles:
-- Users can read their own profile.
create policy "Users can view own profile" on public.profiles
for select using (auth.uid() = id);

create policy "Users can insert own profile" on public.profiles
for insert with check (auth.uid() = id);

create policy "Users can update own profile" on public.profiles
for update using (auth.uid() = id);

-- Tenant admins/managers can view profiles in their tenant.
create policy "Admins/Managers view tenant profiles" on public.profiles
for select using (
  auth.uid() in (
    select id from public.profiles where tenant_id = public.profiles.tenant_id and role in ('admin', 'manager')
  )
);

-- 2. Time Entries:
-- Users can view their own entries.
create policy "Users view own time entries" on public.time_entries
for select using (auth.uid() = user_id);

-- Users can insert their own entries (Start shift).
create policy "Users insert own time entries" on public.time_entries
for insert with check (auth.uid() = user_id);

-- Users can update their own OPEN entries (End shift, add notes).
-- STRICT: Users cannot update closed entries.
create policy "Users update own open entries" on public.time_entries
for update using (auth.uid() = user_id and status = 'open');

-- Admins/Managers view all tenant entries.
create policy "Admins/Managers view tenant entries" on public.time_entries
for select using (
  exists (
    select 1 from public.profiles
    where id = auth.uid()
      and tenant_id = public.time_entries.tenant_id
      and role in ('admin', 'manager')
  )
);

-- 3. Tenants:
-- Users can view their own tenant info.
create policy "Users view own tenant" on public.tenants
for select using (
  exists (
    select 1 from public.profiles
    where id = auth.uid()
      and tenant_id = public.tenants.id
  )
);

-- Only Superadmins (custom claim or specific user) can create tenants.
-- For MVP, allow anyone authenticated to create a tenant (Self-signup flow).
create policy " authenticated users can create tenant" on public.tenants
for insert with check (auth.role() = 'authenticated');


-- FUNCTIONS --------------------------------------------------------------

-- Trigger to handle user creation (Optional, usually handled by app logic or edge function)
-- For now, relying on manual insertion into profiles after signup.

-- Function to handle 'Clock Out' ensuring consistency
-- (Implemented via direct update for MVP, later via RPC for strictness)

