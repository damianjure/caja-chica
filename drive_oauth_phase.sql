-- Drive OAuth phase migration
-- Apply once in production via Supabase SQL editor

create table if not exists public.drive_connections (
    id uuid primary key default gen_random_uuid(),
    owner_user_id uuid not null references public.app_users(user_id) on delete cascade,
    dashboard_id uuid,
    refresh_token_enc text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create unique index if not exists uq_drive_connections_owner
    on public.drive_connections (owner_user_id);

alter table public.drive_connections enable row level security;

create policy "owner manages own drive connection"
on public.drive_connections
for all
to authenticated
using (public.is_active_app_user() and owner_user_id = auth.uid())
with check (public.is_active_app_user() and owner_user_id = auth.uid());

-- Extend report_exports with drive columns
alter table public.report_exports
    add column if not exists destination text not null default 'local'
        check (destination in ('local', 'drive')),
    add column if not exists drive_file_id text,
    add column if not exists drive_url text;
