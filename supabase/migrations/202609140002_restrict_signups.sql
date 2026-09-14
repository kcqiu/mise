create schema if not exists private;

revoke all on schema private from public, anon, authenticated;

create table if not exists private.signup_allowlist (
  email text primary key,
  created_at timestamptz not null default now(),
  constraint signup_allowlist_email_normalized check (email = lower(trim(email)))
);

revoke all on table private.signup_allowlist from public, anon, authenticated;
grant usage on schema private to supabase_auth_admin;
grant select on table private.signup_allowlist to supabase_auth_admin;

create or replace function private.hook_restrict_signup_by_email(event jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  requested_email text := lower(trim(event -> 'user' ->> 'email'));
  requested_provider text := event -> 'user' -> 'app_metadata' ->> 'provider';
begin
  if requested_provider = 'google'
    and exists (
      select 1
      from private.signup_allowlist
      where email = requested_email
    )
  then
    return '{}'::jsonb;
  end if;

  return jsonb_build_object(
    'error', jsonb_build_object(
      'http_code', 403,
      'message', 'This account is not approved for MISE.'
    )
  );
end;
$$;

revoke execute on function private.hook_restrict_signup_by_email(jsonb)
from public, anon, authenticated;
grant execute on function private.hook_restrict_signup_by_email(jsonb)
to supabase_auth_admin;
