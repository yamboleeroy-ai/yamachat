const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const baseMock=fs.readFileSync(path.join(__dirname,'supabase-fixture.js'),'utf8');

const configs=[
 {id:'u-desktop',name:'Desktop',platform:'desktop',width:1280,height:800,touch:false},
 {id:'u-web',name:'Web',platform:'web',width:1280,height:800,touch:false},
 {id:'u-android',name:'Android',platform:'android',width:390,height:844,touch:true},
 {id:'u-ios',name:'iOS PWA',platform:'ios-pwa',width:390,height:844,touch:true,ios:true}
];

function source(platform){
 const doc=fs.readFileSync(path.join(root,platform==='desktop'?'desktop/desktop-client.html':'index.html'),'utf8'),marker='window.__ycClientReady=true;';
 assert(doc.includes(marker),platform+' client-ready marker missing');
 const bridge=`
window.__ycE2E={
 state:()=>({user:user?.id||'',community:currentCommunity?.id||'',channel:currentChannel?.id||'',voice:voiceChannel?.id||'',heartbeat:!!voiceHeartbeatTimer,participantSub:!!voiceParticipantSub,audio:voiceStream?.getAudioTracks?.()[0]?.readyState||'',peers:voicePeers.size,connected:[...voicePeerStates.values()].filter(x=>x==='connected').length,liveReceivers:[...voicePeers.values()].flatMap(pc=>pc.getReceivers()).filter(r=>r.track?.kind==='audio'&&r.track.readyState==='live').length}),
 get voiceSessionId(){return voiceSessionId},
 handleSignal:msg=>handleVoiceSignal(msg),
 joinVoiceById:async id=>{const ch=voiceChannelDefs.find(x=>String(x.id)===String(id));if(!ch)throw Error('voice channel missing: '+id);return joinVoiceChannel(ch)},
 installSignalBridge:()=>{sendVoiceSignal=async(to,data)=>{if(!voiceChannel||!to||to===user.id)return;const wire=JSON.parse(JSON.stringify({...data,from_session:voiceSessionId}));return window.__ycTestSignal({...wire,signal_type:data.signal_type,from:user.id,to,channel_id:voiceChannel.id})}},
 setRoster:(id,rows)=>{window.__testVoiceRows=rows;voicePresenceByChannel[id]=rows;renderVoiceChannels(voiceChannelDefs)},
 syncVoice:()=>syncVoicePeers(),
 watchScreen:id=>ycWatchScreenShare(id),
 screenActive:id=>voiceScreenActiveByUser.has(id),
 watching:id=>screenWatchingByUser.has(id),
 selectCommunityById:id=>selectCommunity(id),
 disconnectVoice:()=>ycRequestVoiceDisconnect(),
 startSyntheticScreen:async()=>{
   const canvas=document.createElement('canvas');canvas.width=640;canvas.height=360;const ctx=canvas.getContext('2d');let frame=0;
   const timer=setInterval(()=>{ctx.fillStyle='#071019';ctx.fillRect(0,0,640,360);ctx.fillStyle='#70e4e8';ctx.font='28px sans-serif';ctx.fillText('Yamachat multi '+(++frame),30,80)},80);
   const stream=canvas.captureStream(12),ac=new AudioContext(),osc=ac.createOscillator(),gain=ac.createGain(),dest=ac.createMediaStreamDestination();
   gain.gain.value=.01;osc.connect(gain).connect(dest);osc.start();stream.addTrack(dest.stream.getAudioTracks()[0]);window.__multiScreen={canvas,stream,ac,osc,timer};
   getScreenMediaDevices=()=>({getDisplayMedia:async()=>stream});ycPrepareDesktopProcessAudio=async()=>({mode:'test'});
   const previous=typeof ycScreenPreflightBusy==='undefined'?false:ycScreenPreflightBusy;if(typeof ycScreenPreflightBusy!=='undefined')ycScreenPreflightBusy=true;
   try{await startScreenShare()}finally{if(typeof ycScreenPreflightBusy!=='undefined')ycScreenPreflightBusy=previous}
 },
 stopSyntheticScreen:async()=>{await stopScreenShare(true);const s=window.__multiScreen;if(s){clearInterval(s.timer);try{s.osc.stop()}catch{};s.stream.getTracks().forEach(t=>t.stop());await s.ac.close().catch(()=>{});window.__multiScreen=null}}
};
`;
 return doc.replace(marker,bridge+marker);
}
function mockFor(id,name){
 let s=baseMock
  .replaceAll("'audit-user'","'"+id+"'")
  .replace("username:'tester',display_name:'Místní test'","username:'"+id+"',display_name:'"+name+"'")
  .replace(
   "const communities=[{id:'community-a',name:'Testovací server',owner_id:'"+id+"',server_color:'#1a9fff'}];",
   "const communities=[{id:'community-a',name:'Testovací server',owner_id:'"+id+"',server_color:'#1a9fff'},{id:'community-b',name:'Druhý server',owner_id:'"+id+"',server_color:'#70e4e8'}];"
  )
  .replace(
   "const channels=[{id:'chat-a',community_id:'community-a',name:'obecný',kind:'text'},{id:'chat-b',community_id:'community-a',name:'druhý-chat',kind:'text'}];",
   "const channels=[{id:'chat-a',community_id:'community-a',name:'obecný',kind:'text',position:1},{id:'chat-b',community_id:'community-a',name:'druhý-chat',kind:'text',position:2},{id:'voice-a',community_id:'community-a',name:'Hlas',kind:'voice',position:3},{id:'chat-c',community_id:'community-b',name:'jiný-server',kind:'text',position:1}];"
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
   "const channel=()=>{const c={on:()=>c,subscribe:(cb)=>{queueMicrotask(()=>cb?.('SUBSCRIBED'));return c},track:async()=>{},untrack:async()=>{},send:async()=>{},presenceState:()=>({})};return c};"
  )
  .replace(
   "return {from:query,rpc:async()=>({data:false,error:null}),channel,removeChannel:async()=>{},auth:",
   "return {from:query,rpc:async(name,args)=>{window.__mockRpcWrites.push({name,args});return {data:false,error:null}},channel,removeChannel:async()=>{},auth:"
  )
  .replace(
   "}};window.__mockWrites=[];",
   "}};window.__mockWrites=[];window.__mockRpcWrites=[];"
  );
 return s;
}

(async()=>{
 const browser=await chromium.launch({headless:true,args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--autoplay-policy=no-user-gesture-required']});
 const clients=new Map(),deliveries=[];
 try{
  for(const cfg of configs){
   const context=await browser.newContext({
    viewport:{width:cfg.width,height:cfg.height},hasTouch:cfg.touch,isMobile:cfg.touch,serviceWorkers:'block',permissions:['microphone'],
    ...(cfg.ios?{userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1'}:{})
   });
   if(cfg.ios)await context.addInitScript(()=>Object.defineProperty(navigator,'standalone',{value:true,configurable:true}));
   await context.addInitScript(()=>{
    const install=()=>{
     if(!navigator.mediaDevices)return;
     navigator.mediaDevices.getUserMedia=async constraints=>{
      if(!constraints?.audio)throw new DOMException('Video capture is not used in this voice test','NotSupportedError');
      const ac=new (window.AudioContext||window.webkitAudioContext)(),osc=ac.createOscillator(),gain=ac.createGain(),dest=ac.createMediaStreamDestination();
      gain.gain.value=.012;osc.frequency.value=220;osc.connect(gain).connect(dest);osc.start();
      window.__ycSyntheticMic={ac,osc,dest};
      return dest.stream;
     };
    };
    install();
   });
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   clients.set(cfg.id,{cfg,context,page,errors});
  }

  for(const [id,client] of clients){
   await client.page.exposeBinding('__ycTestSignal',async(_source,packet)=>{
    deliveries.push({from:packet.from,to:packet.to,type:packet.signal_type});
    const target=clients.get(packet.to);if(!target)return false;
    setTimeout(()=>void target.page.evaluate(msg=>window.__ycE2E.handleSignal(msg),packet).catch(()=>{}),0);
    return true;
   });
   await client.page.route('**/*',route=>{
    const u=new URL(route.request().url());if(u.hostname!=='127.0.0.1')return route.abort();
    if(u.pathname.endsWith('/supabase.js'))return route.fulfill({contentType:'text/javascript',body:mockFor(id,client.cfg.name)});
    if(u.pathname==='/')return route.fulfill({contentType:'text/html',body:source(client.cfg.platform)});
    const file=path.resolve(root,'.'+decodeURIComponent(u.pathname));
    if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||fs.statSync(file).isDirectory())return route.fulfill({status:404,body:''});
    return route.fulfill({path:file});
   });
   await client.page.goto('http://127.0.0.1/');
   await client.page.waitForFunction(()=>window.__ycClientReady,{},{timeout:20000});
   await client.page.waitForSelector('#app:not(.hidden)');
   assert.equal(await client.page.evaluate(()=>window.__ycE2E.state().user),id,id+' authenticated identity mismatch');
   await client.page.evaluate(()=>window.__ycE2E.joinVoiceById('voice-a'));
   await client.page.waitForFunction(()=>{const s=window.__ycE2E.state();return s.voice==='voice-a'&&s.audio==='live'},{},{timeout:15000});
   await client.page.evaluate(()=>window.__ycE2E.installSignalBridge());
  }

  const roster=[];
  for(const [id,c] of clients){
   const sid=await c.page.evaluate(()=>window.__ycE2E.voiceSessionId);
   roster.push({user_id:id,username:c.cfg.name,session_id:sid,muted:false,deafened:false,speaking:false,channel_id:'voice-a',joined_at:new Date().toISOString(),last_seen:new Date().toISOString()});
  }
  for(const c of clients.values()){
   await c.page.evaluate(rows=>window.__ycE2E.setRoster('voice-a',rows),roster);
  }
  await Promise.all([...clients.values()].map(c=>c.page.evaluate(()=>window.__ycE2E.syncVoice())));

  for(const [id,c] of clients){
   await c.page.waitForFunction(expected=>{const s=window.__ycE2E.state();return s.peers===expected&&s.connected===expected},configs.length-1,{timeout:25000});
   const state=await c.page.evaluate(()=>window.__ycE2E.state());
   assert.equal(state.voice,'voice-a');assert.equal(state.peers,3,id+' missing full-mesh peers');assert.equal(state.connected,3,id+' peers not connected');
   assert(state.liveReceivers>=3,id+' missing remote audio receivers');
  }
  assert(deliveries.some(x=>x.type==='offer')&&deliveries.some(x=>x.type==='answer')&&deliveries.some(x=>x.type==='ice'),'real SDP/ICE signaling did not traverse clients');

  // Every platform sends chat while all four users remain connected to the same voice room.
  for(const [id,c] of clients){
   await c.page.locator('#messageInput').fill('multiclient voice chat '+id);
   await c.page.locator('#sendBtn').click();
   await c.page.waitForFunction(()=>window.__mockWrites.includes('messages:insert'));
   assert.equal(await c.page.evaluate(()=>window.__ycE2E.state().voice),'voice-a',id+' dropped voice while sending chat');
  }

  // Stream from desktop through the existing voice peer graph. Viewers request the stream
  // from web, Android and iOS/PWA while the 4-way voice call remains connected.
  const streamer=clients.get('u-desktop');
  await streamer.page.evaluate(()=>window.__ycE2E.startSyntheticScreen());
  for(const [id,c] of clients){
   if(id==='u-desktop')continue;
   await c.page.waitForFunction(()=>window.__ycE2E.screenActive('u-desktop'),{},{timeout:10000});
   await c.page.evaluate(()=>window.__ycE2E.watchScreen('u-desktop'));
  }
  for(const [id,c] of clients){
   if(id==='u-desktop')continue;
   await c.page.waitForFunction(()=>document.querySelector('.yc-stream-viewer video')?.videoWidth>0,{},{timeout:20000});
   const first=await c.page.locator('.yc-stream-viewer video').evaluate(v=>v.currentTime);
   await c.page.waitForFunction(t=>document.querySelector('.yc-stream-viewer video')?.currentTime>t+.12,first,{timeout:10000});
   const state=await c.page.evaluate(()=>{const s=window.__ycE2E.state();return{voice:s.voice,connected:s.connected,watching:window.__ycE2E.watching('u-desktop')}});
   assert.equal(state.voice,'voice-a',id+' voice dropped while watching desktop stream');assert.equal(state.connected,3,id+' peer graph changed while streaming');assert(state.watching,id+' did not enter stream-watch state');
  }

  // A client can browse another server and keep the active call + stream alive.
  const android=clients.get('u-android');
  await android.page.evaluate(()=>window.__ycE2E.selectCommunityById('community-b'));
  await android.page.waitForFunction(()=>window.__ycE2E.state().community==='community-b');
  await android.page.locator('#messageInput').fill('android other server during stream');await android.page.locator('#sendBtn').click();
  const continuity=await android.page.evaluate(()=>{const s=window.__ycE2E.state();return{voice:s.voice,connected:s.connected,playing:(document.querySelector('.yc-stream-viewer video')?.currentTime||0)>0}});
  assert.deepEqual(continuity,{voice:'voice-a',connected:3,playing:true},'Android lost voice/stream while browsing and chatting in another server');

  await streamer.page.evaluate(()=>window.__ycE2E.stopSyntheticScreen());
  for(const c of clients.values())await c.page.evaluate(()=>window.__ycE2E.disconnectVoice());
  for(const [id,c] of clients){
   await c.page.waitForFunction(()=>{const s=window.__ycE2E.state();return !s.voice&&!s.heartbeat&&!s.participantSub},{},{timeout:10000});
   assert.deepEqual(c.errors,[],id+' runtime page errors');
  }
  console.log('PASS simultaneous 4-client call: desktop + web + Android layout + iOS PWA, real SDP/ICE/audio full mesh, chat during call, desktop stream watched by all other platforms, cross-server continuity, clean disconnect.');
 }finally{
  for(const c of clients.values())await c.context.close().catch(()=>{});
  await browser.close();
 }
})().catch(e=>{console.error(e);process.exit(1)});
