-- Migration: Validate recipe payload invariants
-- Description: Enforce server-side schema invariants on public.recipes via a BEFORE INSERT OR UPDATE trigger.

create or replace function public.validate_recipe_payload_trigger()
returns trigger
language plpgsql
security definer
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

drop trigger if exists trg_validate_recipe_payload on public.recipes;
create trigger trg_validate_recipe_payload
before insert or update on public.recipes
for each row execute function public.validate_recipe_payload_trigger();
