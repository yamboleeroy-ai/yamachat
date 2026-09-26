
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
assert(!html.includes("ycVoiceAnnounceOnce(row,'join')"),'Direct INSERT join announcement would duplicate the refreshed participant diff');
assert(!html.includes("ycVoiceAnnounceOnce(row,'leave')"),'Direct DELETE leave announcement would duplicate the refreshed participant diff');
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
assert(html.includes('YC_VOICE_JOIN_CUE_DATA'),'Uploaded join cue missing');
assert(html.includes('YC_VOICE_LEAVE_CUE_DATA'),'Uploaded leave cue missing');
assert(html.includes('ycPlayVoiceFileCue(action)'),'Cue mode does not play uploaded join/leave audio');
assert(html.includes("audio=new Audio(data)"),'Uploaded join/leave cues are not played as the embedded MP3 files');
assert(html.includes("root.querySelector('#ycVoiceJoinTest').onclick"),'JOIN preview button is not wired to uploaded audio');
assert(html.includes("root.querySelector('#ycVoiceLeaveTest').onclick"),'LEAVE preview button is not wired to uploaded audio');
assert(html.includes('if(previewBusy)return'),'Voice preview anti-spam guard missing');
assert(html.includes('previewButtons.forEach(b=>b.disabled=true)'),'Voice preview buttons are not disabled while a preview is active');
assert(html.includes('ycVoiceProfileVoice(voices,wanted,profileCfg)'),'Voice profiles do not select profile-aware system voices');
for(const marker of ["rate:.80,pitch:.55","rate:.94,pitch:.82","rate:1.12,pitch:1.05","rate:.86,pitch:1.18","rate:1.00,pitch:1.42","rate:1.16,pitch:1.70"])
 assert(html.includes(marker),'Distinct voice profile tuning missing: '+marker);
for(const marker of ['YC_VOICE_JOIN_CUE_DATA','YC_VOICE_LEAVE_CUE_DATA']){
 const m=html.match(new RegExp("const "+marker+"='data:audio/mpeg;base64,([^']+)'"));
 assert(m&&m[1].startsWith('SUQz')&&m[1].length>4500,'Embedded MP3 cue is missing or truncated: '+marker);
}
for(const profile of ['male-deep','male-natural','male-clear','female-soft','female-natural','female-bright'])
 assert(html.includes(profile),'Missing voice profile: '+profile);
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
  assert.equal(await section.locator('#ycVoiceAnnounceProfile').count(),1);
  assert.equal(await section.locator('#ycSoundboardVolumeRange').count(),1);
  assert.equal(await section.locator('#ycVoiceJoinTest').count(),1);
  assert.equal(await section.locator('#ycVoiceLeaveTest').count(),1);
  await section.locator('#ycVoiceAnnounceMode').selectOption('cue');
  assert.equal(await section.locator('#ycVoiceJoinTest').isVisible(),true);
  assert.equal(await section.locator('#ycVoiceLeaveTest').isVisible(),true);
  assert.equal(await section.locator('#ycVoiceAnnounceTest').isVisible(),false);
  await section.locator('#ycVoiceAnnounceProfile').selectOption('female-natural');
  await section.locator('#ycSoundboardVolumeRange').fill('35');
  const saved=await page.evaluate(()=>({
   mode:localStorage.getItem('yc_voice_announce_mode'),
   profile:localStorage.getItem('yc_voice_announce_profile_v2'),
   volume:localStorage.getItem('yc_soundboard_volume_v1')
  }));
  assert.deepEqual(saved,{mode:'cue',profile:'female-natural',volume:'35'});

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
  console.log('PASS voice experience: single-source join/leave announcements, MP3 previews, anti-spam guard, distinct voice profiles, backdrop-close settings, continuity, AFK and soundboard controls.');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
