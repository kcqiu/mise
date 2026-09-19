-- Migration: 202609180008_harden_recipe_share_revocation.sql
-- Description: Upgrade revoke_recipe_share to SECURITY DEFINER with set search_path = ''
-- so authenticated owners can revoke their recipe shares despite table-wide UPDATE
-- permissions being revoked from public.recipe_shares.

create or replace function public.revoke_recipe_share(p_recipe_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_recipe_id is null or trim(p_recipe_id) = '' then
    raise exception 'Recipe ID is required';
  end if;

  update public.recipe_shares
  set revoked_at = now()
  where recipe_id = trim(p_recipe_id)
    and owner_id = v_user_id
    and revoked_at is null;

  return jsonb_build_object('success', true);
end;
$$;

revoke all on function public.revoke_recipe_share(text) from public, anon;
grant execute on function public.revoke_recipe_share(text) to authenticated;
