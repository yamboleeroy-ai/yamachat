-- Pending production migration: scope attachment Realtime events to their
-- parent channel or direct-message thread. This is additive and backfills
-- existing rows; it does not delete or rewrite message content.

alter table public.attachments
  add column if not exists channel_id uuid references public.channels(id) on delete cascade,
  add column if not exists direct_thread_id uuid references public.direct_threads(id) on delete cascade;

create or replace function public.yc_scope_attachment_from_message()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  message_channel_id uuid;
  message_direct_thread_id uuid;
begin
  select m.channel_id, m.direct_thread_id
    into message_channel_id, message_direct_thread_id
    from public.messages as m
   where m.id = new.message_id;

  if message_channel_id is null and message_direct_thread_id is null then
    raise exception 'Attachment message % has no chat scope', new.message_id;
  end if;

  new.channel_id := message_channel_id;
  new.direct_thread_id := message_direct_thread_id;
  return new;
end;
$$;

drop trigger if exists yc_scope_attachment_from_message on public.attachments;
create trigger yc_scope_attachment_from_message
before insert or update of message_id on public.attachments
for each row execute function public.yc_scope_attachment_from_message();

update public.attachments as a
   set channel_id = m.channel_id,
       direct_thread_id = m.direct_thread_id
  from public.messages as m
 where m.id = a.message_id
   and (a.channel_id is distinct from m.channel_id
     or a.direct_thread_id is distinct from m.direct_thread_id);

alter table public.attachments
  drop constraint if exists attachments_chat_scope_check;
alter table public.attachments
  add constraint attachments_chat_scope_check
  check (num_nonnulls(channel_id, direct_thread_id) = 1) not valid;
alter table public.attachments
  validate constraint attachments_chat_scope_check;

create index if not exists attachments_channel_idx
  on public.attachments (channel_id, created_at desc)
  where channel_id is not null;
create index if not exists attachments_direct_thread_idx
  on public.attachments (direct_thread_id, created_at desc)
  where direct_thread_id is not null;
