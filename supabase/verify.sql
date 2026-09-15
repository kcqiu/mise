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

select
  (select count(*) from private.signup_allowlist) as approved_accounts,
  private.hook_restrict_signup_by_email(
    jsonb_build_object(
      'user', jsonb_build_object(
        'email', (select email from private.signup_allowlist order by email limit 1),
        'app_metadata', jsonb_build_object('provider', 'google')
      )
    )
  ) as approved_result,
  private.hook_restrict_signup_by_email(
    jsonb_build_object(
      'user', jsonb_build_object(
        'email', 'not-approved@example.com',
        'app_metadata', jsonb_build_object('provider', 'google')
      )
    )
  ) as rejected_result;

-- Verify Groceries Phase 2 table, RLS, and partial unique constraint
select
  (select relrowsecurity from pg_class where oid = 'public.grocery_sessions'::regclass) as grocery_sessions_rls,
  (select relrowsecurity from pg_class where oid = 'public.grocery_mutation_log'::regclass) as grocery_mutations_rls,
  (select count(*) from pg_indexes where tablename = 'grocery_sessions' and indexname = 'grocery_sessions_one_active_per_user_idx') as unique_active_constraint;
