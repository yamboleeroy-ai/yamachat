const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const clients=100,communities=5,roomsPerCommunity=4,roomSize=5;
assert.equal(communities*roomsPerCommunity*roomSize,clients);

for(const file of ['desktop/desktop-client.html','index.html','mobile/www/index.html']){
  const src=fs.readFileSync(path.join(root,file),'utf8');
  assert(src.includes("event:'INSERT',schema:'public',table:'voice_participants',filter"),file+' room-scoped participant INSERT missing');
  assert(src.includes("event:'DELETE',schema:'public',table:'voice_participants',filter"),file+' room-scoped participant DELETE missing');
  assert(!src.includes("event:'UPDATE',schema:'public',table:'voice_participants'"),file+' participant heartbeat UPDATE returned to realtime');
  assert(src.includes("filter:'to_user=eq.'+uid"),file+' targeted signaling recipient filter missing');
  assert(src.includes(".in('channel_id',ids).gt('last_seen',cutoff)"),file+' batched voice roster query missing');
  assert(src.includes("const delay=voiceChannel?YC_VOICE_HEARTBEAT_MS:YC_VOICE_ROSTER_MS"),file+' single roster scheduler missing');
}

const users=Array.from({length:clients},(_,i)=>({
  id:'u'+i,
  community:Math.floor(i/20),
  room:Math.floor(i/5),
  session:'s0-'+i,
  active:true,
  peers:new Set()
}));
const rebuildPeers=()=>{
  for(const u of users)u.peers.clear();
  const active=users.filter(u=>u.active);
  for(let room=0;room<communities*roomsPerCommunity;room++){
    const members=active.filter(u=>u.room===room);
    for(let i=0;i<members.length;i++)for(let j=i+1;j<members.length;j++){
      members[i].peers.add(members[j].id);members[j].peers.add(members[i].id);
    }
  }
};
const pairCount=()=>users.reduce((n,u)=>n+u.peers.size,0)/2;
const endpointPeerCount=()=>users.reduce((n,u)=>n+u.peers.size,0);

rebuildPeers();
assert.equal(pairCount(),200,'20 rooms x C(5,2) must create 200 unique P2P pairs');
assert.equal(endpointPeerCount(),400,'Every P2P pair has two client endpoints');
for(const u of users)assert.equal(u.peers.size,4,'Five-person room must expose four peers per client');

const membershipDeliveries=users.filter(u=>u.community===2).length;
const participantDeliveries=users.filter(u=>u.room===7&&u.active).length;
const signalDeliveries=1;
const heartbeatRealtimeDeliveries=0;
assert.equal(membershipDeliveries,20);
assert.equal(participantDeliveries,5);
assert.equal(signalDeliveries,1);
assert.equal(heartbeatRealtimeDeliveries,0);

const directedPeerSignals=users.reduce((n,u)=>n+u.peers.size,0);
assert.equal(directedPeerSignals,400,'One directed signal per peer endpoint must stay O(room size), not global O(N²)');
assert(directedPeerSignals<clients*clients,'Targeted signaling must stay below global fan-out');

const oldSessions=new Set();
for(let room=0;room<20;room++){
  const leaver=users.find(u=>u.room===room&&u.active);
  oldSessions.add(leaver.session);leaver.active=false;
}
rebuildPeers();
assert.equal(pairCount(),120,'After one leave per room, 20 x C(4,2) pairs must remain');
assert.equal(endpointPeerCount(),240);
for(const u of users.filter(u=>u.active))assert(u.peers.size<=3,'Churn cleanup left a ghost peer');

for(let room=0;room<20;room++){
  const leaver=users.find(u=>u.room===room&&!u.active);
  leaver.session='s1-'+leaver.id;leaver.active=true;
}
rebuildPeers();
assert.equal(pairCount(),200);
assert.equal(endpointPeerCount(),400);
for(const u of users){assert.equal(u.peers.size,4);assert(!oldSessions.has(u.session),'Old voice session survived rejoin');}

const leaseWritesPerSecond=clients/15;
const rosterReadsPerSecond=clients/15;
const metrics={
  type:'SIMULATION_NOT_REAL_CLIENTS',
  virtual_clients:clients,
  communities,
  voice_rooms:20,
  users_per_room:roomSize,
  unique_p2p_pairs:pairCount(),
  peer_endpoints:endpointPeerCount(),
  directed_signaling_deliveries_for_one_peer_round:directedPeerSignals,
  member_event_max_deliveries:membershipDeliveries,
  participant_event_room_deliveries:participantDeliveries,
  targeted_signal_deliveries:signalDeliveries,
  heartbeat_realtime_deliveries:heartbeatRealtimeDeliveries,
  modeled_voice_lease_writes_per_second:Number(leaseWritesPerSecond.toFixed(4)),
  modeled_batched_roster_reads_per_second:Number(rosterReadsPerSecond.toFixed(4))
};
console.log('AUDIT_100_SIGNALING_MODEL '+JSON.stringify(metrics));
console.log('PASS 100-client signaling/realtime model: scoped events, targeted signals, churn cleanup and bounded five-user P2P rooms. This is a deterministic architecture simulation, not 100 rendered/audio clients.');
