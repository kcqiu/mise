-- Bootstrap the first cloud grocery session for browsers that already have
-- a local grocery list. Subsequent mutation and completion RPCs remain the
-- only writers to grocery session state.

create or replace function public.ensure_grocery_session(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_session record;
  v_created boolean := false;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_session_id is null then
    raise exception 'Session ID is required';
  end if;

  select * into v_session
  from public.grocery_sessions
  where user_id = v_user_id and status = 'active';

  if not found then
    insert into public.grocery_sessions (
      id,
      user_id,
      status,
      started_at,
      updated_at,
      revision,
      recipes,
      custom_items,
      item_overrides
    )
    values (
      p_session_id,
      v_user_id,
      'active',
      clock_timestamp(),
      clock_timestamp(),
      1,
      '[]'::jsonb,
      '[]'::jsonb,
      '{}'::jsonb
    )
    on conflict do nothing
    returning * into v_session;

    v_created := found;

    if not found then
      select * into v_session
      from public.grocery_sessions
      where user_id = v_user_id and status = 'active';
    end if;
  end if;

  if v_session.id is null then
    return jsonb_build_object(
      'success', false,
      'code', 'SESSION_CREATE_FAILED'
    );
  end if;

  return jsonb_build_object(
    'success', true,
    'created', v_created,
    'session', to_jsonb(v_session)
  );
end;
$$;

revoke all on function public.ensure_grocery_session(uuid) from public, anon;
grant execute on function public.ensure_grocery_session(uuid) to authenticated;
