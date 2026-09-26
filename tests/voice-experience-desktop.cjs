
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
  "if(table==='profiles')data=[profile];",
  "if(table==='profiles')data=[profile,peer];if(table==='friendships')data=[{requester_id:'audit-user',addressee_id:'peer',status:'accepted',created_at:'2026-09-20T10:00:00Z'}];if(table==='profile_stats')data=[{user_id:'audit-user',xp:1800,message_count:10},{user_id:'peer',xp:3900,message_count:22}];if(table==='user_presence')data=[{user_id:'audit-user',state:'online',activity_text:'V Yamachatu',last_seen_at:new Date().toISOString()},{user_id:'peer',state:'online',activity_text:'V Yamachatu',last_seen_at:new Date().toISOString()}];if(table==='direct_thread_members')data=[{thread_id:'dm-a',user_id:'audit-user'},{thread_id:'dm-a',user_id:'peer'}];"
 );
 return s;
}
async function boot(browser,width=1440,height=900){
 const page=await browser.newPage({viewport:{width,height},serviceWorkers:'block'});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const supabase=mock();
 await page.route('**/*',route=>{
  const u=new URL(route.request().url());
  if(u.hostname!=='127.0.0.1')return route.abort();
  if(u.pathname==='/node_modules/@supabase/supabase-js/dist/umd/supabase.js')return route.fulfill({contentType:'application/javascript',body:supabase});
  const file=path.join(root,u.pathname==='/'?'desktop/desktop-client.html':decodeURIComponent(u.pathname));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:''});
  if(u.pathname==='/')return route.fulfill({contentType:'text/html',body:fs.readFileSync(file,'utf8')});
  return route.fulfill({path:file});
 });
 await page.goto('http://127.0.0.1/');
 await page.waitForFunction(()=>window.__ycClientReady,{},{timeout:15000});
 await page.waitForSelector('#voiceControls',{state:'attached'});
 return {page,errors};
}
async function themeSnapshot(page,theme){
 return page.evaluate(async theme=>{
  document.documentElement.style.setProperty('--yc-theme',theme);
  document.documentElement.style.setProperty('--yc-theme-soft','color-mix(in srgb,'+theme+' 18%,transparent)');
  await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
  const read=s=>{const el=document.querySelector(s),cs=el&&getComputedStyle(el),r=el?.getBoundingClientRect();return el&&cs?{outline:cs.outlineColor,border:cs.borderColor,width:r.width,height:r.height}:null};
  return {top:read('.yc-v3-workspace>.top'),side:read('#side'),right:read('.yc-v3-content-grid>.right'),composer:read('.composer-wrap'),voice:read('#voiceControls')};
 },theme);
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
   for(const sel of ['[data-yc-ann-mode]','[data-yc-ann-preset]','[data-yc-ann-voice]','[data-yc-ann-sound]','[data-yc-ann-vol]','[data-yc-sb-vol]','[data-yc-sb-enabled]','[data-yc-msg-enabled]','[data-yc-msg-vol]','[data-yc-afk]'])
    assert.equal(await page.locator('[data-yc-settings-section="voice-experience"] '+sel).count(),1,'Missing settings '+sel);
   await page.locator('#closeModal').click();

   const logic=await page.evaluate(()=>{
    const old=profile.status;
    profile.status='online';const msgOnline=ycMessageSoundAllowed();
    profile.status='dnd';const msgDnd=ycMessageSoundAllowed();
    profile.status='invisible';const msgInvisible=ycMessageSoundAllowed();
    profile.status='online';

    window.__ycSpoken=[];ycVoiceSpeak=t=>{window.__ycSpoken.push(t);return true};
    voiceChannel={id:'voice-a',community_id:'community-a',name:'Hlavní místnost'};ycVoiceExpAnnounceSeen.clear();
    ycVoiceExpSpeakParticipant('join',{user_id:'peer',channel_id:'voice-a',username:'Petr'});
    ycVoiceExpSpeakParticipant('leave',{user_id:'peer',channel_id:'voice-a',username:'Petr'});

    localStorage.setItem('yc_soundboard_enabled','1');localStorage.setItem('yc_soundboard_volume','35');
    ycSetSoundboardUserMuted('peer',true);const sbMuted=ycSoundboardUserMuted('peer'),sbGain=ycSoundboardGain();
    ycSetSoundboardUserMuted('peer',false);const sbUnmuted=ycSoundboardUserMuted('peer');

    localStorage.setItem('yc_voice_afk_minutes','5');ycLastInputAt=0;voiceSpeaking=true;const speaking=ycAutoPresenceState();
    voiceSpeaking=false;ycVoiceExpLastRoom='voice-a';ycVoiceExpLastSpeechAt=Date.now()-6*60*1000;const silent=ycAutoPresenceState();
    profile.status='dnd';const dnd=ycAutoPresenceState();profile.status='invisible';const invisible=ycAutoPresenceState();
    profile.status=old;
    return {msgOnline,msgDnd,msgInvisible,spoken:window.__ycSpoken.slice(),sbMuted,sbUnmuted,sbGain,speaking,silent,dnd,invisible,uriLength:YC_MESSAGE_UHOH_URI.length};
   });
   assert.equal(logic.msgOnline,true);assert.equal(logic.msgDnd,false);assert.equal(logic.msgInvisible,false);
   assert.deepEqual(logic.spoken,['Petr se připojil do místnosti','Petr opustil místnost']);
   assert.equal(logic.sbMuted,true);assert.equal(logic.sbUnmuted,false);assert.equal(logic.sbGain,.35);assert(logic.uriLength>4000);
   assert.deepEqual({speaking:logic.speaking,silent:logic.silent,dnd:logic.dnd,invisible:logic.invisible},{speaking:'online',silent:'afk',dnd:'dnd',invisible:'invisible'});

   await page.evaluate(()=>{voiceChannel={id:'voice-a',community_id:'community-a',name:'Hlavní místnost'};currentCommunity={id:'community-a',name:'Server A',role:'owner'};soundboardSounds=[];document.getElementById('soundboardPanel').classList.remove('hidden');renderSoundboardPanel()});
   assert.equal(await page.locator('#soundboardPanel .yc-soundboard-master').count(),1);
   assert.equal(await page.locator('#soundboardPanel .yc-soundboard-folder').count(),2);

   const browse=await page.evaluate(async()=>{
    profile.status='online';communities=[{id:'community-a',name:'Server A',role:'owner'},{id:'community-b',name:'Server B',role:'owner'}];currentCommunity=communities[0];
    voiceChannel={id:'voice-a',community_id:'community-a',name:'Hlavní místnost'};voiceSessionId='session-test';
    const track={readyState:'live',enabled:true,stop(){}};voiceStream={getAudioTracks:()=>[track],getTracks:()=>[track]};
    const before={id:voiceChannel.id,session:voiceSessionId,seq:voiceActionSeq};
    await selectCommunity('community-b');
    const after={id:voiceChannel?.id||'',session:voiceSessionId,seq:voiceActionSeq,community:currentCommunity?.id||'',heartbeat:!!voiceHeartbeatTimer,track:voiceStream?.getAudioTracks?.()[0]?.readyState||''};
    if(voiceHeartbeatTimer){clearInterval(voiceHeartbeatTimer);voiceHeartbeatTimer=null}
    return {before,after};
   });
   assert.equal(browse.after.id,browse.before.id,JSON.stringify(browse));assert.equal(browse.after.session,browse.before.session,JSON.stringify(browse));assert.equal(browse.after.seq,browse.before.seq,JSON.stringify(browse));assert.equal(browse.after.community,'community-b',JSON.stringify(browse));assert.equal(browse.after.heartbeat,true,JSON.stringify(browse));assert.equal(browse.after.track,'live',JSON.stringify(browse));

   assert.deepEqual(errors,[]);
   await page.close();
  }
  console.log('PASS desktop voice experience: theme bars, settings, message rules, named voice announcements, soundboard controls, AFK and cross-server voice persistence.');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
