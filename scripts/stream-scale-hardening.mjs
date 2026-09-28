function replaceBetween(html,startMarker,endMarker,replacement,label){
  const start=html.indexOf(startMarker),end=html.indexOf(endMarker,start);
  if(start<0||end<0||end<=start)throw Error('Stream scale boundary missing: '+label);
  return html.slice(0,start)+replacement+'\n'+html.slice(end);
}

export function withStreamScaleHardening(html){
  if(html.includes('STREAM SCALE HARDENING 2026-09-28'))return html;

  const stateOld="let ycCommunityStreamSub=null,ycStreamPresenceTimer=null,ycStreamPreviewTimer=null";
  const stateNew="let ycCommunityStreamSub=null,ycCommunityStreamPollTimer=null,ycCommunityStreamLoadBusy=null,ycStreamPresenceTimer=null,ycStreamPreviewTimer=null";
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

  if(html.includes(".on('postgres_changes',{event:'*',schema:'public',table:'community_stream_presence',filter:'community_id=eq.'+cid}"))
    throw Error('Global stream heartbeat UPDATE fanout remains');
  return html;
}
