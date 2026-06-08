-- Boteado schema + auth bootstrap + invitation model
-- IMPORTANT:
-- 1. Run this SQL in the Supabase SQL editor.
-- 2. Insert your own admin email into public.bootstrap_admin_emails before first login.
-- 3. In Supabase Dashboard configure the "Before User Created" hook to call:
--    public.hook_authorize_google_invited_users

create extension if not exists pgcrypto;

do $$ begin
  create type public.app_role as enum ('superadmin', 'admin', 'member');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.app_user_status as enum ('active', 'suspended');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.invitation_status as enum ('pending', 'accepted', 'revoked', 'expired');
exception when duplicate_object then null;
end $$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.bootstrap_admin_emails (
  email text primary key,
  note text,
  created_at timestamptz not null default now()
);

comment on table public.bootstrap_admin_emails is
'Emails permitidos para bootstrap inicial. Insertar aquí el email del primer superadmin antes del primer login.';

create table if not exists public.user_invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  role public.app_role not null default 'member',
  status public.invitation_status not null default 'pending',
  invite_token text not null unique default encode(gen_random_bytes(24), 'hex'),
  invited_by uuid references auth.users(id) on delete set null,
  accepted_user_id uuid references auth.users(id) on delete set null,
  expires_at timestamptz,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_user_invitations_set_updated_at
before update on public.user_invitations
for each row execute procedure public.set_updated_at();

create table if not exists public.app_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  role public.app_role not null default 'member',
  status public.app_user_status not null default 'active',
  invited_by uuid references auth.users(id) on delete set null,
  invited_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_app_users_set_updated_at
before update on public.app_users
for each row execute procedure public.set_updated_at();

-- Core business tables
create table if not exists public.empresas (
    id uuid primary key default gen_random_uuid(),
    owner_user_id uuid not null references public.app_users(user_id) on delete cascade,
    created_at timestamptz default now(),
    nombre text not null,
    tenant_id text default 'default'
);
create unique index if not exists uniq_empresas_owner_nombre
    on public.empresas (owner_user_id, lower(nombre));

create table if not exists public.movimientos (
    id uuid primary key default gen_random_uuid(),
    owner_user_id uuid not null references public.app_users(user_id) on delete cascade,
    created_at timestamptz default now(),
    tipo text not null check (tipo in ('ingreso', 'egreso')),
    moneda text not null check (moneda in ('ARS', 'USD')),
    monto numeric,
    categoria text,
    empresa_nombre text,
    descripcion text,
    original_text text,
    conciliado boolean not null default false,
    conciliado_at timestamptz,
    conciliado_notas text,
    tenant_id text default 'default'
);

create table if not exists public.presupuestos (
    id uuid primary key default gen_random_uuid(),
    owner_user_id uuid not null references public.app_users(user_id) on delete cascade,
    period text not null,
    categoria text not null,
    moneda text not null check (moneda in ('ARS', 'USD')),
    monto numeric not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint presupuestos_period_format check (period ~ '^\d{4}-\d{2}$')
);
create unique index if not exists uniq_presupuestos_owner_period_categoria_moneda
    on public.presupuestos (owner_user_id, period, lower(categoria), moneda);

create trigger trg_presupuestos_set_updated_at
before update on public.presupuestos
for each row execute procedure public.set_updated_at();

create table if not exists public.categorias (
    id uuid primary key default gen_random_uuid(),
    owner_user_id uuid not null references public.app_users(user_id) on delete cascade,
    created_at timestamptz default now(),
    nombre text not null,
    tenant_id text default 'default'
);
create unique index if not exists uniq_categorias_owner_nombre
    on public.categorias (owner_user_id, lower(nombre));

create table if not exists public.usuarios (
    id uuid primary key default gen_random_uuid(),
    owner_user_id uuid unique references public.app_users(user_id) on delete cascade,
    chat_id bigint unique,
    username text,
    created_at timestamptz default now(),
    reminders_enabled boolean default true,
    link_token text unique,
    link_token_expires_at timestamptz,
    linked_at timestamptz
);

create table if not exists public.recurrentes (
    id uuid primary key default gen_random_uuid(),
    owner_user_id uuid not null references public.app_users(user_id) on delete cascade,
    created_at timestamptz default now(),
    monto decimal(15,2) not null,
    tipo text not null check (tipo in ('ingreso', 'egreso')),
    moneda text not null check (moneda in ('ARS', 'USD')),
    categoria text,
    empresa_nombre text default 'Personal',
    descripcion text,
    frecuencia text not null check (frecuencia in ('diario', 'semanal', 'quincenal', 'mensual', 'anual')),
    last_processed timestamptz,
    chat_id bigint,
    dashboard_id uuid,
    created_by_user_id uuid,
    is_active boolean,
    deleted_at timestamptz,
    day_of_month smallint check (day_of_month is null or (day_of_month >= 1 and day_of_month <= 31))
);

create table if not exists public.report_exports (
    id uuid primary key default gen_random_uuid(),
    owner_user_id uuid references public.app_users(user_id) on delete cascade,
    dashboard_id uuid,
    exported_by_user_id uuid references public.app_users(user_id) on delete set null,
    created_at timestamptz not null default now(),
    format text not null check (format in ('csv', 'pdf')),
    period_type text not null check (period_type in ('day', 'week', 'month', 'range')),
    period_label text not null,
    period_anchor_date date,
    period_month text,
    period_from date,
    period_to date,
    company text not null default 'all',
    tipo text not null default 'all' check (tipo in ('all', 'ingreso', 'egreso')),
    moneda text not null default 'all' check (moneda in ('all', 'ARS', 'USD')),
    total_movements integer not null default 0,
    file_name text not null
);

-- Existing-table migration helpers (important when the project already had the old global schema)
alter table public.empresas
  add column if not exists owner_user_id uuid references public.app_users(user_id) on delete cascade;

alter table public.movimientos
  add column if not exists owner_user_id uuid references public.app_users(user_id) on delete cascade;

alter table public.movimientos
  add column if not exists conciliado boolean not null default false,
  add column if not exists conciliado_at timestamptz,
  add column if not exists conciliado_notas text;

alter table public.categorias
  add column if not exists owner_user_id uuid references public.app_users(user_id) on delete cascade;

alter table public.usuarios
  add column if not exists owner_user_id uuid unique references public.app_users(user_id) on delete cascade,
  add column if not exists link_token text unique,
  add column if not exists link_token_expires_at timestamptz,
  add column if not exists linked_at timestamptz;

alter table public.recurrentes
  add column if not exists owner_user_id uuid references public.app_users(user_id) on delete cascade;

alter table public.empresas drop constraint if exists empresas_nombre_key;
alter table public.categorias drop constraint if exists categorias_nombre_key;

-- Indexes
create index if not exists idx_movimientos_created_at_desc
    on public.movimientos (created_at desc);

create index if not exists idx_movimientos_owner_created_at_desc
    on public.movimientos (owner_user_id, created_at desc);

create index if not exists idx_movimientos_empresa_nombre
    on public.movimientos (empresa_nombre);

create index if not exists idx_movimientos_categoria
    on public.movimientos (categoria);

create index if not exists idx_movimientos_owner_conciliado
    on public.movimientos (owner_user_id, conciliado, created_at desc);

create index if not exists idx_recurrentes_last_processed
    on public.recurrentes (last_processed);

create index if not exists idx_recurrentes_owner_last_processed
    on public.recurrentes (owner_user_id, last_processed);

create index if not exists idx_empresas_owner
    on public.empresas (owner_user_id);

create index if not exists idx_categorias_owner
    on public.categorias (owner_user_id);

create index if not exists idx_presupuestos_owner_period
    on public.presupuestos (owner_user_id, period);

create index if not exists idx_usuarios_owner
    on public.usuarios (owner_user_id);

create index if not exists idx_usuarios_link_token
    on public.usuarios (link_token);

create index if not exists idx_report_exports_owner_created_at_desc
    on public.report_exports (owner_user_id, created_at desc);

create index if not exists idx_user_invitations_status_email
    on public.user_invitations (status, email);

create index if not exists idx_app_users_role_status
    on public.app_users (role, status);

-- Auth helper functions
create or replace function public.is_active_app_user()
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.app_users
    where user_id = auth.uid()
      and status = 'active'
  );
$$;

create or replace function public.is_admin_app_user()
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.app_users
    where user_id = auth.uid()
      and status = 'active'
      and role in ('admin', 'superadmin')
  );
$$;

create or replace function public.is_superadmin_app_user()
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.app_users
    where user_id = auth.uid()
      and status = 'active'
      and role = 'superadmin'
  );
$$;

create or replace function public.hook_authorize_google_invited_users(event jsonb)
returns jsonb
language plpgsql
as $$
declare
  request_email text;
  provider_name text;
  invited boolean;
  bootstrap boolean;
begin
  request_email := lower(coalesce(event->'user'->>'email', ''));
  provider_name := lower(coalesce(event->'user'->'app_metadata'->>'provider', ''));

  if request_email = '' then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'message', 'No se recibió un email válido.',
        'http_code', 400
      )
    );
  end if;

  if provider_name <> 'google' then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'message', 'Solo se permite acceso con Google.',
        'http_code', 403
      )
    );
  end if;

  select exists(
    select 1 from public.bootstrap_admin_emails where lower(email) = request_email
  ) into bootstrap;

  select exists(
    select 1
    from public.user_invitations
    where lower(email) = request_email
      and status = 'pending'
      and (expires_at is null or expires_at > now())
  ) into invited;

  if bootstrap or invited then
    return '{}'::jsonb;
  end if;

  return jsonb_build_object(
    'error', jsonb_build_object(
      'message', 'Tu email no está autorizado. Pedile una invitación al administrador.',
      'http_code', 403
    )
  );
end;
$$;

grant execute on function public.hook_authorize_google_invited_users(jsonb) to supabase_auth_admin;
revoke execute on function public.hook_authorize_google_invited_users(jsonb) from anon, authenticated, public;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  invited_record public.user_invitations%rowtype;
  is_bootstrap boolean;
begin
  select exists(
    select 1 from public.bootstrap_admin_emails where lower(email) = lower(new.email)
  ) into is_bootstrap;

  select *
    into invited_record
  from public.user_invitations
  where lower(email) = lower(new.email)
    and status = 'pending'
    and (expires_at is null or expires_at > now())
  order by created_at desc
  limit 1;

  insert into public.app_users (
    user_id,
    email,
    role,
    status,
    invited_by,
    invited_at
  )
  values (
    new.id,
    lower(new.email),
    case
      when is_bootstrap then 'superadmin'::public.app_role
      when invited_record.id is not null then invited_record.role
      else 'member'::public.app_role
    end,
    'active'::public.app_user_status,
    invited_record.invited_by,
    invited_record.created_at
  )
  on conflict (user_id) do update
    set email = excluded.email;

  if invited_record.id is not null then
    update public.user_invitations
      set status = 'accepted',
          accepted_at = now(),
          accepted_user_id = new.id,
          updated_at = now()
    where id = invited_record.id;
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_auth_user();

-- Enable Realtime
alter publication supabase_realtime add table public.movimientos;
alter publication supabase_realtime add table public.empresas;
alter publication supabase_realtime add table public.categorias;
alter publication supabase_realtime add table public.recurrentes;

-- Row Level Security
alter table public.bootstrap_admin_emails enable row level security;
alter table public.user_invitations enable row level security;
alter table public.app_users enable row level security;
alter table public.empresas enable row level security;
alter table public.movimientos enable row level security;
alter table public.categorias enable row level security;
alter table public.usuarios enable row level security;
alter table public.recurrentes enable row level security;
alter table public.presupuestos enable row level security;
alter table public.report_exports enable row level security;

-- bootstrap_admin_emails
create policy "superadmins can read bootstrap emails"
on public.bootstrap_admin_emails
for select
to authenticated
using (public.is_superadmin_app_user());

-- app_users
create policy "users can read own app user"
on public.app_users
for select
to authenticated
using (
  user_id = auth.uid()
  or public.is_admin_app_user()
);

create policy "superadmins can update app users"
on public.app_users
for update
to authenticated
using (public.is_superadmin_app_user())
with check (public.is_superadmin_app_user());

-- user_invitations
create policy "admins can read invitations"
on public.user_invitations
for select
to authenticated
using (public.is_admin_app_user());

create policy "admins can insert invitations"
on public.user_invitations
for insert
to authenticated
with check (
  public.is_admin_app_user()
  and (
    role <> 'superadmin'
    or public.is_superadmin_app_user()
  )
);

create policy "admins can update invitations"
on public.user_invitations
for update
to authenticated
using (public.is_admin_app_user())
with check (
  public.is_admin_app_user()
  and (
    role <> 'superadmin'
    or public.is_superadmin_app_user()
  )
);

-- Business tables: authenticated active users can read; writes stay server-side
create policy "active users can read empresas"
on public.empresas
for select
to authenticated
using (public.is_active_app_user() and owner_user_id = auth.uid());

create policy "active users can read movimientos"
on public.movimientos
for select
to authenticated
using (public.is_active_app_user() and owner_user_id = auth.uid());

create policy "active users can read categorias"
on public.categorias
for select
to authenticated
using (public.is_active_app_user() and owner_user_id = auth.uid());

create policy "active users can read recurrentes"
on public.recurrentes
for select
to authenticated
using (public.is_active_app_user() and owner_user_id = auth.uid());

create policy "active users can read presupuestos"
on public.presupuestos
for select
to authenticated
using (public.is_active_app_user() and owner_user_id = auth.uid());

create policy "users can read own telegram link"
on public.usuarios
for select
to authenticated
using (
  public.is_active_app_user()
  and owner_user_id = auth.uid()
);

create policy "active users can read report exports"
on public.report_exports
for select
to authenticated
using (public.is_active_app_user() and owner_user_id = auth.uid());

-- Bootstrap instruction example:
-- insert into public.bootstrap_admin_emails (email, note)
-- values ('tu-email@gmail.com', 'Primer superadmin de Boteado');
