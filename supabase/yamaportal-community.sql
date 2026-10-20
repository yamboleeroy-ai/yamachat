-- New, isolated YamaPortal community features. Apply only after review.
-- Existing Yamachat messages, channels and community data are untouched.
begin;

create table if not exists public.portal_chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null constraint portal_chat_messages_user_id_fkey references public.profiles(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);

create index if not exists portal_chat_messages_created_at_idx
  on public.portal_chat_messages (created_at desc);

create table if not exists public.portal_forum_topics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null constraint portal_forum_topics_user_id_fkey references public.profiles(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  body text not null check (char_length(btrim(body)) between 1 and 5000),
  created_at timestamptz not null default now()
);

create index if not exists portal_forum_topics_created_at_idx
  on public.portal_forum_topics (created_at desc);

alter table public.portal_chat_messages enable row level security;
alter table public.portal_forum_topics enable row level security;

drop policy if exists "Signed-in users can read portal chat" on public.portal_chat_messages;
create policy "Signed-in users can read portal chat"
  on public.portal_chat_messages for select to authenticated using (true);
drop policy if exists "Users can send portal chat messages as themselves" on public.portal_chat_messages;
create policy "Users can send portal chat messages as themselves"
  on public.portal_chat_messages for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists "Signed-in users can read portal forum topics" on public.portal_forum_topics;
create policy "Signed-in users can read portal forum topics"
  on public.portal_forum_topics for select to authenticated using (true);
drop policy if exists "Users can create portal topics as themselves" on public.portal_forum_topics;
create policy "Users can create portal topics as themselves"
  on public.portal_forum_topics for insert to authenticated with check (user_id = (select auth.uid()));

revoke all on public.portal_chat_messages from anon, authenticated, public;
revoke all on public.portal_forum_topics from anon, authenticated, public;
grant select, insert on public.portal_chat_messages to authenticated;
grant select, insert on public.portal_forum_topics to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'portal_chat_messages'
  ) then
    alter publication supabase_realtime add table public.portal_chat_messages;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'portal_forum_topics'
  ) then
    alter publication supabase_realtime add table public.portal_forum_topics;
  end if;
end $$;

commit;
