-- Migration: 202609140005_grocery_sessions.sql
-- Table, partial unique constraint, mutation log, RLS, and atomic RPCs for Groceries Phase 2

create table if not exists public.grocery_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'completed')),
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  revision bigint not null default 1,
  recipes jsonb not null default '[]'::jsonb,
  custom_items jsonb not null default '[]'::jsonb,
  item_overrides jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint grocery_sessions_recipes_is_array check (jsonb_typeof(recipes) = 'array'),
  constraint grocery_sessions_custom_items_is_array check (jsonb_typeof(custom_items) = 'array'),
  constraint grocery_sessions_item_overrides_is_object check (jsonb_typeof(item_overrides) = 'object')
);

create index if not exists grocery_sessions_user_id_idx on public.grocery_sessions (user_id);
create index if not exists grocery_sessions_user_status_idx on public.grocery_sessions (user_id, status);
create index if not exists grocery_sessions_user_updated_idx on public.grocery_sessions (user_id, updated_at desc);

-- STRICT INVARIANT: Exactly one active grocery session per user at database engine level
create unique index if not exists grocery_sessions_one_active_per_user_idx
  on public.grocery_sessions (user_id)
  where status = 'active';

-- Idempotency Mutation Log
create table if not exists public.grocery_mutation_log (
  mutation_id uuid primary key,
  session_id uuid not null references public.grocery_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  mutation_type text not null,
  observed_revision bigint,
  applied_at timestamptz not null default now()
);

create index if not exists grocery_mutation_log_session_idx 
  on public.grocery_mutation_log (session_id, applied_at desc);

drop trigger if exists grocery_sessions_set_updated_at on public.grocery_sessions;
create trigger grocery_sessions_set_updated_at
before update on public.grocery_sessions
for each row execute function public.set_updated_at();

alter table public.grocery_sessions enable row level security;
alter table public.grocery_mutation_log enable row level security;

-- HARDENED ACCESS: Revoke direct INSERT/UPDATE/DELETE from client roles
revoke all on table public.grocery_sessions from anon, authenticated;
revoke all on table public.grocery_mutation_log from anon, authenticated;

-- Grant only SELECT to authenticated users under RLS
grant select on table public.grocery_sessions to authenticated;

drop policy if exists "Users read their own grocery sessions" on public.grocery_sessions;
create policy "Users read their own grocery sessions"
on public.grocery_sessions for select to authenticated
using (user_id = (select auth.uid()));

-- Private Realtime channel authorization on realtime.messages
do $$
begin
  if exists (select 1 from pg_tables where schemaname = 'realtime' and tablename = 'messages') then
    execute '
      drop policy if exists "Users can subscribe to own grocery session channels" on realtime.messages;
      create policy "Users can subscribe to own grocery session channels"
        on realtime.messages for select to authenticated
        using (
          extension = ''broadcast''
          and exists (
            select 1 from public.grocery_sessions
            where id::text = split_part(topic, '':'', 2)
              and user_id = (select auth.uid())
          )
        );
    ';
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- RPC: Get Active Grocery Session
-- -----------------------------------------------------------------------------
create or replace function public.get_active_grocery_session()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_session record;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_session
  from public.grocery_sessions
  where user_id = v_user_id and status = 'active';

  if not found then
    return jsonb_build_object('success', true, 'session', null);
  end if;

  return jsonb_build_object('success', true, 'session', to_jsonb(v_session));
end;
$$;

revoke all on function public.get_active_grocery_session() from public, anon;
grant execute on function public.get_active_grocery_session() to authenticated;

-- -----------------------------------------------------------------------------
-- RPC: Apply Grocery Mutations (Atomic & Idempotent with Authoritative Revision)
-- -----------------------------------------------------------------------------
create or replace function public.apply_grocery_mutations(
  p_session_id uuid,
  p_expected_revision bigint,
  p_mutations jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_session record;
  v_active_session record;
  v_now_ms bigint;
  v_ack_ids jsonb := '[]'::jsonb;
  v_applied_count int := 0;
  v_overrides jsonb;
  v_custom jsonb;
  v_recipes jsonb;
  v_mutation jsonb;
  v_mut_id uuid;
  v_type text;
  v_target_id text;
  v_payload jsonb;
  v_obs_rev bigint;
  v_res record;
  v_custom_map jsonb := '{}'::jsonb;
  v_elem jsonb;
  v_elem_id text;
  v_updated boolean;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_session_id is null then
    raise exception 'Session ID is required';
  end if;

  v_now_ms := (extract(epoch from clock_timestamp()) * 1000)::bigint;

  -- 1. Lock active session row
  select * into v_session
  from public.grocery_sessions
  where id = p_session_id and user_id = v_user_id
  for update;

  if not found then
    return jsonb_build_object(
      'success', false,
      'code', 'SESSION_NOT_FOUND',
      'sessionId', p_session_id
    );
  end if;

  if v_session.status = 'completed' then
    select * into v_active_session
    from public.grocery_sessions
    where user_id = v_user_id and status = 'active';

    return jsonb_build_object(
      'success', false,
      'code', 'SESSION_COMPLETED',
      'sessionId', p_session_id,
      'currentActiveSession', to_jsonb(v_active_session)
    );
  end if;

  v_overrides := coalesce(v_session.item_overrides, '{}'::jsonb);
  v_custom := coalesce(v_session.custom_items, '[]'::jsonb);
  v_recipes := coalesce(v_session.recipes, '[]'::jsonb);

  -- Index custom items into map for efficient updates
  for v_elem in select * from jsonb_array_elements(v_custom) loop
    v_elem_id := v_elem ->> 'id';
    if v_elem_id is not null then
      v_custom_map := jsonb_set(v_custom_map, array[v_elem_id], v_elem);
    end if;
  end loop;

  -- 2. Process each mutation in serial order
  if jsonb_typeof(p_mutations) = 'array' then
    for v_mutation in select * from jsonb_array_elements(p_mutations) loop
      v_mut_id := (v_mutation ->> 'mutationId')::uuid;
      v_type := v_mutation ->> 'type';
      v_target_id := v_mutation ->> 'targetId';
      v_payload := coalesce(v_mutation -> 'payload', '{}'::jsonb);
      v_obs_rev := (v_mutation ->> 'observedRevision')::bigint;

      if v_mut_id is null then
        continue;
      end if;

      -- Idempotency check: skip already applied mutation
      if exists (select 1 from public.grocery_mutation_log where mutation_id = v_mut_id) then
        v_ack_ids := v_ack_ids || to_jsonb(v_mut_id);
        continue;
      end if;

      -- Process mutation type
      if v_type = 'ITEM_STATUS_CHANGED' and v_target_id is not null then
        -- Suppress check/uncheck if item is already dismissed
        if not (v_overrides ? v_target_id and v_overrides -> v_target_id ->> 'status' = 'dismissed') then
          v_overrides := jsonb_set(
            v_overrides,
            array[v_target_id],
            jsonb_build_object('status', v_payload ->> 'status', 'updatedAt', v_now_ms)
          );
          v_applied_count := v_applied_count + 1;
        end if;

      elsif v_type = 'ITEM_DISMISSED' and v_target_id is not null then
        v_overrides := jsonb_set(
          v_overrides,
          array[v_target_id],
          jsonb_build_object('status', 'dismissed', 'updatedAt', v_now_ms)
        );
        v_applied_count := v_applied_count + 1;

      elsif v_type = 'ITEM_RESTORED' and v_target_id is not null then
        v_overrides := jsonb_set(
          v_overrides,
          array[v_target_id],
          jsonb_build_object('status', 'unchecked', 'updatedAt', v_now_ms)
        );
        v_applied_count := v_applied_count + 1;

      elsif v_type = 'PANTRY_ITEM_PROMOTED' and v_target_id is not null then
        v_overrides := jsonb_set(
          v_overrides,
          array[v_target_id],
          jsonb_build_object('status', 'unchecked', 'isPantryPromoted', true, 'updatedAt', v_now_ms)
        );
        v_applied_count := v_applied_count + 1;

      elsif v_type = 'CUSTOM_ITEM_ADDED' and v_target_id is not null then
        v_custom_map := jsonb_set(
          v_custom_map,
          array[v_target_id],
          jsonb_build_object(
            'id', v_target_id,
            'name', coalesce(v_payload ->> 'name', 'Custom Item'),
            'quantity', v_payload -> 'quantity',
            'unit', coalesce(v_payload ->> 'unit', ''),
            'category', coalesce(v_payload ->> 'category', 'Household & Other'),
            'note', coalesce(v_payload ->> 'note', ''),
            'status', 'unchecked',
            'updatedAt', v_now_ms
          )
        );
        v_applied_count := v_applied_count + 1;

      elsif v_type = 'CUSTOM_ITEM_DELETED' and v_target_id is not null then
        if v_custom_map ? v_target_id then
          v_custom_map := jsonb_set(
            v_custom_map,
            array[v_target_id, 'status'],
            to_jsonb('dismissed'::text)
          );
          v_custom_map := jsonb_set(
            v_custom_map,
            array[v_target_id, 'updatedAt'],
            to_jsonb(v_now_ms)
          );
          v_applied_count := v_applied_count + 1;
        end if;

      elsif v_type = 'RECIPE_ADDED' and v_target_id is not null then
        -- Check if recipe already present
        v_updated := false;
        select coalesce(jsonb_agg(
          case
            when elem ->> 'recipeId' = v_target_id then
              jsonb_build_object('recipeId', v_target_id, 'servings', coalesce((v_payload ->> 'servings')::int, 2), 'addedAt', v_now_ms)
            else elem
          end
        ), '[]'::jsonb) into v_recipes
        from jsonb_array_elements(v_recipes) elem;

        if not exists (select 1 from jsonb_array_elements(v_recipes) elem where elem ->> 'recipeId' = v_target_id) then
          v_recipes := v_recipes || jsonb_build_object('recipeId', v_target_id, 'servings', coalesce((v_payload ->> 'servings')::int, 2), 'addedAt', v_now_ms);
        end if;
        v_applied_count := v_applied_count + 1;

      elsif v_type = 'RECIPE_REMOVED' and v_target_id is not null then
        select coalesce(jsonb_agg(elem), '[]'::jsonb) into v_recipes
        from jsonb_array_elements(v_recipes) elem
        where elem ->> 'recipeId' != v_target_id;
        v_applied_count := v_applied_count + 1;

      elsif v_type = 'RECIPE_SERVINGS_CHANGED' and v_target_id is not null then
        select coalesce(jsonb_agg(
          case
            when elem ->> 'recipeId' = v_target_id then
              jsonb_set(elem, array['servings'], to_jsonb(coalesce((v_payload ->> 'nextServings')::int, 2)))
            else elem
          end
        ), '[]'::jsonb) into v_recipes
        from jsonb_array_elements(v_recipes) elem;
        v_applied_count := v_applied_count + 1;
      end if;

      -- Record mutation in log
      insert into public.grocery_mutation_log (
        mutation_id, session_id, user_id, mutation_type, observed_revision, applied_at
      )
      values (
        v_mut_id, p_session_id, v_user_id, v_type, v_obs_rev, clock_timestamp()
      );

      v_ack_ids := v_ack_ids || to_jsonb(v_mut_id);
    end loop;
  end if;

  select coalesce(jsonb_agg(value), '[]'::jsonb) into v_custom
  from jsonb_each(v_custom_map);

  -- 3. Update database row if any mutations applied
  if v_applied_count > 0 then
    update public.grocery_sessions
    set
      revision = v_session.revision + 1,
      item_overrides = v_overrides,
      custom_items = v_custom,
      recipes = v_recipes,
      updated_at = clock_timestamp()
    where id = p_session_id and user_id = v_user_id
    returning * into v_res;
  else
    select * into v_res from public.grocery_sessions where id = p_session_id;
  end if;

  return jsonb_build_object(
    'success', true,
    'sessionId', p_session_id,
    'revision', v_res.revision,
    'ackMutationIds', v_ack_ids,
    'session', to_jsonb(v_res)
  );
end;
$$;

revoke all on function public.apply_grocery_mutations(uuid, bigint, jsonb) from public, anon;
grant execute on function public.apply_grocery_mutations(uuid, bigint, jsonb) to authenticated;

-- -----------------------------------------------------------------------------
-- RPC: Complete Grocery Session (Atomic & Protected by Expected Revision)
-- -----------------------------------------------------------------------------
create or replace function public.complete_grocery_session(
  p_session_id uuid,
  p_action text, -- 'clear' or 'rollover'
  p_rollover_custom_items jsonb,
  p_new_session_id uuid,
  p_expected_revision bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_session record;
  v_new_session record;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_session_id is null or p_new_session_id is null then
    raise exception 'Both current and new session UUIDs are required';
  end if;

  -- 1. Lock existing active session row
  select * into v_session
  from public.grocery_sessions
  where id = p_session_id and user_id = v_user_id
  for update;

  if not found then
    -- Idempotent fallback: return current active session if one exists
    select * into v_new_session from public.grocery_sessions
    where user_id = v_user_id and status = 'active';

    return jsonb_build_object(
      'success', true,
      'code', 'ALREADY_COMPLETED',
      'activeSession', to_jsonb(v_new_session)
    );
  end if;

  if v_session.status = 'completed' then
    select * into v_new_session from public.grocery_sessions
    where user_id = v_user_id and status = 'active';

    return jsonb_build_object(
      'success', true,
      'code', 'ALREADY_COMPLETED',
      'activeSession', to_jsonb(v_new_session)
    );
  end if;

  -- 2. Validate expected revision to protect against stale client rollover
  if p_expected_revision is not null and v_session.revision != p_expected_revision then
    return jsonb_build_object(
      'success', false,
      'code', 'REVISION_CONFLICT',
      'currentRevision', v_session.revision,
      'session', to_jsonb(v_session)
    );
  end if;

  -- 3. Mark current session completed
  update public.grocery_sessions
  set
    status = 'completed',
    completed_at = clock_timestamp(),
    updated_at = clock_timestamp(),
    revision = v_session.revision + 1
  where id = p_session_id;

  -- 4. Insert new active session in same transaction (partial unique index preserved)
  if p_action = 'rollover' then
    insert into public.grocery_sessions (
      id, user_id, status, started_at, updated_at, revision,
      recipes, custom_items, item_overrides
    )
    values (
      p_new_session_id, v_user_id, 'active', clock_timestamp(), clock_timestamp(), 1,
      '[]'::jsonb, coalesce(p_rollover_custom_items, '[]'::jsonb), '{}'::jsonb
    )
    returning * into v_new_session;

    return jsonb_build_object(
      'success', true,
      'action', 'rollover',
      'completedSessionId', p_session_id,
      'activeSession', to_jsonb(v_new_session)
    );
  end if;

  -- If 'clear', fresh empty active session
  insert into public.grocery_sessions (
    id, user_id, status, started_at, updated_at, revision,
    recipes, custom_items, item_overrides
  )
  values (
    p_new_session_id, v_user_id, 'active', clock_timestamp(), clock_timestamp(), 1,
    '[]'::jsonb, '[]'::jsonb, '{}'::jsonb
  )
  returning * into v_new_session;

  return jsonb_build_object(
    'success', true,
    'action', 'clear',
    'completedSessionId', p_session_id,
    'activeSession', to_jsonb(v_new_session)
  );
end;
$$;

revoke all on function public.complete_grocery_session(uuid, text, jsonb, uuid, bigint) from public, anon;
grant execute on function public.complete_grocery_session(uuid, text, jsonb, uuid, bigint) to authenticated;
