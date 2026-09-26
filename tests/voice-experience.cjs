
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
assert(html.includes("String(currentCommunity.id)===ycVoiceCommunityId()"),'Soundboard admin actions must stay on the joined voice server');
assert(!html.includes("speechSynthesis.cancel();speechSynthesis.speak(u);"),'Rapid voice announcements must not cancel the previous username');
assert(html.includes("community_id:ycVoiceCommunity"),'Stream presence must remain on the joined voice community');

// Presence: manual status wins. In voice, AFK may appear only after prolonged microphone/UI inactivity,
 // and real microphone activity must wake the presence immediately.
assert(html.includes("const voiceLive=!!voiceChannel&&!!voiceStream?.getAudioTracks?.().some(t=>t.readyState==='live');if(voiceLive){const lastVoiceActivity=Math.max(Number(window.__ycVoiceLastMicActivityAt||0),Number(ycLastInputAt||0));return Date.now()-lastVoiceActivity>=300000?'afk':'online'}"),'Microphone-aware voice AFK protection missing');
assert(html.includes("window.__ycVoiceLastMicActivityAt=Date.now()"),'Voice VAD does not mark microphone activity');
assert(html.includes("if(next&&ycLastPresenceSig.startsWith('afk|'))void ycTouchPresence(true)"),'Voice AFK does not recover promptly when speech resumes');
assert(html.includes("if(pref!=='online')return pref"),'Manual AFK/DND/invisible preference must remain authoritative');

// Voice participant announcements have one authoritative source: refreshed participant diffs.
assert(!html.includes("payload.eventType==='INSERT'&&uid!==user.id&&voiceJoinSoundArmed&&voiceChannel?.id===id)ycVoiceAnnounceOnce(row,'join')"),'Direct INSERT join announcement would duplicate the refreshed participant diff');
assert(!html.includes("if(voiceJoinSoundArmed&&(!id||voiceChannel?.id===id))ycVoiceAnnounceOnce(row,'leave')"),'Direct DELETE leave announcement would duplicate the refreshed participant diff');
assert(html.includes("payload.eventType==='INSERT'&&uid!==user.id&&voiceJoinSoundArmed&&voiceChannel?.id===id)void 0"),'INSERT path is not neutralized before participant diff');
assert(html.includes("if(uid!==user.id){closeVoicePeer(uid)}"),'DELETE path should close the peer without announcing directly');
assert(html.includes("ycVoiceDiffAnnouncements(id,before,after)"),'Participant diff announcement source missing');
assert(html.includes("function ycVoiceHandleAnnouncement(payload){\n  if(window.__ycVoiceParticipantAnnouncements)return;"),'Legacy broadcast TTS path is not suppressed');
assert(html.includes("function ycVoiceSpeakPerson(row,action){\n  if(window.__ycVoiceParticipantAnnouncements)return;"),'Legacy participant TTS path is not suppressed');
assert(html.includes("if(now-last<6000)return"),'Voice announcement duplicate guard is too short or missing');
assert(html.includes("row.username||cached?.username||cached?.display_name||'Uživatel'"),'Voice announcement username/fallback source missing');
assert(html.includes("row.channel_id||''"),'Voice announcement active-channel inference missing');
assert(html.includes("cached?.channel_id||activeChannel"),'Voice leave announcement cannot recover channel/name from cached presence');
assert(html.includes('ycVoiceDiffAnnouncements(id,before,after)'),'Participant refresh does not diff join/leave state');
assert(html.includes("const before=[...(voicePresenceByChannel[id]||[])]"),'Participant refresh does not preserve cached leave rows');
assert(html.includes("const newDeleteCache=\"if(id){if(voiceChannel?.id===id)syncVoicePeers()}renderVoiceChannels(voiceChannelDefs)\"")||html.includes("if(id){if(voiceChannel?.id===id)syncVoicePeers()}renderVoiceChannels(voiceChannelDefs)"),'DELETE path removes cached participant before diff can retain the username');
assert(html.includes('YC_VOICE_JOIN_CUE_SRC'),'Uploaded join cue path missing');
assert(html.includes('YC_VOICE_LEAVE_CUE_SRC'),'Uploaded leave cue path missing');
assert(html.includes("./audio/yamachat_join_voice.mp3"),'Exact JOIN file is not referenced');
assert(html.includes("./audio/yamachat_leave_voice.mp3"),'Exact LEAVE file is not referenced');
assert(html.includes('ycPlayVoiceFileCue(action)'),'Cue mode does not play uploaded join/leave audio');
assert(html.includes("audio=new Audio(src)"),'Uploaded join/leave cues are not played from packaged MP3 files');
assert(html.includes("root.querySelector('#ycVoiceJoinTest').onclick"),'JOIN preview button is not wired to uploaded audio');
assert(html.includes("root.querySelector('#ycVoiceLeaveTest').onclick"),'LEAVE preview button is not wired to uploaded audio');
assert(html.includes('if(previewBusy)return'),'Voice preview anti-spam guard missing');
assert(html.includes('previewButtons.forEach(b=>b.disabled=true)'),'Voice preview buttons are not disabled while a preview is active');
assert(html.includes("previewRun(done=>void ycPlayVoiceFileCue('join',done),2600)"),'JOIN preview cooldown is too short or missing');
assert(html.includes("previewRun(done=>void ycPlayVoiceFileCue('leave',done),2600)"),'LEAVE preview cooldown is too short or missing');
assert(html.includes('function ycVoiceSelectedVoice(voices)'),'Real system voice selector missing');
assert(html.includes('u.voice=selected'),'Speech does not use the selected real system voice');
assert(html.includes("u.rate=1;u.pitch=1"),'Speech must not fake different voices with rate/pitch profiles');
assert(html.includes('ycVoiceOptionsHtml(voices)'),'Real system voice option renderer missing');
assert(!html.includes('male-deep')&&!html.includes('female-bright'),'Fake male/female pitch profiles must not remain');
const crypto=require('node:crypto');
for(const [file,expected] of [
 ['audio/yamachat_join_voice.mp3','d0f4654da5668871290144e88cef5e879397a8ab05a6df0f4ecbd1c7a9cd151e'],
 ['audio/yamachat_leave_voice.mp3','08fcd45a4141b3e28e24d0ce6051b7123c0f0d124ae297291b0077a3788ebaa1']
]){
 const p=path.join(root,file);assert(fs.existsSync(p),'Uploaded voice cue missing: '+file);
 const bytes=fs.readFileSync(p);assert.equal(bytes.length,17324,'Uploaded voice cue size changed: '+file);
 assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),expected,'Uploaded voice cue bytes changed: '+file);
}
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
 'html body .composer',
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
  assert.equal(await section.locator('#ycVoiceAnnounceProfile').count(),0);
  assert.equal(await section.locator('#ycSoundboardVolumeRange').count(),1);
  assert.equal(await section.locator('#ycVoiceJoinTest').count(),1);
  assert.equal(await section.locator('#ycVoiceLeaveTest').count(),1);
  await section.locator('#ycVoiceAnnounceMode').selectOption('cue');
  assert.equal(await section.locator('#ycVoiceJoinTest').isVisible(),true);
  assert.equal(await section.locator('#ycVoiceLeaveTest').isVisible(),true);
  assert.equal(await section.locator('#ycVoiceAnnounceTest').isVisible(),false);
  await section.locator('#ycVoiceAnnounceMode').selectOption('speech');
  await section.locator('#ycVoiceAnnounceVoice').evaluate(sel=>{const o=document.createElement('option');o.value='mock-real-voice-uri';o.textContent='Mock real voice';sel.appendChild(o)});
  await section.locator('#ycVoiceAnnounceVoice').selectOption('mock-real-voice-uri');
  await section.locator('#ycSoundboardVolumeRange').fill('35');
  const saved=await page.evaluate(()=>({
   mode:localStorage.getItem('yc_voice_announce_mode'),
   voice:localStorage.getItem('yc_voice_announce_voice'),
   volume:localStorage.getItem('yc_soundboard_volume_v1')
  }));
  assert.deepEqual(saved,{mode:'speech',voice:'mock-real-voice-uri',volume:'35'});

  // Personal settings close on a click on the shaded area, not only via the X button.
  const settingsBack=page.locator('#modalRoot>.modal-back');
  assert.equal(await settingsBack.count(),1);
  await settingsBack.click({position:{x:3,y:3}});
  await page.waitForFunction(()=>!document.querySelector('#modalRoot .yc-app-settings-modal'));

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
  console.log('PASS voice experience: single-source join/leave announcements, exact uploaded MP3 cues, preview cooldown, real voiceURI TTS selection, backdrop-close settings, continuity, AFK and soundboard controls.');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
