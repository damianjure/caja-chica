-- soft_delete_movimientos_phase.sql
-- Agrega soft delete a movimientos (alto #11 auditoría 2026-05-03).
-- Idempotente. Aplicar en Supabase SQL editor del proyecto dezgusgxotihxkfkxico.

alter table public.movimientos
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by_user_id uuid references public.app_users(user_id) on delete set null;

create index if not exists idx_movimientos_dashboard_active
  on public.movimientos (dashboard_id, deleted_at, created_at desc)
  where deleted_at is null;

create index if not exists idx_movimientos_owner_active
  on public.movimientos (owner_user_id, deleted_at, created_at desc)
  where deleted_at is null;
