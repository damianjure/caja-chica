create extension if not exists pgcrypto;

create table if not exists public.telegram_pending_movements (
  id uuid primary key default gen_random_uuid(),
  chat_id bigint not null,
  user_id uuid references public.app_users(user_id) on delete cascade,
  dashboard_id uuid references public.dashboards(id) on delete cascade,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'resolved', 'cancelled', 'expired')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  expires_at timestamptz not null default (now() + interval '1 day')
);

create index if not exists idx_telegram_pending_movements_chat_status
  on public.telegram_pending_movements (chat_id, status, created_at desc);

create unique index if not exists uniq_telegram_pending_movements_active_chat
  on public.telegram_pending_movements (chat_id)
  where status = 'pending';

alter table public.telegram_pending_movements enable row level security;
