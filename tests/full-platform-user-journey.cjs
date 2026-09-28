const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const baseMock=fs.readFileSync(path.join(__dirname,'supabase-fixture.js'),'utf8');

function html(platform){
  const doc=fs.readFileSync(path.join(root,platform==='desktop'?'desktop/desktop-client.html':'index.html'),'utf8');
  const marker='window.__ycClientReady=true;';
  assert(doc.includes(marker),platform+' client-ready marker missing');
  const bridge=`
window.__ycE2E={
  state:()=>({user:user?.id||'',community:currentCommunity?.id||'',channel:currentChannel?.id||'',voice:voiceChannel?.id||'',heartbeat:!!voiceHeartbeatTimer,signalReady:!!voiceSignalReady,participantSub:!!voiceParticipantSub,audio:voiceStream?.getAudioTracks?.()[0]?.readyState||'',peers:voicePeers.size,connected:[...voicePeerStates.values()].filter(x=>x==='connected').length}),
  get user(){return user},get profile(){return profile},get voiceChannel(){return voiceChannel},get voiceStream(){return voiceStream},get voiceSessionId(){return voiceSessionId},
  get voicePeers(){return voicePeers},get voicePeerStates(){return voicePeerStates},get voicePeerSessions(){return voicePeerSessions},get voicePresenceByChannel(){return voicePresenceByChannel},
  get voiceScreenActiveByUser(){return voiceScreenActiveByUser},get remoteScreenStreams(){return remoteScreenStreams},
  joinVoiceById:async id=>{const ch=voiceChannelDefs.find(x=>String(x.id)===String(id));if(!ch)throw Error('voice channel missing: '+id);return joinVoiceChannel(ch)},
  selectChannelById:async id=>{const all=await getChannels();return selectChannel(id,all)},
  selectCommunityById:id=>selectCommunity(id),
  disconnectVoice:()=>ycRequestVoiceDisconnect(),
  installSyntheticMic:async()=>{
   const ac=new (window.AudioContext||window.webkitAudioContext)(),osc=ac.createOscillator(),gain=ac.createGain(),dest=ac.createMediaStreamDestination();
   gain.gain.value=.012;osc.frequency.value=220;osc.connect(gain).connect(dest);osc.start();
   const media={getUserMedia:async()=>dest.stream,enumerateDevices:async()=>[]};
   getVoiceMediaDevices=()=>media;ycPrepareMicStream=async raw=>raw;window.__ycSyntheticMic={ac,osc,dest};
   return dest.stream.getAudioTracks()[0]?.readyState||'';
  },
  stopSyntheticMic:async()=>{const m=window.__ycSyntheticMic;if(!m)return;try{m.osc.stop()}catch{};m.dest.stream.getTracks().forEach(t=>t.stop());await m.ac.close().catch(()=>{});window.__ycSyntheticMic=null;},
  setRoster:(id,rows)=>{window.__testVoiceRows=rows;voicePresenceByChannel[id]=rows;renderVoiceChannels(voiceChannelDefs)},
  attachVoiceScreen,ycAttachRemoteScreenAudio,ycWatchScreenShare,ycSyncStreamViewer
};
`;
  return doc.replace(marker,bridge+marker);
}
function mock(){
  let s=baseMock
    .replace(
      "const communities=[{id:'community-a',name:'Testovací server',owner_id:'audit-user',server_color:'#1a9fff'}];",
      "const communities=[{id:'community-a',name:'Testovací server',owner_id:'audit-user',server_color:'#1a9fff'},{id:'community-b',name:'Druhý server',owner_id:'audit-user',server_color:'#70e4e8'}];"
    )
    .replace(
      "const channels=[{id:'chat-a',community_id:'community-a',name:'obecný',kind:'text'},{id:'chat-b',community_id:'community-a',name:'druhý-chat',kind:'text'}];",
      "const channels=[{id:'chat-a',community_id:'community-a',name:'obecný',kind:'text',position:1},{id:'chat-b',community_id:'community-a',name:'druhý-chat',kind:'text',position:2},{id:'voice-a',community_id:'community-a',name:'Hlas',kind:'voice',position:3},{id:'chat-c',community_id:'community-b',name:'jiný-server',kind:'text',position:1}];"
    )
    .replace(
      "if(table==='profiles')data=[profile];",
      "if(table==='profiles')data=[profile,{id:'peer',username:'peer',display_name:'Druhý uživatel',status:'online'}];"
    )
    .replace(
      "if(table==='community_members')data=[{user_id:'audit-user',community_id:'community-a',role:'owner',profiles:profile}];",
      "if(table==='community_members')data=[{user_id:'audit-user',community_id:'community-a',role:'owner',profiles:profile},{user_id:'audit-user',community_id:'community-b',role:'owner',profiles:profile}];"
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

async function installSyntheticRemoteStream(page){
  await page.evaluate(async()=>{
    const canvas=document.createElement('canvas');canvas.width=640;canvas.height=360;
    const ctx=canvas.getContext('2d');let frame=0;
    const timer=setInterval(()=>{ctx.fillStyle='#071019';ctx.fillRect(0,0,640,360);ctx.fillStyle='#70e4e8';ctx.font='28px sans-serif';ctx.fillText('Yamachat journey '+(++frame),30,80)},80);
    const source=canvas.captureStream(12),ac=new AudioContext(),osc=ac.createOscillator(),gain=ac.createGain(),dest=ac.createMediaStreamDestination();
    gain.gain.value=.015;osc.connect(gain).connect(dest);osc.start();source.addTrack(dest.stream.getAudioTracks()[0]);
    const sender=new RTCPeerConnection(),receiver=new RTCPeerConnection();
    sender.onicecandidate=e=>{if(e.candidate)receiver.addIceCandidate(e.candidate).catch(()=>{})};
    receiver.onicecandidate=e=>{if(e.candidate)sender.addIceCandidate(e.candidate).catch(()=>{})};
    const y=window.__ycE2E,vc=y.voiceChannel,u=y.user,p=y.profile;
    y.setRoster(String(vc.id),[{user_id:u.id,username:p.display_name,session_id:y.voiceSessionId},{user_id:'peer',username:'Druhý uživatel',session_id:'peer-session'}]);
    y.voicePeers.set('peer',receiver);y.voicePeerStates.set('peer','connected');y.voicePeerSessions.set('peer','peer-session');y.voiceScreenActiveByUser.add('peer');
    receiver.ontrack=e=>{if(e.track.kind==='video')y.attachVoiceScreen('peer',e.streams[0]);else y.ycAttachRemoteScreenAudio('peer',e.track)};
    source.getTracks().forEach(t=>sender.addTrack(t,source));
    const offer=await sender.createOffer();await sender.setLocalDescription(offer);await receiver.setRemoteDescription(offer);
    const answer=await receiver.createAnswer();await receiver.setLocalDescription(answer);await sender.setRemoteDescription(answer);
    await y.ycWatchScreenShare('peer');y.ycSyncStreamViewer();
    window.__journeyStream={canvas,source,ac,osc,timer,sender,receiver,video:document.querySelector('.yc-stream-viewer video')};
  });
  await page.waitForFunction(()=>document.querySelector('.yc-stream-viewer video')?.videoWidth>0);
  const t=await page.locator('.yc-stream-viewer video').evaluate(v=>v.currentTime);
  await page.waitForFunction(t=>document.querySelector('.yc-stream-viewer video').currentTime>t+.12,t);
}
async function cleanupSyntheticRemoteStream(page){
  await page.evaluate(()=>{
    const j=window.__journeyStream;if(!j)return;
    clearInterval(j.timer);try{j.osc.stop()}catch{};j.source.getTracks().forEach(t=>t.stop());j.sender.close();j.receiver.close();void j.ac.close();window.__journeyStream=null;
  });
}

(async()=>{
  const browser=await chromium.launch({headless:true,args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--autoplay-policy=no-user-gesture-required']});
  const results=[];
  try{
    for(const cfg of [
      {platform:'desktop',width:1280,height:800,touch:false},
      {platform:'web',width:1440,height:900,touch:false},
      {platform:'android',width:390,height:844,touch:true},
      {platform:'ios-pwa',width:390,height:844,touch:true,ios:true}
    ]){
      const context=await browser.newContext({
        viewport:{width:cfg.width,height:cfg.height},hasTouch:cfg.touch,isMobile:cfg.touch,
        serviceWorkers:'block',permissions:['microphone'],
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
      const supabase=mock(),doc=html(cfg.platform);
      await page.route('**/*',route=>{
        const u=new URL(route.request().url());
        if(u.hostname!=='127.0.0.1')return route.abort();
        if(u.pathname.endsWith('/supabase.js'))return route.fulfill({contentType:'text/javascript',body:supabase});
        if(u.pathname==='/')return route.fulfill({contentType:'text/html',body:doc});
        const file=path.resolve(root,'.'+decodeURIComponent(u.pathname));
        if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||fs.statSync(file).isDirectory())return route.fulfill({status:404,body:''});
        return route.fulfill({path:file});
      });

      await page.goto('http://127.0.0.1/');
      await page.waitForFunction(()=>window.__ycClientReady,{},{timeout:20000});
      await page.waitForSelector('#app:not(.hidden)');
      let state=await page.evaluate(()=>window.__ycE2E.state());
      assert.equal(state.user,'audit-user',cfg.platform+' authenticated session missing');
      assert.equal(state.community,'community-a',cfg.platform+' initial community missing');
      assert.equal(state.channel,'chat-a',cfg.platform+' initial text channel missing');

      // Authenticated chat send from the real composer.
      const body='journey '+cfg.platform+' '+Date.now();
      await page.locator('#messageInput').fill(body);await page.locator('#sendBtn').click();
      await page.waitForFunction(()=>window.__mockWrites.filter(x=>x==='messages:insert').length>=1);
      await page.waitForFunction(()=>document.querySelector('#messageInput')?.value===''&&!document.querySelector('#sendBtn')?.disabled);
      assert.equal(await page.locator('#messageInput').inputValue(),'');
      
      // Real voice join path with a deterministic live synthetic microphone track.
      const syntheticMicState=await page.evaluate(()=>window.__ycE2E.installSyntheticMic());
      assert.equal(syntheticMicState,'live',cfg.platform+' synthetic microphone did not become live');
      await page.evaluate(()=>window.__ycE2E.joinVoiceById('voice-a'));
      try{await page.waitForFunction(()=>{const s=window.__ycE2E.state();return s.voice==='voice-a'&&s.audio==='live'},{},{timeout:12000})}
      catch(e){const snapshot=await page.evaluate(()=>window.__ycE2E.state());throw new Error(cfg.platform+' voice join stalled: '+JSON.stringify(snapshot)+' :: '+e.message)}
      state=await page.evaluate(()=>({...window.__ycE2E.state(),rpcs:window.__mockRpcWrites.map(x=>x.name)}));
      assert.equal(state.voice,'voice-a');assert(state.heartbeat,cfg.platform+' heartbeat missing');assert(state.signalReady,cfg.platform+' signal subscription not ready');
      assert(state.participantSub,cfg.platform+' scoped participant subscription missing');assert.equal(state.audio,'live');
      assert(state.rpcs.includes('set_voice_participant'),cfg.platform+' did not publish voice lease');

      // Text navigation and sending must not tear down voice.
      await page.evaluate(()=>window.__ycE2E.selectChannelById('chat-b'));
      assert.equal(await page.evaluate(()=>window.__ycE2E.state().voice),'voice-a',cfg.platform+' voice dropped on channel switch');
      await page.locator('#messageInput').fill('chat while in voice '+cfg.platform);await page.locator('#sendBtn').click();
      await page.waitForFunction(()=>window.__mockWrites.filter(x=>x==='messages:insert').length>=2);

      // Browsing another server must keep the active room alive.
      await page.evaluate(()=>window.__ycE2E.selectCommunityById('community-b'));
      await page.waitForFunction(()=>{const s=window.__ycE2E.state();return s.community==='community-b'&&s.channel==='chat-c'});
      assert.equal(await page.evaluate(()=>window.__ycE2E.state().voice),'voice-a',cfg.platform+' voice dropped while browsing another server');
      await page.locator('#messageInput').fill('other server while voice stays '+cfg.platform);await page.locator('#sendBtn').click();
      await page.waitForFunction(()=>window.__mockWrites.filter(x=>x==='messages:insert').length>=3);
      await page.evaluate(()=>window.__ycE2E.selectCommunityById('community-a'));
      await page.waitForFunction(()=>window.__ycE2E.state().community==='community-a');

      // Real loopback WebRTC screen video+audio viewed while the user remains in voice.
      await installSyntheticRemoteStream(page);
      const viewerIdentity=await page.evaluate(()=>({voice:window.__ycE2E.state().voice,video:!!window.__journeyStream?.video,peer:window.__ycE2E.voicePeers.get('peer')===window.__journeyStream?.receiver}));
      assert.deepEqual(viewerIdentity,{voice:'voice-a',video:true,peer:true},cfg.platform+' stream/voice identity mismatch');

      // Continue chatting while a stream is playing; neither peer nor video node may be replaced.
      const before=await page.evaluate(()=>({video:window.__journeyStream.video,peer:window.__ycE2E.voicePeers.get('peer')}));
      await page.evaluate(()=>window.__ycE2E.selectChannelById('chat-b'));
      await page.locator('#messageInput').fill('chat while watching stream '+cfg.platform);await page.locator('#sendBtn').click();
      await page.waitForFunction(()=>window.__mockWrites.filter(x=>x==='messages:insert').length>=4);
      const continuity=await page.evaluate(()=>({
        voice:window.__ycE2E.state().voice,
        sameVideo:window.__journeyStream.video===document.querySelector('.yc-stream-viewer video'),
        samePeer:window.__journeyStream.receiver===window.__ycE2E.voicePeers.get('peer'),
        currentTime:document.querySelector('.yc-stream-viewer video')?.currentTime||0
      }));
      assert.equal(continuity.voice,'voice-a');assert(continuity.sameVideo,cfg.platform+' stream video replaced during chat');
      assert(continuity.samePeer,cfg.platform+' WebRTC peer replaced during chat');assert(continuity.currentTime>0,cfg.platform+' stream stopped while chatting');

      // Short offline/online transition must preserve the live client state.
      await context.setOffline(true);await page.waitForTimeout(120);await context.setOffline(false);await page.waitForTimeout(180);
      const recovered=await page.evaluate(()=>({voice:window.__ycE2E.state().voice,sameVideo:window.__journeyStream.video===document.querySelector('.yc-stream-viewer video'),samePeer:window.__journeyStream.receiver===window.__ycE2E.voicePeers.get('peer')}));
      assert.deepEqual(recovered,{voice:'voice-a',sameVideo:true,samePeer:true},cfg.platform+' short reconnect destroyed voice/stream');

      await cleanupSyntheticRemoteStream(page);
      await page.evaluate(()=>window.__ycE2E.disconnectVoice());
      await page.waitForFunction(()=>{const s=window.__ycE2E.state();return !s.voice&&!s.heartbeat&&!s.participantSub});
      await page.evaluate(()=>window.__ycE2E.stopSyntheticMic());
      assert.deepEqual(errors,[],cfg.platform+' runtime page errors');
      results.push({platform:cfg.platform,authenticated:true,chatWrites:4,voice:true,stream:true,crossServerVoice:true,reconnect:true});
      await context.close();
    }
  }finally{await browser.close()}
  fs.writeFileSync(path.join(__dirname,'full-platform-user-journey-results.json'),JSON.stringify(results,null,2));
  console.log('PASS full authenticated journey on desktop/web/Android-layout/iOS-PWA: chat → voice → cross-channel/server → real WebRTC stream playback → chat during stream → reconnect → clean disconnect.');
})().catch(e=>{console.error(e);process.exit(1)});
