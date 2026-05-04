-- Shared dashboard architecture migration
-- Goal: move ownership from owner_user_id to dashboard_id without breaking the current app.
-- Strategy:
-- 1. introduce dashboards + dashboard_members
-- 2. backfill one personal dashboard per existing app user
-- 3. add dashboard_id to business tables and copy current ownership
-- 4. keep owner_user_id temporarily for backward compatibility

create extension if not exists pgcrypto;

do $$ begin
  create type public.dashboard_member_role as enum ('owner', 'editor', 'viewer');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.dashboard_member_status as enum ('active', 'revoked');
exception when duplicate_object then null;
end $$;

create table if not exists public.dashboards (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  personal_for_user_id uuid unique references public.app_users(user_id) on delete cascade,
  created_by_user_id uuid references public.app_users(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_dashboards_set_updated_at on public.dashboards;
create trigger trg_dashboards_set_updated_at
before update on public.dashboards
for each row execute procedure public.set_updated_at();

create table if not exists public.dashboard_members (
  id uuid primary key default gen_random_uuid(),
  dashboard_id uuid not null references public.dashboards(id) on delete cascade,
  user_id uuid not null references public.app_users(user_id) on delete cascade,
  role public.dashboard_member_role not null,
  status public.dashboard_member_status not null default 'active',
  invited_by_user_id uuid references public.app_users(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uniq_dashboard_member unique (dashboard_id, user_id)
);

drop trigger if exists trg_dashboard_members_set_updated_at on public.dashboard_members;
create trigger trg_dashboard_members_set_updated_at
before update on public.dashboard_members
for each row execute procedure public.set_updated_at();

alter table public.empresas
  add column if not exists dashboard_id uuid references public.dashboards(id) on delete cascade;

alter table public.movimientos
  add column if not exists dashboard_id uuid references public.dashboards(id) on delete cascade,
  add column if not exists created_by_user_id uuid references public.app_users(user_id) on delete set null;

alter table public.presupuestos
  add column if not exists dashboard_id uuid references public.dashboards(id) on delete cascade;

alter table public.categorias
  add column if not exists dashboard_id uuid references public.dashboards(id) on delete cascade;

alter table public.recurrentes
  add column if not exists dashboard_id uuid references public.dashboards(id) on delete cascade,
  add column if not exists created_by_user_id uuid references public.app_users(user_id) on delete set null;

alter table public.usuarios
  add column if not exists user_id uuid references public.app_users(user_id) on delete cascade,
  add column if not exists dashboard_id uuid references public.dashboards(id) on delete cascade;

insert into public.dashboards (
  name,
  personal_for_user_id,
  created_by_user_id
)
select
  coalesce(nullif(split_part(au.email, '@', 1), ''), 'Dashboard') || ' Dashboard',
  au.user_id,
  au.user_id
from public.app_users au
left join public.dashboards d
  on d.personal_for_user_id = au.user_id
where d.id is null;

insert into public.dashboard_members (
  dashboard_id,
  user_id,
  role,
  status,
  invited_by_user_id
)
select
  d.id,
  d.personal_for_user_id,
  'owner'::public.dashboard_member_role,
  'active'::public.dashboard_member_status,
  d.created_by_user_id
from public.dashboards d
left join public.dashboard_members dm
  on dm.dashboard_id = d.id
 and dm.user_id = d.personal_for_user_id
where d.personal_for_user_id is not null
  and dm.id is null;

update public.empresas e
set dashboard_id = d.id
from public.dashboards d
where e.dashboard_id is null
  and e.owner_user_id is not null
  and d.personal_for_user_id = e.owner_user_id;

update public.movimientos m
set dashboard_id = d.id,
    created_by_user_id = coalesce(m.created_by_user_id, m.owner_user_id)
from public.dashboards d
where (m.dashboard_id is null or m.created_by_user_id is null)
  and m.owner_user_id is not null
  and d.personal_for_user_id = m.owner_user_id;

update public.presupuestos p
set dashboard_id = d.id
from public.dashboards d
where p.dashboard_id is null
  and p.owner_user_id is not null
  and d.personal_for_user_id = p.owner_user_id;

update public.categorias c
set dashboard_id = d.id
from public.dashboards d
where c.dashboard_id is null
  and c.owner_user_id is not null
  and d.personal_for_user_id = c.owner_user_id;

update public.recurrentes r
set dashboard_id = d.id,
    created_by_user_id = coalesce(r.created_by_user_id, r.owner_user_id)
from public.dashboards d
where (r.dashboard_id is null or r.created_by_user_id is null)
  and r.owner_user_id is not null
  and d.personal_for_user_id = r.owner_user_id;

update public.usuarios u
set user_id = coalesce(u.user_id, u.owner_user_id),
    dashboard_id = coalesce(u.dashboard_id, d.id)
from public.dashboards d
where u.owner_user_id is not null
  and d.personal_for_user_id = u.owner_user_id
  and (u.user_id is null or u.dashboard_id is null);

create unique index if not exists uniq_empresas_dashboard_nombre
  on public.empresas (dashboard_id, lower(nombre))
  where dashboard_id is not null;

create unique index if not exists uniq_categorias_dashboard_nombre
  on public.categorias (dashboard_id, lower(nombre))
  where dashboard_id is not null;

create unique index if not exists uniq_presupuestos_dashboard_period_categoria_moneda
  on public.presupuestos (dashboard_id, period, lower(categoria), moneda)
  where dashboard_id is not null;

create unique index if not exists uniq_usuarios_user_id
  on public.usuarios (user_id)
  where user_id is not null;

create index if not exists idx_dashboards_personal_for_user
  on public.dashboards (personal_for_user_id);

create index if not exists idx_dashboard_members_user
  on public.dashboard_members (user_id, status);

create index if not exists idx_dashboard_members_dashboard
  on public.dashboard_members (dashboard_id, status);

create index if not exists idx_movimientos_dashboard_created_at_desc
  on public.movimientos (dashboard_id, created_at desc)
  where dashboard_id is not null;

create index if not exists idx_movimientos_dashboard_conciliado
  on public.movimientos (dashboard_id, conciliado, created_at desc)
  where dashboard_id is not null;

create index if not exists idx_empresas_dashboard
  on public.empresas (dashboard_id)
  where dashboard_id is not null;

create index if not exists idx_categorias_dashboard
  on public.categorias (dashboard_id)
  where dashboard_id is not null;

create index if not exists idx_presupuestos_dashboard_period
  on public.presupuestos (dashboard_id, period)
  where dashboard_id is not null;

create index if not exists idx_recurrentes_dashboard_last_processed
  on public.recurrentes (dashboard_id, last_processed)
  where dashboard_id is not null;

create index if not exists idx_usuarios_dashboard
  on public.usuarios (dashboard_id)
  where dashboard_id is not null;

create or replace function public.user_has_dashboard_access(target_dashboard_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.dashboard_members dm
    where dm.dashboard_id = target_dashboard_id
      and dm.user_id = auth.uid()
      and dm.status = 'active'
  );
$$;

create or replace function public.user_can_edit_dashboard(target_dashboard_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.dashboard_members dm
    where dm.dashboard_id = target_dashboard_id
      and dm.user_id = auth.uid()
      and dm.status = 'active'
      and dm.role in ('owner', 'editor')
  );
$$;

alter table public.dashboards enable row level security;
alter table public.dashboard_members enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'dashboards'
      and policyname = 'members can read dashboards'
  ) then
    create policy "members can read dashboards"
    on public.dashboards
    for select
    to authenticated
    using (public.user_has_dashboard_access(id));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'dashboard_members'
      and policyname = 'members can read dashboard memberships'
  ) then
    create policy "members can read dashboard memberships"
    on public.dashboard_members
    for select
    to authenticated
    using (public.user_has_dashboard_access(dashboard_id));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'dashboard_members'
      and policyname = 'owners and admins can manage dashboard memberships'
  ) then
    create policy "owners and admins can manage dashboard memberships"
    on public.dashboard_members
    for all
    to authenticated
    using (
      public.is_admin_app_user()
      or public.user_can_edit_dashboard(dashboard_id)
    )
    with check (
      public.is_admin_app_user()
      or public.user_can_edit_dashboard(dashboard_id)
    );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'movimientos'
      and policyname = 'dashboard members can read movimientos'
  ) then
    create policy "dashboard members can read movimientos"
    on public.movimientos
    for select
    to authenticated
    using (
      (dashboard_id is not null and public.user_has_dashboard_access(dashboard_id))
      or (dashboard_id is null and public.is_active_app_user() and owner_user_id = auth.uid())
    );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'empresas'
      and policyname = 'dashboard members can read empresas'
  ) then
    create policy "dashboard members can read empresas"
    on public.empresas
    for select
    to authenticated
    using (
      (dashboard_id is not null and public.user_has_dashboard_access(dashboard_id))
      or (dashboard_id is null and public.is_active_app_user() and owner_user_id = auth.uid())
    );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'categorias'
      and policyname = 'dashboard members can read categorias'
  ) then
    create policy "dashboard members can read categorias"
    on public.categorias
    for select
    to authenticated
    using (
      (dashboard_id is not null and public.user_has_dashboard_access(dashboard_id))
      or (dashboard_id is null and public.is_active_app_user() and owner_user_id = auth.uid())
    );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'presupuestos'
      and policyname = 'dashboard members can read presupuestos'
  ) then
    create policy "dashboard members can read presupuestos"
    on public.presupuestos
    for select
    to authenticated
    using (
      (dashboard_id is not null and public.user_has_dashboard_access(dashboard_id))
      or (dashboard_id is null and public.is_active_app_user() and owner_user_id = auth.uid())
    );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'recurrentes'
      and policyname = 'dashboard members can read recurrentes'
  ) then
    create policy "dashboard members can read recurrentes"
    on public.recurrentes
    for select
    to authenticated
    using (
      (dashboard_id is not null and public.user_has_dashboard_access(dashboard_id))
      or (dashboard_id is null and public.is_active_app_user() and owner_user_id = auth.uid())
    );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'usuarios'
      and policyname = 'users can read own telegram link by member user'
  ) then
    create policy "users can read own telegram link by member user"
    on public.usuarios
    for select
    to authenticated
    using (
      public.is_active_app_user()
      and (
        user_id = auth.uid()
        or (user_id is null and owner_user_id = auth.uid())
      )
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
      and tablename = 'dashboards'
  ) then
    alter publication supabase_realtime add table public.dashboards;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'dashboard_members'
  ) then
    alter publication supabase_realtime add table public.dashboard_members;
  end if;
end $$;

-- IMPORTANT:
-- owner_user_id stays in place for the compatibility window.
-- After backend + Telegram cutover and production verification:
-- 1. make dashboard_id not null on business tables
-- 2. switch unique constraints fully to dashboard_id
-- 3. remove legacy owner_user_id reads/writes
