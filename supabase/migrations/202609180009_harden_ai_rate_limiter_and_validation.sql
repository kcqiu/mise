-- Migration: 202609180009_harden_ai_rate_limiter_and_validation.sql
-- Description:
-- 1. Atomic AI rate limiter: Replace SELECT...FOR UPDATE with a single atomic UPSERT in private.consume_ai_quota
--    to prevent undercounting race conditions on brand-new or expiring keys across serverless workers.
-- 2. Deep payload validation: Ensure array elements in tags, keywords, notes, substitutions, and equipment
--    are validated strings (<= 1000 chars), and scalar fields (cuisine, description, method) are strings (<= 2000 chars).

-- =============================================================================
-- 1. Atomic Durable AI Rate Limiter (service_role only)
-- =============================================================================
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
  v_new_reset_at timestamptz;
  v_count int;
  v_reset_at timestamptz;
  v_allowed boolean;
begin
  if p_key is null or length(trim(p_key)) = 0 then
    raise exception 'Rate limit key is required';
  end if;

  if p_limit is null or p_limit <= 0 then
    raise exception 'Limit must be greater than zero';
  end if;

  if p_window_seconds is null or p_window_seconds <= 0 then
    raise exception 'Window seconds must be greater than zero';
  end if;

  v_new_reset_at := v_now + (p_window_seconds || ' seconds')::interval;

  -- Single atomic UPSERT to eliminate concurrency race conditions on missing/expiring rows
  insert into private.ai_rate_limits as r (key, count, window_start, reset_at)
  values (p_key, 1, v_now, v_new_reset_at)
  on conflict (key) do update
  set
    count = case
      when r.reset_at <= v_now then 1
      else least(p_limit + 1, r.count + 1)
    end,
    window_start = case
      when r.reset_at <= v_now then v_now
      else r.window_start
    end,
    reset_at = case
      when r.reset_at <= v_now then v_new_reset_at
      else r.reset_at
    end
  returning r.count, r.reset_at into v_count, v_reset_at;

  v_allowed := (v_count <= p_limit);

  return jsonb_build_object(
    'allowed', v_allowed,
    'count', v_count,
    'remaining', greatest(0, p_limit - v_count),
    'reset_at', v_reset_at,
    'retry_after_seconds', case
      when v_allowed then 0
      else greatest(1, ceil(extract(epoch from (v_reset_at - v_now))))::int
    end
  );
end;
$$;

revoke all on function private.consume_ai_quota(text, int, int) from public, anon, authenticated;
grant execute on function private.consume_ai_quota(text, int, int) to service_role;

-- =============================================================================
-- 2. Strengthen Recipe Payload Validation Trigger (SECURITY INVOKER)
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

  -- 7. Optional scalar text fields: description, cuisine, method (must be string and <= 2000 chars)
  foreach v_str in array array['description', 'cuisine', 'method'] loop
    if (v_payload ? v_str) and (v_payload -> v_str) is not null and pg_catalog.jsonb_typeof(v_payload -> v_str) != 'null' then
      if pg_catalog.jsonb_typeof(v_payload -> v_str) != 'string' then
        raise exception 'Recipe % must be text', v_str;
      end if;
      if length(v_payload ->> v_str) > 2000 then
        raise exception 'Recipe % exceeds 2000 characters', v_str;
      end if;
    end if;
  end loop;

  -- 8. Ingredients: array, 1..200 items
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

  -- 9. Steps: array, 1..150 items
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

  -- 10. List fields (tags, keywords, notes, substitutions, equipment): max 100 items each, each item must be a string <= 1000 chars
  foreach v_str in array array['tags', 'keywords', 'notes', 'substitutions', 'equipment'] loop
    if (v_payload ? v_str) and (v_payload -> v_str) is not null and pg_catalog.jsonb_typeof(v_payload -> v_str) != 'null' then
      if pg_catalog.jsonb_typeof(v_payload -> v_str) != 'array' then
        raise exception 'Recipe % must be an array', v_str;
      end if;
      v_len := pg_catalog.jsonb_array_length(v_payload -> v_str);
      if v_len > 100 then
        raise exception 'Recipe % array cannot exceed 100 items', v_str;
      end if;
      for v_idx in 0 .. (v_len - 1) loop
        v_item := (v_payload -> v_str) -> v_idx;
        if pg_catalog.jsonb_typeof(v_item) != 'string' then
          raise exception 'Each item in recipe % must be a string', v_str;
        end if;
        if length(v_item #>> '{}') > 1000 then
          raise exception 'Each item in recipe % cannot exceed 1000 characters', v_str;
        end if;
      end loop;
    end if;
  end loop;

  -- 11. Source video: must be https:// and <= 2000 chars if present
  if (v_payload ? 'sourceVideo') and coalesce(v_payload ->> 'sourceVideo', '') != '' then
    v_str := trim(v_payload ->> 'sourceVideo');
    if length(v_str) > 2000 or (v_str !~* '^https://') then
      raise exception 'Recipe sourceVideo must be an HTTPS URL up to 2000 characters';
    end if;
  end if;

  -- 12. Artwork: max 2000 chars, no dangerous javascript/data:text schemes
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
