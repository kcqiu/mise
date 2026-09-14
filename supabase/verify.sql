select
  (select count(*) from public.recipes where is_system) as system_recipes,
  (select count(*) from public.recipes where not is_system) as personal_recipes,
  (select relrowsecurity from pg_class where oid = 'public.recipes'::regclass)
    as recipes_rls_enabled,
  (select relrowsecurity from pg_class where oid = 'public.favorites'::regclass)
    as favorites_rls_enabled,
  (select relrowsecurity from pg_class where oid = 'public.recipe_progress'::regclass)
    as progress_rls_enabled;

select tablename, policyname, roles, cmd
from pg_policies
where schemaname = 'public'
  and tablename in ('recipes', 'favorites', 'recipe_progress')
order by tablename, policyname;
