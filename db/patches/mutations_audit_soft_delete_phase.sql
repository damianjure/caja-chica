-- Audit + soft delete phase for movimientos/empresas mutations

create extension if not exists pgcrypto;

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  dashboard_id uuid references public.dashboards(id) on delete set null,
  actor_user_id uuid references public.app_users(user_id) on delete set null,
  source text not null check (source in ('web', 'telegram', 'system')),
  action text not null check (action in ('create', 'update', 'delete', 'restore_backup')),
  entity_type text not null check (entity_type in ('movimiento', 'empresa')),
  entity_id uuid,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_logs_dashboard_created_at
  on public.audit_logs (dashboard_id, created_at desc);

create index if not exists idx_audit_logs_entity
  on public.audit_logs (entity_type, entity_id, created_at desc);

create table if not exists public.empresa_delete_backups (
  id uuid primary key default gen_random_uuid(),
  dashboard_id uuid references public.dashboards(id) on delete set null,
  empresa_id uuid,
  empresa_data jsonb not null,
  related_movimientos_snapshot jsonb not null default '[]'::jsonb,
  deleted_by_user_id uuid references public.app_users(user_id) on delete set null,
  source text not null check (source in ('web', 'telegram', 'system')),
  created_at timestamptz not null default now()
);

create index if not exists idx_empresa_delete_backups_dashboard_created_at
  on public.empresa_delete_backups (dashboard_id, created_at desc);

alter table public.empresas
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by_user_id uuid references public.app_users(user_id) on delete set null;

create index if not exists idx_empresas_dashboard_active
  on public.empresas (dashboard_id, deleted_at, nombre);

alter table public.audit_logs enable row level security;
alter table public.empresa_delete_backups enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'audit_logs'
      and policyname = 'dashboard members can read audit logs'
  ) then
    create policy "dashboard members can read audit logs"
    on public.audit_logs
    for select
    to authenticated
    using (
      dashboard_id is null
      or public.user_has_dashboard_access(dashboard_id)
    );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'empresa_delete_backups'
      and policyname = 'dashboard members can read empresa backups'
  ) then
    create policy "dashboard members can read empresa backups"
    on public.empresa_delete_backups
    for select
    to authenticated
    using (
      dashboard_id is null
      or public.user_has_dashboard_access(dashboard_id)
    );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'audit_logs'
  ) then
    alter publication supabase_realtime add table public.audit_logs;
  end if;
end $$;
