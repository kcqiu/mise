-- Migration: 202609180001_capability_recipe_sharing.sql
-- Description: Replace open public SELECT on public.recipes with capability-based token sharing

-- 1. Drop the overly permissive SELECT policy on recipes
drop policy if exists "Recipes are viewable by everyone" on public.recipes;
drop policy if exists "System recipes are readable by everyone" on public.recipes;
drop policy if exists "Users read system and owned recipes" on public.recipes;
drop policy if exists "Users read system, owned, and favorited recipes" on public.recipes;

-- Anon can ONLY select system recipes
create policy "System recipes are readable by everyone"
on public.recipes for select to anon
using (is_system = true);

-- Authenticated can select system recipes, recipes they own, or recipes in their favorites
create policy "Users read system, owned, and favorited recipes"
on public.recipes for select to authenticated
using (
  is_system = true
  or owner_id = (select auth.uid())
  or exists (
    select 1 from public.favorites
    where favorites.recipe_id = recipes.id
      and favorites.user_id = (select auth.uid())
  )
);

-- 2. Create the recipe_shares table for capability tokens
create table if not exists public.recipe_shares (
  id uuid primary key default gen_random_uuid(),
  recipe_id text not null references public.recipes(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  share_token text not null unique,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  expires_at timestamptz
);

create index if not exists recipe_shares_token_idx on public.recipe_shares(share_token);
create index if not exists recipe_shares_recipe_id_idx on public.recipe_shares(recipe_id);
create index if not exists recipe_shares_owner_id_idx on public.recipe_shares(owner_id);

alter table public.recipe_shares enable row level security;

revoke all on table public.recipe_shares from public, anon, authenticated;
grant select, insert, update, delete on table public.recipe_shares to authenticated;

-- Owners can read their own shares
create policy "Owners read their recipe shares"
on public.recipe_shares for select to authenticated
using (owner_id = (select auth.uid()));

-- Owners can insert shares for recipes they own
create policy "Owners create recipe shares"
on public.recipe_shares for insert to authenticated
with check (
  owner_id = (select auth.uid())
  and exists (
    select 1 from public.recipes
    where recipes.id = recipe_shares.recipe_id
      and recipes.owner_id = (select auth.uid())
  )
);

-- Owners can update (e.g. revoke) their own shares
create policy "Owners update recipe shares"
on public.recipe_shares for update to authenticated
using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));

-- Owners can delete their own shares
create policy "Owners delete recipe shares"
on public.recipe_shares for delete to authenticated
using (owner_id = (select auth.uid()));

-- 3. Update public.favorites INSERT policy to allow favoriting active shared recipes
drop policy if exists "Users create their own favorites" on public.favorites;
create policy "Users create their own favorites"
on public.favorites for insert to authenticated
with check (
  user_id = (select auth.uid())
  and (
    exists (
      select 1
      from public.recipes
      where recipes.id = favorites.recipe_id
        and (recipes.is_system or recipes.owner_id = (select auth.uid()))
    )
    or exists (
      select 1
      from public.recipe_shares
      where recipe_shares.recipe_id = favorites.recipe_id
        and recipe_shares.revoked_at is null
        and (recipe_shares.expires_at is null or recipe_shares.expires_at > now())
    )
  )
);

-- 4. RPC: get_or_create_recipe_share(p_recipe_id text)
create or replace function public.get_or_create_recipe_share(p_recipe_id text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_token text;
  v_share record;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (
    select 1 from public.recipes
    where id = p_recipe_id and owner_id = v_user_id
  ) then
    raise exception 'Recipe not found or not owned by user';
  end if;

  -- Look for an existing active share
  select * into v_share
  from public.recipe_shares
  where recipe_id = p_recipe_id
    and owner_id = v_user_id
    and revoked_at is null
    and (expires_at is null or expires_at > now())
  limit 1;

  if v_share.share_token is not null then
    return jsonb_build_object(
      'success', true,
      'share_token', v_share.share_token
    );
  end if;

  -- Generate opaque URL-safe 24-char token (18 random bytes)
  v_token := replace(replace(replace(encode(gen_random_bytes(18), 'base64'), '/', '_'), '+', '-'), '=', '');

  insert into public.recipe_shares (
    recipe_id,
    owner_id,
    share_token
  )
  values (
    p_recipe_id,
    v_user_id,
    v_token
  )
  returning * into v_share;

  return jsonb_build_object(
    'success', true,
    'share_token', v_share.share_token
  );
end;
$$;

revoke all on function public.get_or_create_recipe_share(text) from public, anon;
grant execute on function public.get_or_create_recipe_share(text) to authenticated;

-- 5. RPC: get_shared_recipe(p_token text)
create or replace function public.get_shared_recipe(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recipe_id text;
  v_payload jsonb;
begin
  if p_token is null or length(trim(p_token)) = 0 then
    return null;
  end if;

  select recipe_id into v_recipe_id
  from public.recipe_shares
  where share_token = p_token
    and revoked_at is null
    and (expires_at is null or expires_at > now());

  if v_recipe_id is null then
    return null;
  end if;

  select payload into v_payload
  from public.recipes
  where id = v_recipe_id;

  if v_payload is null then
    return null;
  end if;

  -- Return payload ensured to have the recipe id and isShared marker,
  -- while completely omitting internal database columns (owner_id, etc.)
  return v_payload || jsonb_build_object(
    'id', v_recipe_id,
    'isShared', true,
    'shareToken', p_token
  );
end;
$$;

revoke all on function public.get_shared_recipe(text) from public;
grant execute on function public.get_shared_recipe(text) to anon, authenticated;

-- 6. RPC: revoke_recipe_share(p_recipe_id text)
create or replace function public.revoke_recipe_share(p_recipe_id text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  update public.recipe_shares
  set revoked_at = now()
  where recipe_id = p_recipe_id
    and owner_id = v_user_id
    and revoked_at is null;

  return jsonb_build_object('success', true);
end;
$$;

revoke all on function public.revoke_recipe_share(text) from public, anon;
grant execute on function public.revoke_recipe_share(text) to authenticated;
