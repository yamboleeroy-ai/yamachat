import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const START='// YC EGRESS HARDENING 2026-10-02 START';
const END='// YC EGRESS HARDENING 2026-10-02 END';

// This is deliberately a runtime-only patch: it changes neither markup nor CSS and
// is applied to every client built from the shared HTML core.
const runtime=`${START}
;(()=>{
 const YC_PRESENCE_HEARTBEAT_MS=60000,YC_SOCIAL_PRESENCE_WATCHDOG_MS=60000;
 const YC_VOICE_HEARTBEAT_HARDENED_MS=45000,YC_VOICE_ROSTER_ACTIVE_MS=90000,YC_VOICE_ROSTER_IDLE_MS=120000;
 const YC_STREAM_WATCHDOG_MS=120000;
 let ycRealtimeCircuitUntil=0,ycRealtimeCircuitTimer=null,ycRealtimeFailureCount=0;
 const ycRealtimeDetail=value=>{try{return typeof value==='string'?value:JSON.stringify(value,Object.getOwnPropertyNames(value||{}))}catch{return String(value||'')}};
 const ycRealtimeQuotaFailure=value=>/\\b402\\b|quota|egress|payment required|usage limit|over limit/i.test(ycRealtimeDetail(value));
 const ycRealtimeCircuitOpen=()=>Date.now()<ycRealtimeCircuitUntil;
 const ycStopRealtimeForQuota=reason=>{
   if(!ycRealtimeQuotaFailure(reason))return false;
   ycRealtimeFailureCount=Math.min(ycRealtimeFailureCount+1,6);
   ycRealtimeCircuitUntil=Date.now()+Math.min(6*60*60*1000,15*60*1000*(2**(ycRealtimeFailureCount-1)));
   clearTimeout(ycRealtimeCircuitTimer);
   ycRealtimeCircuitTimer=setTimeout(()=>{ycRealtimeCircuitTimer=null},Math.max(0,ycRealtimeCircuitUntil-Date.now()));
   try{for(const channel of sb.getChannels?.()||[])void sb.removeChannel(channel)}catch{}
   try{sb.realtime?.disconnect?.()}catch{}
   console.warn('Yamachat Realtime paused after quota restriction until '+new Date(ycRealtimeCircuitUntil).toISOString(),reason);
   return true;
 };
 const ycSafeRealtimeConnect=()=>{
   if(ycRealtimeCircuitOpen())return false;
   try{if(sb?.realtime&&typeof sb.realtime.connect==='function'&&(typeof sb.realtime.isConnected!=='function'||!sb.realtime.isConnected())){sb.realtime.connect();return true}}catch(error){ycStopRealtimeForQuota(error);console.warn('Yamachat Realtime reconnect',error)}
   return false;
 };
 // Supabase exposes upgrade failures through channel callbacks on supported SDKs.
 // Treat explicit 402/quota failures as a circuit-breaker signal; other failures
 // retain normal SDK recovery behaviour.
 window.ycEnsureRealtime=ycSafeRealtimeConnect;
 window.addEventListener('online',()=>setTimeout(ycSafeRealtimeConnect,120));
 window.addEventListener('pageshow',()=>setTimeout(ycSafeRealtimeConnect,160));
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)setTimeout(ycSafeRealtimeConnect,180)});

 const baseTouchPresence=ycTouchPresence;
 let ycPresenceLastWriteAt=0,ycPresenceQueued=false;
 ycTouchPresence=async function(force=false){
   const now=Date.now();
   if(!force&&now-ycPresenceLastWriteAt<15000)return;
   // Ordinary lifecycle/activity calls are coalesced. A changed presence signature
   // still writes immediately, preserving status, foreground and voice transitions.
   const nextState=typeof ycAutoPresenceState==='function'?ycAutoPresenceState():'';
   const nextActivity=typeof ycCurrentActivity==='function'?ycCurrentActivity():'';
   const nextSig=nextState+'|'+nextActivity;
   if(force&&nextSig===ycLastPresenceSig&&now-ycPresenceLastWriteAt<YC_PRESENCE_HEARTBEAT_MS){ycPresenceQueued=true;return}
   ycPresenceQueued=false;const out=await baseTouchPresence.call(this,force);
   ycPresenceLastWriteAt=Date.now();return out;
 };
 const baseStartPresence=ycStartPresence;
 ycStartPresence=function(){
   baseStartPresence.call(this);
   if(ycPresenceTimer){clearInterval(ycPresenceTimer);ycPresenceTimer=setInterval(()=>{if(user&&profile&&!document.hidden)void ycTouchPresence(true)},YC_PRESENCE_HEARTBEAT_MS)}
   if(ycSocialRefreshTimer){clearInterval(ycSocialRefreshTimer);ycSocialRefreshTimer=setInterval(()=>{if(!user||document.hidden)return;if(rightMode==='friends')void ycRefreshVisibleFriendPresence();else if(rightMode==='members')void ycRefreshVisibleMemberPresence();if(ycFriendsHomeMode)void ycMaybePeriodicDmRefresh()},YC_SOCIAL_PRESENCE_WATCHDOG_MS)}
 };
 ycStopPresenceTimers();ycStartPresence();

 const baseSyncVoiceParticipantRow=syncVoiceParticipantRow;
 let ycVoiceParticipantSignature='',ycVoiceParticipantWriteAt=0;
 syncVoiceParticipantRow=function(){
   const signature=[voiceChannel?.id,voiceSessionId,voiceMuted||ycMicTestVoiceHold,voiceDeafened,voiceSpeaking,profile?.display_name||profile?.username].join('|');
   if(signature===ycVoiceParticipantSignature&&Date.now()-ycVoiceParticipantWriteAt<YC_VOICE_HEARTBEAT_HARDENED_MS)return ycVoiceParticipantSyncQueue||Promise.resolve();
   ycVoiceParticipantSignature=signature;ycVoiceParticipantWriteAt=Date.now();return baseSyncVoiceParticipantRow.call(this);
 };
 startVoiceHeartbeat=function(){
   stopVoiceHeartbeat();
   const beat=()=>{if(!voiceChannel||ycRealtimeCircuitOpen())return;subscribeVoiceParticipants();startVoiceRosterRefresh();void syncVoiceParticipantRow().catch(error=>{ycStopRealtimeForQuota(error);console.warn('voice participant keepalive',error)});if(!voiceSignalSub||!voiceSignalReady)void subscribeVoiceSignals().catch(error=>{ycStopRealtimeForQuota(error);console.warn('voice signal reconnect',error)})};
   beat();voiceHeartbeatTimer=setInterval(beat,YC_VOICE_HEARTBEAT_HARDENED_MS);
 };
 startVoiceRosterRefresh=function(){
   const delay=voiceChannel?YC_VOICE_ROSTER_ACTIVE_MS:YC_VOICE_ROSTER_IDLE_MS;
   if(voiceRosterRefreshTimer&&voiceRosterRefreshDelay===delay)return;
   if(voiceRosterRefreshTimer)clearTimeout(voiceRosterRefreshTimer);
   voiceRosterRefreshDelay=delay;voiceRosterRefreshTimer=setTimeout(async()=>{voiceRosterRefreshTimer=null;voiceRosterRefreshDelay=0;try{if(!ycRealtimeCircuitOpen())await refreshVoiceRosterSet(voiceChannelDefs,true)}finally{if(voiceChannelDefs.length||voiceChannel?.id)startVoiceRosterRefresh()}},delay);
 };

 // The stream channel is authoritative. Its timer only revives a failed
 // subscription and never re-reads the table while the subscription is healthy.
 const baseStartCommunityStreamWatch=ycStartCommunityStreamWatch;
 ycStartCommunityStreamWatch=async function(...args){
   const out=await baseStartCommunityStreamWatch.apply(this,args);
   if(ycCommunityStreamPollTimer){clearInterval(ycCommunityStreamPollTimer);ycCommunityStreamPollTimer=setInterval(()=>{if(!currentCommunity?.id||ycRealtimeCircuitOpen())return;if(!ycCommunityStreamSub)void ycStartCommunityStreamWatch()},YC_STREAM_WATCHDOG_MS)}
   return out;
 };

 // Replace the original eager reconnect hook after all core declarations exist.
 // New channels retain their callbacks but their subscription error is inspected.
 const baseChannel=sb.channel.bind(sb);
 sb.channel=function(...args){
   const channel=baseChannel(...args),subscribe=channel.subscribe?.bind(channel);
   if(!subscribe||channel.__ycQuotaGuard)return channel;
   channel.__ycQuotaGuard=true;
   channel.subscribe=(callback,...rest)=>subscribe((status,error)=>{if(ycStopRealtimeForQuota(error)||ycStopRealtimeForQuota(status))return;callback?.(status,error)},...rest);
   return channel;
 };
 window.__ycEgressHardening={ycRealtimeCircuitOpen,ycStopRealtimeForQuota,ycSafeRealtimeConnect,YC_PRESENCE_HEARTBEAT_MS,YC_VOICE_HEARTBEAT_HARDENED_MS,YC_STREAM_WATCHDOG_MS};
})();
${END}`;

export function withEgressHardening(html){
  const globalAttachmentSubscription="attachmentSub=sb.channel('yc-att-'+targetId+'-'+generation).on('postgres_changes',{event:'*',schema:'public',table:'attachments'},payload=>{if(!isCurrent())return;const mid=String(payload.new?.message_id||payload.old?.message_id||'');if(mid&&visibleMessageIds.has(mid)){ycChatAttachmentDirty.add(mid);ycScheduleMessageRefresh(60)}else if(!mid){for(const id of visibleMessageIds)ycChatAttachmentDirty.add(String(id));ycScheduleMessageRefresh(80)}}).subscribe();";
  const scopedAttachmentSubscription="const attachmentFilter=currentChannel?'channel_id=eq.'+currentChannel.id:'direct_thread_id=eq.'+currentThread.id;\n  attachmentSub=sb.channel('yc-att-'+targetId+'-'+generation).on('postgres_changes',{event:'*',schema:'public',table:'attachments',filter:attachmentFilter},payload=>{if(!isCurrent())return;const mid=String(payload.new?.message_id||payload.old?.message_id||'');if(mid&&visibleMessageIds.has(mid)){ycChatAttachmentDirty.add(mid);ycScheduleMessageRefresh(60)}else if(!mid){for(const id of visibleMessageIds)ycChatAttachmentDirty.add(String(id));ycScheduleMessageRefresh(80)}}).subscribe();";
  if(html.includes(globalAttachmentSubscription)) html=html.replace(globalAttachmentSubscription,scopedAttachmentSubscription);
  if(!html.includes("table:'attachments',filter:attachmentFilter"))throw Error('Egress hardening could not scope attachment Realtime');
  if(html.includes(START)){
    const start=html.indexOf(START),end=html.indexOf(END,start);
    if(end<start)throw Error('Malformed existing egress hardening block');
    return html.slice(0,start)+runtime+html.slice(end+END.length);
  }
  // The historical client installed an unconditional reconnect in both the SDK
  // heartbeat callback and foreground handlers. Disable those two paths before
  // adding the guarded replacement below.
  html=html.replace(/heartbeatCallback:\(status\)=>\{if\(status==='disconnected'\)\{queueMicrotask\(\(\)=>\{try\{if\(typeof sb\.realtime\.isConnected!=='function'\|\|!sb\.realtime\.isConnected\(\)\)sb\.realtime\.connect\(\)\}catch\(e\)\{console\.warn\('Yamachat Realtime reconnect',e\)\}\}\)\}\}/,"heartbeatCallback:()=>{}");
  html=html.replace(/function ycEnsureRealtime\(\)\{try\{if\(sb\?\.realtime&&typeof sb\.realtime\.connect==='function'\)\{if\(typeof sb\.realtime\.isConnected!=='function'\|\|!sb\.realtime\.isConnected\(\)\)sb\.realtime\.connect\(\)\}\}catch\(e\)\{console\.warn\('Yamachat Realtime foreground reconnect',e\)\}\}/,"function ycEnsureRealtime(){return false}");
  if(html.includes("heartbeatCallback:(status)=>")||html.includes("function ycEnsureRealtime(){try{if(sb?.realtime"))throw Error('Egress hardening could not disable eager reconnect');
  const marker='window.__ycClientReady=true;';
  if(!html.includes(marker))throw Error('Egress hardening insertion boundary missing');
  return html.replace(marker,runtime+'\n'+marker);
}

if(process.argv[1]===fileURLToPath(import.meta.url)){
  const file=process.argv[2];
  if(!file)throw Error('Usage: node scripts/egress-hardening.mjs <client.html>');
  const resolved=path.resolve(file),html=fs.readFileSync(resolved,'utf8');
  fs.writeFileSync(resolved,withEgressHardening(html));
  console.log('Applied shared egress hardening to '+resolved);
}
