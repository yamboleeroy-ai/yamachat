import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {withStreamViewer} from '../scripts/stream-viewer.mjs';
const gitFile=(rev,file)=>execFileSync('git',['show',rev+':'+file],{encoding:'utf8',maxBuffer:20e6}).replaceAll('\r\n','\n');
const baseline=gitFile('7c1ed3234b7af60c6264ce2b5466dc7263659b09','index.html');
const desktop=gitFile('653d01fb81fd5410908bcb3a3aedc2d9eb7859c0','desktop/desktop-client.html');
const functions=['voicePeer','sendVoiceSignal','ycRenegotiateScreenPeer','ycSendScreenWatchOrdered','toggleScreenShare','stopScreenShare','ycEnsureScreenAudio','attachVoiceAudio','getScreenMediaDevices'];
function section(source,name){
 const re=new RegExp('^(?:async )?function '+name+'\\(','m'),start=source.search(re);assert(start>=0,name+' exists');
 const rest=source.slice(start),next=rest.slice(1).search(/^(?:async )?function /m);
 return (next<0?rest:rest.slice(0,next+1)).replaceAll('ycSyncStreamViewer','renderScreenShareStage').trim();
}
for(const [name,before,after] of [['web',baseline,fs.readFileSync('index.html','utf8')],['desktop',desktop,withStreamViewer(desktop,{desktop:true})]]){
 for(const fn of functions)assert.equal(section(after,fn),section(before,fn),name+' transport changed: '+fn);
 for(const old of ['screenShareStage','ycShareOverlay','__ycMultiStreamViewerInstalled','__ycSafeStreamVolumeInstalled','__ycDeadShareCleanup','__ycStreamResizeInstalled'])assert(!after.includes(old),name+' old UI remains '+old);
 assert.equal((after.match(/const ycStreamViewer=/g)||[]).length,1);
 console.log('PASS '+name+': nine voice/screen transport functions unchanged; one viewer; old UI absent.');
}
