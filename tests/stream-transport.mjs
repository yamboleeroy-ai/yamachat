import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';

const gitFile=(rev,file)=>execFileSync('git',['show',rev+':'+file],{encoding:'utf8',maxBuffer:20e6}).replaceAll('\r\n','\n');
const baseline=gitFile('fc669b3','index.html');
const desktop=gitFile('fc669b3','desktop/desktop-client.html');
const functions=['voicePeer','sendVoiceSignal','ycRenegotiateScreenPeer','ycSendScreenWatchOrdered','toggleScreenShare','stopScreenShare','ycEnsureScreenAudio','attachVoiceAudio','getScreenMediaDevices'];
function section(source,name){
 source=source.replaceAll('\r\n','\n');
 const re=new RegExp('^(?:async )?function '+name+'\\(','m'),start=source.search(re);assert(start>=0,name+' exists');
 const rest=source.slice(start),next=rest.slice(1).search(/^(?:async )?function /m);
 let end=next<0?rest.length:next+1;
 // ycEnsureScreenAudio is followed by reviewed top-level scheduling before the
 // next function in current desktop builds. Keep the transport lock scoped to
 // the function body instead of accidentally comparing adjacent statements.
 if(name==='ycEnsureScreenAudio'){
  const schedule=rest.search(/^setInterval\(/m);
  if(schedule>0)end=Math.min(end,schedule);
 }
 let out=rest.slice(0,end).replaceAll('ycSyncStreamViewer','renderScreenShareStage').trim();
 if(name==='voicePeer')out=out.replaceAll("setTimeout(()=>{if(voicePeers.get(peerId)===pc&&(pc.connectionState==='failed'||pc.iceConnectionState==='failed'))restartVoicePeer(peerId)},350)","setTimeout(()=>restartVoicePeer(peerId),350)");
 return out;
}
for(const [name,before,after] of [['web',baseline,fs.readFileSync('index.html','utf8')],['desktop',desktop,fs.readFileSync('desktop/desktop-client.html','utf8')]]){
 for(const fn of functions){
  if(fn==='stopScreenShare'||(name==='desktop'&&fn==='attachVoiceAudio'))continue;
  assert.equal(section(after,fn),section(before,fn),name+' transport changed: '+fn);
 }
 assert.equal((after.match(/voicePeers\.get\(peerId\)===pc&&\(pc\.connectionState==='failed'\|\|pc\.iceConnectionState==='failed'\)/g)||[]).length,2,name+' failed reconnect timers must reject stale replacement peers');
 const stop=section(after,'stopScreenShare');
 assert(stop.includes("const ownerUserId=user?.id"),name+' stop must capture the stream owner before async cleanup');
 assert(stop.includes("await ycStopGlobalStreamPresence(ownerUserId)"),name+' stop must await serialized stream-presence cleanup');
 if(name==='desktop'){
  assert(stop.includes("if(typeof ycResetScreenAudioSenders==='function')await ycResetScreenAudioSenders()"),'desktop stop must retire stale stream-audio sender');
  assert(after.includes('async function ycResetScreenAudioSenders()'),'desktop fresh screen-audio transceiver helper missing');
  const voiceAudio=section(after,'attachVoiceAudio');
  assert(voiceAudio.includes("window.__ycScreenAudioTracks?.get?.(peerId)?.id===track.id"),'desktop voice path must reject the dedicated screen-audio track');
  assert(voiceAudio.includes("trackId:track?.id||''"),'desktop voice path must retain track identity for safe stream-audio cleanup');
  assert(after.includes("secondaryAudio=!!e.transceiver&&audioTx.indexOf(e.transceiver)>0"),'desktop must classify the second audio transceiver as stream audio');
 }
 for(const old of ['screenShareStage','ycShareOverlay','__ycMultiStreamViewerInstalled','__ycSafeStreamVolumeInstalled','__ycDeadShareCleanup','__ycStreamResizeInstalled'])assert(!after.includes(old),name+' old UI remains '+old);
 assert.equal((after.match(/const ycStreamViewer=/g)||[]).length,1);
 assert(after.includes("audio:{restrictOwnAudio:true},systemAudio:'include'"),name+' does not exclude Yamachat playback from stream audio');
 console.log('PASS '+name+': protected voice/screen transport functions unchanged except reviewed desktop stream-audio routing; Yamachat playback excluded from stream audio; one viewer; old UI absent.');
}
