-- Shared dashboard invitations phase
-- Adds collaborator invitations scoped to a dashboard.

create extension if not exists pgcrypto;

create table if not exists public.dashboard_invitations (
  id uuid primary key default gen_random_uuid(),
  dashboard_id uuid not null references public.dashboards(id) on delete cascade,
  email text not null,
  role public.dashboard_member_role not null,
  status public.invitation_status not null default 'pending',
  invite_token text not null unique default replace(gen_random_uuid()::text, '-', ''),
  invited_by_user_id uuid references public.app_users(user_id) on delete set null,
  accepted_user_id uuid references public.app_users(user_id) on delete set null,
  expires_at timestamptz,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uniq_dashboard_invitation_dashboard_email unique (dashboard_id, email)
);

drop trigger if exists trg_dashboard_invitations_set_updated_at on public.dashboard_invitations;
create trigger trg_dashboard_invitations_set_updated_at
before update on public.dashboard_invitations
for each row execute procedure public.set_updated_at();

create index if not exists idx_dashboard_invitations_dashboard_status
  on public.dashboard_invitations (dashboard_id, status, created_at desc);

create index if not exists idx_dashboard_invitations_email_status
  on public.dashboard_invitations (lower(email), status);

alter table public.dashboard_invitations enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'dashboard_invitations'
      and policyname = 'members can read dashboard invitations'
  ) then
    create policy "members can read dashboard invitations"
    on public.dashboard_invitations
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
      and tablename = 'dashboard_invitations'
      and policyname = 'owners and admins can manage dashboard invitations'
  ) then
    create policy "owners and admins can manage dashboard invitations"
    on public.dashboard_invitations
    for all
    to authenticated
    using (
      public.is_admin_app_user()
      or exists (
        select 1
        from public.dashboard_members dm
        where dm.dashboard_id = dashboard_invitations.dashboard_id
          and dm.user_id = auth.uid()
          and dm.status = 'active'
          and dm.role = 'owner'
      )
    )
    with check (
      public.is_admin_app_user()
      or exists (
        select 1
        from public.dashboard_members dm
        where dm.dashboard_id = dashboard_invitations.dashboard_id
          and dm.user_id = auth.uid()
          and dm.status = 'active'
          and dm.role = 'owner'
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
      and tablename = 'dashboard_invitations'
  ) then
    alter publication supabase_realtime add table public.dashboard_invitations;
  end if;
end $$;
