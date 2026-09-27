-- Notification preferences used by Yamachat web/PWA/Android/Windows clients.
-- Applied to production Supabase on 2026-09-27.
-- Priority in yc_push_message_context: user -> text channel -> server -> enabled.

create table if not exists public.notification_preferences (
  user_id uuid not null references auth.users(id) on delete cascade,
  scope_type text not null check (scope_type in ('server','channel','user')),
  scope_id uuid not null,
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (user_id, scope_type, scope_id)
);

alter table public.notification_preferences enable row level security;

grant select, insert, update, delete on public.notification_preferences to authenticated;
grant select, insert, update, delete on public.notification_preferences to service_role;

drop policy if exists "notification_preferences_select_own" on public.notification_preferences;
create policy "notification_preferences_select_own"
on public.notification_preferences
for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "notification_preferences_insert_own" on public.notification_preferences;
create policy "notification_preferences_insert_own"
on public.notification_preferences
for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "notification_preferences_update_own" on public.notification_preferences;
create policy "notification_preferences_update_own"
on public.notification_preferences
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "notification_preferences_delete_own" on public.notification_preferences;
create policy "notification_preferences_delete_own"
on public.notification_preferences
for delete to authenticated
using ((select auth.uid()) = user_id);

create or replace function public.yc_push_message_context(p_message_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'private', 'pg_catalog'
as $function$
declare
  m public.messages%rowtype;
  sender_name text;
  ch public.channels%rowtype;
  community_name text;
  recipient_ids uuid[];
begin
  select * into m from public.messages where id=p_message_id;
  if not found or m.is_system then return null; end if;

  select coalesce(nullif(display_name,''),username,'Uživatel')
    into sender_name from public.profiles where id=m.author_id;

  if m.channel_id is not null then
    select * into ch from public.channels where id=m.channel_id;
    if not found then return null; end if;
    select name into community_name from public.communities where id=ch.community_id;

    select coalesce(array_agg(cm.user_id),array[]::uuid[])
      into recipient_ids
    from public.community_members cm
    left join public.profiles p on p.id=cm.user_id
    where cm.community_id=ch.community_id
      and cm.user_id<>m.author_id
      and coalesce(p.status,'online')<>'dnd'
      and not private.users_blocked(cm.user_id,m.author_id)
      and private.can_access_channel_for(cm.user_id,ch.id)
      and coalesce(
        (select np.enabled from public.notification_preferences np
          where np.user_id=cm.user_id and np.scope_type='user' and np.scope_id=m.author_id),
        (select np.enabled from public.notification_preferences np
          where np.user_id=cm.user_id and np.scope_type='channel' and np.scope_id=ch.id),
        (select np.enabled from public.notification_preferences np
          where np.user_id=cm.user_id and np.scope_type='server' and np.scope_id=ch.community_id),
        true
      );

    return jsonb_build_object(
      'messageId',m.id,'authorId',m.author_id,'sender',coalesce(sender_name,'Uživatel'),
      'body',left(regexp_replace(coalesce(nullif(m.body,''),'Nová zpráva'),'\s+',' ','g'),180),
      'where','#'||ch.name,'channelId',ch.id,'channelName',ch.name,
      'communityId',ch.community_id,'communityName',coalesce(community_name,''),
      'threadId','','recipientIds',to_jsonb(recipient_ids)
    );
  elsif m.direct_thread_id is not null then
    select coalesce(array_agg(dtm.user_id),array[]::uuid[])
      into recipient_ids
    from public.direct_thread_members dtm
    left join public.profiles p on p.id=dtm.user_id
    where dtm.thread_id=m.direct_thread_id
      and dtm.user_id<>m.author_id
      and coalesce(p.status,'online')<>'dnd'
      and not private.users_blocked(dtm.user_id,m.author_id)
      and coalesce(
        (select np.enabled from public.notification_preferences np
          where np.user_id=dtm.user_id and np.scope_type='user' and np.scope_id=m.author_id),
        true
      );

    return jsonb_build_object(
      'messageId',m.id,'authorId',m.author_id,'sender',coalesce(sender_name,'Uživatel'),
      'body',left(regexp_replace(coalesce(nullif(m.body,''),'Nová zpráva'),'\s+',' ','g'),180),
      'where','Soukromá zpráva','channelId','','channelName','','communityId','',
      'communityName','','threadId',m.direct_thread_id,'recipientIds',to_jsonb(recipient_ids)
    );
  end if;
  return null;
end;
$function$;
