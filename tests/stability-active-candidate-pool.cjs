const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),cp=require('node:child_process');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const base=fs.readFileSync(path.join(__dirname,'supabase-fixture.js'),'utf8');
const N=Math.max(1,Math.min(1000,Number(process.env.YC_ACTIVE_USERS||10)));
const SOAK_SECONDS=Math.max(15,Math.min(600,Number(process.env.YC_SOAK_SECONDS||60)));
const VOICE_FRACTION=Math.max(0,Math.min(0.8,Number(process.env.YC_VOICE_FRACTION||0.4)));
const ROOM_SIZE=Math.max(2,Math.min(8,Number(process.env.YC_VOICE_ROOM_SIZE||4)));\nconst VOICE_CONNECT_TIMEOUT_MS=Math.max(45000,Math.min(180000,Number(process.env.YC_VOICE_CONNECT_TIMEOUT_MS||45000)));\nconst RENDERER_PROCESS_LIMIT=Math.max(0,Math.min(128,Number(process.env.YC_RENDERER_PROCESS_LIMIT||0)));
const voiceTarget=Math.min(N,Math.floor(N*VOICE_FRACTION));
const profiles=[
 {platform:'desktop',width:1280,height:800},
 {platform:'web',width:1366,height:768},
 {platform:'android',width:390,height:844,touch:true},
 {platform:'ios-pwa',width:390,height:844,touch:true,ios:true}
];
const configs=Array.from({length:N},(_,i)=>{
 const p=profiles[i%profiles.length],voice=i<voiceTarget,room=voice?'voice-'+(Math.floor(i/ROOM_SIZE)+1):null;
 return {id:'ramp-'+String(i+1).padStart(4,'0'),index:i,...p,voice,room};
});
const roomNames=[...new Set(configs.filter(x=>x.voice).map(x=>x.room))];

function source(platform){
 const file=platform==='desktop'?'desktop/desktop-client.html':'index.html';
 let doc=fs.readFileSync(path.join(root,file),'utf8'),marker='window.__ycClientReady=true;';
 doc=doc.replaceAll("iceCandidatePoolSize:8","iceCandidatePoolSize:0");
 assert(doc.includes(marker),platform+' client ready marker missing');
 const bridge=[
 "window.__ycRamp={",
 " state:()=>({user:user?.id||'',community:currentCommunity?.id||'',channel:currentChannel?.id||'',voice:voiceChannel?.id||'',peers:voicePeers.size,connected:[...voicePeerStates.values()].filter(x=>x==='connected').length,signalReady:!!voiceSignalReady,participantSub:!!voiceParticipantSub,audio:voiceStream?.getAudioTracks?.()[0]?.readyState||'',realtime:window.__rampActiveChannels?.size||0,muted:voiceMuted,screenSenders:voiceScreenSenders.size,remoteScreens:remoteScreenStreams.size,watching:screenWatchingByUser.size}),",
 " get voiceSessionId(){return voiceSessionId},",
 " joinVoiceById:async id=>{const ch=voiceChannelDefs.find(x=>String(x.id)===String(id));if(!ch)throw Error('voice channel missing '+id);return joinVoiceChannel(ch)},",
 " disconnectVoice:()=>ycRequestVoiceDisconnect(),",
 " toggleMute:()=>toggleVoiceMute(),",
 " selectCommunityById:id=>selectCommunity(id),",
 " handleSignal:msg=>handleVoiceSignal(msg),",
 " installSignalBridge:()=>{sendVoiceSignal=async(to,data)=>{if(!voiceChannel||!to||to===user.id)return;const wire=JSON.parse(JSON.stringify({...data,from_session:voiceSessionId}));return window.__ycRampSignal({...wire,signal_type:data.signal_type,from:user.id,to,channel_id:voiceChannel.id})}},",
 " setRoster:(id,rows)=>{window.__testVoiceRows=rows;voicePresenceByChannel[id]=rows;renderVoiceChannels(voiceChannelDefs)},",
 " syncVoice:()=>syncVoicePeers(),",
 " reconnectSignals:async()=>{voiceSignalReady=false;if(voiceSignalSub){try{await sb.removeChannel(voiceSignalSub)}catch{}voiceSignalSub=null}await subscribeVoiceSignals();return voiceSignalReady},",
 " installSyntheticMic:async()=>{const ac=new (window.AudioContext||window.webkitAudioContext)(),osc=ac.createOscillator(),gain=ac.createGain(),dest=ac.createMediaStreamDestination();gain.gain.value=.008;osc.frequency.value=180;osc.connect(gain).connect(dest);osc.start();const media={getUserMedia:async()=>dest.stream,enumerateDevices:async()=>[]};getVoiceMediaDevices=()=>media;ycPrepareMicStream=async raw=>raw;window.__rampMic={ac,osc,dest};return dest.stream.getAudioTracks()[0]?.readyState||''},",
 " stopSyntheticMic:async()=>{const m=window.__rampMic;if(!m)return;try{m.osc.stop()}catch{};m.dest.stream.getTracks().forEach(t=>t.stop());await m.ac.close().catch(()=>{});window.__rampMic=null},",
 " startSyntheticScreen:async()=>{const canvas=document.createElement('canvas');canvas.width=320;canvas.height=180;const ctx=canvas.getContext('2d');let frame=0;const timer=setInterval(()=>{ctx.fillStyle='#071019';ctx.fillRect(0,0,320,180);ctx.fillStyle='#70e4e8';ctx.font='16px sans-serif';ctx.fillText('Yamachat ramp '+(++frame),14,40)},120);const stream=canvas.captureStream(8),ac=new AudioContext(),osc=ac.createOscillator(),gain=ac.createGain(),dest=ac.createMediaStreamDestination();gain.gain.value=.005;osc.connect(gain).connect(dest);osc.start();stream.addTrack(dest.stream.getAudioTracks()[0]);window.__rampScreen={canvas,stream,ac,osc,timer};getScreenMediaDevices=()=>({getDisplayMedia:async()=>stream});if(typeof ycPrepareDesktopProcessAudio!=='undefined')ycPrepareDesktopProcessAudio=async()=>({mode:'test'});const previous=typeof ycScreenPreflightBusy==='undefined'?false:ycScreenPreflightBusy;if(typeof ycScreenPreflightBusy!=='undefined')ycScreenPreflightBusy=true;try{await startScreenShare()}finally{if(typeof ycScreenPreflightBusy!=='undefined')ycScreenPreflightBusy=previous}},",
 " stopSyntheticScreen:async()=>{await stopScreenShare(true);const s=window.__rampScreen;if(s){clearInterval(s.timer);try{s.osc.stop()}catch{};s.stream.getTracks().forEach(t=>t.stop());await s.ac.close().catch(()=>{});window.__rampScreen=null}},",
 " watchScreen:id=>ycWatchScreenShare(id),",
 " screenActive:id=>voiceScreenActiveByUser.has(id),",
 " async rtc(){const out=[];for(const [id,pc] of voicePeers){const stats=await pc.getStats();let sent=0,received=0,lost=0,jitter=0,rtt=0,localType='',remoteType='';let pair=null;stats.forEach(x=>{if(x.type==='outbound-rtp')sent+=Number(x.bytesSent||0);if(x.type==='inbound-rtp'){received+=Number(x.bytesReceived||0);lost+=Number(x.packetsLost||0);jitter=Math.max(jitter,Number(x.jitter||0))}if(!pair&&x.type==='candidate-pair'&&x.state==='succeeded'&&x.nominated)pair=x});if(pair){rtt=Number(pair.currentRoundTripTime||0);localType=stats.get(pair.localCandidateId)?.candidateType||'';remoteType=stats.get(pair.remoteCandidateId)?.candidateType||''}out.push({id,connection:pc.connectionState,ice:pc.iceConnectionState,signaling:pc.signalingState,hasLocal:!!pc.localDescription,hasRemote:!!pc.remoteDescription,sent,received,lost,jitter,rtt,localType,remoteType})}return out},",
 " heap:()=>({used:performance.memory?.usedJSHeapSize||0,total:performance.memory?.totalJSHeapSize||0}),",
 " errors:()=>window.__rampErrors||[]",
 "};",
 "window.__rampErrors=[];window.addEventListener('error',e=>window.__rampErrors.push(String(e.error?.stack||e.error?.message||e.message||'error')));window.addEventListener('unhandledrejection',e=>window.__rampErrors.push(String(e.reason?.stack||e.reason?.message||e.reason||'rejection')));"
 ].join('\n');
 return doc.replace(marker,bridge+'\n'+marker);
}

function fixture(id){
 const communities=[
  {id:'community-a',name:'Ramp A',owner_id:id,server_color:'#1a9fff'},
  {id:'community-b',name:'Ramp B',owner_id:id,server_color:'#70e4e8'},
  {id:'community-c',name:'Ramp C',owner_id:id,server_color:'#8a7dff'}
 ];
 const channels=[
  {id:'chat-a',community_id:'community-a',name:'a-chat',kind:'text',position:1},
  {id:'chat-a2',community_id:'community-a',name:'a-chat-2',kind:'text',position:2},
  ...roomNames.map((room,i)=>({id:room,community_id:'community-a',name:'Voice '+(i+1),kind:'voice',position:10+i})),
  {id:'chat-b',community_id:'community-b',name:'b-chat',kind:'text',position:1},
  {id:'chat-c',community_id:'community-c',name:'c-chat',kind:'text',position:1}
 ];
 const members=communities.map(c=>"{user_id:'"+id+"',community_id:'"+c.id+"',role:'owner',profiles:profile}").join(',');
 let s=base
  .replace("const communities=[{id:'community-a',name:'Testovací server',owner_id:'audit-user',server_color:'#1a9fff'}];","const communities="+JSON.stringify(communities)+";")
  .replace("const channels=[{id:'chat-a',community_id:'community-a',name:'obecný',kind:'text'},{id:'chat-b',community_id:'community-a',name:'druhý-chat',kind:'text'}];","const channels="+JSON.stringify(channels)+";")
  .replace("if(table==='community_members')data=[{user_id:'audit-user',community_id:'community-a',role:'owner',profiles:profile}];","if(table==='community_members')data=["+members+"];")
  .replace("if(table==='messages')data=Array.from({length:60},","if(table==='voice_participants')data=window.__testVoiceRows||[];if(table==='messages')data=Array.from({length:60},")
  .replace("if(filters.id)data=data.filter(x=>x.id===filters.id);","if(filters.id)data=data.filter(x=>x.id===filters.id);if(filters.community_id)data=data.filter(x=>x.community_id===filters.community_id);if(filters.channel_id)data=data.filter(x=>x.channel_id===filters.channel_id);")
  .replace("const channel=()=>{const c={on:()=>c,subscribe:()=>c,track:async()=>{},untrack:async()=>{},send:async()=>{},presenceState:()=>({})};return c};","const channel=(name)=>{const c={__name:String(name),__active:false,on:()=>c,subscribe:(cb)=>{if(!c.__active){c.__active=true;window.__rampActiveChannels.add(c.__name)}queueMicrotask(()=>cb?.('SUBSCRIBED'));return c},track:async()=>{},untrack:async()=>{},send:async()=>{},presenceState:()=>({})};return c};")
  .replace("return {from:query,rpc:async()=>({data:false,error:null}),channel,removeChannel:async()=>{},auth:","return {from:query,rpc:async(name,args)=>{window.__rampRpc.push({name,args});return {data:false,error:null}},channel,removeChannel:async(c)=>{if(c?.__name)window.__rampActiveChannels.delete(c.__name);if(c)c.__active=false},auth:")
  .replace("functions:{invoke:async()=>({data:null,error:Error('offline fixture')})}","functions:{invoke:async(name)=>name==='yamachat-turn-cloudflare'?({data:{iceServers:[]},error:null}):({data:null,error:Error('offline fixture')})}")
  .replace("}};window.__mockWrites=[];","}};window.__mockWrites=[];window.__rampRpc=[];window.__rampActiveChannels=new Set();")
  .replaceAll("'audit-user'","'"+id+"'");
 return s;
}

function processSnapshot(label){
 try{
  const rows=cp.execFileSync('ps',['-eo','rss=,%cpu=,comm='],{encoding:'utf8'}).trim().split(/\n+/).map(x=>x.trim().split(/\s+/)).filter(x=>/chrome|chromium/i.test(x.slice(2).join(' ')));
  const rss=rows.reduce((n,x)=>n+(Number(x[0])||0),0),cpu=rows.reduce((n,x)=>n+(Number(x[1])||0),0);
  const snap={label,chromium_processes:rows.length,rss_kb:rss,cpu_percent_sum:Number(cpu.toFixed(1)),node_rss:process.memoryUsage().rss,loadavg:require('node:os').loadavg()};
  console.log('YC_RAMP_PROCESS '+JSON.stringify(snap));return snap;
 }catch(e){const snap={label,error:e.message};console.log('YC_RAMP_PROCESS '+JSON.stringify(snap));return snap}
}

async function inBatches(items,size,fn){
 for(let i=0;i<items.length;i+=size)await Promise.all(items.slice(i,i+size).map(fn));
}

(async()=>{
 const started=Date.now();
 const launchArgs=['--use-fake-ui-for-media-stream','--autoplay-policy=no-user-gesture-required','--enable-precise-memory-info','--js-flags=--expose-gc'];\n if(RENDERER_PROCESS_LIMIT>0)launchArgs.push('--renderer-process-limit='+RENDERER_PROCESS_LIMIT);\n const browser=await chromium.launch({headless:true,args:launchArgs});
 const clients=new Map(),deliveries=[],signalQueues=new Map(),signalDeliveryErrors=[];let streamsStarted=0,streamViewers=0,messagesSent=0,navigations=0,reconnects=0;
 let beforeSoak=null,afterSoak=null,summary=null;
 try{
  await inBatches(configs,12,async cfg=>{
   const context=await browser.newContext({viewport:{width:cfg.width,height:cfg.height},hasTouch:!!cfg.touch,isMobile:!!cfg.touch,serviceWorkers:'block',permissions:['microphone'],...(cfg.ios?{userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1'}:{})});
   if(cfg.ios)await context.addInitScript(()=>Object.defineProperty(navigator,'standalone',{value:true,configurable:true}));
   const page=await context.newPage(),pageErrors=[];
   page.on('pageerror',e=>pageErrors.push(String(e.stack||e.message||e)));
   await page.exposeBinding('__ycRampSignal',async(_src,packet)=>{
    deliveries.push({from:packet.from,to:packet.to,type:packet.signal_type,channel:packet.channel_id,bytes:Buffer.byteLength(JSON.stringify(packet))});
    const target=clients.get(packet.to);if(!target)return false;
    const previous=signalQueues.get(packet.to)||Promise.resolve();
    const delivery=previous.catch(()=>{}).then(async()=>{
     let lastError=null;
     for(let attempt=1;attempt<=3;attempt++){
      try{await target.page.evaluate(msg=>window.__ycRamp.handleSignal(msg),packet);return true}
      catch(e){lastError=e;if(attempt<3)await new Promise(r=>setTimeout(r,100*attempt))}
     }
     const failure={from:packet.from,to:packet.to,type:packet.signal_type,error:String(lastError?.message||lastError||'delivery failed')};
     signalDeliveryErrors.push(failure);throw new Error('signal delivery failed '+JSON.stringify(failure));
    });
    signalQueues.set(packet.to,delivery);
    delivery.catch(()=>{});
    return true;
   });
   await page.route('**/*',route=>{
    const u=new URL(route.request().url());if(u.hostname!=='127.0.0.1')return route.abort();
    if(u.pathname.endsWith('/supabase.js'))return route.fulfill({contentType:'text/javascript',body:fixture(cfg.id)});
    if(u.pathname==='/')return route.fulfill({contentType:'text/html',body:source(cfg.platform)});
    const file=path.resolve(root,'.'+decodeURIComponent(u.pathname));
    if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||fs.statSync(file).isDirectory())return route.fulfill({status:404,body:''});
    return route.fulfill({path:file});
   });
   clients.set(cfg.id,{cfg,context,page,pageErrors});
   await page.goto('http://127.0.0.1/',{waitUntil:'domcontentloaded',timeout:30000});
   await page.waitForFunction(()=>window.__ycClientReady,{},{timeout:30000});
   await page.waitForSelector('#app:not(.hidden)',{timeout:30000});
  });

  const platformCounts={desktop:0,web:0,android:0,'ios-pwa':0};for(const c of clients.values())platformCounts[c.cfg.platform]++;
  console.log('YC_RAMP_READY '+JSON.stringify({users:N,voice_target:voiceTarget,rooms:roomNames.length,platforms:platformCounts}));
  processSnapshot('ready');

  const voiceClients=[...clients.values()].filter(c=>c.cfg.voice);
  await inBatches(voiceClients,12,async c=>{
   const live=await c.page.evaluate(()=>window.__ycRamp.installSyntheticMic());
   assert.equal(live,'live',c.cfg.id+' synthetic mic not live');
   await c.page.evaluate(room=>window.__ycRamp.joinVoiceById(room),c.cfg.room);
   await c.page.waitForFunction(room=>{const s=window.__ycRamp.state();return s.voice===room&&s.audio==='live'},c.cfg.room,{timeout:30000});
   await c.page.evaluate(()=>window.__ycRamp.installSignalBridge());
  });

  const rosters=new Map();
  for(const room of roomNames){
   const members=voiceClients.filter(c=>c.cfg.room===room),rows=[];
   for(const c of members){const sid=await c.page.evaluate(()=>window.__ycRamp.voiceSessionId);rows.push({user_id:c.cfg.id,username:c.cfg.id,session_id:sid,muted:false,deafened:false,speaking:false,channel_id:room,joined_at:new Date().toISOString(),last_seen:new Date().toISOString()})}
   rosters.set(room,rows);
  }
  await inBatches(voiceClients,10,async c=>{const rows=rosters.get(c.cfg.room);await c.page.evaluate(({room,rows})=>window.__ycRamp.setRoster(room,rows),{room:c.cfg.room,rows});});
  await inBatches(voiceClients,10,c=>c.page.evaluate(()=>window.__ycRamp.syncVoice()));
  await inBatches(voiceClients,10,async c=>{
   const expected=rosters.get(c.cfg.room).length-1;
   try{
    await c.page.waitForFunction(expected=>{const s=window.__ycRamp.state();return s.peers===expected&&s.connected===expected},expected,{timeout:VOICE_CONNECT_TIMEOUT_MS});
   }catch(e){
    const diag=await c.page.evaluate(async({id,expected})=>({id,expected,state:window.__ycRamp.state(),rtc:await window.__ycRamp.rtc(),errors:window.__ycRamp.errors()}),{id:c.cfg.id,expected}).catch(err=>({id:c.cfg.id,expected,diagnostic_error:String(err)}));diag.signalDeliveryErrors=signalDeliveryErrors.slice(-20);diag.signals=deliveries.filter(x=>x.from===c.cfg.id||x.to===c.cfg.id).slice(-120);
    console.error('YC_VOICE_CONNECT_TIMEOUT '+JSON.stringify(diag));throw e;
   }
  });

  const active=[...clients.values()];
  await inBatches(active,20,async c=>{
   await c.page.locator('#messageInput').fill('ramp active '+c.cfg.id);
   await c.page.locator('#sendBtn').click();messagesSent++;
  });

  const navigators=active.filter((_,i)=>i%5===0);
  await inBatches(navigators,12,async c=>{await c.page.evaluate(()=>window.__ycRamp.selectCommunityById('community-b'));await c.page.waitForFunction(()=>window.__ycRamp.state().community==='community-b',{},{timeout:15000});navigations++;});
  for(const c of navigators.filter(c=>c.cfg.voice)){
   const s=await c.page.evaluate(()=>window.__ycRamp.state());assert.equal(s.voice,c.cfg.room,c.cfg.id+' lost voice after cross-community navigation');
  }

  const muteClients=voiceClients.filter((_,i)=>i%4===0);
  await inBatches(muteClients,15,async c=>{await c.page.evaluate(()=>window.__ycRamp.toggleMute());await c.page.evaluate(()=>window.__ycRamp.toggleMute());});

  const reconnectClients=voiceClients.filter((_,i)=>i%20===1);
  await inBatches(reconnectClients,8,async c=>{await c.page.evaluate(()=>window.__ycRamp.reconnectSignals());reconnects++;});

  const streamerClients=voiceClients.filter((_,i)=>i%20===0).slice(0,10);
  for(const streamer of streamerClients){
   await streamer.page.evaluate(()=>window.__ycRamp.startSyntheticScreen());streamsStarted++;
   const sameRoom=voiceClients.filter(c=>c.cfg.room===streamer.cfg.room&&c.cfg.id!==streamer.cfg.id);
   for(const viewer of sameRoom){
    await viewer.page.waitForFunction(id=>window.__ycRamp.screenActive(id),streamer.cfg.id,{timeout:15000});
    await viewer.page.evaluate(id=>window.__ycRamp.watchScreen(id),streamer.cfg.id);streamViewers++;
    await viewer.page.waitForFunction(()=>document.querySelector('.yc-stream-viewer video')?.videoWidth>0,{},{timeout:20000});
   }
  }
  // Keep the stream playing while chat/navigation remains usable, matching the real mini-player workflow.
  for(const c of active){
   const minimize=c.page.locator('.yc-stream-viewer [data-action="minimize"]');
   if(await minimize.count()&&await minimize.first().isVisible().catch(()=>false)){
    await minimize.first().click();
    await c.page.waitForFunction(()=>document.querySelector('.yc-stream-viewer')?.dataset.mode==='mini',{},{timeout:10000});
   }
  }

  beforeSoak=processSnapshot('before_soak');
  const heapBefore=await Promise.all(active.map(c=>c.page.evaluate(()=>{try{globalThis.gc?.();globalThis.gc?.()}catch{};return window.__ycRamp.heap()})));
  const soakEnd=Date.now()+SOAK_SECONDS*1000;let tick=0;
  while(Date.now()<soakEnd){
   tick++;
   const sample=active.filter((_,i)=>i%Math.max(1,Math.floor(N/20))===tick%Math.max(1,Math.floor(N/20))).slice(0,20);
   await inBatches(sample,10,async c=>{await c.page.locator('#messageInput').fill('soak '+tick+' '+c.cfg.id);await c.page.locator('#sendBtn').click();messagesSent++;});
   const muters=muteClients.slice(0,Math.min(12,muteClients.length));await inBatches(muters,12,async c=>{await c.page.evaluate(()=>window.__ycRamp.toggleMute());await c.page.evaluate(()=>window.__ycRamp.toggleMute());});
   await new Promise(r=>setTimeout(r,4000));
   await inBatches(voiceClients,20,async c=>{const expected=rosters.get(c.cfg.room).length-1;const s=await c.page.evaluate(()=>window.__ycRamp.state());assert.equal(s.voice,c.cfg.room,c.cfg.id+' voice dropped during soak');assert.equal(s.connected,expected,c.cfg.id+' connected peer count changed during soak');});
  }
  afterSoak=processSnapshot('after_soak');

  const states=await Promise.all(active.map(c=>c.page.evaluate(async()=>({state:window.__ycRamp.state(),heap:window.__ycRamp.heap(),rtc:await window.__ycRamp.rtc(),errors:window.__ycRamp.errors()}))));
  const heapAfter=await Promise.all(active.map(c=>c.page.evaluate(()=>{try{globalThis.gc?.();globalThis.gc?.()}catch{};return window.__ycRamp.heap()})));
  let peerTotal=0,connectedTotal=0,iceFailures=0,packetLoss=0,maxJitter=0,maxRtt=0,relayPairs=0,hostPairs=0,runtimeErrors=0,pageErrors=0;
  states.forEach((x,i)=>{peerTotal+=x.state.peers;connectedTotal+=x.state.connected;runtimeErrors+=x.errors.length;pageErrors+=active[i].pageErrors.length;for(const r of x.rtc){if(r.ice==='failed'||r.connection==='failed')iceFailures++;packetLoss+=r.lost;maxJitter=Math.max(maxJitter,r.jitter||0);maxRtt=Math.max(maxRtt,r.rtt||0);if(r.localType==='relay'||r.remoteType==='relay')relayPairs++;if(r.localType==='host'||r.remoteType==='host')hostPairs++;}});
  const heapBeforeTotal=heapBefore.reduce((n,x)=>n+(x.used||0),0),heapAfterTotal=heapAfter.reduce((n,x)=>n+(x.used||0),0);
  const signalTypes={};for(const d of deliveries)signalTypes[d.type]=(signalTypes[d.type]||0)+1;
  summary={users:N,active_users:N,platforms:platformCounts,voice_users:voiceClients.length,voice_rooms:roomNames.length,voice_room_size:ROOM_SIZE,streamers:streamsStarted,stream_viewers:streamViewers,messages_sent:messagesSent,cross_community_navigations:navigations,signal_reconnects:reconnects,peer_connections_total:peerTotal,connected_peers_total:connectedTotal,ice_failures:iceFailures,packet_loss:packetLoss,max_jitter_seconds:maxJitter,max_rtt_seconds:maxRtt,relay_candidate_pairs:relayPairs,host_candidate_pairs:hostPairs,signal_deliveries:deliveries.length,signal_types:signalTypes,runtime_errors:runtimeErrors,page_errors:pageErrors,heap_before_gc_bytes:heapBeforeTotal,heap_after_gc_bytes:heapAfterTotal,heap_growth_bytes:heapAfterTotal-heapBeforeTotal,soak_seconds:SOAK_SECONDS,duration_seconds:Number(((Date.now()-started)/1000).toFixed(1)),process_before_soak:beforeSoak,process_after_soak:afterSoak,backend:'mocked Supabase fixture',turn:'disabled; local host ICE only',platform_execution:'Chromium renderers with desktop/web/Android-layout/iOS-PWA profiles; not native devices'};
  console.log('YC_RAMP_RESULT '+JSON.stringify(summary));
  assert.equal(runtimeErrors,0,'runtime errors detected');
  assert.equal(pageErrors,0,'page errors detected');
  assert.equal(iceFailures,0,'ICE failures detected');

  for(const streamer of streamerClients)await streamer.page.evaluate(()=>window.__ycRamp.stopSyntheticScreen()).catch(()=>{});
  await inBatches(voiceClients,15,c=>c.page.evaluate(()=>window.__ycRamp.disconnectVoice()).catch(()=>{}));
  await inBatches(voiceClients,15,c=>c.page.evaluate(()=>window.__ycRamp.stopSyntheticMic()).catch(()=>{}));
  console.log('PASS Yamachat isolated active ramp '+N+' users');
 }catch(e){
  const failure={users:N,voice_target:voiceTarget,rooms:roomNames.length,soak_seconds:SOAK_SECONDS,duration_seconds:Number(((Date.now()-started)/1000).toFixed(1)),error:String(e.stack||e.message||e),process:processSnapshot('failure'),backend:'mocked Supabase fixture',turn:'disabled; local host ICE only'};
  console.error('YC_RAMP_FAILURE '+JSON.stringify(failure));throw e;
 }finally{
  await Promise.all([...clients.values()].map(c=>c.context.close().catch(()=>{})));
  await browser.close().catch(()=>{});
 }
})().catch(e=>{console.error(e);process.exit(1)});
