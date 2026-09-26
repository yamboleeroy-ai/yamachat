const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const bridge=String.raw`
window.streamTest={
 async start(){
  const canvas=document.createElement('canvas');canvas.width=960;canvas.height=540;
  const ctx=canvas.getContext('2d');let frame=0;
  const timer=setInterval(()=>{ctx.fillStyle='#112837';ctx.fillRect(0,0,960,540);ctx.fillStyle='#70e4e8';ctx.font='40px sans-serif';ctx.fillText('Yamachat · testovací stream',80,180);ctx.fillText(String(++frame),80,280)},80);
  const source=canvas.captureStream(12),sender=new RTCPeerConnection(),receiver=new RTCPeerConnection();
  sender.onicecandidate=e=>{if(e.candidate)receiver.addIceCandidate(e.candidate).catch(()=>{})};
  receiver.onicecandidate=e=>{if(e.candidate)sender.addIceCandidate(e.candidate).catch(()=>{})};
  voiceChannel={id:'voice-a',name:'Test voice',community_id:'community-a'};voiceSessionId='test-session';
  voicePresenceByChannel['voice-a']=[{user_id:'peer',username:'Testující streamer'}];
  voicePeers.set('peer',receiver);voiceScreenActiveByUser.add('peer');
  receiver.ontrack=e=>attachVoiceScreen('peer',e.streams[0]);
  source.getTracks().forEach(t=>sender.addTrack(t,source));
  await receiver.setRemoteDescription(await sender.createOffer().then(async offer=>{await sender.setLocalDescription(offer);return offer}));
  await sender.setRemoteDescription(await receiver.createAnswer().then(async answer=>{await receiver.setLocalDescription(answer);return answer}));
  await ycWatchScreenShare('peer');
  this.sender=sender;this.receiver=receiver;this.source=source;this.timer=timer;
  this.firstVideo=document.querySelector('.yc-stream-viewer video');
  this.firstPeer=voicePeers.get('peer');
 },
 async navigate(where){
  if(where==='channel')await selectChannel('chat-b');
  if(where==='server')await selectCommunity('community-b');
  if(where==='friends')window.__ycV3NavRegistryBridge.showFriendsHome();
  if(where==='dm')await selectThread('dm-a');
  if(where==='settings')ycOpenAppSettings();
  ycSyncStreamViewer();
 },
 same(){return this.firstVideo===document.querySelector('.yc-stream-viewer video')&&this.firstPeer===voicePeers.get('peer')},
 stop(){return handleVoiceSignal({to:user.id,from:'peer',channel_id:voiceChannel.id,signal_type:'screen-state',active:false})},
 detach(){closeVoicePeer('peer')},
 sync(){ycSyncStreamViewer()},
 pending(){screenWatchPendingByUser.add('peer');ycSyncStreamViewer()},
 restored(){screenWatchPendingByUser.delete('peer');ycSyncStreamViewer()},
 async unavailable(){voiceScreenActiveByUser.add('missing-peer');await ycWatchScreenShare('missing-peer')},
 watched(){return screenWatchingByUser.has('peer')},
 async recovery(){const ids=ycStreamViewer.beginRecovery();screenWatchingByUser.clear();remoteScreenStreams.clear();ycSyncStreamViewer();await ycStreamViewer.endRecovery(ids,true)},
 cleanup(){clearInterval(this.timer);this.source?.getTracks().forEach(t=>t.stop());this.sender?.close();this.receiver?.close()}
};
`;
function html(desktop=false){
 const file=desktop?'desktop-client-dist/desktop-client.html':'index.html';
 return fs.readFileSync(path.join(root,file),'utf8').replace('// Register every feature before restoring a cached session.',bridge+'\n// Register every feature before restoring a cached session.');
}
function mock(){
 return fs.readFileSync(path.join(__dirname,'supabase-fixture.js'),'utf8')
 .replace("const communities=[", "const communities=[{id:'community-b',name:'Druhý server',owner_id:'audit-user'},")
 .replace("const channels=[", "const channels=[{id:'chat-c',community_id:'community-b',name:'třetí',kind:'text'},")
 .replace("if(table==='profiles')data=[profile];", "if(table==='profiles')data=[profile,{id:'peer',username:'Testující streamer'}];if(table==='direct_threads')data=[{id:'dm-a'}];if(table==='direct_thread_members')data=[{thread_id:'dm-a',user_id:'audit-user'},{thread_id:'dm-a',user_id:'peer'}];");
}
module.exports={root,html,mock};
if(require.main===module){
 require('node:http').createServer((req,res)=>{
  const pathname=new URL(req.url,'http://127.0.0.1').pathname;
  if(pathname==='/'||pathname==='/desktop'){res.setHeader('Content-Type','text/html');res.end(html(pathname==='/desktop'));return}
  if(pathname.endsWith('/supabase.js')){res.setHeader('Content-Type','text/javascript');res.end(mock());return}
  const file=path.resolve(root,'.'+decodeURIComponent(pathname));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404);res.end();return}
  res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':file.endsWith('.png')?'image/png':'application/octet-stream');res.end(fs.readFileSync(file));
 }).listen(4173,'127.0.0.1',()=>console.log('Isolated fixture: http://127.0.0.1:4173'));
}
