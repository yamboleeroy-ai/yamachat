-- Isolated replies for Yamaportal forum topics. Does not modify Yamachat messages.
begin;

create table if not exists public.portal_forum_replies (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null constraint portal_forum_replies_topic_id_fkey references public.portal_forum_topics(id) on delete cascade,
  user_id uuid not null constraint portal_forum_replies_user_id_fkey references public.profiles(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists portal_forum_replies_topic_created_idx
  on public.portal_forum_replies (topic_id, created_at asc);
create index if not exists portal_forum_replies_user_id_idx
  on public.portal_forum_replies (user_id);

alter table public.portal_forum_replies enable row level security;
drop policy if exists "Signed-in users can read portal forum replies" on public.portal_forum_replies;
create policy "Signed-in users can read portal forum replies"
  on public.portal_forum_replies for select to authenticated using (true);
drop policy if exists "Users can reply as themselves" on public.portal_forum_replies;
create policy "Users can reply as themselves"
  on public.portal_forum_replies for insert to authenticated with check (user_id = (select auth.uid()));

revoke all on public.portal_forum_replies from anon, authenticated, public;
grant select, insert on public.portal_forum_replies to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'portal_forum_replies'
  ) then
    alter publication supabase_realtime add table public.portal_forum_replies;
  end if;
end $$;

commit;
