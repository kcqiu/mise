-- Migration: 202609180004_harden_grocery_rpcs.sql
-- Harden SECURITY DEFINER grocery RPCs against hostile input:
-- - Maximum 100 mutations per batch
-- - Strict mutation type allowlist
-- - Strict UUID regex validation for mutation IDs
-- - Target ID length (max 100 chars) and control char validation
-- - Recipe servings bounds (1 to 100)
-- - Custom item name length (1 to 250), category (max 100), note (max 1000), unit (max 50)
-- - Item status enum validation ('checked', 'unchecked')
-- - Session capacity limits (max 500 custom items, max 100 recipes)
-- - Rejection of unhandled/malformed mutations without ACK or log entry
-- - Complete session action validation ('clear', 'rollover') and rollover array limit (max 500)

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
  v_mut_id_text text;
  v_type text;
  v_target_id text;
  v_payload jsonb;
  v_obs_rev bigint;
  v_obs_rev_text text;
  v_res record;
  v_custom_map jsonb := '{}'::jsonb;
  v_elem jsonb;
  v_elem_id text;
  v_updated boolean;
  v_status text;
  v_servings_text text;
  v_servings numeric;
  v_item_name text;
  v_item_cat text;
  v_item_note text;
  v_item_unit text;
  v_existing_item jsonb;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_session_id is null then
    raise exception 'Session ID is required';
  end if;

  -- 1. Validate mutation batch payload shape and size
  if p_mutations is null or jsonb_typeof(p_mutations) != 'array' then
    return jsonb_build_object(
      'success', false,
      'code', 'INVALID_MUTATIONS_PAYLOAD',
      'message', 'p_mutations must be a JSON array'
    );
  end if;

  if jsonb_array_length(p_mutations) > 100 then
    return jsonb_build_object(
      'success', false,
      'code', 'MUTATION_BATCH_TOO_LARGE',
      'message', 'Mutation batch exceeds maximum allowed limit of 100'
    );
  end if;

  v_now_ms := (extract(epoch from clock_timestamp()) * 1000)::bigint;

  -- 2. Lock active session row
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

  -- 3. Validate expected revision for optimistic concurrency control
  if p_expected_revision is not null and v_session.revision != p_expected_revision then
    return jsonb_build_object(
      'success', false,
      'code', 'REVISION_CONFLICT',
      'sessionId', p_session_id,
      'currentRevision', v_session.revision,
      'session', to_jsonb(v_session),
      'currentSession', to_jsonb(v_session)
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

  -- 4. Process each mutation with strict input validation
  for v_mutation in select * from jsonb_array_elements(p_mutations) loop
    -- Mutation item must be a JSON object
    if jsonb_typeof(v_mutation) != 'object' then
      continue;
    end if;

    -- Mutation ID must be a valid UUID format
    v_mut_id_text := v_mutation ->> 'mutationId';
    if v_mut_id_text is null or v_mut_id_text !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
      continue;
    end if;
    v_mut_id := v_mut_id_text::uuid;

    -- Idempotency check: skip already applied mutation
    if exists (select 1 from public.grocery_mutation_log where mutation_id = v_mut_id) then
      v_ack_ids := v_ack_ids || to_jsonb(v_mut_id);
      continue;
    end if;

    -- Type must be in strict allowlist
    v_type := v_mutation ->> 'type';
    if v_type not in (
      'ITEM_STATUS_CHANGED',
      'ITEM_DISMISSED',
      'ITEM_RESTORED',
      'PANTRY_ITEM_PROMOTED',
      'CUSTOM_ITEM_ADDED',
      'CUSTOM_ITEM_EDITED',
      'CUSTOM_ITEM_DELETED',
      'RECIPE_ADDED',
      'RECIPE_REMOVED',
      'RECIPE_SERVINGS_CHANGED'
    ) then
      continue;
    end if;

    -- Target ID must be non-empty and bounded (max 100 chars, no control chars)
    v_target_id := v_mutation ->> 'targetId';
    if v_target_id is null or length(trim(v_target_id)) = 0 or length(v_target_id) > 100 or v_target_id ~ '[\x00-\x1f]' then
      continue;
    end if;

    -- Payload must be an object
    v_payload := v_mutation -> 'payload';
    if v_payload is null or jsonb_typeof(v_payload) != 'object' then
      v_payload := '{}'::jsonb;
    end if;

    -- Observed revision parsing
    v_obs_rev_text := v_mutation ->> 'observedRevision';
    if v_obs_rev_text is not null and v_obs_rev_text ~ '^[0-9]+$' then
      v_obs_rev := v_obs_rev_text::bigint;
    else
      v_obs_rev := null;
    end if;

    -- Specific mutation handlers with strict bounds
    if v_type = 'ITEM_STATUS_CHANGED' then
      v_status := v_payload ->> 'status';
      if v_status not in ('checked', 'unchecked') then
        continue;
      end if;

      if not (v_overrides ? v_target_id and v_overrides -> v_target_id ->> 'status' = 'dismissed') then
        v_overrides := jsonb_set(
          v_overrides,
          array[v_target_id],
          jsonb_build_object('status', v_status, 'updatedAt', v_now_ms)
        );
        v_applied_count := v_applied_count + 1;
      end if;

    elsif v_type = 'ITEM_DISMISSED' then
      v_overrides := jsonb_set(
        v_overrides,
        array[v_target_id],
        jsonb_build_object('status', 'dismissed', 'updatedAt', v_now_ms)
      );
      v_applied_count := v_applied_count + 1;

    elsif v_type = 'ITEM_RESTORED' then
      v_overrides := jsonb_set(
        v_overrides,
        array[v_target_id],
        jsonb_build_object('status', 'unchecked', 'updatedAt', v_now_ms)
      );
      v_applied_count := v_applied_count + 1;

    elsif v_type = 'PANTRY_ITEM_PROMOTED' then
      v_overrides := jsonb_set(
        v_overrides,
        array[v_target_id],
        jsonb_build_object('status', 'unchecked', 'isPantryPromoted', true, 'updatedAt', v_now_ms)
      );
      v_applied_count := v_applied_count + 1;

    elsif v_type = 'CUSTOM_ITEM_ADDED' then
      v_item_name := trim(coalesce(v_payload ->> 'name', ''));
      if length(v_item_name) = 0 then
        v_item_name := 'Custom Item';
      elsif length(v_item_name) > 250 then
        v_item_name := substring(v_item_name from 1 for 250);
      end if;

      v_item_cat := trim(coalesce(v_payload ->> 'category', 'Household & Other'));
      if length(v_item_cat) > 100 then
        v_item_cat := substring(v_item_cat from 1 for 100);
      end if;

      v_item_note := trim(coalesce(v_payload ->> 'note', ''));
      if length(v_item_note) > 1000 then
        v_item_note := substring(v_item_note from 1 for 1000);
      end if;

      v_item_unit := trim(coalesce(v_payload ->> 'unit', ''));
      if length(v_item_unit) > 50 then
        v_item_unit := substring(v_item_unit from 1 for 50);
      end if;

      -- Check custom items limit
      if not (v_custom_map ? v_target_id) and (select count(*) from jsonb_each(v_custom_map)) >= 500 then
        continue;
      end if;

      v_custom_map := jsonb_set(
        v_custom_map,
        array[v_target_id],
        jsonb_build_object(
          'id', v_target_id,
          'name', v_item_name,
          'quantity', case when (v_payload -> 'quantity') is not null and (jsonb_typeof(v_payload -> 'quantity') = 'number' or length(v_payload ->> 'quantity') <= 50) then v_payload -> 'quantity' else null end,
          'unit', v_item_unit,
          'category', v_item_cat,
          'note', v_item_note,
          'status', 'unchecked',
          'updatedAt', v_now_ms
        )
      );
      v_applied_count := v_applied_count + 1;

    elsif v_type = 'CUSTOM_ITEM_EDITED' then
      if v_custom_map ? v_target_id then
        v_existing_item := v_custom_map -> v_target_id;

        v_item_name := trim(coalesce(v_payload ->> 'name', v_existing_item ->> 'name', 'Custom Item'));
        if length(v_item_name) > 250 then
          v_item_name := substring(v_item_name from 1 for 250);
        end if;

        v_item_cat := trim(coalesce(v_payload ->> 'category', v_existing_item ->> 'category', 'Household & Other'));
        if length(v_item_cat) > 100 then
          v_item_cat := substring(v_item_cat from 1 for 100);
        end if;

        v_item_note := trim(coalesce(v_payload ->> 'note', v_existing_item ->> 'note', ''));
        if length(v_item_note) > 1000 then
          v_item_note := substring(v_item_note from 1 for 1000);
        end if;

        v_item_unit := trim(coalesce(v_payload ->> 'unit', v_existing_item ->> 'unit', ''));
        if length(v_item_unit) > 50 then
          v_item_unit := substring(v_item_unit from 1 for 50);
        end if;

        v_custom_map := jsonb_set(
          v_custom_map,
          array[v_target_id],
          jsonb_build_object(
            'id', v_target_id,
            'name', v_item_name,
            'quantity', case when (v_payload -> 'quantity') is not null and (jsonb_typeof(v_payload -> 'quantity') = 'number' or length(v_payload ->> 'quantity') <= 50) then v_payload -> 'quantity' else v_existing_item -> 'quantity' end,
            'unit', v_item_unit,
            'category', v_item_cat,
            'note', v_item_note,
            'status', coalesce(v_existing_item ->> 'status', 'unchecked'),
            'updatedAt', v_now_ms
          )
        );
        v_applied_count := v_applied_count + 1;
      end if;

    elsif v_type = 'CUSTOM_ITEM_DELETED' then
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

    elsif v_type = 'RECIPE_ADDED' then
      v_servings_text := coalesce(v_payload ->> 'servings', '2');
      if v_servings_text !~ '^[0-9]+(\.[0-9]+)?$' then
        continue;
      end if;
      v_servings := v_servings_text::numeric;
      if v_servings < 1 or v_servings > 100 then
        continue;
      end if;

      -- Check recipes limit
      if not exists (select 1 from jsonb_array_elements(v_recipes) elem where elem ->> 'recipeId' = v_target_id) then
        if jsonb_array_length(v_recipes) >= 100 then
          continue;
        end if;
      end if;

      v_updated := false;
      select coalesce(jsonb_agg(
        case
          when elem ->> 'recipeId' = v_target_id then
            jsonb_build_object('recipeId', v_target_id, 'servings', v_servings::int, 'addedAt', v_now_ms)
          else elem
        end
      ), '[]'::jsonb) into v_recipes
      from jsonb_array_elements(v_recipes) elem;

      if not exists (select 1 from jsonb_array_elements(v_recipes) elem where elem ->> 'recipeId' = v_target_id) then
        v_recipes := v_recipes || jsonb_build_object('recipeId', v_target_id, 'servings', v_servings::int, 'addedAt', v_now_ms);
      end if;
      v_applied_count := v_applied_count + 1;

    elsif v_type = 'RECIPE_REMOVED' then
      select coalesce(jsonb_agg(elem), '[]'::jsonb) into v_recipes
      from jsonb_array_elements(v_recipes) elem
      where elem ->> 'recipeId' != v_target_id;
      v_applied_count := v_applied_count + 1;

    elsif v_type = 'RECIPE_SERVINGS_CHANGED' then
      v_servings_text := coalesce(v_payload ->> 'nextServings', v_payload ->> 'servings');
      if v_servings_text is null or v_servings_text !~ '^[0-9]+(\.[0-9]+)?$' then
        continue;
      end if;
      v_servings := v_servings_text::numeric;
      if v_servings < 1 or v_servings > 100 then
        continue;
      end if;

      select coalesce(jsonb_agg(
        case
          when elem ->> 'recipeId' = v_target_id then
            jsonb_set(elem, array['servings'], to_jsonb(v_servings::int))
          else elem
        end
      ), '[]'::jsonb) into v_recipes
      from jsonb_array_elements(v_recipes) elem;
      v_applied_count := v_applied_count + 1;
    end if;

    -- Record handled mutation in log
    insert into public.grocery_mutation_log (
      mutation_id, session_id, user_id, mutation_type, observed_revision, applied_at
    )
    values (
      v_mut_id, p_session_id, v_user_id, v_type, v_obs_rev, clock_timestamp()
    );

    v_ack_ids := v_ack_ids || to_jsonb(v_mut_id);
  end loop;

  select coalesce(jsonb_agg(value), '[]'::jsonb) into v_custom
  from jsonb_each(v_custom_map);

  -- 5. Update database row if any mutations applied
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

-- Also update complete_grocery_session with strict input validation
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

  -- 1. Validate action enum
  if p_action not in ('clear', 'rollover') then
    return jsonb_build_object(
      'success', false,
      'code', 'INVALID_ACTION',
      'message', 'Action must be clear or rollover'
    );
  end if;

  -- 2. Validate rollover payload if action is rollover
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
  end if;

  -- 3. Lock existing active session row
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

  -- 4. Validate expected revision to protect against stale client rollover
  if p_expected_revision is not null and v_session.revision != p_expected_revision then
    return jsonb_build_object(
      'success', false,
      'code', 'REVISION_CONFLICT',
      'currentRevision', v_session.revision,
      'session', to_jsonb(v_session)
    );
  end if;

  -- 5. Mark current session completed
  update public.grocery_sessions
  set
    status = 'completed',
    completed_at = clock_timestamp(),
    updated_at = clock_timestamp(),
    revision = v_session.revision + 1
  where id = p_session_id;

  -- 6. Insert new active session
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
