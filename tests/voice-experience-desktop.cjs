
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const baseMock=fs.readFileSync(path.join(__dirname,'supabase-fixture.js'),'utf8');

function mock(){
 let s=baseMock.replace(
  "const profile={id:'audit-user',username:'tester',display_name:'Místní test',status:'online',ui_theme_color:'#ff0000'};",
  "const profile={id:'audit-user',username:'tester',display_name:'Místní test',status:'online',ui_theme_color:'#e056fd'};const peer={id:'peer',username:'Petr',display_name:'Petr Test',status:'online',ui_theme_color:'#e056fd'};"
 );
 s=s.replace(
  "const communities=[{id:'community-a',name:'Testovací server',owner_id:'audit-user',server_color:'#1a9fff'}];",
  "const communities=[{id:'community-a',name:'Server A',owner_id:'audit-user',server_color:'#1a9fff'},{id:'community-b',name:'Server B',owner_id:'audit-user',server_color:'#ff9900'}];"
 );
 s=s.replace(
  "const channels=[{id:'chat-a',community_id:'community-a',name:'obecný',kind:'text'},{id:'chat-b',community_id:'community-a',name:'druhý-chat',kind:'text'}];",
  "const channels=[{id:'chat-a',community_id:'community-a',name:'obecný',kind:'text'},{id:'voice-a',community_id:'community-a',name:'hlavní-místnost',kind:'voice'},{id:'chat-b',community_id:'community-b',name:'jiný-chat',kind:'text'},{id:'voice-b',community_id:'community-b',name:'jiná-místnost',kind:'voice'}];"
 );
 s=s.replace(
  "if(table==='community_members')data=[{user_id:'audit-user',community_id:'community-a',role:'owner',profiles:profile}];",
  "if(table==='community_members')data=[{user_id:'audit-user',community_id:'community-a',role:'owner',profiles:profile},{user_id:'audit-user',community_id:'community-b',role:'owner',profiles:profile}];"
 );
 s=s.replace(
  "if(table==='profiles')data=[profile];",
  "if(table==='profiles')data=[profile,peer];if(table==='friendships')data=[{requester_id:'audit-user',addressee_id:'peer',status:'accepted',created_at:'2026-09-20T10:00:00Z'}];if(table==='profile_stats')data=[{user_id:'audit-user',xp:1800,message_count:10},{user_id:'peer',xp:3900,message_count:22}];if(table==='user_presence')data=[{user_id:'audit-user',state:'online',activity_text:'V Yamachatu',last_seen_at:new Date().toISOString()},{user_id:'peer',state:'online',activity_text:'V Yamachatu',last_seen_at:new Date().toISOString()}];if(table==='direct_thread_members')data=[{thread_id:'dm-a',user_id:'audit-user'},{thread_id:'dm-a',user_id:'peer'}];"
 );
 s=s.replace(
  "if(filters.id)data=data.filter(x=>x.id===filters.id);",
  "if(filters.id)data=data.filter(x=>x.id===filters.id);if(filters.community_id)data=data.filter(x=>x.community_id===filters.community_id);if(filters.user_id)data=data.filter(x=>x.user_id===filters.user_id);if(filters.channel_id)data=data.filter(x=>x.channel_id===filters.channel_id);"
 );
 return s;
}
async function boot(browser,width=1440,height=900){
 const page=await browser.newPage({viewport:{width,height},serviceWorkers:'block'});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  const NativeAudioContext=window.AudioContext||window.webkitAudioContext;
  const TestAudioContext=function(...args){
   const ctx=new NativeAudioContext(...args);
   try{Object.defineProperty(ctx,'audioWorklet',{configurable:true,value:{addModule:async()=>{}}})}catch{}
   return ctx
  };
  TestAudioContext.prototype=NativeAudioContext.prototype;
  window.AudioContext=TestAudioContext;window.webkitAudioContext=TestAudioContext;
  window.AudioWorkletNode=class{
   constructor(ctx){
    const node=ctx.createGain();
    node.port={onmessage:null,postMessage(){}};
    return node
   }
  };
  const makeStream=()=>{const C=window.AudioContext||window.webkitAudioContext,ctx=new C(),dst=ctx.createMediaStreamDestination(),osc=ctx.createOscillator(),gain=ctx.createGain();gain.gain.value=.00001;osc.connect(gain).connect(dst);osc.start();window.__ycTestMic={ctx,osc,stream:dst.stream};return dst.stream};
  const media={getUserMedia:async()=>window.__ycTestMic?.stream||makeStream(),enumerateDevices:async()=>[{kind:'audioinput',deviceId:'default',label:'Test microphone',groupId:'test'},{kind:'audiooutput',deviceId:'default',label:'Test output',groupId:'test'}],getSupportedConstraints:()=>({echoCancellation:true,noiseSuppression:true,autoGainControl:true,channelCount:true,sampleRate:true})};
  try{Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:media})}catch{}
 });
 const supabase=mock();
 await page.route('**/*',route=>{
  const u=new URL(route.request().url());
  if(u.hostname!=='127.0.0.1')return route.abort();
  if(u.pathname==='/node_modules/@supabase/supabase-js/dist/umd/supabase.js')return route.fulfill({contentType:'application/javascript',body:supabase});
  const file=path.join(root,u.pathname==='/'?'desktop/desktop-client.html':decodeURIComponent(u.pathname));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:''});
  if(u.pathname==='/')return route.fulfill({contentType:'text/html',body:fs.readFileSync(file,'utf8')});
  if(/\.(?:js|mjs)$/.test(u.pathname))return route.fulfill({path:file,contentType:'application/javascript'});
  if(/\.wasm$/.test(u.pathname))return route.fulfill({path:file,contentType:'application/wasm'});
  return route.fulfill({path:file});
 });
 await page.goto('http://127.0.0.1/');
 await page.waitForFunction(()=>window.__ycClientReady&&window.YamachatVoiceExperience,{},{timeout:15000});
 await page.waitForSelector('#voiceControls',{state:'attached'});
 await page.waitForSelector('#rail [data-community="community-a"]',{state:'attached'});
 return {page,errors};
}
async function themeSnapshot(page,theme){
 return page.evaluate(async theme=>{
  document.documentElement.style.setProperty('--yc-theme',theme);document.documentElement.style.setProperty('--yc-theme-soft','color-mix(in srgb,'+theme+' 18%,transparent)');
  await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
  const read=s=>{const el=document.querySelector(s),cs=el&&getComputedStyle(el),r=el?.getBoundingClientRect();return el&&cs?{outline:cs.outlineColor,border:cs.borderColor,width:r.width,height:r.height}:null};
  return {top:read('.yc-v3-workspace>.top'),side:read('#side'),right:read('.yc-v3-content-grid>.right'),composer:read('.composer-wrap'),voice:read('#voiceControls')};
 },theme);
}
async function joinVoiceA(page){
 const row=page.locator('.voice-channel[data-voice="voice-a"]');await row.waitFor({state:'visible'});await row.dblclick();
 try{
  await page.waitForFunction(()=>window.YamachatVoiceExperience?.snapshot().voiceConnected,{},{timeout:15000});
 }catch(error){
  const debug=await page.evaluate(()=>({
   snapshot:window.YamachatVoiceExperience?.snapshot?.()||null,
   toast:document.getElementById('toast')?.textContent||'',
   voiceStatus:document.getElementById('voiceStatusSub')?.textContent||'',
   switching:!!window.__ycVoiceSwitchBusy,
   target:String(window.__ycVoiceSwitchTargetId||'')
  }));
  throw new Error('Voice join failed: '+JSON.stringify(debug)+' :: '+error.message);
 }
 return page.evaluate(()=>window.YamachatVoiceExperience.snapshot());
}
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
 try{
  for(const [width,height] of [[1440,900],[1100,650],[900,480]]){
   const {page,errors}=await boot(browser,width,height);
   const a=await themeSnapshot(page,'#00bcd4'),b=await themeSnapshot(page,'#ff7a00');
   for(const key of ['top','side','right','composer','voice']){
    assert(a[key]&&b[key],JSON.stringify({width,height,key,a:a[key],b:b[key]}));
    assert.notEqual(a[key].outline,b[key].outline,JSON.stringify({width,height,key,a:a[key].outline,b:b[key].outline}));
    assert(Math.abs(a[key].width-b[key].width)<0.2&&Math.abs(a[key].height-b[key].height)<0.2,JSON.stringify({width,height,key,a:a[key],b:b[key]}));
   }
   assert.notEqual(a.composer.border,b.composer.border,'Composer border must follow theme');

   await page.locator('#appSettingsBtn').click();await page.waitForSelector('[data-yc-settings-section="voice-experience"]');
   const section=page.locator('[data-yc-settings-section="voice-experience"]');
   for(const sel of ['[data-yc-ann-mode]','[data-yc-ann-preset]','[data-yc-ann-voice]','[data-yc-ann-sound]','[data-yc-ann-vol]','[data-yc-sb-vol]','[data-yc-sb-enabled]','[data-yc-msg-enabled]','[data-yc-msg-vol]','[data-yc-afk]'])
    assert.equal(await section.locator(sel).count(),1,'Missing settings '+sel);
   await section.locator('[data-yc-sb-vol]').evaluate(el=>{el.value='35';el.dispatchEvent(new Event('input',{bubbles:true}))});
   await section.locator('[data-yc-afk]').selectOption('5');
   await page.locator('#closeModal').click();

   const rules=await page.evaluate(()=>({
    online:window.YamachatVoiceExperience.messageSoundAllowedFor('online'),dnd:window.YamachatVoiceExperience.messageSoundAllowedFor('dnd'),invisible:window.YamachatVoiceExperience.messageSoundAllowedFor('invisible'),
    join:window.YamachatVoiceExperience.announcementText('join','Petr'),leave:window.YamachatVoiceExperience.announcementText('leave','Petr'),
    speaking:window.YamachatVoiceExperience.presenceFor('online',true,true,60*60*1000,5,'afk'),silent:window.YamachatVoiceExperience.presenceFor('online',true,false,6*60*1000,5,'online'),
    dndPresence:window.YamachatVoiceExperience.presenceFor('dnd',true,false,60*60*1000,5,'online'),invisiblePresence:window.YamachatVoiceExperience.presenceFor('invisible',true,false,60*60*1000,5,'online'),
    snapshot:window.YamachatVoiceExperience.snapshot()
   }));
   assert.deepEqual({online:rules.online,dnd:rules.dnd,invisible:rules.invisible},{online:true,dnd:false,invisible:false});
   assert.equal(rules.join,'Petr se připojil do místnosti');assert.equal(rules.leave,'Petr opustil místnost');
   assert.deepEqual({speaking:rules.speaking,silent:rules.silent,dnd:rules.dndPresence,invisible:rules.invisiblePresence},{speaking:'online',silent:'afk',dnd:'dnd',invisible:'invisible'});
   assert.equal(rules.snapshot.messageSoundEmbedded,true);assert.equal(rules.snapshot.soundboardGain,.35);assert.equal(rules.snapshot.afkMinutes,5);
   await page.evaluate(()=>localStorage.setItem('yc_soundboard_muted_users',JSON.stringify({peer:1})));
   assert.equal(await page.evaluate(()=>window.YamachatVoiceExperience.isSoundboardUserMuted('peer')),true);

   const before=await joinVoiceA(page);
   assert.equal(before.voiceChannelId,'voice-a',JSON.stringify(before));
   assert.equal(before.micLive,true,JSON.stringify(before));
   assert.equal(before.heartbeat,true,JSON.stringify(before));
   await page.locator('#voiceSoundboardBtn').click();await page.waitForSelector('#soundboardPanel:not(.hidden)');
   assert.equal(await page.locator('#soundboardPanel .yc-soundboard-master').count(),1);assert.equal(await page.locator('#soundboardPanel .yc-soundboard-folder').count(),2);
   await page.locator('#soundboardCloseBtn').click();

   await page.locator('#rail [data-community="community-b"]').evaluate(el=>el.click());
   await page.waitForSelector('#rail [data-community="community-b"].active',{timeout:10000});
   const after=await page.evaluate(()=>window.YamachatVoiceExperience.snapshot());
   assert.equal(after.voiceConnected,true,JSON.stringify({before,after}));assert.equal(after.voiceChannelId,before.voiceChannelId,JSON.stringify({before,after}));assert.equal(after.voiceSessionId,before.voiceSessionId,JSON.stringify({before,after}));assert.equal(after.voiceCommunityId,'community-a',JSON.stringify({before,after}));assert.equal(after.micLive,true,JSON.stringify({before,after}));assert.equal(after.heartbeat,true,JSON.stringify({before,after}));

   assert.deepEqual(errors,[]);await page.close();
  }
  console.log('PASS desktop voice experience: themed bars, settings, notification rules, named announcements, soundboard controls, AFK and real UI cross-server voice persistence.');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
