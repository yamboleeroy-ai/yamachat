function replaceBetween(html,startMarker,endMarker,replacement,label){
  const start=html.indexOf(startMarker),end=html.indexOf(endMarker,start);
  if(start<0||end<0||end<=start)throw Error('Voice scale boundary missing: '+label);
  return html.slice(0,start)+replacement+'\n'+html.slice(end);
}

export function withVoiceScaleHardening(html){
  if(html.includes('VOICE SCALE HARDENING 2026-09-28'))return html;

  const stateOld="voiceParticipantSub=null,voiceHeartbeatTimer=null,voiceMissingSince=new Map()";
  const stateNew="voiceParticipantSub=null,voiceParticipantSubChannelId='',voiceHeartbeatTimer=null,voiceRosterRefreshTimer=null,voiceRosterLastRefresh=0,voiceRosterRefreshBusy=null,voiceRemoteSpeaking=new Set(),voiceRemoteVadStops=new Map(),voiceMissingSince=new Map()";
  if(!html.includes(stateOld))throw Error('Voice scale state boundary missing');
  html=html.replace(stateOld,stateNew);

  const speakingOld="(p.speaking&&!p.muted?'is-speaking':'')";
  const speakingNew="(((p.user_id===user?.id?voiceSpeaking:voiceRemoteSpeaking.has(p.user_id))&&!p.muted)?'is-speaking':'')";
  if(!html.includes(speakingOld))throw Error('Voice scale speaking-render boundary missing');
  html=html.replace(speakingOld,speakingNew);

  const participantBlock=`// VOICE SCALE HARDENING 2026-09-28
const YC_VOICE_HEARTBEAT_MS=15000,YC_VOICE_TTL_MS=60000,YC_VOICE_ROSTER_MS=20000
function stopVoiceParticipantSubscription(){if(voiceParticipantSub){try{sb.removeChannel(voiceParticipantSub)}catch{}voiceParticipantSub=null}voiceParticipantSubChannelId=''}
function subscribeVoiceParticipants(){const id=voiceChannel?.id?String(voiceChannel.id):'';if(!id){stopVoiceParticipantSubscription();return}if(voiceParticipantSub&&voiceParticipantSubChannelId===id)return;stopVoiceParticipantSubscription();const filter='channel_id=eq.'+id,sub=sb.channel('yc-voice-participants-'+user.id+'-'+id+'-'+Date.now()).on('postgres_changes',{event:'INSERT',schema:'public',table:'voice_participants',filter},()=>{void refreshVoiceParticipants(id)}).on('postgres_changes',{event:'DELETE',schema:'public',table:'voice_participants',filter},payload=>{const uid=payload.old?.user_id;if(uid&&uid!==user.id)closeVoicePeer(uid);void refreshVoiceParticipants(id)}).subscribe(status=>{if(['CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(status)&&voiceParticipantSub===sub){try{sb.removeChannel(sub)}catch{}voiceParticipantSub=null;voiceParticipantSubChannelId=''}});voiceParticipantSub=sub;voiceParticipantSubChannelId=id}
async function refreshVoiceParticipants(id){if(!id)return;const before=[...(voicePresenceByChannel[id]||[])],cutoff=new Date(Date.now()-YC_VOICE_TTL_MS).toISOString();const {data,error}=await sb.from('voice_participants').select('channel_id,user_id,session_id,username,muted,deafened,speaking,joined_at,last_seen').eq('channel_id',id).gt('last_seen',cutoff).order('joined_at');if(error){console.warn('voice participants',error);return}const after=data||[];voicePresenceByChannel[id]=after;ycVoiceDiffAnnouncements(id,before,after);renderVoiceChannels(voiceChannelDefs);if(voiceChannel?.id===id)syncVoicePeers()}
async function refreshVoiceRosterSet(chs=voiceChannelDefs,force=false){const ids=[...new Set([...(chs||[]).map(c=>String(c.id||'')),String(voiceChannel?.id||'')].filter(Boolean))];if(!ids.length)return;const now=Date.now();if(!force&&now-voiceRosterLastRefresh<3000)return;if(voiceRosterRefreshBusy)return voiceRosterRefreshBusy;voiceRosterLastRefresh=now;voiceRosterRefreshBusy=(async()=>{const cutoff=new Date(Date.now()-YC_VOICE_TTL_MS).toISOString(),{data,error}=await sb.from('voice_participants').select('channel_id,user_id,session_id,username,muted,deafened,speaking,joined_at,last_seen').in('channel_id',ids).gt('last_seen',cutoff).order('joined_at');if(error){console.warn('voice roster refresh',error);return}const grouped=new Map(ids.map(id=>[id,[]]));for(const row of data||[]){const id=String(row.channel_id||'');if(grouped.has(id))grouped.get(id).push(row)}for(const id of ids){const before=[...(voicePresenceByChannel[id]||[])],after=grouped.get(id)||[];voicePresenceByChannel[id]=after;if(String(voiceChannel?.id||'')===id)ycVoiceDiffAnnouncements(id,before,after)}renderVoiceChannels(voiceChannelDefs);if(voiceChannel?.id)syncVoicePeers()})().finally(()=>{voiceRosterRefreshBusy=null});return voiceRosterRefreshBusy}
function startVoiceRosterRefresh(){if(voiceRosterRefreshTimer)return;voiceRosterRefreshTimer=setInterval(()=>{void refreshVoiceRosterSet(voiceChannelDefs,true)},YC_VOICE_ROSTER_MS)}
function stopVoiceRosterRefresh(){if(voiceRosterRefreshTimer){clearInterval(voiceRosterRefreshTimer);voiceRosterRefreshTimer=null}}
function ensureVoiceRooms(chs){const defs=[...(chs||[])];if(voiceChannel?.id&&!defs.some(c=>String(c.id)===String(voiceChannel.id)))defs.push(voiceChannel);const wanted=new Set(defs.map(c=>String(c.id)));for(const id of Object.keys(voicePresenceByChannel))if(!wanted.has(String(id)))delete voicePresenceByChannel[id];subscribeVoiceParticipants();startVoiceRosterRefresh();void refreshVoiceRosterSet(defs)}
`;
  html=replaceBetween(html,'function subscribeVoiceParticipants()','function updateVoicePresence(id)',participantBlock,'participant roster');

  html=replaceBetween(html,'async function trackVoicePresence','function renderVoiceControls()',`async function trackVoicePresence(){await syncVoiceParticipantRow()}`,'presence alias');

  html=replaceBetween(html,'function startVoiceHeartbeat()','function stopVoiceHeartbeat()',`function startVoiceHeartbeat(){stopVoiceHeartbeat();const beat=()=>{if(!voiceChannel)return;subscribeVoiceParticipants();void syncVoiceParticipantRow().catch(e=>console.warn('voice participant keepalive',e));if(!voiceSignalSub||!voiceSignalReady)void subscribeVoiceSignals().catch(e=>console.warn('voice signal reconnect',e));void refreshVoiceParticipants(voiceChannel.id)};beat();voiceHeartbeatTimer=setInterval(beat,YC_VOICE_HEARTBEAT_MS)}`,'heartbeat');

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
attachVoiceAudio=(peerId,stream)=>{ycStartRemoteVoiceActivityDetector(peerId,stream);return ycAttachVoiceAudioBase(peerId,stream)}
`;
  html=html.slice(0,attachStart)+remoteVad+attach+html.slice(attachEnd);

  const localVadOld="voiceSpeaking=next;if(next&&ycLastPresenceSig.startsWith('afk|'))void ycTouchPresence(true);syncVoiceParticipantRow().catch(()=>{});renderVoiceChannels(voiceChannelDefs)";
  const localVadNew="voiceSpeaking=next;if(next&&ycLastPresenceSig.startsWith('afk|'))void ycTouchPresence(true);renderVoiceChannels(voiceChannelDefs)";
  if(!html.includes(localVadOld))throw Error('Voice scale local-VAD boundary missing');
  html=html.replace(localVadOld,localVadNew);

  const closeOld='function closeVoicePeer(peerId){const pc=voicePeers.get(peerId);';
  if(!html.includes(closeOld))throw Error('Voice scale peer cleanup boundary missing');
  html=html.replace(closeOld,'function closeVoicePeer(peerId){ycStopRemoteVoiceActivityDetector(peerId);const pc=voicePeers.get(peerId);');

  const leaveOld="voiceChannel=null;voiceRouteMode='checking';renderVoiceControls();";
  if(!html.includes(leaveOld))throw Error('Voice scale leave boundary missing');
  html=html.replace(leaveOld,"voiceChannel=null;stopVoiceParticipantSubscription();voiceRouteMode='checking';renderVoiceControls();");

  const cleanupOld="function cleanupVoiceRooms(){if(typeof ycStopMicTest==='function')ycStopMicTest();stopVoiceHeartbeat();leaveVoiceChannel(true);";
  if(!html.includes(cleanupOld))throw Error('Voice scale cleanup boundary missing');
  html=html.replace(cleanupOld,"function cleanupVoiceRooms(){if(typeof ycStopMicTest==='function')ycStopMicTest();stopVoiceHeartbeat();stopVoiceRosterRefresh();for(const id of [...voiceRemoteVadStops.keys()])ycStopRemoteVoiceActivityDetector(id);leaveVoiceChannel(true);");

  for(const bad of ["config:{presence:{key:user.id}","voice presence subscribe","voice presence keepalive","yamachat-turn',{method:'GET'}","setTimeout(()=>trackVoicePresence"])
    if(html.includes(bad))throw Error('Voice scale forbidden marker remains: '+bad);

  return html;
}
