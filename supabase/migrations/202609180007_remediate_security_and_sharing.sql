-- Migration: 202609180007_remediate_security_and_sharing.sql
-- Description: Security remediation pass:
-- 1. Make share tokens immutable (revoke UPDATE on public.recipe_shares to prevent share repointing)
-- 2. Capability-based favorite promotion via public.favorite_shared_recipe RPC
-- 3. Restrict public.favorites INSERT to owned/system recipes (shared recipes must use RPC)
-- 4. Allow cooking progress on favorited recipes in public.recipe_progress
-- 5. Harden complete_grocery_session: require expected revision & validate rollover custom items
-- 6. Downgrade validate_recipe_payload_trigger to SECURITY INVOKER with revoked public execution
-- 7. Durable server-authoritative rate limiting (private.ai_rate_limits & private.consume_ai_quota for service_role)

-- =============================================================================
-- 1. Make share tokens immutable (Prevent Share Repointing)
-- =============================================================================
drop policy if exists "Owners update recipe shares" on public.recipe_shares;
revoke update on table public.recipe_shares from public, anon, authenticated;

-- =============================================================================
-- 2. Capability-based Favorite Promotion RPC: favorite_shared_recipe
-- =============================================================================
create or replace function public.favorite_shared_recipe(p_share_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_recipe_id text;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_share_token is null or trim(p_share_token) !~ '^[A-Za-z0-9_-]{16,64}$' then
    raise exception 'Invalid share token format';
  end if;

  select recipe_id into v_recipe_id
  from public.recipe_shares
  where share_token = trim(p_share_token)
    and revoked_at is null
    and (expires_at is null or expires_at > now());

  if v_recipe_id is null then
    raise exception 'Shared recipe not found or share has expired';
  end if;

  insert into public.favorites (user_id, recipe_id)
  values (v_user_id, v_recipe_id)
  on conflict do nothing;

  return jsonb_build_object(
    'success', true,
    'recipe_id', v_recipe_id
  );
end;
$$;

revoke all on function public.favorite_shared_recipe(text) from public, anon;
grant execute on function public.favorite_shared_recipe(text) to authenticated;

-- =============================================================================
-- 3. Restrict public.favorites INSERT: Only owned or system recipes directly
-- =============================================================================
drop policy if exists "Users create their own favorites" on public.favorites;
create policy "Users create their own favorites"
on public.favorites for insert to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.recipes
    where recipes.id = favorites.recipe_id
      and (recipes.is_system or recipes.owner_id = (select auth.uid()))
  )
);

-- =============================================================================
-- 4. Allow cooking progress on system, owned, and favorited recipes
-- =============================================================================
drop policy if exists "Users create their own progress" on public.recipe_progress;
create policy "Users create their own progress"
on public.recipe_progress for insert to authenticated
with check (
  user_id = (select auth.uid()) and
  exists (
    select 1
    from public.recipes
    where recipes.id = recipe_progress.recipe_id
      and (
        recipes.is_system
        or recipes.owner_id = (select auth.uid())
        or exists (
          select 1 from public.favorites
          where favorites.recipe_id = recipe_progress.recipe_id
            and favorites.user_id = (select auth.uid())
        )
      )
  )
);

drop policy if exists "Users update their own progress" on public.recipe_progress;
create policy "Users update their own progress"
on public.recipe_progress for update to authenticated
using (user_id = (select auth.uid()))
with check (
  user_id = (select auth.uid()) and
  exists (
    select 1
    from public.recipes
    where recipes.id = recipe_progress.recipe_id
      and (
        recipes.is_system
        or recipes.owner_id = (select auth.uid())
        or exists (
          select 1 from public.favorites
          where favorites.recipe_id = recipe_progress.recipe_id
            and favorites.user_id = (select auth.uid())
        )
      )
  )
);

-- =============================================================================
-- 5. Harden complete_grocery_session: require revision & validate rollover items
-- =============================================================================
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
  v_sanitized_rollover jsonb := '[]'::jsonb;
  v_item jsonb;
  v_item_id text;
  v_item_name text;
  v_item_cat text;
  v_item_note text;
  v_item_unit text;
  v_item_status text;
  v_now_ms bigint;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_session_id is null or p_new_session_id is null then
    raise exception 'Both current and new session UUIDs are required';
  end if;

  -- 1. Enforce non-null expected revision
  if p_expected_revision is null then
    return jsonb_build_object(
      'success', false,
      'code', 'REVISION_REQUIRED',
      'message', 'Expected revision is required to complete session'
    );
  end if;

  -- 2. Validate action enum
  if p_action not in ('clear', 'rollover') then
    return jsonb_build_object(
      'success', false,
      'code', 'INVALID_ACTION',
      'message', 'Action must be clear or rollover'
    );
  end if;

  v_now_ms := (extract(epoch from clock_timestamp()) * 1000)::bigint;

  -- 3. Validate rollover payload if action is rollover
  if p_action = 'rollover' and p_rollover_custom_items is not null then
    if jsonb_typeof(p_rollover_custom_items) != 'array' then
      return jsonb_build_object(
        'success', false,
        'code', 'INVALID_ROLLOVER_ITEMS',
        'message', 'Rollover custom items must be a JSON array'
      );
    end if;

    if jsonb_array_length(p_rollover_custom_items) > 500 then
      return jsonb_build_object(
        'success', false,
        'code', 'ROLLOVER_LIMIT_EXCEEDED',
        'message', 'Rollover custom items cannot exceed 500'
      );
    end if;

    -- Deep validation of each custom item matching apply_grocery_mutations invariants
    for v_item in select * from jsonb_array_elements(p_rollover_custom_items) loop
      if jsonb_typeof(v_item) != 'object' then
        continue;
      end if;

      v_item_id := v_item ->> 'id';
      if v_item_id is null or length(trim(v_item_id)) = 0 or length(v_item_id) > 100 or v_item_id ~ '[\x00-\x1f]' then
        continue;
      end if;

      v_item_name := trim(coalesce(v_item ->> 'name', ''));
      if length(v_item_name) = 0 then
        v_item_name := 'Custom Item';
      elsif length(v_item_name) > 250 then
        v_item_name := substring(v_item_name from 1 for 250);
      end if;

      v_item_cat := trim(coalesce(v_item ->> 'category', 'Household & Other'));
      if length(v_item_cat) > 100 then
        v_item_cat := substring(v_item_cat from 1 for 100);
      end if;

      v_item_note := trim(coalesce(v_item ->> 'note', ''));
      if length(v_item_note) > 1000 then
        v_item_note := substring(v_item_note from 1 for 1000);
      end if;

      v_item_unit := trim(coalesce(v_item ->> 'unit', ''));
      if length(v_item_unit) > 50 then
        v_item_unit := substring(v_item_unit from 1 for 50);
      end if;

      v_item_status := coalesce(v_item ->> 'status', 'unchecked');
      if v_item_status not in ('checked', 'unchecked') then
        v_item_status := 'unchecked';
      end if;

      v_sanitized_rollover := v_sanitized_rollover || jsonb_build_object(
        'id', v_item_id,
        'name', v_item_name,
        'quantity', case when (v_item -> 'quantity') is not null and (jsonb_typeof(v_item -> 'quantity') = 'number' or length(v_item ->> 'quantity') <= 50) then v_item -> 'quantity' else null end,
        'unit', v_item_unit,
        'category', v_item_cat,
        'note', v_item_note,
        'status', v_item_status,
        'updatedAt', v_now_ms
      );
    end loop;
  end if;

  -- 4. Lock existing active session row
  select * into v_session
  from public.grocery_sessions
  where id = p_session_id and user_id = v_user_id
  for update;

  if not found then
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

  -- 5. Validate expected revision
  if v_session.revision != p_expected_revision then
    return jsonb_build_object(
      'success', false,
      'code', 'REVISION_CONFLICT',
      'currentRevision', v_session.revision,
      'session', to_jsonb(v_session)
    );
  end if;

  -- 6. Mark current session completed
  update public.grocery_sessions
  set
    status = 'completed',
    completed_at = clock_timestamp(),
    updated_at = clock_timestamp(),
    revision = v_session.revision + 1
  where id = p_session_id and user_id = v_user_id;

  -- 7. Insert new active session
  if p_action = 'rollover' then
    insert into public.grocery_sessions (
      id, user_id, status, started_at, updated_at, revision,
      recipes, custom_items, item_overrides
    )
    values (
      p_new_session_id, v_user_id, 'active', clock_timestamp(), clock_timestamp(), 1,
      '[]'::jsonb, v_sanitized_rollover, '{}'::jsonb
    )
    returning * into v_new_session;

    return jsonb_build_object(
      'success', true,
      'action', 'rollover',
      'completedSessionId', p_session_id,
      'activeSession', to_jsonb(v_new_session)
    );
  end if;

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

-- =============================================================================
-- 6. Least Privilege for Recipe Payload Trigger
-- =============================================================================
create or replace function public.validate_recipe_payload_trigger()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_payload jsonb := new.payload;
  v_item jsonb;
  v_idx int;
  v_len int;
  v_num numeric;
  v_str text;
begin
  -- 1. Ensure payload is a JSON object and size <= 512KB
  if v_payload is null or pg_catalog.jsonb_typeof(v_payload) != 'object' then
    raise exception 'Recipe payload must be a JSON object';
  end if;
  if pg_catalog.octet_length(v_payload::text) > 524288 then
    raise exception 'Recipe payload exceeds maximum allowed size (512 KB)';
  end if;

  -- 2. Validate ID
  if new.id is null or new.id !~ '^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$' then
    raise exception 'Recipe id is invalid';
  end if;
  if (v_payload ->> 'id') is distinct from new.id then
    raise exception 'Recipe payload id does not match table id';
  end if;

  -- 3. Title: required, string, 1..200 chars
  v_str := trim(coalesce(v_payload ->> 'title', ''));
  if length(v_str) < 1 or length(v_str) > 200 then
    raise exception 'Recipe title must be between 1 and 200 characters';
  end if;

  -- 4. Category: required, string, 1..100 chars
  v_str := trim(coalesce(v_payload ->> 'category', ''));
  if length(v_str) < 1 or length(v_str) > 100 then
    raise exception 'Recipe category must be between 1 and 100 characters';
  end if;

  -- 5. Servings: required, numeric between 1 and 100
  if not (v_payload ? 'servings') or (v_payload ->> 'servings') is null then
    raise exception 'Recipe servings is required';
  end if;
  begin
    v_num := (v_payload ->> 'servings')::numeric;
  exception when others then
    raise exception 'Recipe servings must be a number between 1 and 100';
  end;
  if v_num < 1 or v_num > 100 then
    raise exception 'Recipe servings must be between 1 and 100';
  end if;

  -- 6. Prep, cook, rest minutes: if present, 0..10080
  foreach v_str in array array['prepMinutes', 'cookMinutes', 'restMinutes'] loop
    if (v_payload ? v_str) and (v_payload ->> v_str) is not null and (v_payload ->> v_str) != '' then
      begin
        v_num := (v_payload ->> v_str)::numeric;
      exception when others then
        raise exception 'Recipe % must be a valid number', v_str;
      end;
      if v_num < 0 or v_num > 10080 then
        raise exception 'Recipe % must be between 0 and 10080', v_str;
      end if;
    end if;
  end loop;

  -- 7. Ingredients: array, 1..200 items
  if not (v_payload ? 'ingredients') or pg_catalog.jsonb_typeof(v_payload -> 'ingredients') != 'array' then
    raise exception 'Recipe ingredients must be an array';
  end if;
  v_len := pg_catalog.jsonb_array_length(v_payload -> 'ingredients');
  if v_len < 1 or v_len > 200 then
    raise exception 'Recipe ingredients array must contain between 1 and 200 items';
  end if;

  for v_idx in 0 .. (v_len - 1) loop
    v_item := (v_payload -> 'ingredients') -> v_idx;
    if pg_catalog.jsonb_typeof(v_item) != 'object' then
      raise exception 'Ingredient at index % must be an object', v_idx;
    end if;
    v_str := trim(coalesce(v_item ->> 'name', ''));
    if length(v_str) < 1 or length(v_str) > 300 then
      raise exception 'Ingredient at index % must have a name between 1 and 300 characters', v_idx;
    end if;
    if (v_item ? 'quantity') and (v_item ->> 'quantity') is not null and (v_item ->> 'quantity') != '' then
      begin
        v_num := (v_item ->> 'quantity')::numeric;
      exception when others then
        raise exception 'Ingredient quantity at index % must be numeric', v_idx;
      end;
      if v_num < 0 or v_num > 100000 then
        raise exception 'Ingredient quantity at index % must be between 0 and 100000', v_idx;
      end if;
    end if;
    if (v_item ? 'unit') and length(coalesce(v_item ->> 'unit', '')) > 50 then
      raise exception 'Ingredient unit at index % exceeds 50 characters', v_idx;
    end if;
    if (v_item ? 'note') and length(coalesce(v_item ->> 'note', '')) > 500 then
      raise exception 'Ingredient note at index % exceeds 500 characters', v_idx;
    end if;
    if (v_item ? 'group') and length(coalesce(v_item ->> 'group', '')) > 100 then
      raise exception 'Ingredient group at index % exceeds 100 characters', v_idx;
    end if;
  end loop;

  -- 8. Steps: array, 1..150 items
  if not (v_payload ? 'steps') or pg_catalog.jsonb_typeof(v_payload -> 'steps') != 'array' then
    raise exception 'Recipe steps must be an array';
  end if;
  v_len := pg_catalog.jsonb_array_length(v_payload -> 'steps');
  if v_len < 1 or v_len > 150 then
    raise exception 'Recipe steps array must contain between 1 and 150 items';
  end if;

  for v_idx in 0 .. (v_len - 1) loop
    v_item := (v_payload -> 'steps') -> v_idx;
    if pg_catalog.jsonb_typeof(v_item) != 'object' then
      raise exception 'Step at index % must be an object', v_idx;
    end if;
    v_str := trim(coalesce(v_item ->> 'instruction', ''));
    if length(v_str) < 1 or length(v_str) > 5000 then
      raise exception 'Step instruction at index % must be between 1 and 5000 characters', v_idx;
    end if;
    if (v_item ? 'title') and length(coalesce(v_item ->> 'title', '')) > 150 then
      raise exception 'Step title at index % exceeds 150 characters', v_idx;
    end if;
  end loop;

  -- 9. List fields (tags, keywords, notes, substitutions, equipment): max 100 items each
  foreach v_str in array array['tags', 'keywords', 'notes', 'substitutions', 'equipment'] loop
    if (v_payload ? v_str) and (v_payload -> v_str) is not null and pg_catalog.jsonb_typeof(v_payload -> v_str) != 'null' then
      if pg_catalog.jsonb_typeof(v_payload -> v_str) != 'array' then
        raise exception 'Recipe % must be an array', v_str;
      end if;
      if pg_catalog.jsonb_array_length(v_payload -> v_str) > 100 then
        raise exception 'Recipe % array cannot exceed 100 items', v_str;
      end if;
    end if;
  end loop;

  -- 10. Source video: must be https:// and <= 2000 chars if present
  if (v_payload ? 'sourceVideo') and coalesce(v_payload ->> 'sourceVideo', '') != '' then
    v_str := trim(v_payload ->> 'sourceVideo');
    if length(v_str) > 2000 or (v_str !~* '^https://') then
      raise exception 'Recipe sourceVideo must be an HTTPS URL up to 2000 characters';
    end if;
  end if;

  -- 11. Artwork: max 2000 chars, no dangerous javascript/data:text schemes
  if (v_payload ? 'artwork') and coalesce(v_payload ->> 'artwork', '') != '' then
    v_str := trim(v_payload ->> 'artwork');
    if length(v_str) > 2000 then
      raise exception 'Recipe artwork string cannot exceed 2000 characters';
    end if;
    if v_str ~* '^\s*(javascript|vbscript|data:(?!image/))' then
      raise exception 'Recipe artwork contains an invalid or prohibited scheme';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.validate_recipe_payload_trigger() from public, anon, authenticated;

-- =============================================================================
-- 7. Server-Authoritative Durable AI Rate Limiter (service_role only)
-- =============================================================================
create table if not exists private.ai_rate_limits (
  key text primary key,
  count int not null default 1,
  window_start timestamptz not null default now(),
  reset_at timestamptz not null
);

revoke all on table private.ai_rate_limits from public, anon, authenticated;
grant all on table private.ai_rate_limits to service_role;

create or replace function private.consume_ai_quota(
  p_key text,
  p_limit int,
  p_window_seconds int
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_record record;
  v_count int;
  v_reset_at timestamptz;
begin
  if p_key is null or length(trim(p_key)) = 0 then
    raise exception 'Rate limit key is required';
  end if;

  select * into v_record
  from private.ai_rate_limits
  where key = p_key
  for update;

  if not found or v_record.reset_at <= v_now then
    v_reset_at := v_now + (p_window_seconds || ' seconds')::interval;
    insert into private.ai_rate_limits (key, count, window_start, reset_at)
    values (p_key, 1, v_now, v_reset_at)
    on conflict (key) do update
    set count = 1, window_start = v_now, reset_at = v_reset_at;

    return jsonb_build_object(
      'allowed', true,
      'count', 1,
      'remaining', greatest(0, p_limit - 1),
      'reset_at', v_reset_at,
      'retry_after_seconds', 0
    );
  end if;

  if v_record.count >= p_limit then
    return jsonb_build_object(
      'allowed', false,
      'count', v_record.count,
      'remaining', 0,
      'reset_at', v_record.reset_at,
      'retry_after_seconds', greatest(1, ceil(extract(epoch from (v_record.reset_at - v_now))))::int
    );
  end if;

  update private.ai_rate_limits
  set count = count + 1
  where key = p_key
  returning count into v_count;

  return jsonb_build_object(
    'allowed', true,
    'count', v_count,
    'remaining', greatest(0, p_limit - v_count),
    'reset_at', v_record.reset_at,
    'retry_after_seconds', 0
  );
end;
$$;

revoke all on function private.consume_ai_quota(text, int, int) from public, anon, authenticated;
grant execute on function private.consume_ai_quota(text, int, int) to service_role;
