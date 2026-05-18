-- onboarding_demo_phase.sql
-- Adds is_demo flag to empresas/movimientos and onboarding_state to app_users.
-- Apply on Supabase prod before deploying backend + frontend changes.

alter table public.empresas
  add column if not exists is_demo boolean not null default false;

alter table public.movimientos
  add column if not exists is_demo boolean not null default false;

alter table public.app_users
  add column if not exists onboarding_state text not null default 'pending'
    check (onboarding_state in ('pending', 'seeded', 'completed', 'cleaned'));

-- Index for fast demo bulk-delete
create index if not exists idx_empresas_owner_is_demo
  on public.empresas (owner_user_id, is_demo)
  where is_demo = true;

create index if not exists idx_movimientos_owner_is_demo
  on public.movimientos (owner_user_id, is_demo)
  where is_demo = true;
