const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const files=['desktop/desktop-client.html','index.html','mobile/www/index.html'];

for(const file of files){
  const html=fs.readFileSync(path.join(root,file),'utf8');
  const start=html.indexOf('// YC EGRESS HARDENING 2026-10-02 START');
  const end=html.indexOf('// YC EGRESS HARDENING 2026-10-02 END',start);
  assert(start>=0&&end>start,file+' missing shared egress hardening');
  assert.equal(html.indexOf('// YC EGRESS HARDENING 2026-10-02 START',start+1),-1,file+' injects hardening more than once');
  const hardening=html.slice(start,end);
  assert(hardening.includes('ycRealtimeQuotaFailure'),'402/quota classifier missing in '+file);
  assert(hardening.includes('\\b402\\b|quota|egress'),'quota classifier does not cover HTTP 402 in '+file);
  assert(hardening.includes('sb.realtime?.disconnect?.()'),'quota circuit breaker does not disconnect in '+file);
  assert(hardening.includes('for(const channel of sb.getChannels?.()||[])void sb.removeChannel(channel)'),'quota circuit breaker does not remove subscriptions in '+file);
  assert(hardening.includes('YC_PRESENCE_HEARTBEAT_MS=60000'),'presence heartbeat is not reduced to one minute in '+file);
  assert(hardening.includes('YC_VOICE_HEARTBEAT_HARDENED_MS=45000'),'voice heartbeat is not coalesced in '+file);
  assert(hardening.includes('YC_VOICE_ROSTER_ACTIVE_MS=90000'),'voice roster watchdog is not sparse in '+file);
  assert(hardening.includes('YC_STREAM_WATCHDOG_MS=120000'),'stream watchdog is not sparse in '+file);
  assert(hardening.includes('if(signature===ycVoiceParticipantSignature&&Date.now()-ycVoiceParticipantWriteAt<YC_VOICE_HEARTBEAT_HARDENED_MS)'),'duplicate voice RPC guard missing in '+file);
  assert(hardening.includes('if(!ycCommunityStreamSub)void ycStartCommunityStreamWatch()'),'healthy stream subscription still polls in '+file);
  assert(html.includes('heartbeatCallback:()=>{}'),'unbounded SDK heartbeat reconnect remains in '+file);
  assert(html.includes('function ycEnsureRealtime(){return false}'),'unbounded foreground reconnect remains in '+file);
}
console.log('PASS egress regression: all clients share a 402/quota circuit breaker, coalesced presence/voice writes, and Realtime-first roster/stream watchdogs without duplicated timers.');
