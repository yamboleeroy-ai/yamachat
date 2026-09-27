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
 return (next<0?rest:rest.slice(0,next+1)).replaceAll('ycSyncStreamViewer','renderScreenShareStage').trim();
}
for(const [name,before,after] of [['web',baseline,fs.readFileSync('index.html','utf8')],['desktop',desktop,fs.readFileSync('desktop/desktop-client.html','utf8')]]){
 for(const fn of functions){
  if(name==='desktop'&&fn==='stopScreenShare')continue;
  assert.equal(section(after,fn),section(before,fn),name+' transport changed: '+fn);
 }
 if(name==='desktop'){
  const stop=section(after,'stopScreenShare');
  assert(stop.includes("if(typeof ycResetScreenAudioSenders==='function')await ycResetScreenAudioSenders()"),'desktop stop must retire stale stream-audio sender');
  assert(after.includes('async function ycResetScreenAudioSenders()'),'desktop fresh screen-audio transceiver helper missing');
 }
 for(const old of ['screenShareStage','ycShareOverlay','__ycMultiStreamViewerInstalled','__ycSafeStreamVolumeInstalled','__ycDeadShareCleanup','__ycStreamResizeInstalled'])assert(!after.includes(old),name+' old UI remains '+old);
 assert.equal((after.match(/const ycStreamViewer=/g)||[]).length,1);
 assert(after.includes("audio:{restrictOwnAudio:true},systemAudio:'include'"),name+' does not exclude Yamachat playback from stream audio');
 console.log('PASS '+name+': nine protected voice/screen transport functions unchanged; Yamachat playback excluded from stream audio; one viewer; old UI absent.');
}
