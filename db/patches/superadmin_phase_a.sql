-- Chunk A: Superadmin pause/block/activate, force logout, role change, user detail
-- Adds:
--   - new app_user_status enum values: 'paused', 'blocked'
--   - app_users: display_name, settings, paused_at, blocked_at, status_reason, status_changed_by
--   - audit_logs: expands action + entity_type to support 'app_user' lifecycle
--   - system_config: key-value store (used now for nothing; Chunk B for maintenance_mode)

begin;

-- 1. Expand app_user_status enum (legacy 'suspended' kept for backwards-compat, unused)
alter type public.app_user_status add value if not exists 'paused';
alter type public.app_user_status add value if not exists 'blocked';

-- 2. app_users new columns
alter table public.app_users
  add column if not exists display_name text,
  add column if not exists settings jsonb not null default '{}'::jsonb,
  add column if not exists paused_at timestamptz,
  add column if not exists blocked_at timestamptz,
  add column if not exists status_reason text,
  add column if not exists status_changed_by uuid references public.app_users(user_id) on delete set null,
  add column if not exists status_changed_at timestamptz;

-- 3. audit_logs: relax CHECK constraints to allow new actions / entity types
alter table public.audit_logs drop constraint if exists audit_logs_action_check;
alter table public.audit_logs drop constraint if exists audit_logs_entity_type_check;

alter table public.audit_logs
  add constraint audit_logs_action_check check (action in (
    'create', 'update', 'delete', 'restore_backup',
    'pause', 'block', 'activate', 'force_logout', 'role_change',
    'purge', 'maintenance_toggle', 'telegram_link_revoke'
  ));

alter table public.audit_logs
  add constraint audit_logs_entity_type_check check (entity_type in (
    'movimiento', 'empresa', 'movimientos_bulk',
    'app_user', 'telegram_link', 'system_config'
  ));

-- Allow audit_logs.dashboard_id to be null for admin actions that target users globally
-- (already nullable because of "on delete set null", just confirming)

-- 4. system_config (key-value, RLS service-role only)
create table if not exists public.system_config (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_by uuid references public.app_users(user_id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.system_config enable row level security;

drop policy if exists system_config_service_only on public.system_config;
create policy system_config_service_only
  on public.system_config
  for all
  using (false)
  with check (false);

-- 5. Indexes
create index if not exists idx_app_users_status on public.app_users (status) where status != 'active';
create index if not exists idx_audit_logs_actor_created on public.audit_logs (actor_user_id, created_at desc);
create index if not exists idx_audit_logs_action_entity on public.audit_logs (action, entity_type);

commit;
