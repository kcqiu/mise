create extension if not exists pgcrypto;

create table if not exists public.recipes (
  id text primary key,
  owner_id uuid references auth.users(id) on delete cascade,
  is_system boolean not null default false,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recipes_valid_owner check (
    (is_system = true and owner_id is null) or
    (is_system = false and owner_id is not null)
  ),
  constraint recipes_payload_is_object check (jsonb_typeof(payload) = 'object'),
  constraint recipes_payload_id_matches check (payload ->> 'id' = id)
);

create table if not exists public.favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  recipe_id text not null references public.recipes(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, recipe_id)
);

create table if not exists public.recipe_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  recipe_id text not null references public.recipes(id) on delete cascade,
  progress jsonb not null default '{"ingredients": [], "steps": []}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, recipe_id)
);

create index if not exists recipes_owner_id_idx on public.recipes(owner_id);
create index if not exists recipes_is_system_idx on public.recipes(is_system);
create index if not exists favorites_recipe_id_idx on public.favorites(recipe_id);
create index if not exists recipe_progress_recipe_id_idx on public.recipe_progress(recipe_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists recipes_set_updated_at on public.recipes;
create trigger recipes_set_updated_at
before update on public.recipes
for each row execute function public.set_updated_at();

drop trigger if exists recipe_progress_set_updated_at on public.recipe_progress;
create trigger recipe_progress_set_updated_at
before update on public.recipe_progress
for each row execute function public.set_updated_at();

alter table public.recipes enable row level security;
alter table public.favorites enable row level security;
alter table public.recipe_progress enable row level security;

revoke all on table public.recipes from anon, authenticated;
revoke all on table public.favorites from anon, authenticated;
revoke all on table public.recipe_progress from anon, authenticated;

grant select on table public.recipes to anon;
grant select, insert, update, delete on table public.recipes to authenticated;
grant select, insert, delete on table public.favorites to authenticated;
grant select, insert, update, delete on table public.recipe_progress to authenticated;

drop policy if exists "System recipes are readable by everyone" on public.recipes;
create policy "System recipes are readable by everyone"
on public.recipes for select to anon
using (is_system);

drop policy if exists "Users read system and owned recipes" on public.recipes;
create policy "Users read system and owned recipes"
on public.recipes for select to authenticated
using (is_system or owner_id = (select auth.uid()));

drop policy if exists "Users create their own recipes" on public.recipes;
create policy "Users create their own recipes"
on public.recipes for insert to authenticated
with check (owner_id = (select auth.uid()) and is_system = false);

drop policy if exists "Users update their own recipes" on public.recipes;
create policy "Users update their own recipes"
on public.recipes for update to authenticated
using (owner_id = (select auth.uid()) and is_system = false)
with check (owner_id = (select auth.uid()) and is_system = false);

drop policy if exists "Users delete their own recipes" on public.recipes;
create policy "Users delete their own recipes"
on public.recipes for delete to authenticated
using (owner_id = (select auth.uid()) and is_system = false);

drop policy if exists "Users read their own favorites" on public.favorites;
create policy "Users read their own favorites"
on public.favorites for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "Users create their own favorites" on public.favorites;
create policy "Users create their own favorites"
on public.favorites for insert to authenticated
with check (
  user_id = (select auth.uid()) and
  exists (
    select 1
    from public.recipes
    where recipes.id = favorites.recipe_id
      and (recipes.is_system or recipes.owner_id = (select auth.uid()))
  )
);

drop policy if exists "Users delete their own favorites" on public.favorites;
create policy "Users delete their own favorites"
on public.favorites for delete to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "Users read their own progress" on public.recipe_progress;
create policy "Users read their own progress"
on public.recipe_progress for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "Users create their own progress" on public.recipe_progress;
create policy "Users create their own progress"
on public.recipe_progress for insert to authenticated
with check (
  user_id = (select auth.uid()) and
  exists (
    select 1
    from public.recipes
    where recipes.id = recipe_progress.recipe_id
      and (recipes.is_system or recipes.owner_id = (select auth.uid()))
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
      and (recipes.is_system or recipes.owner_id = (select auth.uid()))
  )
);

drop policy if exists "Users delete their own progress" on public.recipe_progress;
create policy "Users delete their own progress"
on public.recipe_progress for delete to authenticated
using (user_id = (select auth.uid()));

revoke execute on function public.set_updated_at() from public, anon, authenticated;
