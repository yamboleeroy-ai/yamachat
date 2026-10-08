-- Keeps the active-room roster snapshot bounded as communities grow.
-- Applied to production as the voice_roster_realtime_index migration.
create index if not exists voice_participants_channel_last_seen_idx
  on public.voice_participants (channel_id, last_seen desc);
