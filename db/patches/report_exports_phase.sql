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

create index if not exists idx_report_exports_owner_created_at_desc
    on public.report_exports (owner_user_id, created_at desc);

alter table public.report_exports enable row level security;

drop policy if exists "active users can read report exports" on public.report_exports;
create policy "active users can read report exports"
on public.report_exports
for select
to authenticated
using (public.is_active_app_user() and owner_user_id = auth.uid());
