-- Final cutover from owner_user_id to dashboard_id
-- Run ONLY after:
-- 1. shared_dashboard_phase.sql applied
-- 2. shared_dashboard_invitations_phase.sql applied
-- 3. app + bot deployed with dashboard-aware code
-- 4. data backfill verified in production

create extension if not exists pgcrypto;

do $$
begin
  if exists (select 1 from public.empresas where dashboard_id is null) then
    raise exception 'empresas still has rows with null dashboard_id';
  end if;
  if exists (select 1 from public.movimientos where dashboard_id is null) then
    raise exception 'movimientos still has rows with null dashboard_id';
  end if;
  if exists (select 1 from public.movimientos where created_by_user_id is null) then
    raise exception 'movimientos still has rows with null created_by_user_id';
  end if;
  if exists (select 1 from public.presupuestos where dashboard_id is null) then
    raise exception 'presupuestos still has rows with null dashboard_id';
  end if;
  if exists (select 1 from public.categorias where dashboard_id is null) then
    raise exception 'categorias still has rows with null dashboard_id';
  end if;
  if exists (select 1 from public.recurrentes where dashboard_id is null) then
    raise exception 'recurrentes still has rows with null dashboard_id';
  end if;
  if exists (select 1 from public.recurrentes where created_by_user_id is null) then
    raise exception 'recurrentes still has rows with null created_by_user_id';
  end if;
  if exists (select 1 from public.usuarios where user_id is null or dashboard_id is null) then
    raise exception 'usuarios still has rows with null user_id or dashboard_id';
  end if;
end $$;

alter table public.empresas
  alter column dashboard_id set not null;

alter table public.movimientos
  alter column dashboard_id set not null,
  alter column created_by_user_id set not null;

alter table public.presupuestos
  alter column dashboard_id set not null;

alter table public.categorias
  alter column dashboard_id set not null;

alter table public.recurrentes
  alter column dashboard_id set not null,
  alter column created_by_user_id set not null;

alter table public.usuarios
  alter column user_id set not null,
  alter column dashboard_id set not null;

drop policy if exists "active users can read empresas" on public.empresas;
drop policy if exists "active users can read movimientos" on public.movimientos;
drop policy if exists "active users can read categorias" on public.categorias;
drop policy if exists "active users can read recurrentes" on public.recurrentes;
drop policy if exists "active users can read presupuestos" on public.presupuestos;
drop policy if exists "users can read own telegram link" on public.usuarios;
drop policy if exists "dashboard members can read movimientos" on public.movimientos;
drop policy if exists "dashboard members can read empresas" on public.empresas;
drop policy if exists "dashboard members can read categorias" on public.categorias;
drop policy if exists "dashboard members can read presupuestos" on public.presupuestos;
drop policy if exists "dashboard members can read recurrentes" on public.recurrentes;
drop policy if exists "users can read own telegram link by member user" on public.usuarios;

create policy "dashboard members can read empresas strict"
on public.empresas
for select
to authenticated
using (public.user_has_dashboard_access(dashboard_id));

create policy "dashboard members can read movimientos strict"
on public.movimientos
for select
to authenticated
using (public.user_has_dashboard_access(dashboard_id));

create policy "dashboard members can read categorias strict"
on public.categorias
for select
to authenticated
using (public.user_has_dashboard_access(dashboard_id));

create policy "dashboard members can read presupuestos strict"
on public.presupuestos
for select
to authenticated
using (public.user_has_dashboard_access(dashboard_id));

create policy "dashboard members can read recurrentes strict"
on public.recurrentes
for select
to authenticated
using (public.user_has_dashboard_access(dashboard_id));

create policy "users can read own telegram link strict"
on public.usuarios
for select
to authenticated
using (
  public.is_active_app_user()
  and user_id = auth.uid()
);

drop index if exists uniq_empresas_owner_nombre;
drop index if exists uniq_categorias_owner_nombre;
drop index if exists uniq_presupuestos_owner_period_categoria_moneda;
drop index if exists idx_movimientos_owner_created_at_desc;
drop index if exists idx_movimientos_owner_conciliado;
drop index if exists idx_recurrentes_owner_last_processed;
drop index if exists idx_empresas_owner;
drop index if exists idx_categorias_owner;
drop index if exists idx_presupuestos_owner_period;
drop index if exists idx_usuarios_owner;

alter table public.empresas drop column if exists owner_user_id;
alter table public.movimientos drop column if exists owner_user_id;
alter table public.presupuestos drop column if exists owner_user_id;
alter table public.categorias drop column if exists owner_user_id;
alter table public.recurrentes drop column if exists owner_user_id;
alter table public.usuarios drop column if exists owner_user_id;

-- Optional cleanup after a stable window:
-- drop column personal_for_user_id from public.dashboards if personal dashboards
-- are no longer needed as a first-class concept.
