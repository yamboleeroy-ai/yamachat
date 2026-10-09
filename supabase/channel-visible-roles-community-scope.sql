-- Scope hidden-channel role changes to their community so Realtime clients do
-- not receive role changes belonging to unrelated communities.
alter table public.channel_visible_roles
  add column if not exists community_id uuid;

update public.channel_visible_roles as visible
   set community_id = channel.community_id
  from public.channels as channel
 where channel.id = visible.channel_id
   and visible.community_id is distinct from channel.community_id;

alter table public.channel_visible_roles
  alter column community_id set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'channel_visible_roles_community_id_fkey'
       and conrelid = 'public.channel_visible_roles'::regclass
  ) then
    alter table public.channel_visible_roles
      add constraint channel_visible_roles_community_id_fkey
      foreign key (community_id) references public.communities(id) on delete cascade;
  end if;
end;
$$;

create index if not exists channel_visible_roles_community_idx
  on public.channel_visible_roles (community_id);

create or replace function public.yc_scope_channel_visible_role_community()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  select channel.community_id
    into new.community_id
    from public.channels as channel
   where channel.id = new.channel_id;

  if new.community_id is null then
    raise exception 'Unknown channel % for visibility rule', new.channel_id;
  end if;

  return new;
end;
$$;

drop trigger if exists yc_scope_channel_visible_role_community on public.channel_visible_roles;
create trigger yc_scope_channel_visible_role_community
before insert or update of channel_id on public.channel_visible_roles
for each row execute function public.yc_scope_channel_visible_role_community();
