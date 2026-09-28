function replaceBetween(html,startMarker,endMarker,replacement,label){
  const start=html.indexOf(startMarker),end=html.indexOf(endMarker,start);
  if(start<0||end<0||end<=start)throw Error('Stream scale boundary missing: '+label);
  return html.slice(0,start)+replacement+'\n'+html.slice(end);
}

export function withStreamScaleHardening(html){
  if(html.includes('STREAM SCALE HARDENING 2026-09-28'))return html;

  const stateOld="let ycCommunityStreamSub=null,ycStreamPresenceTimer=null,ycStreamPreviewTimer=null";
  const stateNew="let ycCommunityStreamSub=null,ycCommunityStreamPollTimer=null,ycCommunityStreamLoadBusy=null,ycStreamPresenceTimer=null,ycStreamPreviewTimer=null,ycStreamPublishEpoch=0,ycStreamPublishQueue=Promise.resolve()";
  if(!html.includes(stateOld))throw Error('Stream discovery state boundary missing');
  html=html.replace(stateOld,stateNew);

  const load=`// STREAM SCALE HARDENING 2026-09-28
async function ycLoadCommunityStreams(){
  if(!currentCommunity?.id){ycCommunityStreams.clear();renderVoiceChannels(voiceChannelDefs);return}
  if(ycCommunityStreamLoadBusy)return ycCommunityStreamLoadBusy
  const cid=String(currentCommunity.id)
  ycCommunityStreamLoadBusy=(async()=>{
    try{
      const cutoff=new Date(Date.now()-50000).toISOString(),{data,error}=await sb.from('community_stream_presence').select('*').eq('community_id',cid).gt('updated_at',cutoff)
      if(error)throw error
      if(String(currentCommunity?.id||'')!==cid)return
      const next=new Map();for(const row of data||[])next.set(String(row.user_id),row)
      let changed=next.size!==ycCommunityStreams.size
      if(!changed)for(const [uid,row] of next){const old=ycCommunityStreams.get(uid);if(!old||old.updated_at!==row.updated_at||old.channel_id!==row.channel_id||old.preview_data!==row.preview_data){changed=true;break}}
      ycCommunityStreams.clear();for(const [uid,row] of next)ycCommunityStreams.set(uid,row)
      if(changed)renderVoiceChannels(voiceChannelDefs)
    }catch(e){console.warn('community stream load',e)}
  })().finally(()=>{ycCommunityStreamLoadBusy=null})
  return ycCommunityStreamLoadBusy
}`;
  html=replaceBetween(html,'async function ycLoadCommunityStreams(){','async function ycStopCommunityStreamWatch(){',load,'community stream roster');

  const watch=`async function ycStopCommunityStreamWatch(){
  if(ycCommunityStreamPollTimer){clearInterval(ycCommunityStreamPollTimer);ycCommunityStreamPollTimer=null}
  const ch=ycCommunityStreamSub;ycCommunityStreamSub=null;if(ch)try{await sb.removeChannel(ch)}catch{}
}
async function ycStartCommunityStreamWatch(){
  await ycStopCommunityStreamWatch();await ycLoadCommunityStreams();if(!currentCommunity?.id)return;const cid=String(currentCommunity.id)
  const removeStream=key=>{ycCommunityStreams.delete(key);if(screenWatchingByUser.has(key)){screenWatchingByUser.delete(key);screenWatchPendingByUser.delete(key);remoteScreenStreams.delete(key);try{ycRemoveScreenAudioElement(key)}catch{}ycSyncStreamViewer()}renderVoiceChannels(voiceChannelDefs)}
  ycCommunityStreamSub=sb.channel('yc-community-streams-'+cid+'-'+Date.now())
    .on('postgres_changes',{event:'INSERT',schema:'public',table:'community_stream_presence',filter:'community_id=eq.'+cid},payload=>{const row=payload.new;if(!row?.user_id||!ycStreamPresenceFresh(row))return;ycCommunityStreams.set(String(row.user_id),row);renderVoiceChannels(voiceChannelDefs)})
    .on('postgres_changes',{event:'DELETE',schema:'public',table:'community_stream_presence'},payload=>{const row=payload.old;if(!row?.user_id||String(row.community_id||'')!==cid)return;removeStream(String(row.user_id))})
    .subscribe()
  ycCommunityStreamPollTimer=setInterval(()=>{if(String(currentCommunity?.id||'')===cid)void ycLoadCommunityStreams()},20000)
}`;
  html=replaceBetween(html,'async function ycStopCommunityStreamWatch(){','function ycClearStreamPublishTimers(){',watch,'community stream watch');

  const streamStopOld="async function stopScreenShare(silent=false){\n  const stream=screenShareStream;if(!screenShareActive&&!stream)return";
  const streamStopNew="async function stopScreenShare(silent=false){\n  const ownerUserId=user?.id,stream=screenShareStream;if(!screenShareActive&&!stream)return";
  if(!html.includes(streamStopOld))throw Error('Stream owner cleanup boundary missing');
  html=html.replace(streamStopOld,streamStopNew);
  const stopFnStart=html.indexOf('async function stopScreenShare(silent=false){');
  const stopFnEnd=html.indexOf('\n}\n',stopFnStart);
  if(stopFnStart<0||stopFnEnd<0)throw Error('Stream stop function boundary missing');
  const stopFn=html.slice(stopFnStart,stopFnEnd);
  if(!stopFn.includes('void ycStopGlobalStreamPresence();'))throw Error('Stream owner cleanup call boundary missing');
  html=html.slice(0,stopFnStart)+stopFn.replace('void ycStopGlobalStreamPresence();','void ycStopGlobalStreamPresence(ownerUserId);')+html.slice(stopFnEnd);
  const globalStopOld="async function ycStopGlobalStreamPresence(){ycClearStreamPublishTimers();if(user?.id){try{await sb.from('community_stream_presence').delete().eq('user_id',user.id)}catch{}}ycCommunityStreams.delete(String(user?.id||''));renderVoiceChannels(voiceChannelDefs)}";
  const globalStopNew="async function ycStopGlobalStreamPresence(ownerUserId=user?.id){const uid=String(ownerUserId||'');ycClearStreamPublishTimers();if(uid){try{await sb.from('community_stream_presence').delete().eq('user_id',uid)}catch{}}if(uid)ycCommunityStreams.delete(uid);renderVoiceChannels(voiceChannelDefs)}";
  if(!html.includes(globalStopOld))throw Error('Global stream presence owner boundary missing');
  html=html.replace(globalStopOld,globalStopNew);

  const publishBlock=`async function ycPublishStreamPresence(initial=false,withPreview=false){
  const epoch=ycStreamPublishEpoch,uid=String(user?.id||''),streamRef=screenShareStream,communityId=String(voiceChannel?.community_id||voiceChannel?.communityId||currentCommunity?.id||''),channelId=String(voiceChannel?.id||'');
  if(!screenShareActive||!uid||!streamRef||!communityId||!channelId)return false;
  const owns=()=>epoch===ycStreamPublishEpoch&&screenShareActive&&screenShareStream===streamRef&&String(user?.id||'')===uid&&String(voiceChannel?.id||'')===channelId;
  const run=async()=>{
    if(!owns())return false;
    const now=new Date().toISOString(),row={user_id:uid,community_id:communityId,channel_id:channelId,updated_at:now};
    if(initial){row.started_at=now;row.preview_data=null}
    if(withPreview){const p=await ycCaptureStreamPreviewData();if(!owns())return false;if(p)row.preview_data=p}
    if(!owns())return false;
    try{
      const {data,error}=await sb.from('community_stream_presence').upsert(row,{onConflict:'user_id'}).select().maybeSingle();
      if(error)throw error;
      if(!owns())return false;
      if(data)ycCommunityStreams.set(uid,data);renderVoiceChannels(voiceChannelDefs);return true;
    }catch(e){if(owns())console.warn('stream presence publish',e);return false}
  };
  const task=ycStreamPublishQueue.catch(()=>{}).then(run);
  ycStreamPublishQueue=task.catch(()=>{});
  return task;
}
async function ycStartGlobalStreamPresence(){
  const epoch=++ycStreamPublishEpoch;ycClearStreamPublishTimers();
  await ycPublishStreamPresence(true,false);
  if(epoch!==ycStreamPublishEpoch||!screenShareActive)return;
  setTimeout(()=>{if(epoch===ycStreamPublishEpoch&&screenShareActive)void ycPublishStreamPresence(false,true)},450);
  ycStreamPresenceTimer=setInterval(()=>{if(epoch===ycStreamPublishEpoch&&screenShareActive)void ycPublishStreamPresence(false,false)},12000);
  ycStreamPreviewTimer=setInterval(()=>{if(epoch===ycStreamPublishEpoch&&screenShareActive)void ycPublishStreamPresence(false,true)},15000);
}
async function ycStopGlobalStreamPresence(ownerUserId=user?.id){
  const uid=String(ownerUserId||'');++ycStreamPublishEpoch;ycClearStreamPublishTimers();
  try{await ycStreamPublishQueue}catch{}
  if(uid){try{await sb.from('community_stream_presence').delete().eq('user_id',uid)}catch{}}
  if(uid)ycCommunityStreams.delete(uid);renderVoiceChannels(voiceChannelDefs);
}
`;
  html=replaceBetween(html,'async function ycPublishStreamPresence','ycOnLifecycle(\'init\'',publishBlock,'serialized stream presence');

  const stopAwaitOld="void ycStopGlobalStreamPresence(ownerUserId);ycSyncStreamViewer();renderVoiceControls();if(!silent)toast('Sdílení obrazovky ukončeno.')";
  const stopAwaitNew="await ycStopGlobalStreamPresence(ownerUserId);ycSyncStreamViewer();renderVoiceControls();if(!silent)toast('Sdílení obrazovky ukončeno.')";
  if(!html.includes(stopAwaitOld))throw Error('Stream stop await boundary missing');
  html=html.replace(stopAwaitOld,stopAwaitNew);

  if(html.includes(".on('postgres_changes',{event:'*',schema:'public',table:'community_stream_presence',filter:'community_id=eq.'+cid}"))
    throw Error('Global stream heartbeat UPDATE fanout remains');
  return html;
}
