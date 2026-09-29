const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),cp=require('node:child_process');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const baseMock=fs.readFileSync(path.join(__dirname,'supabase-fixture.js'),'utf8');

const configs=[
 {id:'d1',name:'Desktop 1',platform:'desktop',room:'voice-a1',community:'community-a',width:1280,height:800},
 {id:'w1',name:'Web 1',platform:'web',room:'voice-a1',community:'community-a',width:1280,height:800},
 {id:'a1',name:'Android 1',platform:'android',room:'voice-a1',community:'community-a',width:390,height:844,touch:true},
 {id:'i1',name:'iOS PWA 1',platform:'ios-pwa',room:'voice-a1',community:'community-a',width:390,height:844,touch:true,ios:true},
 {id:'d2',name:'Desktop 2',platform:'desktop',room:'voice-b1',community:'community-b',width:1280,height:800},
 {id:'w2',name:'Web 2',platform:'web',room:'voice-b1',community:'community-b',width:1280,height:800},
 {id:'a2',name:'Android 2',platform:'android',room:'voice-b1',community:'community-b',width:390,height:844,touch:true},
 {id:'i2',name:'iOS PWA 2',platform:'ios-pwa',room:'voice-b1',community:'community-b',width:390,height:844,touch:true,ios:true},
 {id:'w3',name:'Web chat only',platform:'web',room:null,community:'community-a',width:1280,height:800},
 {id:'a3',name:'Android chat only',platform:'android',room:null,community:'community-b',width:390,height:844,touch:true}
];

function source(platform){
 const doc=fs.readFileSync(path.join(root,platform==='desktop'?'desktop/desktop-client.html':'index.html'),'utf8'),marker='window.__ycClientReady=true;';
 assert(doc.includes(marker),platform+' client-ready marker missing');
 const bridge=`
window.__ycAudit={
 state:()=>({user:user?.id||'',community:currentCommunity?.id||'',channel:currentChannel?.id||'',voice:voiceChannel?.id||'',heartbeat:!!voiceHeartbeatTimer,signalReady:!!voiceSignalReady,participantSub:!!voiceParticipantSub,audio:voiceStream?.getAudioTracks?.()[0]?.readyState||'',peers:voicePeers.size,connected:[...voicePeerStates.values()].filter(x=>x==='connected').length,realtime:window.__activeRealtimeChannels?.size||0,remoteVad:voiceRemoteVadStops.size,screenSenders:voiceScreenSenders.size,remoteScreens:remoteScreenStreams.size,watching:screenWatchingByUser.size,screenTimers:screenWatchTimers.size,missingPeers:voiceMissingSince.size,muted:voiceMuted,deafened:voiceDeafened}),
 get voiceSessionId(){return voiceSessionId},
 joinVoiceById:async id=>{const ch=voiceChannelDefs.find(x=>String(x.id)===String(id));if(!ch)throw Error('voice channel missing: '+id);return joinVoiceChannel(ch)},
 selectCommunityById:id=>selectCommunity(id),
 selectChannelById:async id=>{const all=await getChannels();return selectChannel(id,all)},
 disconnectVoice:()=>ycRequestVoiceDisconnect(),
 toggleMute:()=>toggleVoiceMute(),
 toggleDeafen:()=>toggleVoiceDeafen(),
 participantRpcCount:()=>window.__mockRpcWrites.filter(x=>x.name==='set_voice_participant').length,
 spamVoiceControls:async(mutes=0,deafens=0)=>{for(let i=0;i<mutes;i++)void toggleVoiceMute();for(let i=0;i<deafens;i++)void toggleVoiceDeafen();await ycVoiceParticipantSyncQueue;await Promise.resolve();return window.__mockRpcWrites.filter(x=>x.name==='set_voice_participant').length},
 setMix:(id,patch)=>setVoiceUserMix(id,patch),
 getMix:id=>voiceMixFor(id),
 forceExpirePeer:async id=>{voiceMissingSince.set(id,Date.now()-61000);window.__testVoiceRows=(window.__testVoiceRows||[]).filter(x=>x.user_id!==id);const rows=voicePresenceByChannel[voiceChannel?.id]||[];voicePresenceByChannel[voiceChannel?.id]=rows.filter(x=>x.user_id!==id);await syncVoicePeers()},
 setRoster:(id,rows)=>{window.__testVoiceRows=rows;voicePresenceByChannel[id]=rows;renderVoiceChannels(voiceChannelDefs)},
 syncVoice:()=>syncVoicePeers(),
 handleSignal:msg=>handleVoiceSignal(msg),
 installSignalBridge:()=>{sendVoiceSignal=async(to,data)=>{if(!voiceChannel||!to||to===user.id)return;const wire=JSON.parse(JSON.stringify({...data,from_session:voiceSessionId}));return window.__ycTestSignal({...wire,signal_type:data.signal_type,from:user.id,to,channel_id:voiceChannel.id})}},
 reconnectSignals:async()=>{voiceSignalReady=false;if(voiceSignalSub){try{await sb.removeChannel(voiceSignalSub)}catch{}voiceSignalSub=null}await subscribeVoiceSignals();return voiceSignalReady},
 installSyntheticMic:async()=>{
   const ac=new (window.AudioContext||window.webkitAudioContext)(),osc=ac.createOscillator(),gain=ac.createGain(),dest=ac.createMediaStreamDestination();
   gain.gain.value=.012;osc.frequency.value=220;osc.connect(gain).connect(dest);osc.start();
   const media={getUserMedia:async()=>dest.stream,enumerateDevices:async()=>[]};
   getVoiceMediaDevices=()=>media;ycPrepareMicStream=async raw=>raw;window.__ycSyntheticMic={ac,osc,dest};return dest.stream.getAudioTracks()[0]?.readyState||'';
 },
 stopSyntheticMic:async()=>{const m=window.__ycSyntheticMic;if(!m)return;try{m.osc.stop()}catch{};m.dest.stream.getTracks().forEach(t=>t.stop());await m.ac.close().catch(()=>{});window.__ycSyntheticMic=null;},
 startSyntheticScreen:async()=>{
   const canvas=document.createElement('canvas');canvas.width=640;canvas.height=360;const ctx=canvas.getContext('2d');let frame=0;
   const timer=setInterval(()=>{ctx.fillStyle='#071019';ctx.fillRect(0,0,640,360);ctx.fillStyle='#70e4e8';ctx.font='28px sans-serif';ctx.fillText('Yamachat stress '+(++frame),30,80)},70);
   const stream=canvas.captureStream(15),ac=new AudioContext(),osc=ac.createOscillator(),gain=ac.createGain(),dest=ac.createMediaStreamDestination();
   gain.gain.value=.01;osc.connect(gain).connect(dest);osc.start();stream.addTrack(dest.stream.getAudioTracks()[0]);window.__auditScreen={canvas,stream,ac,osc,timer};
   getScreenMediaDevices=()=>({getDisplayMedia:async()=>stream});ycPrepareDesktopProcessAudio=async()=>({mode:'test'});
   const previous=typeof ycScreenPreflightBusy==='undefined'?false:ycScreenPreflightBusy;if(typeof ycScreenPreflightBusy!=='undefined')ycScreenPreflightBusy=true;
   try{await startScreenShare()}finally{if(typeof ycScreenPreflightBusy!=='undefined')ycScreenPreflightBusy=previous}
 },
 stopSyntheticScreen:async()=>{await stopScreenShare(true);const s=window.__auditScreen;if(s){clearInterval(s.timer);try{s.osc.stop()}catch{};s.stream.getTracks().forEach(t=>t.stop());await s.ac.close().catch(()=>{});window.__auditScreen=null}},
 watchScreen:id=>ycWatchScreenShare(id),
 screenActive:id=>voiceScreenActiveByUser.has(id),
 async rtc(){
   const peers=[];
   for(const [id,pc] of voicePeers){
     const stats=await pc.getStats();let sent=0,received=0,lost=0,dtls='',localType='',remoteType='';
     stats.forEach(x=>{if(x.type==='outbound-rtp')sent+=Number(x.bytesSent||0);if(x.type==='inbound-rtp'){received+=Number(x.bytesReceived||0);lost+=Number(x.packetsLost||0)}if(x.type==='transport'&&x.dtlsState)dtls=x.dtlsState});
     let pair=null;stats.forEach(x=>{if(!pair&&x.type==='transport'&&x.selectedCandidatePairId)pair=stats.get(x.selectedCandidatePairId)});if(!pair)stats.forEach(x=>{if(!pair&&x.type==='candidate-pair'&&x.state==='succeeded'&&x.nominated)pair=x});
     if(pair){localType=stats.get(pair.localCandidateId)?.candidateType||'';remoteType=stats.get(pair.remoteCandidateId)?.candidateType||''}
     peers.push({id,connection:pc.connectionState,ice:pc.iceConnectionState,signaling:pc.signalingState,dtls,sent,received,lost,localType,remoteType,senders:pc.getSenders().filter(x=>x.track).length,receivers:pc.getReceivers().filter(x=>x.track).length});
   }
   return peers;
 },
 heap:()=>({used:performance.memory?.usedJSHeapSize||0,total:performance.memory?.totalJSHeapSize||0}),
 realtimeNames:()=>[...(window.__activeRealtimeChannels||[])],
 runtimeErrors:()=>window.__auditRuntimeErrors||[]
};
window.__auditRuntimeErrors=[];window.addEventListener('error',e=>window.__auditRuntimeErrors.push(String(e.error?.message||e.message||'error')));window.addEventListener('unhandledrejection',e=>window.__auditRuntimeErrors.push(String(e.reason?.message||e.reason||'rejection')));
`;
 return doc.replace(marker,bridge+marker);
}

function mockFor(id,name){
 let s=baseMock
  .replaceAll("'audit-user'","'"+id+"'")
  .replace("username:'tester',display_name:'Místní test'","username:'"+id+"',display_name:'"+name+"'")
  .replace(
   "const communities=[{id:'community-a',name:'Testovací server',owner_id:'"+id+"',server_color:'#1a9fff'}];",
   "const communities=[{id:'community-a',name:'Server A',owner_id:'"+id+"',server_color:'#1a9fff'},{id:'community-b',name:'Server B',owner_id:'"+id+"',server_color:'#70e4e8'}];"
  )
  .replace(
   "const channels=[{id:'chat-a',community_id:'community-a',name:'obecný',kind:'text'},{id:'chat-b',community_id:'community-a',name:'druhý-chat',kind:'text'}];",
   "const channels=[{id:'chat-a',community_id:'community-a',name:'a-chat',kind:'text',position:1},{id:'chat-a2',community_id:'community-a',name:'a-chat-2',kind:'text',position:2},{id:'voice-a1',community_id:'community-a',name:'A Voice',kind:'voice',position:3},{id:'chat-b',community_id:'community-b',name:'b-chat',kind:'text',position:1},{id:'chat-b2',community_id:'community-b',name:'b-chat-2',kind:'text',position:2},{id:'voice-b1',community_id:'community-b',name:'B Voice',kind:'voice',position:3}];"
  )
  .replace(
   "if(table==='community_members')data=[{user_id:'"+id+"',community_id:'community-a',role:'owner',profiles:profile}];",
   "if(table==='community_members')data=[{user_id:'"+id+"',community_id:'community-a',role:'owner',profiles:profile},{user_id:'"+id+"',community_id:'community-b',role:'owner',profiles:profile}];"
  )
  .replace(
   "if(filters.id)data=data.filter(x=>x.id===filters.id);",
   "if(filters.id)data=data.filter(x=>x.id===filters.id);if(filters.community_id)data=data.filter(x=>x.community_id===filters.community_id);if(filters.channel_id)data=data.filter(x=>x.channel_id===filters.channel_id);"
  )
  .replace(
   "if(table==='messages')data=Array.from({length:60},",
   "if(table==='voice_participants')data=window.__testVoiceRows||[];if(table==='messages')data=Array.from({length:60},"
  )
  .replace(
   "const channel=()=>{const c={on:()=>c,subscribe:()=>c,track:async()=>{},untrack:async()=>{},send:async()=>{},presenceState:()=>({})};return c};",
   "const channel=(name)=>{const c={__name:name,__active:false,on:()=>c,subscribe:(cb)=>{if(!c.__active){c.__active=true;window.__activeRealtimeChannels.add(String(name))}queueMicrotask(()=>cb?.('SUBSCRIBED'));return c},track:async()=>{},untrack:async()=>{},send:async()=>{},presenceState:()=>({})};return c};"
  )
  .replace(
   "return {from:query,rpc:async()=>({data:false,error:null}),channel,removeChannel:async()=>{},auth:",
   "return {from:query,rpc:async(name,args)=>{window.__mockRpcWrites.push({name,args});return {data:false,error:null}},channel,removeChannel:async(c)=>{if(c?.__name)window.__activeRealtimeChannels.delete(String(c.__name));if(c)c.__active=false},auth:"
  )
  .replace(
   "functions:{invoke:async()=>({data:null,error:Error('offline fixture')})}",
   "functions:{invoke:async(name)=>name==='yamachat-turn-cloudflare'?({data:{iceServers:[{urls:['stun:stun.cloudflare.com:3478']}]},error:null}):({data:null,error:Error('offline fixture')})}"
  )
  .replace(
   "}};window.__mockWrites=[];",
   "}};window.__mockWrites=[];window.__mockRpcWrites=[];window.__activeRealtimeChannels=new Set();"
  );
 return s;
}

function processSnapshot(label){
 try{
   const out=cp.execFileSync('ps',['-eo','rss=,%cpu=,comm='],{encoding:'utf8'}).trim().split(/\n+/).map(x=>x.trim().split(/\s+/)).filter(x=>/chrome|chromium/i.test(x.slice(2).join(' ')));
   const rss=out.reduce((n,x)=>n+(Number(x[0])||0),0),cpu=out.reduce((n,x)=>n+(Number(x[1])||0),0);
   console.log('AUDIT_PROCESS '+JSON.stringify({label,chromium_processes:out.length,rss_kb:rss,cpu_percent_sum:Number(cpu.toFixed(1))}));
 }catch(e){console.log('AUDIT_PROCESS '+JSON.stringify({label,error:e.message}))}
}

(async()=>{
 const browser=await chromium.launch({headless:true,args:['--use-fake-ui-for-media-stream','--autoplay-policy=no-user-gesture-required','--enable-precise-memory-info']});
 const clients=new Map(),deliveries=[],started=Date.now();let hardClosedId='';
 try{
  for(const cfg of configs){
   const context=await browser.newContext({viewport:{width:cfg.width,height:cfg.height},hasTouch:!!cfg.touch,isMobile:!!cfg.touch,serviceWorkers:'block',permissions:['microphone'],...(cfg.ios?{userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1'}:{})});
   if(cfg.ios)await context.addInitScript(()=>Object.defineProperty(navigator,'standalone',{value:true,configurable:true}));
   const page=await context.newPage(),pageErrors=[];
   page.on('pageerror',e=>{
    const stack=String(e.stack||e.message),match=stack.match(/http:\/\/127\.0\.0\.1\/:(\d+):(\d+)/);
    let detail=stack;
    if(match){const line=Number(match[1]),column=Number(match[2]),loaded=source(cfg.platform).split(/\r?\n/);detail+='\nAUDIT_SOURCE '+cfg.platform+' '+line+':'+column+' '+String(loaded[line-1]||'').trim()}
    pageErrors.push(detail);
   });
   clients.set(cfg.id,{cfg,context,page,pageErrors,baselineRealtime:0,baselineHeap:0});
  }

  for(const [id,c] of clients){
   await c.page.exposeBinding('__ycTestSignal',async(_src,packet)=>{
    deliveries.push({from:packet.from,to:packet.to,type:packet.signal_type,channel:packet.channel_id,bytes:Buffer.byteLength(JSON.stringify(packet))});
    const target=clients.get(packet.to);if(!target||target.context===null)return false;
    setTimeout(()=>void target.page.evaluate(msg=>window.__ycAudit.handleSignal(msg),packet).catch(()=>{}),0);return true;
   });
   await c.page.route('**/*',route=>{
    const u=new URL(route.request().url());if(u.hostname!=='127.0.0.1')return route.abort();
    if(u.pathname.endsWith('/supabase.js'))return route.fulfill({contentType:'text/javascript',body:mockFor(id,c.cfg.name)});
    if(u.pathname==='/')return route.fulfill({contentType:'text/html',body:source(c.cfg.platform)});
    const file=path.resolve(root,'.'+decodeURIComponent(u.pathname));if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||fs.statSync(file).isDirectory())return route.fulfill({status:404,body:''});return route.fulfill({path:file});
   });
   await c.page.goto('http://127.0.0.1/');await c.page.waitForFunction(()=>window.__ycClientReady,{},{timeout:25000});await c.page.waitForSelector('#app:not(.hidden)');
   const state=await c.page.evaluate(()=>window.__ycAudit.state());assert.equal(state.user,id,id+' auth identity');
   c.baselineRealtime=state.realtime;c.baselineHeap=(await c.page.evaluate(()=>window.__ycAudit.heap())).used;
   if(c.cfg.community!=='community-a'){await c.page.evaluate(id=>window.__ycAudit.selectCommunityById(id),c.cfg.community);await c.page.waitForFunction(id=>window.__ycAudit.state().community===id,c.cfg.community)}
   if(c.cfg.room){
    const mic=await c.page.evaluate(()=>window.__ycAudit.installSyntheticMic());assert.equal(mic,'live',id+' mic');
    await c.page.evaluate(room=>window.__ycAudit.joinVoiceById(room),c.cfg.room);await c.page.waitForFunction(room=>{const s=window.__ycAudit.state();return s.voice===room&&s.audio==='live'&&s.signalReady},c.cfg.room,{timeout:15000});
    await c.page.evaluate(()=>window.__ycAudit.installSignalBridge());
   }
  }
  processSnapshot('after_login_and_join');

  const roomGroups=new Map();
  for(const cfg of configs.filter(x=>x.room)){if(!roomGroups.has(cfg.room))roomGroups.set(cfg.room,[]);roomGroups.get(cfg.room).push(cfg)}
  for(const [room,members] of roomGroups){
   const roster=[];
   for(const m of members){const c=clients.get(m.id),sid=await c.page.evaluate(()=>window.__ycAudit.voiceSessionId);roster.push({user_id:m.id,username:m.name,session_id:sid,muted:false,deafened:false,speaking:false,channel_id:room,joined_at:new Date().toISOString(),last_seen:new Date().toISOString()})}
   for(const m of members)await clients.get(m.id).page.evaluate(({room,roster})=>window.__ycAudit.setRoster(room,roster),{room,roster});
  }
  await Promise.all(configs.filter(x=>x.room).map(x=>clients.get(x.id).page.evaluate(()=>window.__ycAudit.syncVoice())));
  for(const cfg of configs.filter(x=>x.room)){
   const c=clients.get(cfg.id),expected=roomGroups.get(cfg.room).length-1;
   await c.page.waitForFunction(n=>{const s=window.__ycAudit.state();return s.peers===n&&s.connected===n},expected,{timeout:25000});
   const rtc=await c.page.evaluate(()=>window.__ycAudit.rtc());assert.equal(rtc.length,expected,cfg.id+' peer count');
   for(const p of rtc){assert.equal(p.connection,'connected',cfg.id+' peer not connected');assert(['connected','completed'].includes(p.ice),cfg.id+' ICE '+p.ice);if(p.dtls)assert.equal(p.dtls,'connected',cfg.id+' DTLS '+p.dtls)}
  }

  const roomOf=Object.fromEntries(configs.map(x=>[x.id,x.room]));
  for(const d of deliveries){assert.equal(roomOf[d.from],d.channel,d.from+' signaled wrong room');assert.equal(roomOf[d.to],d.channel,d.from+' -> '+d.to+' crossed voice rooms')}
  assert(deliveries.some(x=>x.type==='offer')&&deliveries.some(x=>x.type==='answer')&&deliveries.some(x=>x.type==='ice'),'SDP/ICE signaling missing');

  // Simultaneous chat on all 10 clients, while 8 remain in two isolated voice rooms.
  await Promise.all([...clients.values()].map(async c=>{await c.page.locator('#messageInput').fill('stress chat '+c.cfg.id+' '+Date.now());await c.page.locator('#sendBtn').click();await c.page.waitForFunction(()=>window.__mockWrites.includes('messages:insert'));}));
  for(const cfg of configs.filter(x=>x.room))assert.equal(await clients.get(cfg.id).page.evaluate(()=>window.__ycAudit.state().voice),cfg.room,cfg.id+' voice dropped while chatting');

  // Rapid mute/deafen toggles must end in a stable enabled state without peer churn.
  // Fourteen UI transitions are issued synchronously; participant lease writes must coalesce.
  for(const id of ['d1','a1','w2','i2']){
   const c=clients.get(id),before=await c.page.evaluate(()=>window.__ycAudit.state().peers),rpcBefore=await c.page.evaluate(()=>window.__ycAudit.participantRpcCount());
   const rpcAfter=await c.page.evaluate(()=>window.__ycAudit.spamVoiceControls(8,6));
   const st=await c.page.evaluate(()=>window.__ycAudit.state()),rpcDelta=rpcAfter-rpcBefore;
   assert.equal(st.muted,false,id+' mute spam final state');assert.equal(st.deafened,false,id+' deafen spam final state');assert.equal(st.peers,before,id+' peer churn after mute/deafen spam');
   assert(rpcDelta<=3,id+' mute/deafen spam was not coalesced; 14 UI transitions produced '+rpcDelta+' participant RPCs');
  }

  // Local per-user volume/mute never alters the remote peer graph.
  await clients.get('d1').page.evaluate(()=>{window.__ycAudit.setMix('w1',{volume:175,muted:true});window.__ycAudit.setMix('w1',{muted:false})});
  assert.deepEqual(await clients.get('d1').page.evaluate(()=>window.__ycAudit.getMix('w1')),{muted:false,volume:175,soundboardMuted:false});

  // Voice survives text-channel and server browsing.
  await clients.get('a1').page.evaluate(()=>window.__ycAudit.selectChannelById('chat-a2'));assert.equal(await clients.get('a1').page.evaluate(()=>window.__ycAudit.state().voice),'voice-a1');
  await clients.get('w2').page.evaluate(()=>window.__ycAudit.selectCommunityById('community-a'));await clients.get('w2').page.waitForFunction(()=>window.__ycAudit.state().community==='community-a');assert.equal(await clients.get('w2').page.evaluate(()=>window.__ycAudit.state().voice),'voice-b1');

  // Stream only inside room A. Room B must remain isolated.
  const streamer=clients.get('d1');await streamer.page.evaluate(()=>window.__ycAudit.startSyntheticScreen());
  for(const id of ['w1','a1','i1']){const c=clients.get(id);await c.page.waitForFunction(()=>window.__ycAudit.screenActive('d1'),{},{timeout:10000});await c.page.evaluate(()=>window.__ycAudit.watchScreen('d1'));await c.page.waitForFunction(()=>document.querySelector('.yc-stream-viewer video')?.videoWidth>0,{},{timeout:20000})}
  for(const id of ['d2','w2','a2','i2'])assert.equal(await clients.get(id).page.evaluate(()=>window.__ycAudit.screenActive('d1')),false,id+' saw stream from another room');
  await streamer.page.evaluate(()=>window.__ycAudit.stopSyntheticScreen());
  for(const id of ['w1','a1','i1'])await clients.get(id).page.waitForFunction(()=>window.__ycAudit.state().remoteScreens===0,{},{timeout:10000});

  // Rapid leave/rejoin three times on one web client; subscriptions and peers must return to stable counts.
  const churn=clients.get('w1'),baseRt=churn.baselineRealtime;
  for(let cycle=0;cycle<3;cycle++){
   await churn.page.evaluate(()=>window.__ycAudit.disconnectVoice());await churn.page.waitForFunction(()=>{const s=window.__ycAudit.state();return !s.voice&&!s.heartbeat&&!s.participantSub&&s.peers===0},{},{timeout:10000});
   const rejoinMic=await churn.page.evaluate(()=>window.__ycAudit.installSyntheticMic());assert.equal(rejoinMic,'live','w1 rejoin mic cycle '+cycle);
   await churn.page.evaluate(()=>window.__ycAudit.joinVoiceById('voice-a1'));await churn.page.waitForFunction(()=>{const s=window.__ycAudit.state();return s.voice==='voice-a1'&&s.audio==='live'&&s.signalReady},{},{timeout:10000});await churn.page.evaluate(()=>window.__ycAudit.installSignalBridge());
   const roster=[];for(const id of ['d1','w1','a1','i1']){const c=clients.get(id),sid=await c.page.evaluate(()=>window.__ycAudit.voiceSessionId);roster.push({user_id:id,username:id,session_id:sid,channel_id:'voice-a1',last_seen:new Date().toISOString()})}
   for(const id of ['d1','w1','a1','i1'])await clients.get(id).page.evaluate(({roster})=>window.__ycAudit.setRoster('voice-a1',roster),{roster});
   await Promise.all(['d1','w1','a1','i1'].map(id=>clients.get(id).page.evaluate(()=>window.__ycAudit.syncVoice())));
   await churn.page.waitForFunction(()=>window.__ycAudit.state().connected===3,{},{timeout:15000});
  }
  const churnState=await churn.page.evaluate(()=>window.__ycAudit.state());assert(churnState.realtime<=baseRt+4,'rapid rejoin leaked realtime subscriptions: '+JSON.stringify(churnState));

  // Exercise the browser/mobile lifecycle handlers while voice is live. This is not an
  // OS-level iOS suspension emulator, but it verifies that the actual visibility/blur/
  // focus/pageshow/online recovery handlers do not tear down or duplicate the peer graph.
  const mobileBg=clients.get('a1'),bgBefore=await mobileBg.page.evaluate(()=>window.__ycAudit.state());
  const hiddenOverride=await mobileBg.page.evaluate(()=>{
    let hidden=false,overridden=false;
    try{Object.defineProperty(document,'hidden',{configurable:true,get:()=>hidden});overridden=true}catch{}
    if(overridden){hidden=true;document.dispatchEvent(new Event('visibilitychange'))}
    window.dispatchEvent(new Event('blur'));return overridden;
  });
  await mobileBg.page.waitForTimeout(250);
  await mobileBg.page.evaluate(overridden=>{
    if(overridden){try{Object.defineProperty(document,'hidden',{configurable:true,value:false})}catch{};document.dispatchEvent(new Event('visibilitychange'))}
    window.dispatchEvent(new Event('focus'));window.dispatchEvent(new Event('pageshow'));window.dispatchEvent(new Event('online'));
  },hiddenOverride);
  await mobileBg.page.waitForTimeout(350);
  const bgAfter=await mobileBg.page.evaluate(()=>window.__ycAudit.state());
  assert.equal(bgAfter.voice,bgBefore.voice,'mobile lifecycle dropped voice');
  assert.equal(bgAfter.peers,bgBefore.peers,'mobile lifecycle changed peer count');
  assert.equal(bgAfter.connected,bgBefore.connected,'mobile lifecycle disconnected peers');

  // Hard browser refresh while in voice: the old page/peer session dies without Leave.
  // Rejoining with the same account creates a new session; every surviving room-A client
  // must replace the old peer rather than keep a duplicate or ghost connection.
  const refreshOldSid=await churn.page.evaluate(()=>window.__ycAudit.voiceSessionId);
  await churn.page.reload();await churn.page.waitForFunction(()=>window.__ycClientReady,{},{timeout:20000});await churn.page.waitForSelector('#app:not(.hidden)');
  assert.equal(await churn.page.evaluate(()=>window.__ycAudit.state().user),'w1','web refresh lost authenticated session');
  const refreshMic=await churn.page.evaluate(()=>window.__ycAudit.installSyntheticMic());assert.equal(refreshMic,'live','web refresh synthetic mic');
  await churn.page.evaluate(()=>window.__ycAudit.joinVoiceById('voice-a1'));await churn.page.waitForFunction(()=>{const s=window.__ycAudit.state();return s.voice==='voice-a1'&&s.audio==='live'&&s.signalReady},{},{timeout:15000});await churn.page.evaluate(()=>window.__ycAudit.installSignalBridge());
  const refreshNewSid=await churn.page.evaluate(()=>window.__ycAudit.voiceSessionId);assert.notEqual(refreshNewSid,refreshOldSid,'web refresh reused old voice session');
  const refreshedRoster=[];for(const id of ['d1','w1','a1','i1']){const c=clients.get(id),sid=await c.page.evaluate(()=>window.__ycAudit.voiceSessionId);refreshedRoster.push({user_id:id,username:id,session_id:sid,channel_id:'voice-a1',last_seen:new Date().toISOString()})}
  for(const id of ['d1','w1','a1','i1'])await clients.get(id).page.evaluate(({roster})=>window.__ycAudit.setRoster('voice-a1',roster),{roster:refreshedRoster});
  await Promise.all(['d1','w1','a1','i1'].map(id=>clients.get(id).page.evaluate(()=>window.__ycAudit.syncVoice())));
  for(const id of ['d1','w1','a1','i1'])await clients.get(id).page.waitForFunction(()=>{const s=window.__ycAudit.state();return s.peers===3&&s.connected===3},{},{timeout:20000});

  // Hard-close i2 without Leave Voice. Remaining room-B clients simulate lease expiry and must remove the ghost peer cleanly.
  const hard=clients.get('i2');hardClosedId='i2';await hard.context.close();hard.context=null;
  for(const id of ['d2','w2','a2']){const c=clients.get(id);await c.page.evaluate(id=>window.__ycAudit.forceExpirePeer(id),hardClosedId);await c.page.waitForFunction(()=>{const s=window.__ycAudit.state();return s.peers===2&&s.missingPeers===0},{},{timeout:10000})}

  // Short signaling reconnect on a live room must not create duplicate peers.
  const reconnect=clients.get('a2');await reconnect.page.evaluate(()=>window.__ycAudit.reconnectSignals());await reconnect.page.waitForFunction(()=>window.__ycAudit.state().signalReady);assert.equal(await reconnect.page.evaluate(()=>window.__ycAudit.state().peers),2,'signal reconnect duplicated peers');

  processSnapshot('stress_peak');
  const audit=[];
  for(const [id,c] of clients){
   if(!c.context)continue;
   const state=await c.page.evaluate(()=>window.__ycAudit.state()),heap=await c.page.evaluate(()=>window.__ycAudit.heap()),rtc=await c.page.evaluate(()=>window.__ycAudit.rtc()),runtime=await c.page.evaluate(()=>window.__ycAudit.runtimeErrors());
   audit.push({id,platform:c.cfg.platform,room:c.cfg.room,baseline:{realtime:c.baselineRealtime,heap_used:c.baselineHeap},state,heap,rtc,runtime,pageErrors:c.pageErrors});
   assert.deepEqual(c.pageErrors,[],id+' page errors');assert.deepEqual(runtime,[],id+' runtime errors');
  }
  console.log('AUDIT_CLIENTS '+JSON.stringify(audit));
  console.log('AUDIT_SIGNAL '+JSON.stringify({packets:deliveries.length,bytes:deliveries.reduce((n,x)=>n+x.bytes,0),offers:deliveries.filter(x=>x.type==='offer').length,answers:deliveries.filter(x=>x.type==='answer').length,ice:deliveries.filter(x=>x.type==='ice').length}));

  // Clean disconnect every surviving voice client and assert no ghost media/subscriptions/timers/peers.
  for(const [id,c] of clients){if(!c.context||!c.cfg.room)continue;await c.page.evaluate(()=>window.__ycAudit.disconnectVoice());await c.page.waitForFunction(()=>{const s=window.__ycAudit.state();return !s.voice&&!s.heartbeat&&!s.participantSub&&!s.signalReady&&s.peers===0&&s.missingPeers===0&&s.remoteVad===0&&s.remoteScreens===0&&s.screenSenders===0&&s.screenTimers===0},{},{timeout:12000});await c.page.waitForTimeout(300);const settled=await c.page.evaluate(()=>window.__ycAudit.state());assert.equal(settled.remoteVad,0,id+' late remote VAD restarted after voice leave '+JSON.stringify(settled));assert.equal(settled.signalReady,false,id+' voice signaling remained ready after leave '+JSON.stringify(settled));await c.page.evaluate(()=>window.__ycAudit.stopSyntheticMic())}
  const cleanupAudit=[];
  for(const [id,c] of clients){if(!c.context)continue;const st=await c.page.evaluate(()=>window.__ycAudit.state()),heap=await c.page.evaluate(()=>window.__ycAudit.heap());assert.equal(st.realtime,c.baselineRealtime,id+' realtime subscriptions did not return to baseline '+c.baselineRealtime+' -> '+st.realtime+' '+JSON.stringify(st));cleanupAudit.push({id,platform:c.cfg.platform,baseline:{realtime:c.baselineRealtime,heap_used:c.baselineHeap},after_cleanup:{realtime:st.realtime,heap_used:heap.used},state:st})}
  console.log('AUDIT_CLEANUP '+JSON.stringify(cleanupAudit));
  processSnapshot('after_cleanup');
  console.log('PASS 10-client Yamachat stability stress: 10 authenticated clients across desktop/web/Android/iOS-PWA; 8 concurrent voice users split across two isolated rooms/servers, 2 chat-only users, real SDP/ICE/audio, simultaneous chat, mute/deafen spam, local volume/mute, cross-server browsing, room-scoped stream, repeated leave/rejoin, lifecycle background/foreground handlers, hard web refresh/session replacement, hard-close ghost cleanup and signaling reconnect. elapsed_ms='+(Date.now()-started));
 }finally{
  for(const c of clients.values())if(c.context)await c.context.close().catch(()=>{});
  await browser.close().catch(()=>{});
 }
})().catch(e=>{console.error(e);process.exit(1)});
