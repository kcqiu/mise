-- Migration: 202609180010_performance_index_cleanup.sql
-- Description:
-- 1. Add index on public.grocery_mutation_log(user_id) to optimize foreign key lookups and cascades from auth.users.
-- 2. Drop redundant duplicate index public.recipe_shares_token_idx since share_token is already indexed
--    by the unique constraint index public.recipe_shares_share_token_key.

-- 1. Foreign key index on grocery_mutation_log(user_id)
create index if not exists grocery_mutation_log_user_id_idx
  on public.grocery_mutation_log (user_id);

-- 2. Drop duplicate index on recipe_shares(share_token)
drop index if exists public.recipe_shares_token_idx;
