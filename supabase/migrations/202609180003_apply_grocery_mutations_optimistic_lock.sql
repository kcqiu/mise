-- Migration: 202609180003_apply_grocery_mutations_optimistic_lock.sql
-- Enforce optimistic concurrency control in apply_grocery_mutations:
-- Reject mutations with REVISION_CONFLICT when p_expected_revision != v_session.revision,
-- returning the authoritative current session and revision for client-side rebasing.

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

  -- 2. Validate expected revision for optimistic concurrency control
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

  -- 3. Process each mutation in serial order
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
        v_overrides := jsonb_set(
          v_overrides,
          array[v_target_id],
          coalesce(v_overrides -> v_target_id, '{}'::jsonb) || jsonb_build_object(
            'checked', coalesce((v_payload ->> 'checked')::boolean, false),
            'checkedAt', case when (v_payload ->> 'checked')::boolean then v_now_ms else null end,
            'updatedAt', v_now_ms
          )
        );
        v_applied_count := v_applied_count + 1;
        v_ack_ids := v_ack_ids || to_jsonb(v_mut_id);

        insert into public.grocery_mutation_log (mutation_id, session_id, user_id, mutation_type, observed_revision)
        values (v_mut_id, p_session_id, v_user_id, v_type, v_obs_rev);

      elsif v_type = 'ITEM_DELETED' and v_target_id is not null then
        v_overrides := jsonb_set(
          v_overrides,
          array[v_target_id],
          coalesce(v_overrides -> v_target_id, '{}'::jsonb) || jsonb_build_object(
            'deleted', true,
            'deletedAt', v_now_ms,
            'updatedAt', v_now_ms
          )
        );
        v_applied_count := v_applied_count + 1;
        v_ack_ids := v_ack_ids || to_jsonb(v_mut_id);

        insert into public.grocery_mutation_log (mutation_id, session_id, user_id, mutation_type, observed_revision)
        values (v_mut_id, p_session_id, v_user_id, v_type, v_obs_rev);

      elsif v_type = 'CUSTOM_ITEM_ADDED' and v_target_id is not null then
        v_custom_map := jsonb_set(
          v_custom_map,
          array[v_target_id],
          jsonb_build_object(
            'id', v_target_id,
            'name', coalesce(v_payload ->> 'name', 'Custom Item'),
            'category', coalesce(v_payload ->> 'category', 'Pantry & dry goods'),
            'checked', coalesce((v_payload ->> 'checked')::boolean, false),
            'checkedAt', case when (v_payload ->> 'checked')::boolean then v_now_ms else null end,
            'createdAt', v_now_ms,
            'updatedAt', v_now_ms
          )
        );
        v_applied_count := v_applied_count + 1;
        v_ack_ids := v_ack_ids || to_jsonb(v_mut_id);

        insert into public.grocery_mutation_log (mutation_id, session_id, user_id, mutation_type, observed_revision)
        values (v_mut_id, p_session_id, v_user_id, v_type, v_obs_rev);

      elsif v_type = 'RECIPE_ADDED' and v_target_id is not null then
        -- Append recipe if not already present; update servings if present
        v_updated := false;
        select jsonb_agg(
          case
            when (elem ->> 'recipeId') = v_target_id then
              v_mutation -> 'payload'
            else elem
          end
        ) into v_recipes
        from jsonb_array_elements(v_recipes) as elem;

        if v_recipes is null then
          v_recipes := '[]'::jsonb;
        end if;

        if not exists (
          select 1 from jsonb_array_elements(v_recipes) elem
          where (elem ->> 'recipeId') = v_target_id
        ) then
          v_recipes := v_recipes || jsonb_build_array(v_payload);
        end if;

        v_applied_count := v_applied_count + 1;
        v_ack_ids := v_ack_ids || to_jsonb(v_mut_id);

        insert into public.grocery_mutation_log (mutation_id, session_id, user_id, mutation_type, observed_revision)
        values (v_mut_id, p_session_id, v_user_id, v_type, v_obs_rev);

      elsif v_type = 'RECIPE_REMOVED' and v_target_id is not null then
        select coalesce(jsonb_agg(elem), '[]'::jsonb) into v_recipes
        from jsonb_array_elements(v_recipes) as elem
        where (elem ->> 'recipeId') != v_target_id;

        v_applied_count := v_applied_count + 1;
        v_ack_ids := v_ack_ids || to_jsonb(v_mut_id);

        insert into public.grocery_mutation_log (mutation_id, session_id, user_id, mutation_type, observed_revision)
        values (v_mut_id, p_session_id, v_user_id, v_type, v_obs_rev);

      elsif v_type = 'RECIPE_SERVINGS_CHANGED' and v_target_id is not null then
        select coalesce(jsonb_agg(
          case
            when (elem ->> 'recipeId') = v_target_id then
              elem || jsonb_build_object('servings', (v_payload ->> 'servings')::numeric)
            else elem
          end
        ), '[]'::jsonb) into v_recipes
        from jsonb_array_elements(v_recipes) as elem;

        v_applied_count := v_applied_count + 1;
        v_ack_ids := v_ack_ids || to_jsonb(v_mut_id);

        insert into public.grocery_mutation_log (mutation_id, session_id, user_id, mutation_type, observed_revision)
        values (v_mut_id, p_session_id, v_user_id, v_type, v_obs_rev);

      elsif v_type = 'CUSTOM_ITEM_RESTORED' and v_target_id is not null then
        v_overrides := jsonb_set(
          v_overrides,
          array[v_target_id],
          coalesce(v_overrides -> v_target_id, '{}'::jsonb) || jsonb_build_object(
            'deleted', false,
            'updatedAt', v_now_ms
          )
        );
        v_applied_count := v_applied_count + 1;
        v_ack_ids := v_ack_ids || to_jsonb(v_mut_id);

        insert into public.grocery_mutation_log (mutation_id, session_id, user_id, mutation_type, observed_revision)
        values (v_mut_id, p_session_id, v_user_id, v_type, v_obs_rev);

      elsif v_type = 'CLEARED_COMPLETED_ITEMS' then
        -- Mark all checked custom items as deleted, all checked recipe items as deleted
        for v_elem in select * from jsonb_array_elements(v_custom) loop
          v_elem_id := v_elem ->> 'id';
          if coalesce((v_elem ->> 'checked')::boolean, false) then
            v_custom_map := jsonb_set(
              v_custom_map,
              array[v_elem_id],
              (v_elem || jsonb_build_object('deleted', true, 'deletedAt', v_now_ms, 'updatedAt', v_now_ms))
            );
          end if;
        end loop;

        -- Process recipe checked items in overrides
        for v_elem_id in select jsonb_object_keys(v_overrides) loop
          if coalesce((v_overrides -> v_elem_id ->> 'checked')::boolean, false) then
            v_overrides := jsonb_set(
              v_overrides,
              array[v_elem_id],
              (v_overrides -> v_elem_id) || jsonb_build_object('deleted', true, 'deletedAt', v_now_ms, 'updatedAt', v_now_ms)
            );
          end if;
        end loop;

        v_applied_count := v_applied_count + 1;
        v_ack_ids := v_ack_ids || to_jsonb(v_mut_id);

        insert into public.grocery_mutation_log (mutation_id, session_id, user_id, mutation_type, observed_revision)
        values (v_mut_id, p_session_id, v_user_id, v_type, v_obs_rev);
      end if;

      v_ack_ids := v_ack_ids || to_jsonb(v_mut_id);
    end loop;
  end if;

  select coalesce(jsonb_agg(value), '[]'::jsonb) into v_custom
  from jsonb_each(v_custom_map);

  -- 4. Update database row if any mutations applied
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
