-- Enable public viewing of all recipes so direct links can be accessed by anyone.
-- Mutations (INSERT, UPDATE, DELETE) remain strictly enforced by owner_id RLS policies.

drop policy if exists "System recipes are readable by everyone" on public.recipes;
drop policy if exists "Users read system and owned recipes" on public.recipes;
drop policy if exists "Recipes are viewable by everyone" on public.recipes;

create policy "Recipes are viewable by everyone"
on public.recipes for select to anon, authenticated
using (true);

grant select on table public.recipes to anon, authenticated;
