create or replace function public.hook_authorize_google_invited_users(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
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
