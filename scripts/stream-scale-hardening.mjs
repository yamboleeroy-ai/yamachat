function replaceBetween(html,startMarker,endMarker,replacement,label){
  const start=html.indexOf(startMarker),end=html.indexOf(endMarker,start);
  if(start<0||end<0||end<=start)throw Error('Stream scale boundary missing: '+label);
  return html.slice(0,start)+replacement+'\n'+html.slice(end);
}

export function withStreamScaleHardening(html){
  if(html.includes('STREAM SCALE HARDENING 2026-09-28'))return html;

  const stateOld="let ycCommunityStreamSub=null,ycStreamPresenceTimer=null,ycStreamPreviewTimer=null";
  const stateNew="let ycCommunityStreamSub=null,ycCommunityStreamPollTimer=null,ycCommunityStreamLoadBusy=null,ycCommunityStreamLoadCid='',ycCommunityStreamWatchGeneration=0,ycCommunityStreamFreshnessTimer=null,ycStreamPresenceTimer=null,ycStreamPreviewTimer=null,ycStreamPublishEpoch=0,ycStreamPublishQueue=Promise.resolve(),ycStreamPresenceClearedUserId=''";
  if(!html.includes(stateOld))throw Error('Stream discovery state boundary missing');
  html=html.replace(stateOld,stateNew);

  const load=`// STREAM SCALE HARDENING 2026-09-28
async function ycLoadCommunityStreams(){
  if(!currentCommunity?.id){ycCommunityStreams.clear();renderVoiceChannels(voiceChannelDefs);return}
  const cid=String(currentCommunity.id)
  if(ycCommunityStreamLoadBusy&&ycCommunityStreamLoadCid===cid)return ycCommunityStreamLoadBusy
  const task=(async()=>{
    try{
      const cutoff=new Date(Date.now()-50000).toISOString(),{data,error}=await sb.from('community_stream_presence').select('*').eq('community_id',cid).gt('updated_at',cutoff)
      if(error)throw error
      if(String(currentCommunity?.id||'')!==cid)return
      const next=new Map();for(const row of data||[])next.set(String(row.user_id),row)
      let changed=next.size!==ycCommunityStreams.size
      if(!changed)for(const [uid,row] of next){const old=ycCommunityStreams.get(uid);if(!old||old.updated_at!==row.updated_at||old.channel_id!==row.channel_id||old.preview_data!==row.preview_data){changed=true;break}}
      ycCommunityStreams.clear();for(const [uid,row] of next)ycCommunityStreams.set(uid,row)
      if(changed)renderVoiceChannels(voiceChannelDefs)
    }catch(e){if(String(currentCommunity?.id||'')===cid)console.warn('community stream load',e)}
  })()
  ycCommunityStreamLoadBusy=task;ycCommunityStreamLoadCid=cid
  const clear=()=>{if(ycCommunityStreamLoadBusy===task){ycCommunityStreamLoadBusy=null;ycCommunityStreamLoadCid=''}}
  task.then(clear,clear)
  return task
}
`;
  html=replaceBetween(html,'async function ycLoadCommunityStreams(){','async function ycStopCommunityStreamWatch(){',load,'community stream roster');

  const watch=`async function ycStopCommunityStreamWatch(invalidate=true){
  if(invalidate)++ycCommunityStreamWatchGeneration
  if(ycCommunityStreamPollTimer){clearInterval(ycCommunityStreamPollTimer);ycCommunityStreamPollTimer=null}
  const ch=ycCommunityStreamSub;ycCommunityStreamSub=null;if(ch)try{await sb.removeChannel(ch)}catch{}
}
async function ycStartCommunityStreamWatch(){
  const generation=++ycCommunityStreamWatchGeneration
  await ycStopCommunityStreamWatch(false)
  if(generation!==ycCommunityStreamWatchGeneration)return
  if(!currentCommunity?.id){ycCommunityStreams.clear();renderVoiceChannels(voiceChannelDefs);return}
  const cid=String(currentCommunity.id),current=()=>generation===ycCommunityStreamWatchGeneration&&String(currentCommunity?.id||'')===cid
  const removeStream=key=>{if(!current())return;ycCommunityStreams.delete(key);if(screenWatchingByUser.has(key)){screenWatchingByUser.delete(key);screenWatchPendingByUser.delete(key);remoteScreenStreams.delete(key);try{ycRemoveScreenAudioElement(key)}catch{}ycSyncStreamViewer()}renderVoiceChannels(voiceChannelDefs)}
  const sub=sb.channel('yc-community-streams-'+cid+'-'+Date.now())
    .on('postgres_changes',{event:'INSERT',schema:'public',table:'community_stream_presence',filter:'community_id=eq.'+cid},payload=>{if(!current())return;const row=payload.new;if(!row?.user_id||!ycStreamPresenceFresh(row))return;ycCommunityStreams.set(String(row.user_id),row);renderVoiceChannels(voiceChannelDefs)})
    .on('postgres_changes',{event:'DELETE',schema:'public',table:'community_stream_presence'},payload=>{if(!current())return;const row=payload.old;if(!row?.user_id||String(row.community_id||'')!==cid)return;removeStream(String(row.user_id))})
  if(!current()){try{await sb.removeChannel(sub)}catch{};return}
  ycCommunityStreamSub=sub
  sub.subscribe(status=>{if(!current()){if(ycCommunityStreamSub===sub)ycCommunityStreamSub=null;try{void sb.removeChannel(sub)}catch{};return}if(status==='SUBSCRIBED'){void ycLoadCommunityStreams();return}if(['CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(status)&&ycCommunityStreamSub===sub){ycCommunityStreamSub=null;try{void sb.removeChannel(sub)}catch{}}})
  await ycLoadCommunityStreams()
  if(!current()){if(ycCommunityStreamSub===sub)ycCommunityStreamSub=null;try{await sb.removeChannel(sub)}catch{};return}
  ycCommunityStreamPollTimer=setInterval(()=>{if(!current())return;if(!ycCommunityStreamSub){void ycStartCommunityStreamWatch();return}if(ycCommunityStreams.size)void ycLoadCommunityStreams()},20000)
}
`;
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
      if(data){ycStreamPresenceClearedUserId='';ycCommunityStreams.set(uid,data)}renderVoiceChannels(voiceChannelDefs);return true;
    }catch(e){if(owns())console.warn('stream presence publish',e);return false}
  };
  const task=ycStreamPublishQueue.catch(()=>{}).then(run);
  ycStreamPublishQueue=task.catch(()=>{});
  return task;
}
async function ycStartGlobalStreamPresence(){
  const epoch=++ycStreamPublishEpoch;ycStreamPresenceClearedUserId='';ycClearStreamPublishTimers();
  await ycPublishStreamPresence(true,false);
  if(epoch!==ycStreamPublishEpoch||!screenShareActive)return;
  setTimeout(()=>{if(epoch===ycStreamPublishEpoch&&screenShareActive)void ycPublishStreamPresence(false,true)},450);
  ycStreamPresenceTimer=setInterval(()=>{if(epoch===ycStreamPublishEpoch&&screenShareActive)void ycPublishStreamPresence(false,false)},12000);
  ycStreamPreviewTimer=setInterval(()=>{if(epoch===ycStreamPublishEpoch&&screenShareActive)void ycPublishStreamPresence(false,true)},15000);
}
async function ycStopGlobalStreamPresence(ownerUserId=user?.id){
  const uid=String(ownerUserId||'');++ycStreamPublishEpoch;ycClearStreamPublishTimers();
  try{await ycStreamPublishQueue}catch{}
  if(uid&&ycStreamPresenceClearedUserId!==uid){
    try{const {error}=await sb.from('community_stream_presence').delete().eq('user_id',uid);if(!error)ycStreamPresenceClearedUserId=uid}catch{}
  }
  if(uid)ycCommunityStreams.delete(uid);renderVoiceChannels(voiceChannelDefs);
}
`;
  html=replaceBetween(html,'async function ycPublishStreamPresence','ycOnLifecycle(\'init\'',publishBlock,'serialized stream presence');

  const streamInitOld="ycOnLifecycle('init',async()=>{try{if(user?.id&&!screenShareActive)await sb.from('community_stream_presence').delete().eq('user_id',user.id)}catch{};await ycStartCommunityStreamWatch()})";
  const streamInitNew="ycOnLifecycle('init',async()=>{ycStreamPresenceClearedUserId='';try{if(user?.id&&!screenShareActive){const {error}=await sb.from('community_stream_presence').delete().eq('user_id',user.id);if(!error)ycStreamPresenceClearedUserId=String(user.id)}}catch{};await ycStartCommunityStreamWatch()})";
  if(html.includes(streamInitOld))html=html.replace(streamInitOld,streamInitNew);
  else if(!html.includes(streamInitNew))throw Error('Stream init cleanup idempotency boundary missing');

  const stopStart=html.indexOf('async function stopScreenShare(silent=false){'),stopEnd=html.indexOf('\n}\n',stopStart);
  if(stopStart<0||stopEnd<0)throw Error('Stream stop await function boundary missing');
  let stopBlock=html.slice(stopStart,stopEnd);
  if(/\bvoid\s+ycStopGlobalStreamPresence\s*\(\s*ownerUserId\s*\)\s*;/.test(stopBlock))stopBlock=stopBlock.replace(/\bvoid\s+ycStopGlobalStreamPresence\s*\(\s*ownerUserId\s*\)\s*;/,'await ycStopGlobalStreamPresence(ownerUserId);');
  else if(!/\bawait\s+ycStopGlobalStreamPresence\s*\(\s*ownerUserId\s*\)/.test(stopBlock))throw Error('Stream stop await boundary missing');
  html=html.slice(0,stopStart)+stopBlock+html.slice(stopEnd);

  const screenStartOld=`async function startScreenShare(){
  if(!voiceChannel){toast('Nejdřív se připoj do hlasového kanálu.',true);return}
  const media=getScreenMediaDevices();if(!media?.getDisplayMedia){toast('Tento prohlížeč nepodporuje sdílení obrazovky.',true);return}
  let stream
  try{stream=await media.getDisplayMedia({video:{width:{ideal:ycScreenShareProfile().width,max:ycScreenShareProfile().width},height:{ideal:ycScreenShareProfile().height,max:ycScreenShareProfile().height},frameRate:{ideal:ycScreenShareProfile().fps,max:ycScreenShareProfile().fps}},audio:{restrictOwnAudio:true},systemAudio:'include',surfaceSwitching:'include'})}catch(e){toast('Sdílení bylo zrušeno nebo jej Windows nepovolil. Pokud výběr proběhl, zkus běžné spuštění Yamachatu a stejná oprávnění jako u hry. Chyba: '+(e?.message||e),true);return}
  await ycPrepareDesktopProcessAudio(stream);const track=stream.getVideoTracks()[0];if(!track){stream.getTracks().forEach(t=>t.stop());toast('Nebyl vybrán žádný obraz.',true);return}
  screenShareStream=stream;screenShareActive=true;screenShareViewers.clear()
  await enableScreenShareAudio(stream)`;
  const screenStartNew=`async function startScreenShare(){
  if(!voiceChannel){toast('Nejdřív se připoj do hlasového kanálu.',true);return}
  const channelId=String(voiceChannel.id||''),sessionId=voiceSessionId,uid=String(user?.id||''),current=()=>!!voiceChannel&&String(voiceChannel.id||'')===channelId&&voiceSessionId===sessionId&&String(user?.id||'')===uid
  const discard=stream=>{try{stream?.getTracks?.().forEach(t=>{t.onended=null;try{t.stop()}catch{}})}catch{}}
  const media=getScreenMediaDevices();if(!media?.getDisplayMedia){toast('Tento prohlížeč nepodporuje sdílení obrazovky.',true);return}
  let stream
  try{stream=await media.getDisplayMedia({video:{width:{ideal:ycScreenShareProfile().width,max:ycScreenShareProfile().width},height:{ideal:ycScreenShareProfile().height,max:ycScreenShareProfile().height},frameRate:{ideal:ycScreenShareProfile().fps,max:ycScreenShareProfile().fps}},audio:{restrictOwnAudio:true},systemAudio:'include',surfaceSwitching:'include'})}catch(e){if(current())toast('Sdílení bylo zrušeno nebo jej Windows nepovolil. Pokud výběr proběhl, zkus běžné spuštění Yamachatu a stejná oprávnění jako u hry. Chyba: '+(e?.message||e),true);return}
  if(!current()){discard(stream);return}
  await ycPrepareDesktopProcessAudio(stream);if(!current()){discard(stream);await ycStopDesktopProcessAudio();return}const track=stream.getVideoTracks()[0];if(!track){discard(stream);toast('Nebyl vybrán žádný obraz.',true);return}
  screenShareStream=stream;screenShareActive=true;screenShareViewers.clear()
  await enableScreenShareAudio(stream)
  if(!current()||screenShareStream!==stream||!screenShareActive){if(screenShareStream===stream){screenShareStream=null;screenShareActive=false}discard(stream);await ycStopDesktopProcessAudio();return}`;
  if(html.includes(screenStartOld))html=html.replace(screenStartOld,screenStartNew);
  else if(!html.includes(screenStartNew))throw Error('Screen share startup lifecycle boundary missing');

  const screenAttachOld=`function attachVoiceScreen(peerId,stream){
  const track=stream?.getVideoTracks?.()[0];if(!track)return
  const show=()=>{if(track.readyState!=='live'||!screenWatchingByUser.has(peerId))return;ycClearScreenWatchTimer(peerId);screenWatchPendingByUser.delete(peerId);remoteScreenStreams.set(peerId,stream);ycSyncStreamViewer();renderVoiceChannels(voiceChannelDefs)}
  const hide=()=>{if(remoteScreenStreams.get(peerId)===stream){if(screenWatchingByUser.has(peerId)&&(voiceScreenActiveByUser.has(peerId)||ycStreamInfo(peerId))){screenWatchPendingByUser.add(peerId);ycArmScreenWatch(peerId)}ycSyncStreamViewer();renderVoiceChannels(voiceChannelDefs)}}
  track.onunmute=show
  track.onmute=()=>setTimeout(()=>{if(track.muted)hide()},900)
  track.onended=hide
  if(!track.muted)show()
}`;
  const screenAttachNew=`function attachVoiceScreen(peerId,stream){
  const track=stream?.getVideoTracks?.()[0];if(!track)return
  const channelId=String(voiceChannel?.id||''),sessionId=voiceSessionId,pc=voicePeers.get(peerId)
  const current=()=>!!voiceChannel&&String(voiceChannel.id)===channelId&&voiceSessionId===sessionId&&voicePeers.get(peerId)===pc
  const show=()=>{if(!current()||track.readyState!=='live'||!screenWatchingByUser.has(peerId))return;ycClearScreenWatchTimer(peerId);screenWatchPendingByUser.delete(peerId);remoteScreenStreams.set(peerId,stream);ycSyncStreamViewer();renderVoiceChannels(voiceChannelDefs)}
  const hide=()=>{if(!current()||remoteScreenStreams.get(peerId)!==stream)return;if(screenWatchingByUser.has(peerId)&&(voiceScreenActiveByUser.has(peerId)||ycStreamInfo(peerId))){screenWatchPendingByUser.add(peerId);ycArmScreenWatch(peerId)}ycSyncStreamViewer();renderVoiceChannels(voiceChannelDefs)}
  track.onunmute=show
  track.onmute=()=>setTimeout(()=>{if(track.muted&&current()&&remoteScreenStreams.get(peerId)===stream)hide()},900)
  track.onended=hide
  if(!track.muted)show()
}`;
  if(html.includes(screenAttachOld))html=html.replace(screenAttachOld,screenAttachNew);
  else if(!html.includes(screenAttachNew))throw Error('Remote screen track lifecycle boundary missing');

  const freshnessOld="setInterval(()=>{let changed=false;for(const [uid,row] of [...ycCommunityStreams])if(!ycStreamPresenceFresh(row)){ycCommunityStreams.delete(uid);changed=true}if(changed)renderVoiceChannels(voiceChannelDefs)},10000)";
  const freshnessNew="function ycStartCommunityStreamFreshnessTimer(){if(ycCommunityStreamFreshnessTimer)return;ycCommunityStreamFreshnessTimer=setInterval(()=>{let changed=false;for(const [uid,row] of [...ycCommunityStreams])if(!ycStreamPresenceFresh(row)){ycCommunityStreams.delete(uid);changed=true}if(changed)renderVoiceChannels(voiceChannelDefs)},10000)}\nfunction ycStopCommunityStreamFreshnessTimer(){if(ycCommunityStreamFreshnessTimer){clearInterval(ycCommunityStreamFreshnessTimer);ycCommunityStreamFreshnessTimer=null}}\nycOnLifecycle('init',ycStartCommunityStreamFreshnessTimer)\nycOnLifecycle('beforeAuth',ycStopCommunityStreamFreshnessTimer)";
  if(!html.includes(freshnessOld))throw Error('Stream freshness timer boundary missing');
  html=html.replace(freshnessOld,freshnessNew);

  if(html.includes(".on('postgres_changes',{event:'*',schema:'public',table:'community_stream_presence',filter:'community_id=eq.'+cid}"))
    throw Error('Global stream heartbeat UPDATE fanout remains');
  return html;
}
