-- Ticket line items (Fase A — persistir líneas)
-- A movimiento can be a "ticket": one parent row holding the total, plus child
-- editable line items in movimiento_lineas. Lines inherit the parent's tipo
-- (recibo = egreso); tipo is edited at the movement level. The parent's monto
-- is kept equal to the sum of its active lines (recomputed by the API on line
-- edit/delete). has_lineas lets the Movimientos list show an expander with no
-- N+1 query.
--
-- Scope columns (dashboard_id / owner_user_id) mirror movimientos so RLS read
-- access uses the same predicate. Writes go through the API (service role),
-- which enforces scope in code; the SELECT policy is for client/realtime reads.

create extension if not exists pgcrypto;

create table if not exists public.movimiento_lineas (
  id uuid primary key default gen_random_uuid(),
  movimiento_id uuid not null references public.movimientos(id) on delete cascade,
  dashboard_id uuid references public.dashboards(id) on delete cascade,
  owner_user_id uuid references public.app_users(user_id) on delete cascade,
  descripcion text not null default 'Ítem',
  monto numeric not null default 0 check (monto >= 0),
  categoria text not null default 'Varios',
  cantidad numeric,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists idx_movimiento_lineas_movimiento
  on public.movimiento_lineas (movimiento_id)
  where deleted_at is null;

alter table public.movimientos
  add column if not exists has_lineas boolean not null default false;

alter table public.movimiento_lineas enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'movimiento_lineas'
      and policyname = 'dashboard members can read movimiento_lineas'
  ) then
    create policy "dashboard members can read movimiento_lineas"
    on public.movimiento_lineas
    for select
    to authenticated
    using (
      (dashboard_id is not null and public.user_has_dashboard_access(dashboard_id))
      or (dashboard_id is null and public.is_active_app_user() and owner_user_id = auth.uid())
    );
  end if;
end $$;
