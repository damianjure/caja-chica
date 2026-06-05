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

create index if not exists idx_presupuestos_owner_period
    on public.presupuestos (owner_user_id, period);

alter table public.movimientos
  add column if not exists conciliado boolean not null default false,
  add column if not exists conciliado_at timestamptz,
  add column if not exists conciliado_notas text;

create index if not exists idx_movimientos_owner_conciliado
    on public.movimientos (owner_user_id, conciliado, created_at desc);

alter table public.presupuestos enable row level security;

drop policy if exists "active users can read presupuestos" on public.presupuestos;
create policy "active users can read presupuestos"
on public.presupuestos
for select
to authenticated
using (public.is_active_app_user() and owner_user_id = auth.uid());

drop trigger if exists trg_presupuestos_set_updated_at on public.presupuestos;
create trigger trg_presupuestos_set_updated_at
before update on public.presupuestos
for each row execute procedure public.set_updated_at();
