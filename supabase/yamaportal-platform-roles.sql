-- Add an isolated, audited role layer for the Yamaportal owner center.
-- Existing private.platform_admins and its moderation checks are untouched.
create table if not exists private.platform_role_assignments (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('ADMIN', 'MODERATOR', 'USER')),
  permissions text[] not null default '{}',
  changed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (permissions <@ array[
    'users.read', 'users.suspend', 'users.reset_password', 'storage.read', 'storage.delete'
  ]::text[]),
  check (role <> 'USER' or cardinality(permissions) = 0),
  check (role <> 'MODERATOR' or permissions <@ array['users.read', 'users.suspend']::text[]),
  check (not ('users.suspend' = any(permissions)) or 'users.read' = any(permissions)),
  check (not ('storage.delete' = any(permissions)) or 'storage.read' = any(permissions))
);

create table if not exists private.platform_role_audit (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  target_user_id uuid not null,
  previous_role text,
  next_role text not null check (next_role in ('ADMIN', 'MODERATOR', 'USER')),
  previous_permissions text[] not null default '{}',
  next_permissions text[] not null default '{}',
  reason text not null,
  created_at timestamptz not null default now()
);

alter table private.platform_role_assignments enable row level security;
alter table private.platform_role_audit enable row level security;
revoke all on table private.platform_role_assignments, private.platform_role_audit from public, anon, authenticated;
grant all on table private.platform_role_assignments, private.platform_role_audit to service_role;

create or replace function public.service_list_platform_roles(p_actor_user_id uuid)
returns table(user_id uuid, role text, permissions text[], updated_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if not private.service_is_platform_owner(p_actor_user_id)
     and not exists (
       select 1 from private.platform_role_assignments r
       where r.user_id = p_actor_user_id and 'users.read' = any(r.permissions)
     ) then
    raise exception 'User read permission required.' using errcode = '42501';
  end if;

  return query
    select u.id,
      case when private.service_is_platform_owner(u.id) then 'OWNER' else coalesce(r.role, 'USER') end,
      case when private.service_is_platform_owner(u.id) then array[]::text[] else coalesce(r.permissions, array[]::text[]) end,
      r.updated_at
    from auth.users u
    left join private.platform_role_assignments r on r.user_id = u.id
    order by u.created_at desc;
end;
$function$;

create or replace function public.service_set_platform_role(
  p_actor_user_id uuid,
  p_target_user_id uuid,
  p_role text,
  p_permissions text[],
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_role text := upper(btrim(coalesce(p_role, '')));
  v_permissions text[] := coalesce(p_permissions, array[]::text[]);
  v_previous_role text;
  v_previous_permissions text[];
  v_reason text := left(btrim(coalesce(p_reason, '')), 500);
begin
  if not private.service_is_platform_owner(p_actor_user_id) then
    raise exception 'Owner access required.' using errcode = '42501';
  end if;
  if p_target_user_id is null or not exists (select 1 from auth.users u where u.id = p_target_user_id) then
    raise exception 'Target account does not exist.' using errcode = '22023';
  end if;
  if private.service_is_platform_owner(p_target_user_id) then
    raise exception 'The owner role cannot be changed here.' using errcode = '42501';
  end if;
  if v_role not in ('ADMIN', 'MODERATOR', 'USER') then
    raise exception 'Invalid platform role.' using errcode = '22023';
  end if;
  if cardinality(v_permissions) > 8 or not (v_permissions <@ array[
    'users.read', 'users.suspend', 'users.reset_password', 'storage.read', 'storage.delete'
  ]::text[]) then
    raise exception 'Invalid permission set.' using errcode = '22023';
  end if;
  if (v_role = 'USER' and cardinality(v_permissions) <> 0)
     or (v_role = 'MODERATOR' and not (v_permissions <@ array['users.read', 'users.suspend']::text[])) then
    raise exception 'Permissions do not match the selected role.' using errcode = '22023';
  end if;
  if (('users.suspend' = any(v_permissions) or 'users.reset_password' = any(v_permissions)) and not ('users.read' = any(v_permissions)))
     or ('storage.delete' = any(v_permissions) and not ('storage.read' = any(v_permissions))) then
    raise exception 'Destructive permissions require their matching read permission.' using errcode = '22023';
  end if;
  if char_length(v_reason) < 2 then
    raise exception 'A reason is required.' using errcode = '22023';
  end if;

  select r.role, r.permissions into v_previous_role, v_previous_permissions
  from private.platform_role_assignments r where r.user_id = p_target_user_id;

  insert into private.platform_role_assignments(user_id, role, permissions, changed_by, updated_at)
  values (p_target_user_id, v_role, v_permissions, p_actor_user_id, now())
  on conflict (user_id) do update
    set role = excluded.role,
        permissions = excluded.permissions,
        changed_by = excluded.changed_by,
        updated_at = excluded.updated_at;

  insert into private.platform_role_audit(
    actor_user_id, target_user_id, previous_role, next_role,
    previous_permissions, next_permissions, reason
  ) values (
    p_actor_user_id, p_target_user_id, coalesce(v_previous_role, 'USER'), v_role,
    coalesce(v_previous_permissions, array[]::text[]), v_permissions, v_reason
  );
  return true;
end;
$function$;

create or replace function public.service_list_platform_role_audit(p_actor_user_id uuid)
returns table(
  actor_user_id uuid, target_user_id uuid, previous_role text, next_role text,
  previous_permissions text[], next_permissions text[], reason text, created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if not private.service_is_platform_owner(p_actor_user_id) then
    raise exception 'Owner access required.' using errcode = '42501';
  end if;
  return query
    select a.actor_user_id, a.target_user_id, a.previous_role, a.next_role,
      a.previous_permissions, a.next_permissions, a.reason, a.created_at
    from private.platform_role_audit a
    order by a.created_at desc
    limit 100;
end;
$function$;

create or replace function public.service_user_has_platform_permission(p_user_id uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select p_user_id is not null and (
    private.service_is_platform_owner(p_user_id)
    or exists (
      select 1
      from private.platform_role_assignments r
      where r.user_id = p_user_id
        and p_permission = any(r.permissions)
    )
  );
$function$;

create or replace function public.service_get_platform_access(p_user_id uuid)
returns table(is_owner boolean, role text, permissions text[])
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if p_user_id is null then
    raise exception 'User is required.' using errcode = '22023';
  end if;
  return query
    select private.service_is_platform_owner(p_user_id),
      case when private.service_is_platform_owner(p_user_id) then 'OWNER' else coalesce(r.role, 'USER') end,
      case when private.service_is_platform_owner(p_user_id) then array[]::text[] else coalesce(r.permissions, array[]::text[]) end
    from (select 1) seed
    left join private.platform_role_assignments r on r.user_id = p_user_id;
end;
$function$;

revoke all on function public.service_list_platform_roles(uuid) from public, anon, authenticated;
revoke all on function public.service_set_platform_role(uuid, uuid, text, text[], text) from public, anon, authenticated;
revoke all on function public.service_list_platform_role_audit(uuid) from public, anon, authenticated;
revoke all on function public.service_user_has_platform_permission(uuid, text) from public, anon, authenticated;
revoke all on function public.service_get_platform_access(uuid) from public, anon, authenticated;
grant execute on function public.service_list_platform_roles(uuid) to service_role;
grant execute on function public.service_set_platform_role(uuid, uuid, text, text[], text) to service_role;
grant execute on function public.service_list_platform_role_audit(uuid) to service_role;
grant execute on function public.service_user_has_platform_permission(uuid, text) to service_role;
grant execute on function public.service_get_platform_access(uuid) to service_role;
