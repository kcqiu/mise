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

-- =============================================================================
-- Verify 202609180007 Security Remediation & Sharing Hardening
-- =============================================================================

-- 1. Verify favorite_shared_recipe RPC exists and permissions
select
  p.proname as function_name,
  p.prosecdef as is_security_definer,
  pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_can_execute,
  pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'favorite_shared_recipe';

-- 2. Verify private.consume_ai_quota RPC exists, in private schema, service_role only
select
  p.proname as function_name,
  n.nspname as schema_name,
  p.prosecdef as is_security_definer,
  pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role_can_execute,
  pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_can_execute,
  pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'private'
  and p.proname = 'consume_ai_quota';

-- 3. Verify validate_recipe_payload_trigger is SECURITY INVOKER (prosecdef = false)
select
  p.proname as trigger_function,
  p.prosecdef as is_security_definer
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'validate_recipe_payload_trigger';

-- 4. Verify public.recipe_shares has no UPDATE policy and update privilege is revoked
select
  policyname,
  cmd,
  roles
from pg_policies
where schemaname = 'public'
  and tablename = 'recipe_shares'
  and cmd = 'UPDATE';

-- 5. Verify favorites INSERT policy restricts to owned/system recipes
select
  policyname,
  cmd,
  roles,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'favorites'
  and cmd = 'INSERT';

-- 6. Verify private.ai_rate_limits table exists with RLS
select
  (select relrowsecurity from pg_class where oid = 'private.ai_rate_limits'::regclass) as ai_rate_limits_rls;

-- 7. Verify revoke_recipe_share RPC is SECURITY DEFINER with execution granted to authenticated
select
  p.proname as function_name,
  p.prosecdef as is_security_definer,
  pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_can_execute,
  pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'revoke_recipe_share';


