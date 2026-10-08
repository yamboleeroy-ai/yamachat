function replaceBetween(html,startMarker,endMarker,replacement,label){
  const start=html.indexOf(startMarker),end=html.indexOf(endMarker,start);
  if(start<0||end<0||end<=start)throw Error('Voice scale boundary missing: '+label);
  return html.slice(0,start)+replacement+'\n'+html.slice(end);
}

export function withVoiceScaleHardening(html){
  if(html.includes('VOICE SCALE HARDENING 2026-09-28'))return html;

  const stateOld="voiceParticipantSub=null,voiceHeartbeatTimer=null,voiceMissingSince=new Map()";
  const stateNew="voiceParticipantSub=null,voiceParticipantSubChannelId='',voiceHeartbeatTimer=null,voiceRosterRefreshTimer=null,voiceRosterLastRefresh=0,voiceRosterRefreshBusy=null,voiceRosterGeneration=0,voiceRemoteSpeaking=new Set(),voiceRemoteVadStops=new Map(),voiceMissingSince=new Map()";
  if(!html.includes(stateOld))throw Error('Voice scale state boundary missing');
  html=html.replace(stateOld,stateNew);

  const signalStateOld="voiceSignalSub=null,voiceSignalReady=false,voiceSignalSeen=new Set()";
  const signalStateNew="voiceSignalSub=null,voiceSignalReady=false,voiceSignalRecoverPromise=null,voiceSignalSeen=new Set()";
  if(!html.includes(signalStateOld))throw Error('Voice signal recovery state boundary missing');
  html=html.replace(signalStateOld,signalStateNew);

  const speakingOld="(p.speaking&&!p.muted?'is-speaking':'')";
  const speakingNew="(((p.user_id===user?.id?voiceSpeaking:voiceRemoteSpeaking.has(p.user_id))&&!p.muted)?'is-speaking':'')";
  if(!html.includes(speakingOld))throw Error('Voice scale speaking-render boundary missing');
  html=html.replace(speakingOld,speakingNew);

  // Rapid mute/deafen/mic-test changes must coalesce into the latest participant lease.
  // Never serialize every intermediate UI state into an unbounded RPC queue.
  const participantSyncOld="let ycVoiceParticipantSyncQueue=Promise.resolve()\nfunction syncVoiceParticipantRow(){if(!voiceChannel||!voiceSessionId||!user)return Promise.resolve();const channelId=voiceChannel.id,sid=voiceSessionId,username=profile.display_name||profile.username||'Uživatel',muted=voiceMuted||ycMicTestVoiceHold,deafened=voiceDeafened,speaking=voiceSpeaking;const run=async()=>{if(!voiceChannel||voiceSessionId!==sid||String(voiceChannel.id)!==String(channelId))return;const {error}=await sb.rpc('set_voice_participant',{p_channel_id:channelId,p_session_id:sid,p_username:username,p_muted:muted,p_deafened:deafened,p_speaking:speaking});if(error)console.warn('voice heartbeat',error)};ycVoiceParticipantSyncQueue=ycVoiceParticipantSyncQueue.catch(()=>{}).then(run);return ycVoiceParticipantSyncQueue}";
  const participantSyncNew="let ycVoiceParticipantSyncQueue=Promise.resolve(),ycVoiceParticipantSyncBusy=false,ycVoiceParticipantSyncDirty=false\nfunction syncVoiceParticipantRow(){if(!voiceChannel||!voiceSessionId||!user)return Promise.resolve();ycVoiceParticipantSyncDirty=true;if(ycVoiceParticipantSyncBusy)return ycVoiceParticipantSyncQueue;ycVoiceParticipantSyncBusy=true;ycVoiceParticipantSyncQueue=(async()=>{try{while(ycVoiceParticipantSyncDirty){ycVoiceParticipantSyncDirty=false;if(!voiceChannel||!voiceSessionId||!user)break;const channelId=voiceChannel.id,sid=voiceSessionId,username=profile.display_name||profile.username||'Uživatel',muted=voiceMuted||ycMicTestVoiceHold,deafened=voiceDeafened,speaking=voiceSpeaking;const {error}=await sb.rpc('set_voice_participant',{p_channel_id:channelId,p_session_id:sid,p_username:username,p_muted:muted,p_deafened:deafened,p_speaking:speaking});if(error)console.warn('voice heartbeat',error);if(!voiceChannel||voiceSessionId!==sid||String(voiceChannel.id)!==String(channelId))ycVoiceParticipantSyncDirty=!!voiceChannel&&!!voiceSessionId}}finally{ycVoiceParticipantSyncBusy=false}})();return ycVoiceParticipantSyncQueue}";
  if(!html.includes(participantSyncOld))throw Error('Voice scale participant sync coalescing boundary missing');
  html=html.replace(participantSyncOld,participantSyncNew);

  const participantBlock=`// VOICE SCALE HARDENING 2026-09-28
// A participant lease must tolerate a delayed 30-second hardened heartbeat.
// A short TTL turns a temporary timer/network delay into a false leave, even
// though the WebRTC call and stream are still connected.
const YC_VOICE_HEARTBEAT_MS=15000,YC_VOICE_TTL_MS=120000,YC_VOICE_ROSTER_MS=20000
let voiceRosterRefreshDelay=0,voiceRosterContextKey=''
function stopVoiceParticipantSubscription(){if(voiceParticipantSub){try{sb.removeChannel(voiceParticipantSub)}catch{}voiceParticipantSub=null}voiceParticipantSubChannelId=''}
function ycPatchVoiceParticipant(id,row){if(!row||String(row.channel_id||'')!==String(id))return;const uid=String(row.user_id||'');if(!uid)return;const before=[...(voicePresenceByChannel[id]||[])],index=before.findIndex(p=>String(p.user_id||'')===uid),old=index<0?null:before[index],next=[...before];if(old)next[index]={...old,...row};else next.push(row);next.sort((a,b)=>String(a.joined_at||'').localeCompare(String(b.joined_at||'')));voicePresenceByChannel[id]=next;const changed=!old||String(old.session_id||'')!==String(row.session_id||'')||!!old.muted!==!!row.muted||!!old.deafened!==!!row.deafened||String(old.username||'')!==String(row.username||'');if(!changed)return;renderVoiceChannels(voiceChannelDefs);if(String(voiceChannel?.id||'')===String(id))syncVoicePeers()}
function subscribeVoiceParticipants(){const id=voiceChannel?.id?String(voiceChannel.id):'';if(!id){stopVoiceParticipantSubscription();return}if(voiceParticipantSub&&voiceParticipantSubChannelId===id)return;stopVoiceParticipantSubscription();const filter='channel_id=eq.'+id,sub=sb.channel('yc-voice-participants-'+user.id+'-'+id+'-'+Date.now()).on('postgres_changes',{event:'INSERT',schema:'public',table:'voice_participants',filter},()=>{void refreshVoiceParticipants(id)}).on('postgres_changes',{event:'UPDATE',schema:'public',table:'voice_participants',filter},payload=>{ycPatchVoiceParticipant(id,payload.new)}).on('postgres_changes',{event:'DELETE',schema:'public',table:'voice_participants',filter},payload=>{const uid=payload.old?.user_id;if(uid&&uid!==user.id)closeVoicePeer(uid);void refreshVoiceParticipants(id)}).subscribe(status=>{if(status==='SUBSCRIBED'){if(voiceParticipantSub===sub&&voiceParticipantSubChannelId===id&&String(voiceChannel?.id||'')===id)void refreshVoiceParticipants(id);return}if(['CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(status)&&voiceParticipantSub===sub){try{sb.removeChannel(sub)}catch{}voiceParticipantSub=null;voiceParticipantSubChannelId=''}});voiceParticipantSub=sub;voiceParticipantSubChannelId=id}
async function refreshVoiceParticipants(id){if(!id)return;const generation=voiceRosterGeneration,uid=String(user?.id||''),before=[...(voicePresenceByChannel[id]||[])],cutoff=new Date(Date.now()-YC_VOICE_TTL_MS).toISOString();const {data,error}=await sb.from('voice_participants').select('channel_id,user_id,session_id,username,muted,deafened,speaking,joined_at,last_seen').eq('channel_id',id).gt('last_seen',cutoff).order('joined_at');if(error){console.warn('voice participants',error);return}if(generation!==voiceRosterGeneration||String(user?.id||'')!==uid)return;const after=data||[];voicePresenceByChannel[id]=after;ycVoiceDiffAnnouncements(id,before,after);renderVoiceChannels(voiceChannelDefs);if(voiceChannel?.id===id)syncVoicePeers()}
async function refreshVoiceRosterSet(chs=voiceChannelDefs,force=false){const ids=[...new Set([...(chs||[]).map(c=>String(c.id||'')),String(voiceChannel?.id||'')].filter(Boolean))];if(!ids.length)return;const now=Date.now();if(!force&&now-voiceRosterLastRefresh<3000)return;if(voiceRosterRefreshBusy)return voiceRosterRefreshBusy;const generation=voiceRosterGeneration,uid=String(user?.id||'');voiceRosterLastRefresh=now;const task=(async()=>{const cutoff=new Date(Date.now()-YC_VOICE_TTL_MS).toISOString(),{data,error}=await sb.from('voice_participants').select('channel_id,user_id,session_id,username,muted,deafened,speaking,joined_at,last_seen').in('channel_id',ids).gt('last_seen',cutoff).order('joined_at');if(error){console.warn('voice roster refresh',error);return}if(generation!==voiceRosterGeneration||String(user?.id||'')!==uid)return;const grouped=new Map(ids.map(id=>[id,[]]));for(const row of data||[]){const id=String(row.channel_id||'');if(grouped.has(id))grouped.get(id).push(row)}for(const id of ids){const before=[...(voicePresenceByChannel[id]||[])],after=grouped.get(id)||[];voicePresenceByChannel[id]=after;if(String(voiceChannel?.id||'')===id)ycVoiceDiffAnnouncements(id,before,after)}renderVoiceChannels(voiceChannelDefs);if(voiceChannel?.id)syncVoicePeers()})();voiceRosterRefreshBusy=task;const clear=()=>{if(voiceRosterRefreshBusy===task)voiceRosterRefreshBusy=null};task.then(clear,clear);return task}
function startVoiceRosterRefresh(){const delay=voiceChannel?YC_VOICE_HEARTBEAT_MS:YC_VOICE_ROSTER_MS;if(voiceRosterRefreshTimer&&voiceRosterRefreshDelay===delay)return;if(voiceRosterRefreshTimer)clearTimeout(voiceRosterRefreshTimer);voiceRosterRefreshDelay=delay;voiceRosterRefreshTimer=setTimeout(async()=>{voiceRosterRefreshTimer=null;voiceRosterRefreshDelay=0;try{await refreshVoiceRosterSet(voiceChannelDefs,true)}finally{if(voiceChannelDefs.length||voiceChannel?.id)startVoiceRosterRefresh()}},delay)}
function stopVoiceRosterRefresh(){++voiceRosterGeneration;voiceRosterRefreshBusy=null;voiceRosterLastRefresh=0;if(voiceRosterRefreshTimer){clearTimeout(voiceRosterRefreshTimer);voiceRosterRefreshTimer=null}voiceRosterRefreshDelay=0;voiceRosterContextKey=''}
function ensureVoiceRooms(chs){const defs=[...(chs||[])];if(voiceChannel?.id&&!defs.some(c=>String(c.id)===String(voiceChannel.id)))defs.push(voiceChannel);const ids=[...new Set(defs.map(c=>String(c.id||'')).filter(Boolean))].sort(),contextKey=String(voiceChannel?.id||'')+'|'+ids.join(',');const contextChanged=contextKey!==voiceRosterContextKey;if(contextChanged){++voiceRosterGeneration;voiceRosterRefreshBusy=null;voiceRosterLastRefresh=0}voiceRosterContextKey=contextKey;const wanted=new Set(ids);for(const id of Object.keys(voicePresenceByChannel))if(!wanted.has(String(id)))delete voicePresenceByChannel[id];subscribeVoiceParticipants();startVoiceRosterRefresh();if(contextChanged)void refreshVoiceRosterSet(defs)}
`;
  html=replaceBetween(html,'function subscribeVoiceParticipants()','function updateVoicePresence(id)',participantBlock,'participant roster');

  html=replaceBetween(html,'async function trackVoicePresence','function renderVoiceControls()',`async function trackVoicePresence(){await syncVoiceParticipantRow()}`,'presence alias');

  const signalBlock=`async function recoverVoiceSignals(){const uid=String(user?.id||'');if(!uid)return;if(voiceSignalRecoverPromise)return voiceSignalRecoverPromise;const task=(async()=>{try{const stale=new Date(Date.now()-60000).toISOString();await sb.from('voice_signals').delete().eq('to_user',uid).lt('created_at',stale);if(String(user?.id||'')!==uid)return;const recent=new Date(Date.now()-30000).toISOString(),{data,error}=await sb.from('voice_signals').select('id,channel_id,from_user,to_user,signal_type,payload,created_at').eq('to_user',uid).gt('created_at',recent).order('created_at').limit(200);if(error){console.warn('voice signal recovery',error);return}if(String(user?.id||'')!==uid)return;for(const row of data||[]){if(String(user?.id||'')!==uid)break;await consumeVoiceSignalRow(row)}}catch(e){console.warn('voice signal recovery',e)}})();voiceSignalRecoverPromise=task;const clear=()=>{if(voiceSignalRecoverPromise===task)voiceSignalRecoverPromise=null};task.then(clear,clear);return task}
async function stopVoiceSignals(){const ch=voiceSignalSub;voiceSignalSub=null;voiceSignalRecoverPromise=null;voiceSignalReady=false;voiceSignalError='';if(ch)try{await sb.removeChannel(ch)}catch{}}
async function subscribeVoiceSignals(){if(voiceSignalSub&&voiceSignalReady)return;const uid=String(user?.id||'');if(!uid)return;if(voiceSignalSub){const old=voiceSignalSub;voiceSignalSub=null;try{await sb.removeChannel(old)}catch{}}voiceSignalReady=false;await new Promise(resolve=>{let settled=false,timer=null;const settle=()=>{if(settled)return;settled=true;if(timer)clearTimeout(timer);resolve(null)};const sub=sb.channel('yc-voice-db-'+uid+'-'+Date.now()).on('postgres_changes',{event:'INSERT',schema:'public',table:'voice_signals',filter:'to_user=eq.'+uid},({new:row})=>{if(voiceSignalSub===sub&&String(user?.id||'')===uid)void consumeVoiceSignalRow(row)});voiceSignalSub=sub;sub.subscribe(status=>{if(voiceSignalSub!==sub||String(user?.id||'')!==uid){settle();return}if(status==='SUBSCRIBED'){voiceSignalReady=true;voiceSignalError='';updateVoiceConnectionStatus();void recoverVoiceSignals();settle();return}if(['CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(status)){voiceSignalReady=false;voiceSignalError='Realtime '+status.toLowerCase();voiceSignalSub=null;updateVoiceConnectionStatus();try{void sb.removeChannel(sub)}catch{}settle()}});timer=setTimeout(settle,2500)})}
`;
  html=replaceBetween(html,'async function subscribeVoiceSignals()','async function consumeVoiceSignalRow(row)',signalBlock,'signal recovery');

  const consumeStartOld="async function consumeVoiceSignalRow(row){if(!row||!voiceChannel||row.channel_id!==voiceChannel.id)return;";
  const consumeStartNew="async function consumeVoiceSignalRow(row){if(!row||!user?.id||String(row.to_user||'')!==String(user.id)||!voiceChannel||row.channel_id!==voiceChannel.id)return;";
  if(!html.includes(consumeStartOld))throw Error('Voice signal account guard boundary missing');
  html=html.replace(consumeStartOld,consumeStartNew);
  const seenOld="voiceSignalSeen.add(row.id);if(voiceSignalSeen.size>600)voiceSignalSeen.clear();";
  const seenNew="voiceSignalSeen.add(row.id);if(voiceSignalSeen.size>600)while(voiceSignalSeen.size>400)voiceSignalSeen.delete(voiceSignalSeen.values().next().value);";
  if(!html.includes(seenOld))throw Error('Voice signal dedup boundary missing');
  html=html.replace(seenOld,seenNew);
  const iceOld="else{const q=voiceIceQueues.get(peerId)||[];q.push(msg.candidate);voiceIceQueues.set(peerId,q)}}";
  const iceNew="else{const q=voiceIceQueues.get(peerId)||[],key=String(msg.candidate?.candidate||'');if(!key||!q.some(c=>String(c?.candidate||'')===key)){q.push(msg.candidate);if(q.length>128)q.splice(0,q.length-128)}voiceIceQueues.set(peerId,q)}}";
  if(!html.includes(iceOld))throw Error('Voice ICE queue boundary missing');
  html=html.replace(iceOld,iceNew);

  html=replaceBetween(html,'function startVoiceHeartbeat()','function stopVoiceHeartbeat()',`function startVoiceHeartbeat(){stopVoiceHeartbeat();const beat=()=>{if(!voiceChannel)return;subscribeVoiceParticipants();startVoiceRosterRefresh();void syncVoiceParticipantRow().catch(e=>console.warn('voice participant keepalive',e));if(!voiceSignalSub||!voiceSignalReady)void subscribeVoiceSignals().catch(e=>console.warn('voice signal reconnect',e))};beat();voiceHeartbeatTimer=setInterval(beat,YC_VOICE_HEARTBEAT_MS)}`,'heartbeat');

  const reconnectFailedOld="setTimeout(()=>restartVoicePeer(peerId),350)";
  const reconnectFailedNew="setTimeout(()=>{if(voicePeers.get(peerId)===pc&&(pc.connectionState==='failed'||pc.iceConnectionState==='failed'))restartVoicePeer(peerId)},350)";
  const reconnectFailedCount=html.split(reconnectFailedOld).length-1;if(reconnectFailedCount!==2)throw Error('Voice failed reconnect timer boundary missing');
  html=html.split(reconnectFailedOld).join(reconnectFailedNew);
  // Recover from transient transport loss, but never fan out a retry storm.
  // Retry ownership stays with the current PeerConnection and is released on
  // connection or close; delay grows exponentially and is jittered.
  const restartOld="async function restartVoicePeer(peerId){const pc=voicePeers.get(peerId);if(!pc||!voiceChannel||String(user.id)>=String(peerId))return;try{const offer=await pc.createOffer({iceRestart:true});await pc.setLocalDescription(offer);await sendVoiceSignal(peerId,{signal_type:'offer',sdp:pc.localDescription})}catch{}}";
  const restartNew="const YC_VOICE_RETRY_MAX_ATTEMPTS=5,YC_VOICE_RETRY_BASE_MS=800,YC_VOICE_RETRY_CAP_MS=12000;const ycVoiceRetryState=new Map();\nfunction ycClearVoiceRetry(peerId){const retry=ycVoiceRetryState.get(peerId);if(retry?.timer)clearTimeout(retry.timer);ycVoiceRetryState.delete(peerId)}\nfunction ycScheduleVoiceRetry(peerId,pc){if(voicePeers.get(peerId)!==pc||!voiceChannel)return;const retry=ycVoiceRetryState.get(peerId)||{attempt:0,timer:null};if(retry.timer||retry.attempt>=YC_VOICE_RETRY_MAX_ATTEMPTS)return;const attempt=retry.attempt++,base=Math.min(YC_VOICE_RETRY_CAP_MS,YC_VOICE_RETRY_BASE_MS*(2**attempt)),delay=Math.round(base*(.8+Math.random()*.4));retry.timer=setTimeout(()=>{retry.timer=null;if(voicePeers.get(peerId)!==pc||!voiceChannel||!['failed','disconnected'].includes(pc.connectionState)){ycClearVoiceRetry(peerId);return}void restartVoicePeer(peerId)},delay);ycVoiceRetryState.set(peerId,retry)}\nasync function restartVoicePeer(peerId){const pc=voicePeers.get(peerId);if(!pc||!voiceChannel||String(user.id)>=String(peerId))return;try{const offer=await pc.createOffer({iceRestart:true});await pc.setLocalDescription(offer);await sendVoiceSignal(peerId,{signal_type:'offer',sdp:pc.localDescription});ycScheduleVoiceRetry(peerId,pc)}catch{ycScheduleVoiceRetry(peerId,pc)}}";
  if(!html.includes(restartOld))throw Error('Voice retry boundary missing');
  html=html.replace(restartOld,restartNew);
  const offerRetryOld="setTimeout(()=>{const cur=voicePeers.get(p.user_id),current=(voicePresenceByChannel[voiceChannel?.id]||[]).find(x=>x.user_id===p.user_id);if(cur&&cur.connectionState!=='connected'&&!cur.remoteDescription&&(!expectedSession||current?.session_id===expectedSession)){closeVoicePeer(p.user_id);void syncVoicePeers()}},3200)";
  const offerRetryNew="setTimeout(()=>{const cur=voicePeers.get(p.user_id),current=(voicePresenceByChannel[voiceChannel?.id]||[]).find(x=>x.user_id===p.user_id);if(cur===pc&&cur.connectionState!=='connected'&&!cur.remoteDescription&&(!expectedSession||current?.session_id===expectedSession)){closeVoicePeer(p.user_id);void syncVoicePeers()}},3200)";
  if(!html.includes(offerRetryOld))throw Error('Voice offer retry identity boundary missing');
  html=html.replace(offerRetryOld,offerRetryNew);

  const routeOld="function scheduleVoiceRouteCheck(){setTimeout(()=>void detectVoiceRoute(),450);setTimeout(()=>void detectVoiceRoute(),2200)}";
  const routeNew="let voiceRouteCheckFastTimer=null,voiceRouteCheckSlowTimer=null\nfunction stopVoiceRouteChecks(){if(voiceRouteCheckFastTimer){clearTimeout(voiceRouteCheckFastTimer);voiceRouteCheckFastTimer=null}if(voiceRouteCheckSlowTimer){clearTimeout(voiceRouteCheckSlowTimer);voiceRouteCheckSlowTimer=null}}\nfunction scheduleVoiceRouteCheck(){if(!voiceRouteCheckFastTimer)voiceRouteCheckFastTimer=setTimeout(()=>{voiceRouteCheckFastTimer=null;void detectVoiceRoute()},450);if(voiceRouteCheckSlowTimer)clearTimeout(voiceRouteCheckSlowTimer);voiceRouteCheckSlowTimer=setTimeout(()=>{voiceRouteCheckSlowTimer=null;void detectVoiceRoute()},2200)}";
  if(!html.includes(routeOld))throw Error('Voice route check boundary missing');
  html=html.replace(routeOld,routeNew);
  html=html.replace("stopVoiceHeartbeat();stopVoiceActivityDetector();voiceSpeaking=false;","stopVoiceHeartbeat();stopVoiceActivityDetector();stopVoiceRouteChecks();voiceSpeaking=false;");
  html=html.replace("try{stopVoiceHeartbeat()}catch{};try{stopVoiceActivityDetector()}catch{};try{stopVoiceMeter()}catch{};voiceSpeaking=false;","try{stopVoiceHeartbeat()}catch{};try{stopVoiceActivityDetector()}catch{};try{stopVoiceRouteChecks()}catch{};try{stopVoiceMeter()}catch{};voiceSpeaking=false;");

  const turn=`async function loadVoiceTurnServers(){
  if(voiceTurnReady&&voiceIceServers?.length&&Date.now()-ycVoiceTurnLoadedAt<120000)return true
  voiceTurnReady=false;voiceTurnProvider='none'
  try{const {data,error}=await sb.functions.invoke('yamachat-turn-cloudflare',{method:'GET'});if(!error&&data?.iceServers?.length){voiceIceServers=[...data.iceServers,{urls:['stun:stun.cloudflare.com:3478','stun:stun.cloudflare.com:53']}];voiceTurnReady=true;voiceTurnProvider='cloudflare';ycVoiceTurnLoadedAt=Date.now();return true}}catch(e){console.warn('Cloudflare TURN credentials',e)}
  voiceIceServers=[{urls:['stun:stun.cloudflare.com:3478','stun:stun.cloudflare.com:53']}];ycVoiceTurnLoadedAt=Date.now();return false
}`;
  html=replaceBetween(html,'async function loadVoiceTurnServers(){','async function joinVoiceChannel(ch)',turn,'Cloudflare TURN');

  const attachStart=html.indexOf('function attachVoiceAudio(peerId,stream)');
  const attachEnd=html.indexOf('\nasync function toggleVoiceMute()',attachStart);
  if(attachStart<0||attachEnd<0)throw Error('Voice scale attach-audio boundary missing');
  const attach=html.slice(attachStart,attachEnd);
  const remoteVad=`function ycStopRemoteVoiceActivityDetector(peerId){const stop=voiceRemoteVadStops.get(peerId);if(stop){try{stop()}catch{}voiceRemoteVadStops.delete(peerId)}voiceRemoteSpeaking.delete(peerId);const row=document.querySelector('.voice-user[data-user-id="'+CSS.escape(String(peerId))+'"]');row?.classList.remove('is-speaking')}
function ycSetRemoteSpeaking(peerId,active){const next=!!active;if(next)voiceRemoteSpeaking.add(peerId);else voiceRemoteSpeaking.delete(peerId);const row=document.querySelector('.voice-user[data-user-id="'+CSS.escape(String(peerId))+'"]');row?.classList.toggle('is-speaking',next)}
function ycStartRemoteVoiceActivityDetector(peerId,stream){ycStopRemoteVoiceActivityDetector(peerId);try{const ctx=voiceAudioContext;if(!ctx)return;const src=ctx.createMediaStreamSource(stream),an=ctx.createAnalyser();an.fftSize=256;an.smoothingTimeConstant=.4;src.connect(an);const arr=new Uint8Array(an.fftSize);let raf=0,lastSample=0,noise=.003,speakingUntil=0,last=false;const tick=ts=>{if(!lastSample||ts-lastSample>=48){lastSample=ts;an.getByteTimeDomainData(arr);let sum=0;for(const v of arr){const x=(v-128)/128;sum+=x*x}const rms=Math.sqrt(sum/arr.length),now=performance.now();if(!last&&rms<.035)noise=noise*.97+rms*.03;const threshold=Math.max(.008,noise*2.1);if(rms>threshold)speakingUntil=now+360;const next=now<speakingUntil;if(next!==last){last=next;ycSetRemoteSpeaking(peerId,next)}}raf=requestAnimationFrame(tick)};raf=requestAnimationFrame(tick);voiceRemoteVadStops.set(peerId,()=>{cancelAnimationFrame(raf);try{src.disconnect()}catch{}try{an.disconnect()}catch{}ycSetRemoteSpeaking(peerId,false)})}catch(e){console.warn('remote voice activity',e)}}
const ycAttachVoiceAudioBase=attachVoiceAudio
attachVoiceAudio=(peerId,stream)=>{if(!voiceChannel||!voicePeers.has(peerId))return;ycStartRemoteVoiceActivityDetector(peerId,stream);return ycAttachVoiceAudioBase(peerId,stream)}
`;
  html=html.slice(0,attachStart)+remoteVad+attach+html.slice(attachEnd);

  const localVadOld="voiceSpeaking=next;if(next&&ycLastPresenceSig.startsWith('afk|'))void ycTouchPresence(true);syncVoiceParticipantRow().catch(()=>{});renderVoiceChannels(voiceChannelDefs)";
  const localVadNew="voiceSpeaking=next;if(next&&ycLastPresenceSig.startsWith('afk|'))void ycTouchPresence(true);renderVoiceChannels(voiceChannelDefs)";
  if(!html.includes(localVadOld))throw Error('Voice scale local-VAD boundary missing');
  html=html.replace(localVadOld,localVadNew);

  const missingPeerOld="for(const id of [...voicePeers.keys()]){if(ids.has(id)){voiceMissingSince.delete(id);continue}const pc=voicePeers.get(id);if(pc?.connectionState==='connected'){voiceMissingSince.delete(id);continue}const since=voiceMissingSince.get(id)||now;voiceMissingSince.set(id,since);if(now-since>60000)closeVoicePeer(id)}";
  const missingPeerNew="for(const id of [...voicePeers.keys()]){if(ids.has(id)){voiceMissingSince.delete(id);continue}const since=voiceMissingSince.get(id)||now;voiceMissingSince.set(id,since);if(now-since>60000)closeVoicePeer(id)}";
  if(!html.includes(missingPeerOld))throw Error('Voice scale missing-peer cleanup boundary missing');
  html=html.replace(missingPeerOld,missingPeerNew);

  const closeOld='function closeVoicePeer(peerId){const pc=voicePeers.get(peerId);';
  if(!html.includes(closeOld))throw Error('Voice scale peer cleanup boundary missing');
  html=html.replace(closeOld,'function closeVoicePeer(peerId){try{ycClearVoiceRetry(peerId)}catch{}ycStopRemoteVoiceActivityDetector(peerId);voiceMissingSince.delete(peerId);const pc=voicePeers.get(peerId);');

  const presenceLeaveOld="const sid=voiceSessionId,room=voiceRooms.get(old.id);\n        const clearPromise=(async()=>{try{const {error}=await sb.rpc('clear_voice_participant',{p_session_id:sid});if(error)console.warn('clear voice participant',error)}catch(e){console.warn('clear voice participant',e)}})();\n        const untrackPromise=(async()=>{try{const pending=room?.untrack();if(pending&&typeof pending.then==='function')await pending}catch(e){console.warn('voice untrack',e)}})();\n        const cleanupSettled=Promise.allSettled([clearPromise,untrackPromise]);";
  const presenceLeaveNew="const sid=voiceSessionId;\n        const clearPromise=(async()=>{try{const {error}=await sb.rpc('clear_voice_participant',{p_session_id:sid});if(error)console.warn('clear voice participant',error)}catch(e){console.warn('clear voice participant',e)}})();\n        const cleanupSettled=Promise.allSettled([clearPromise]);";
  if(!html.includes(presenceLeaveOld))throw Error('Voice scale leave Presence cleanup boundary missing');
  html=html.replace(presenceLeaveOld,presenceLeaveNew);

  const leaveOld="voiceChannel=null;voiceRouteMode='checking';renderVoiceControls();";
  if(!html.includes(leaveOld))throw Error('Voice scale leave boundary missing');
  html=html.replace(leaveOld,"voiceChannel=null;stopVoiceParticipantSubscription();await stopVoiceSignals();voiceRouteMode='checking';renderVoiceControls();");

  const leavePeerCleanupOld="for(const [id,pc] of voicePeers){try{pc.close()}catch{}const a=$('voice-audio-'+id);if(a)a.remove()}";
  const leavePeerCleanupNew="for(const id of [...voiceRemoteVadStops.keys()])ycStopRemoteVoiceActivityDetector(id);for(const [id,pc] of voicePeers){ycClearVoiceRetry(id);try{pc.close()}catch{}const a=$('voice-audio-'+id);if(a)a.remove()}voiceMissingSince.clear();try{ycStreamWatchEpoch.clear();ycStreamWatchStarts.clear();ycStreamWatchSignals.clear()}catch{}";
  if(!html.includes(leavePeerCleanupOld))throw Error('Voice leave remote VAD cleanup boundary missing');
  html=html.replace(leavePeerCleanupOld,leavePeerCleanupNew);

  const altHeadOld="const old=voiceChannel,sid=voiceSessionId,room=old?voiceRooms.get(old.id):null,pendingParticipantSync=ycVoiceParticipantSyncQueue;";
  const altHeadNew="const old=voiceChannel,sid=voiceSessionId,pendingParticipantSync=ycVoiceParticipantSyncQueue;";
  if(!html.includes(altHeadOld))throw Error('Voice scale alternate disconnect head missing');
  html=html.replace(altHeadOld,altHeadNew);

  const altAudioOld="try{for(const [,nodes] of voiceAudioNodes){nodes.src?.disconnect();nodes.compressor?.disconnect();nodes.gain?.disconnect()}}catch{}";
  if(!html.includes(altAudioOld))throw Error('Voice scale alternate audio cleanup missing');
  html=html.replace(altAudioOld,altAudioOld+";try{for(const id of [...voiceRemoteVadStops.keys()])ycStopRemoteVoiceActivityDetector(id)}catch{};voiceMissingSince.clear();try{ycStreamWatchEpoch.clear();ycStreamWatchStarts.clear();ycStreamWatchSignals.clear()}catch{}");

  const altStateOld="voiceSessionId='';voiceChannel=null;voiceMuted=false;voiceDeafened=false;voiceRouteMode='checking';";
  if(!html.includes(altStateOld))throw Error('Voice scale alternate state cleanup missing');
  html=html.replace(altStateOld,"voiceSessionId='';voiceChannel=null;stopVoiceParticipantSubscription();void stopVoiceSignals();voiceMuted=false;voiceDeafened=false;voiceRouteMode='checking';");

  const altBgOld="if(old){toast('Odpojeno z hlasového kanálu.');setTimeout(()=>{try{updateVoicePresence(old.id)}catch{}},80);void (async()=>{try{await pendingParticipantSync}catch{}try{if(sid)await sb.rpc('clear_voice_participant',{p_session_id:sid})}catch(e){console.warn('background voice clear',e)}try{const p=room?.untrack();if(p&&typeof p.then==='function')await p}catch(e){console.warn('background voice untrack',e)}})()}";
  const altBgNew="if(old){toast('Odpojeno z hlasového kanálu.');setTimeout(()=>{try{updateVoicePresence(old.id)}catch{}},80);void (async()=>{try{await pendingParticipantSync}catch{}try{if(sid)await sb.rpc('clear_voice_participant',{p_session_id:sid})}catch(e){console.warn('background voice clear',e)}})()}";
  if(!html.includes(altBgOld))throw Error('Voice scale alternate Presence cleanup missing');
  html=html.replace(altBgOld,altBgNew);

  const cleanupBlock=`let ycVoiceCleanupPromise=Promise.resolve(),ycVoiceCleanupActive=false
function cleanupVoiceRooms(){
  if(typeof ycStopMicTest==='function')ycStopMicTest();
  stopVoiceHeartbeat();stopVoiceRosterRefresh();
  for(const id of [...voiceRemoteVadStops.keys()])ycStopRemoteVoiceActivityDetector(id);
  if(!ycVoiceCleanupActive){
    ycVoiceCleanupActive=true;
    ycVoiceCleanupPromise=(async()=>{
      await leaveVoiceChannel(true);
      for(const [,room] of voiceRooms)try{await sb.removeChannel(room)}catch{}
      voiceRooms.clear();voicePresenceByChannel={};voiceChannelDefs=[];voiceMissingSince.clear();
      stopVoiceParticipantSubscription();await stopVoiceSignals();
    })().catch(e=>console.warn('voice cleanup',e)).finally(()=>{ycVoiceCleanupActive=false});
  }
  return ycVoiceCleanupPromise;
}
`;
  const cleanupEndMarker=html.includes('function ycReleaseShortAudioNodes(source,gain)')?'function ycReleaseShortAudioNodes(source,gain)':'function unlockVoiceAudio()';
  html=replaceBetween(html,'function cleanupVoiceRooms(){',cleanupEndMarker,cleanupBlock,'voice auth cleanup');

  const initBarrierOld="async function initApp(s){\n  window.YamachatBootGuard?.begin();\n  const generation=++ycAuthGeneration,uid=s.user.id;\n  const active=()=>generation===ycAuthGeneration&&user?.id===uid;\n  session=s;user=s.user;";
  const initBarrierNew="async function initApp(s){\n  window.YamachatBootGuard?.begin();\n  const generation=++ycAuthGeneration,uid=s.user.id,authActive=()=>generation===ycAuthGeneration;\n  try{await ycVoiceCleanupPromise}catch(e){console.warn('previous voice cleanup',e)}\n  if(!authActive())return false;\n  session=s;user=s.user;const active=()=>generation===ycAuthGeneration&&user?.id===uid;";
  if(!html.includes(initBarrierOld))throw Error('Auth/voice cleanup barrier boundary missing');
  html=html.replace(initBarrierOld,initBarrierNew);

  const silentRefreshOld="if(old){setTimeout(()=>updateVoicePresence(old.id),150);if(!silent)toast('Odpojeno z hlasového kanálu.')}";
  const silentRefreshNew="if(old){if(!silent)setTimeout(()=>updateVoicePresence(old.id),150);if(!silent)toast('Odpojeno z hlasového kanálu.')}";
  if(!html.includes(silentRefreshOld))throw Error('Silent voice refresh boundary missing');
  html=html.replace(silentRefreshOld,silentRefreshNew);

  // The participant roster diff already owns join/leave announcements.
  // Retire the older global voice_participants listener and auxiliary broadcast wrapper.
  const voiceNamesStart=html.indexOf('// reliable voice join/leave name announcements');
  const voiceNamesEnd=html.indexOf('\n\n// hover user profile cards',voiceNamesStart);
  if(voiceNamesStart<0||voiceNamesEnd<0)throw Error('Voice scale auxiliary announcement boundary missing');
  const scaleVoiceNames=`// scale-safe voice join/leave announcements
// The active-room voice_participants roster diff is authoritative.
try{joinVoiceChannel=ycOriginalJoinVoiceChannel;leaveVoiceChannel=ycOriginalLeaveVoiceChannel;void ycVoiceUnsubscribeAnnouncement()}catch{}
`;
  html=html.slice(0,voiceNamesStart)+scaleVoiceNames+html.slice(voiceNamesEnd);

  // Presence heartbeat writes remain leases, but inbound realtime must never fan every user's
  // 20-second heartbeat to every connected client. Friends/members already refresh in batches.
  const presenceStart=html.indexOf('function ycEnsurePresenceRealtime(){');
  const presenceEnd=html.indexOf('\nasync function ycStopPresenceRealtime()',presenceStart);
  if(presenceStart<0||presenceEnd<0)throw Error('Presence scale realtime boundary missing');
  const scalePresence=`function ycEnsurePresenceRealtime(){
  if(!user||ycPresenceRealtimeSub)return
  ycPresenceRealtimeSub=sb.channel('yc-own-profile-live-'+user.id+'-'+Date.now())
    .on('postgres_changes',{event:'UPDATE',schema:'public',table:'profiles',filter:'id=eq.'+user.id},payload=>{const row=payload.new||{};profile={...profile,...row};ycLastPresenceSig='';ycRefreshOwnPresenceUi();void ycTouchPresence(true)})
    .subscribe(status=>{if(status==='SUBSCRIBED')ycRefreshVisibleSocialSoon()})
}`;
  html=html.slice(0,presenceStart)+scalePresence+html.slice(presenceEnd);

  // Window focus/minimize wake must repair audio/lease only; roster reads are centrally scheduled.
  html=html.replace("      try{if(voiceChannel?.id)void refreshVoiceParticipants(voiceChannel.id)}catch{}\n",'');

  for(const bad of ["config:{presence:{key:user.id}","voice presence subscribe","voice presence keepalive","yamachat-turn',{method:'GET'}","setTimeout(()=>trackVoicePresence","yc-voice-name-events-","table:'user_presence'},payload=>ycHandlePresenceRealtime"])
    if(html.includes(bad))throw Error('Voice scale forbidden marker remains: '+bad);

  return html;
}
