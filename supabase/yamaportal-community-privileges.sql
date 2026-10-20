-- Supabase project defaults may grant broader table privileges than needed.
-- Keep the new signed-in-only surfaces read/insert-only at the SQL layer too.
revoke all on public.portal_chat_messages from anon, authenticated, public;
revoke all on public.portal_forum_topics from anon, authenticated, public;
grant select, insert on public.portal_chat_messages to authenticated;
grant select, insert on public.portal_forum_topics to authenticated;
