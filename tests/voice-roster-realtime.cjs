const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');

for(const file of ['desktop/desktop-client.html','index.html','mobile/www/index.html']){
  const html=fs.readFileSync(file,'utf8');
  assert(html.includes("event:'UPDATE',schema:'public',table:'voice_participants',filter},payload=>{ycPatchVoiceParticipant(id,payload.new)}"),file+' must receive only room-scoped participant UPDATE events');
  assert(html.includes("if(status==='SUBSCRIBED'){if(voiceParticipantSub===sub&&voiceParticipantSubChannelId===id&&String(voiceChannel?.id||'')===id)void refreshVoiceParticipants(id);return}"),file+' must snapshot after a successful room subscription');
  const line=html.split('\n').find(value=>value.startsWith('function ycPatchVoiceParticipant('));
  assert(line,file+' missing single-row roster patch');
  let renders=0,peerSyncs=0,announcements=[];
  const context=vm.createContext({
    voicePresenceByChannel:{room:[{channel_id:'room',user_id:'u1',session_id:'s1',username:'One',muted:false,deafened:false,joined_at:'2026-01-01T00:00:00Z',last_seen:'2026-01-01T00:00:00Z'}]},
    voiceChannelDefs:[{id:'room'}],voiceChannel:{id:'room'},
    user:{id:'self'},voiceJoinSoundArmed:true,
    ycVoiceAnnounceOnce(row,action){announcements.push({row,action})},
    renderVoiceChannels(){renders++},syncVoicePeers(){peerSyncs++}
  });
  vm.runInContext(line,context);
  vm.runInContext("ycPatchVoiceParticipant('room',{channel_id:'room',user_id:'u1',session_id:'s1',username:'One',muted:true,deafened:false,joined_at:'2026-01-01T00:00:00Z',last_seen:'2026-01-01T00:00:01Z'})",context);
  assert.equal(context.voicePresenceByChannel.room[0].muted,true,file+' must expose a remote mute immediately');
  assert.equal(renders,1,file+' must render one meaningful mute transition');
  assert.equal(peerSyncs,1,file+' must reconcile a meaningful room update');
  vm.runInContext("ycPatchVoiceParticipant('room',{channel_id:'room',user_id:'u1',session_id:'s1',username:'One',muted:true,deafened:false,joined_at:'2026-01-01T00:00:00Z',last_seen:'2026-01-01T00:00:45Z'})",context);
  assert.equal(renders,1,file+' must not repaint on a lease-only heartbeat');
  assert.equal(context.voicePresenceByChannel.room[0].last_seen,'2026-01-01T00:00:45Z',file+' must retain the fresh lease timestamp');
  vm.runInContext("ycPatchVoiceParticipant('room',{channel_id:'room',user_id:'u1',session_id:'s2',username:'One',muted:true,deafened:false,joined_at:'2026-01-01T00:01:00Z',last_seen:'2026-01-01T00:01:00Z'})",context);
  assert.equal(announcements.length,1,file+' must announce a participant restart with a new session id');
  assert.equal(announcements[0].action,'join',file+' must announce a restart as a join');
  assert.equal(announcements[0].row.username,'One',file+' restart announcement must retain the participant name');
  vm.runInContext("ycPatchVoiceParticipant('room',{channel_id:'other',user_id:'u2',session_id:'s2',username:'Other',muted:false,deafened:false})",context);
  assert.equal(context.voicePresenceByChannel.room.length,1,file+' must reject a row outside the subscribed room');
}
console.log('PASS voice roster realtime: post-subscribe snapshot, immediate remote mute/deafen patch, and lease-only update suppression.');
