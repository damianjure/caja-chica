-- security_hardening_phase.sql
-- Aplica fixes críticos #3, #4, #5 y #7 detectados en auditoría 2026-05-03.
-- Idempotente: cada bloque hace drop policy if exists antes de recrear.
--
-- Aplicar en Supabase SQL editor del proyecto dezgusgxotihxkfkxico.
-- Recomendado: correr fuera de horario activo. No bloquea writes
-- (las policies son SELECT y se reemplazan en una transacción implícita por bloque).

-- =============================================================
-- #7 — Performance RLS: wrap helpers en (SELECT ...)
-- También cierra #3 (cobertura dashboard_id consistente).
-- =============================================================

-- movimientos
drop policy if exists "active users can read movimientos" on public.movimientos;
drop policy if exists "dashboard members can read movimientos" on public.movimientos;

create policy "scoped read movimientos"
on public.movimientos
for select
to authenticated
using (
  (
    dashboard_id is not null
    and (select public.user_has_dashboard_access(dashboard_id))
  )
  or (
    dashboard_id is null
    and (select public.is_active_app_user())
    and owner_user_id = auth.uid()
  )
);

-- empresas
drop policy if exists "active users can read empresas" on public.empresas;
drop policy if exists "dashboard members can read empresas" on public.empresas;

create policy "scoped read empresas"
on public.empresas
for select
to authenticated
using (
  (
    dashboard_id is not null
    and (select public.user_has_dashboard_access(dashboard_id))
  )
  or (
    dashboard_id is null
    and (select public.is_active_app_user())
    and owner_user_id = auth.uid()
  )
);

-- categorias
drop policy if exists "active users can read categorias" on public.categorias;
drop policy if exists "dashboard members can read categorias" on public.categorias;

create policy "scoped read categorias"
on public.categorias
for select
to authenticated
using (
  (
    dashboard_id is not null
    and (select public.user_has_dashboard_access(dashboard_id))
  )
  or (
    dashboard_id is null
    and (select public.is_active_app_user())
    and owner_user_id = auth.uid()
  )
);

-- presupuestos
drop policy if exists "active users can read presupuestos" on public.presupuestos;
drop policy if exists "dashboard members can read presupuestos" on public.presupuestos;

create policy "scoped read presupuestos"
on public.presupuestos
for select
to authenticated
using (
  (
    dashboard_id is not null
    and (select public.user_has_dashboard_access(dashboard_id))
  )
  or (
    dashboard_id is null
    and (select public.is_active_app_user())
    and owner_user_id = auth.uid()
  )
);

-- recurrentes
drop policy if exists "active users can read recurrentes" on public.recurrentes;
drop policy if exists "dashboard members can read recurrentes" on public.recurrentes;

create policy "scoped read recurrentes"
on public.recurrentes
for select
to authenticated
using (
  (
    dashboard_id is not null
    and (select public.user_has_dashboard_access(dashboard_id))
  )
  or (
    dashboard_id is null
    and (select public.is_active_app_user())
    and owner_user_id = auth.uid()
  )
);

-- =============================================================
-- #5 — report_exports cubre dashboard_id
-- =============================================================

drop policy if exists "active users can read report exports" on public.report_exports;

create policy "scoped read report exports"
on public.report_exports
for select
to authenticated
using (
  (
    dashboard_id is not null
    and (select public.user_has_dashboard_access(dashboard_id))
  )
  or (
    dashboard_id is null
    and (select public.is_active_app_user())
    and owner_user_id = auth.uid()
  )
);

-- Index faltante para queries por dashboard
create index if not exists idx_report_exports_dashboard_created_at_desc
  on public.report_exports (dashboard_id, created_at desc)
  where dashboard_id is not null;

-- =============================================================
-- #4 — audit_logs / empresa_delete_backups: cerrar leak por NULL tenant
-- =============================================================

drop policy if exists "dashboard members can read audit logs" on public.audit_logs;

create policy "scoped read audit logs"
on public.audit_logs
for select
to authenticated
using (
  (select public.is_active_app_user())
  and (
    (
      dashboard_id is not null
      and (select public.user_has_dashboard_access(dashboard_id))
    )
    or (
      dashboard_id is null
      and actor_user_id = auth.uid()
    )
  )
);

drop policy if exists "dashboard members can read empresa backups" on public.empresa_delete_backups;

create policy "scoped read empresa backups"
on public.empresa_delete_backups
for select
to authenticated
using (
  (select public.is_active_app_user())
  and (
    (
      dashboard_id is not null
      and (select public.user_has_dashboard_access(dashboard_id))
    )
    or (
      dashboard_id is null
      and deleted_by_user_id = auth.uid()
    )
  )
);

-- =============================================================
-- Verificación post-aplicación (correr manual y revisar)
-- =============================================================
-- select schemaname, tablename, policyname, cmd
-- from pg_policies
-- where schemaname = 'public'
--   and tablename in (
--     'movimientos','empresas','categorias','presupuestos','recurrentes',
--     'report_exports','audit_logs','empresa_delete_backups'
--   )
-- order by tablename, policyname;
