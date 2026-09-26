
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const target=process.env.YC_CLIENT||'index.html';
const html=fs.readFileSync(path.join(root,target),'utf8');

// Voice continuity when browsing another server: server navigation is not a disconnect action.
const selectStart=html.indexOf('async function selectCommunity(id){');
const selectEnd=html.indexOf('function renderChannels(chs)',selectStart);
assert(selectStart>=0&&selectEnd>selectStart,'selectCommunity boundary missing');
const selectBody=html.slice(selectStart,selectEnd);
for(const forbidden of ['leaveVoiceChannel(','ycRequestVoiceDisconnect(','cleanupVoiceRooms('])
 assert(!selectBody.includes(forbidden),'Browsing another server must not disconnect voice: '+forbidden);
assert(html.includes("if(voiceChannel?.id)wanted.add(voiceChannel.id)"),'Active voice room must remain subscribed while browsing another server');
assert(html.includes('function ycVoiceCommunityId()'),'Independent voice community context missing');
assert(html.includes("const ycVoiceCid=ycVoiceCommunityId();"),'Soundboard must load from voice community context');

// Presence: manual status wins, but automatic UI inactivity cannot mark an active voice call AFK.
assert(html.includes("const voiceLive=!!voiceChannel&&!!voiceStream?.getAudioTracks?.().some(t=>t.readyState==='live');if(voiceLive)return'online'"),'Voice-connected AFK protection missing');
assert(html.includes("if(pref!=='online')return pref"),'Manual AFK/DND/invisible preference must remain authoritative');

// Immediate voice participant announcements use the existing participant row, including username.
assert(html.includes("ycVoiceParticipantAnnouncement(row,'join')"),'Immediate join announcement missing');
assert(html.includes("ycVoiceParticipantAnnouncement(row,'leave')"),'Immediate leave announcement missing');
assert(html.includes("row.username||cached?.username||cached?.display_name||'Uživatel'"),'Voice announcement username/fallback source missing');
assert(html.includes("if(window.__ycVoiceParticipantAnnouncements)return;"),'Legacy delayed TTS path is not suppressed');

// Soundboard controls reuse the existing per-user voice mix store.
assert(html.includes('soundboardMuted:!!raw.soundboardMuted'),'Per-user soundboard mute missing from voice mix');
assert(html.includes('data-yc-soundboard-mute-user')||html.includes('data.ycSoundboardMuteUser')||html.includes('ycSoundboardMuteUser'),'Per-user soundboard menu action missing');
assert(html.includes('YC_SOUNDBOARD_VOLUME_KEY'),'Soundboard master volume preference missing');
assert(html.includes('ycSoundboardScaleFor(row.user_id)'),'Incoming soundboard sender mix missing');

// User-provided Uh-oh notification is embedded, and silent statuses still keep visual notifications.
assert(html.includes("data:audio/mpeg;base64,SUQz"),'Uploaded message notification sound missing');
assert(html.includes("presence==='dnd'||presence==='invisible'"),'DND/invisible notification sound suppression missing');
assert(html.includes('ycDmUnreadByThread[tid]'),'Visual DM unread state must remain present');

// Personal theme contour must include the composer and connected voice cleanup.
for(const marker of [
 'ycVoiceThemePolishStyle',
 'html body .composer-wrap',
 'html body #ycGlobalNav',
 '#voiceControls #voiceConnectionPanel',
 'border-bottom:0!important',
 'border-right:0!important'
]) assert(html.includes(marker),'Theme/voice visual marker missing: '+marker);

(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:820},serviceWorkers:'block'});
  const fixture=fs.readFileSync(path.join(root,'tests/supabase-fixture.js'),'utf8');
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>{
   const u=new URL(route.request().url());if(u.hostname!=='127.0.0.1')return route.abort();
   if(u.pathname==='/vendor/supabase.js'||u.pathname==='/node_modules/@supabase/supabase-js/dist/umd/supabase.js')
    return route.fulfill({contentType:'application/javascript',body:fixture});
   const file=path.join(root,u.pathname==='/'?target:decodeURIComponent(u.pathname));
   if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:''});
   if(u.pathname==='/')return route.fulfill({contentType:'text/html',body:fs.readFileSync(file,'utf8')});
   return route.fulfill({path:file});
  });
  await page.goto('http://127.0.0.1/');
  await page.waitForFunction(()=>window.__ycClientReady,{},{timeout:15000});
  await page.locator('#appSettingsBtn').click();
  await page.waitForSelector('[data-yc-settings-section="voice-experience"]');
  const section=page.locator('[data-yc-settings-section="voice-experience"]');
  assert.equal(await section.locator('#ycVoiceAnnounceMode').count(),1);
  assert.equal(await section.locator('#ycVoiceAnnounceVoice').count(),1);
  assert.equal(await section.locator('#ycVoiceAnnounceCharacter').count(),1);
  assert.equal(await section.locator('#ycSoundboardVolumeRange').count(),1);
  await section.locator('#ycVoiceAnnounceMode').selectOption('off');
  await section.locator('#ycVoiceAnnounceCharacter').selectOption('low');
  await section.locator('#ycSoundboardVolumeRange').fill('35');
  const saved=await page.evaluate(()=>({
   mode:localStorage.getItem('yc_voice_announce_mode'),
   character:localStorage.getItem('yc_voice_announce_character'),
   volume:localStorage.getItem('yc_soundboard_volume_v1')
  }));
  assert.deepEqual(saved,{mode:'off',character:'low',volume:'35'});

  // Existing per-user voice menu gains a separate soundboard mute without changing voice volume/mute.
  await page.evaluate(()=>{
   const row=document.createElement('div');row.className='voice-user';row.dataset.userId='peer-test';row.dataset.userName='Peer test';
   row.textContent='Peer test';document.body.appendChild(row);
   row.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:200,clientY:200}));
  });
  await page.waitForSelector('[data-yc-soundboard-mute-user="peer-test"]');
  await page.locator('[data-yc-soundboard-mute-user="peer-test"]').click();
  const mix=await page.evaluate(()=>JSON.parse(localStorage.getItem('yc_voice_user_mix')||'{}')['peer-test']);
  assert.equal(mix.soundboardMuted,true);
  assert.equal(mix.volume,100);
  assert.equal(mix.muted,false);

  assert.deepEqual(errors,[]);
  await page.close();
  console.log('PASS voice experience: continuity guards, voice-aware AFK, named join/leave settings, soundboard controls, notification sound and themed bars.');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
