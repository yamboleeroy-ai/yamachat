-- Yamachat voice scale hardening
-- Prepared for production rollout after preview validation.
-- The voice roster queries filter by channel_id and a rolling last_seen lease.
-- This composite index avoids scanning unrelated rooms as concurrent voice usage grows.
create index if not exists voice_participants_channel_last_seen_idx
  on public.voice_participants (channel_id, last_seen desc);

-- Existing indexes already cover:
--   voice_signals(to_user, created_at desc)
--   messages(channel_id, created_at desc)
--   messages(direct_thread_id, created_at desc)
