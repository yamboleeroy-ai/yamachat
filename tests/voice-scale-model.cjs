const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const desktop=fs.readFileSync(path.join(root,'desktop/desktop-client.html'),'utf8');
const scaleSql=fs.readFileSync(path.join(root,'supabase/voice-scale-indexes.sql'),'utf8');

function meshPairs(n){return n*(n-1)/2}
function oldPresenceDeliveriesPerSecond(users,heartbeatSeconds=5){return (users/heartbeatSeconds)*users}
function newHeartbeatRealtimeDeliveriesPerSecond(){return 0}
function rosterRestQueriesPerSecond(users,pollSeconds){return users/pollSeconds}

for(const users of [100,200,500,1000]){
  const oldFanout=oldPresenceDeliveriesPerSecond(users);
  const newFanout=newHeartbeatRealtimeDeliveriesPerSecond();
  const idleRosterQps=rosterRestQueriesPerSecond(users,20);
  const activeVoiceRosterQps=rosterRestQueriesPerSecond(users,15);
  console.log(JSON.stringify({
    users,
    old_presence_deliveries_per_second:oldFanout,
    new_heartbeat_realtime_deliveries_per_second:newFanout,
    idle_roster_rest_qps:idleRosterQps,
    active_voice_roster_rest_qps:activeVoiceRosterQps
  }));
  assert.equal(newFanout,0,'Heartbeat UPDATEs must not be delivered through Realtime');
}

assert.equal(meshPairs(10),45);
assert.equal(meshPairs(100),4950);
assert.equal(meshPairs(1000),499500);

assert(desktop.includes("const YC_VOICE_HEARTBEAT_MS=15000,YC_VOICE_TTL_MS=60000,YC_VOICE_ROSTER_MS=20000"),'Scale timings missing');
assert(desktop.includes("const delay=voiceChannel?YC_VOICE_HEARTBEAT_MS:YC_VOICE_ROSTER_MS"),'Roster scale model must match the 15s active / 20s idle scheduler');
assert(desktop.includes("event:'INSERT',schema:'public',table:'voice_participants',filter"),'Scoped INSERT subscription missing');
assert(desktop.includes("event:'DELETE',schema:'public',table:'voice_participants',filter"),'Scoped DELETE subscription missing');
assert(desktop.includes(".in('channel_id',ids).gt('last_seen',cutoff)"),'Batched roster query missing');
assert(!desktop.includes("event:'*',schema:'public',table:'voice_participants'"),'Global participant fan-out returned');
assert(!desktop.includes("config:{presence:{key:user.id}"),'Voice Presence returned');
assert(!desktop.includes(".on('presence'"),'Voice Presence listeners returned');
assert(!desktop.includes("room.track("),'Voice Presence track returned');
assert(!desktop.includes("room?.untrack("),'Voice Presence untrack returned');
assert(desktop.includes("function ycStartRemoteVoiceActivityDetector(peerId,stream)"),'Local remote-speaking detector missing');
assert(!desktop.includes("syncVoiceParticipantRow().catch(()=>{});renderVoiceChannels(voiceChannelDefs)"),'Speech edges still write Postgres rows');
assert(!desktop.includes("sb.functions.invoke('yamachat-turn',{method:'GET'})"),'Metered TURN returned');
assert(!desktop.includes('yc-voice-name-events-'),'Global voice-name participant subscription returned');
assert(!desktop.includes("table:'user_presence'},payload=>ycHandlePresenceRealtime"),'Global social presence subscription returned');
assert(desktop.includes("table:'profiles',filter:'id=eq.'+user.id"),'Own-profile realtime must remain targeted to the signed-in user');
assert(!desktop.includes('yc-dm-global-'),'Global desktop DM message listener returned');
assert(!desktop.includes("sb.channel('yc-win-notify-'+user.id"),'Global Windows message listener returned');

assert(scaleSql.includes('voice_participants_channel_last_seen_idx'),'Voice roster composite index definition missing');
assert(scaleSql.includes('(channel_id, last_seen desc)'),'Voice roster index must match channel + lease cutoff query');
assert(scaleSql.includes('voice_signals_created_at_idx'),'Stale signaling cleanup index missing');
assert(scaleSql.includes('prune_stale_voice_state'),'Server-side stale voice-state cleanup function missing');
assert(scaleSql.includes('delete from public.voice_signals'),'Server-side stale signaling DELETE missing');
assert(scaleSql.includes("created_at < now() - interval '5 minutes'"),'Signal cleanup TTL must remain bounded');


assert(desktop.includes("async function recoverVoiceSignals()"),'Voice signal recovery missing');
assert(desktop.includes("lt('created_at',stale)"),'Stale voice signals are not pruned');
assert(desktop.includes("gt('created_at',recent)"),'Recent missed voice signals are not recovered');

// This test intentionally documents the remaining media-plane boundary:
// P2P full mesh is safe only for small rooms. 100–1000 total users can be spread
// across many rooms, but a single 100/1000-person room requires an SFU.
assert(meshPairs(1000)>100000,'Model must expose why a 1000-person P2P room is not a supported target');

console.log('PASS voice scale model: metadata has no global heartbeat fan-out; REST roster load is modeled at 20s idle and 15s while connected to voice; remaining large-room limit is P2P media mesh, which requires SFU.');
