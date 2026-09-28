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

-- Signaling rows are ephemeral. Clients already discard signals older than 30 seconds,
-- so keeping old rows indefinitely only increases table/index size.
create index if not exists voice_signals_created_at_idx
  on public.voice_signals (created_at);

create or replace function public.prune_stale_voice_signals()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted bigint;
begin
  delete from public.voice_signals
  where created_at < now() - interval '5 minutes';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.prune_stale_voice_signals() from public;
grant execute on function public.prune_stale_voice_signals() to authenticated;
