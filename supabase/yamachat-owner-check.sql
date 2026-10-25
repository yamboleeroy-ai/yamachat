-- Server-only owner check for the Portal administration center.
-- The existing platform_admin_status() remains unchanged for Yamachat's
-- moderation tools; OWNER-only Portal actions must use this function.
create or replace function private.service_is_platform_owner(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select p_user_id is not null and exists (
    select 1
    from private.platform_admins a
    where a.user_id = p_user_id
      and lower(a.role) in ('owner', 'superadmin')
  );
$function$;

revoke all on function private.service_is_platform_owner(uuid) from public, anon, authenticated;
grant execute on function private.service_is_platform_owner(uuid) to service_role;

-- PostgREST can call this public wrapper, but only with the server service role.
create or replace function public.service_is_platform_owner(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select private.service_is_platform_owner(p_user_id);
$function$;

revoke all on function public.service_is_platform_owner(uuid) from public, anon, authenticated;
grant execute on function public.service_is_platform_owner(uuid) to service_role;
