-- Yamachat voice scale hardening
-- PREVIEW / REVIEW ONLY. Apply to production only together with the approved release.
--
-- Roster queries filter by channel_id and a rolling last_seen lease.
create index if not exists voice_participants_channel_last_seen_idx
  on public.voice_participants (channel_id, last_seen desc);

-- Targeted signaling recovery reads by recipient/time; the existing
-- voice_signals_to_user_created_idx already covers that. This extra time index
-- makes bounded stale cleanup cheap without scanning the signaling table.
create index if not exists voice_signals_created_at_idx
  on public.voice_signals (created_at);

-- Hard-closing a browser/app cannot reliably execute Leave Voice. The client
-- therefore treats participant rows as leases; this server-side cleanup removes
-- physically stale leases and old ephemeral signaling rows.
create or replace function public.prune_stale_voice_state()
returns table(participants_deleted bigint, signals_deleted bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_participants bigint := 0;
  v_signals bigint := 0;
begin
  delete from public.voice_participants
  where last_seen < now() - interval '5 minutes';
  get diagnostics v_participants = row_count;

  delete from public.voice_signals
  where created_at < now() - interval '5 minutes';
  get diagnostics v_signals = row_count;

  return query select v_participants, v_signals;
end;
$$;

-- Cleanup is maintenance infrastructure, not a client RPC.
revoke all on function public.prune_stale_voice_state() from public;
revoke all on function public.prune_stale_voice_state() from anon;
revoke all on function public.prune_stale_voice_state() from authenticated;

-- Supabase Cron / pg_cron can schedule this after production approval:
--   create extension if not exists pg_cron with schema pg_catalog;
--   select cron.schedule(
--     'yamachat-prune-stale-voice-state',
--     '*/5 * * * *',
--     $$select * from public.prune_stale_voice_state();$$
--   );
--
-- Do not enable/schedule it from this preview branch automatically.
