const runtime=String.raw`
// Voice experience preferences: local per-user choices, no new backend schema.
window.__ycVoiceParticipantAnnouncements=true;
const YC_VOICE_ANNOUNCE_MODE_KEY='yc_voice_announce_mode';
const YC_VOICE_ANNOUNCE_VOICE_KEY='yc_voice_announce_voice';
const YC_VOICE_ANNOUNCE_CHARACTER_KEY='yc_voice_announce_character'; // legacy only
const YC_SOUNDBOARD_VOLUME_KEY='yc_soundboard_volume_v1';
const YC_VOICE_JOIN_CUE_SRC='./audio/yamachat_join_voice.mp3';
const YC_VOICE_LEAVE_CUE_SRC='./audio/yamachat_leave_voice.mp3';
const ycVoiceCuePlayers=new Set();
const ycVoiceAnnouncementDedup=new Map();

function ycVoiceAnnounceMode(){
 const v=localStorage.getItem(YC_VOICE_ANNOUNCE_MODE_KEY)||'speech';
 return ['speech','cue','off'].includes(v)?v:'speech';
}
function ycVoiceAvailableVoices(){
 try{
  const raw=[...(speechSynthesis?.getVoices?.()||[])],seen=new Set(),out=[];
  for(const v of raw){
   const key=String(v.voiceURI||'')||String(v.name||'')+'|'+String(v.lang||'');
   if(!key||seen.has(key))continue;seen.add(key);out.push(v);
  }
  return out.sort((a,b)=>{
   const ac=String(a.lang||'').toLowerCase().startsWith('cs')?0:1,bc=String(b.lang||'').toLowerCase().startsWith('cs')?0:1;
   return ac-bc||String(a.name||'').localeCompare(String(b.name||''),'cs');
  });
 }catch{return[]}
}
function ycVoiceGenderHint(v){
 const n=String(v?.name||'');
 const female=/(^|\b)(vlasta|zira|hazel|susan|linda|heera|helena|zuzana|tereza|iva|mark[eé]ta|veronika|johana|lucie|anna|katja|elsa|sabina|female|woman)(\b|$)/i;
 const male=/(^|\b)(jakub|david|mark|george|james|richard|pavel|michal|daniel|filip|jan|adam|anton[ií]n|ondřej|ondrej|matěj|matej|male|man)(\b|$)/i;
 return female.test(n)?'female':male.test(n)?'male':'';
}
function ycVoiceSelectedVoice(voices){
 const wanted=localStorage.getItem(YC_VOICE_ANNOUNCE_VOICE_KEY)||'';
 const exact=voices.find(v=>v.voiceURI===wanted||v.name===wanted);if(exact)return exact;
 return voices.find(v=>String(v.lang||'').toLowerCase().startsWith('cs'))||voices.find(v=>v.default)||voices[0]||null;
}
function ycVoiceOptionLabel(v){
 const hint=ycVoiceGenderHint(v),gender=hint==='female'?' · ženský':hint==='male'?' · mužský':'';
 return String(v.name||'Systémový hlas')+' · '+String(v.lang||'')+gender;
}
function ycVoiceOptionsHtml(voices){
 const groups=[
  ['Čeština · ženské',voices.filter(v=>String(v.lang||'').toLowerCase().startsWith('cs')&&ycVoiceGenderHint(v)==='female')],
  ['Čeština · mužské',voices.filter(v=>String(v.lang||'').toLowerCase().startsWith('cs')&&ycVoiceGenderHint(v)==='male')],
  ['Čeština · další',voices.filter(v=>String(v.lang||'').toLowerCase().startsWith('cs')&&!ycVoiceGenderHint(v))],
  ['Ostatní skutečné hlasy',voices.filter(v=>!String(v.lang||'').toLowerCase().startsWith('cs'))]
 ];
 return groups.filter(([,list])=>list.length).map(([label,list])=>'<optgroup label="'+esc(label)+'">'+list.map(v=>'<option value="'+esc(v.voiceURI||v.name)+'">'+esc(ycVoiceOptionLabel(v))+'</option>').join('')+'</optgroup>').join('');
}
async function ycPlayVoiceFileCue(action,onDone){
 let audio=null,finished=false;
 const finish=()=>{if(finished)return;finished=true;if(audio)ycVoiceCuePlayers.delete(audio);try{onDone?.()}catch{}};
 try{
  if(voiceDeafened){finish();return null}
  const src=action==='leave'?YC_VOICE_LEAVE_CUE_SRC:YC_VOICE_JOIN_CUE_SRC;
  audio=new Audio(src);audio.preload='auto';audio.volume=.92;ycVoiceCuePlayers.add(audio);
  audio.onended=finish;audio.onerror=finish;
  if(voiceOutputId&&typeof audio.setSinkId==='function')try{await audio.setSinkId(voiceOutputId)}catch{}
  await audio.play();return audio;
 }catch(e){finish();console.warn('voice join/leave cue',e);return null}
}
function ycVoiceSpeakEnhanced(text,onDone){
 if(!text||ycVoiceAnnounceMode()!=='speech'||!('speechSynthesis' in window)){try{onDone?.()}catch{};return null}
 try{
  const u=new SpeechSynthesisUtterance(text),voices=ycVoiceAvailableVoices(),selected=ycVoiceSelectedVoice(voices);
  u.voice=selected;u.lang=selected?.lang||'cs-CZ';u.rate=1;u.pitch=1;u.volume=.94;
  if(onDone){let done=false;const finish=()=>{if(done)return;done=true;try{onDone()}catch{}};u.onend=finish;u.onerror=finish;setTimeout(finish,5200)}
  speechSynthesis.speak(u);return u;
 }catch(e){try{onDone?.()}catch{};console.warn('voice participant TTS',e);return null}
}
function ycVoiceParticipantAnnouncement(row,action){
 try{
  if(!row)return;
  const uid=String(row.user_id||'');if(!uid||uid===String(user?.id||''))return;
  const activeChannel=String(voiceChannel?.id||'');if(!activeChannel)return;
  const rowChannel=String(row.channel_id||'');
  const cached=(voicePresenceByChannel?.[rowChannel||activeChannel]||[]).find(p=>String(p.user_id||'')===uid)
    ||(voicePresenceByChannel?.[activeChannel]||[]).find(p=>String(p.user_id||'')===uid);
  const channelId=rowChannel||String(cached?.channel_id||activeChannel);
  if(channelId!==activeChannel)return;
  const mode=ycVoiceAnnounceMode();if(mode==='off')return;
  if(mode==='cue'){void ycPlayVoiceFileCue(action);return}
  const name=String(row.username||cached?.username||cached?.display_name||'Uživatel').trim()||'Uživatel';
  ycVoiceSpeakEnhanced(action==='join'?name+' se připojil do místnosti':name+' opustil místnost');
 }catch(e){console.warn('voice participant announcement',e)}
}
function ycVoiceAnnounceOnce(row,action){
 try{
  const uid=String(row?.user_id||'');const channel=String(row?.channel_id||voiceChannel?.id||'');if(!uid||!channel)return;
  const key=action+'|'+channel+'|'+uid,now=Date.now(),last=Number(ycVoiceAnnouncementDedup.get(key)||0);
  if(now-last<6000)return;ycVoiceAnnouncementDedup.set(key,now);
  if(ycVoiceAnnouncementDedup.size>120)for(const [k,ts] of ycVoiceAnnouncementDedup)if(now-ts>15000)ycVoiceAnnouncementDedup.delete(k);
  ycVoiceParticipantAnnouncement({...row,channel_id:channel},action);
 }catch(e){console.warn('voice announcement dedup',e)}
}
function ycVoiceDiffAnnouncements(channelId,before,after){
 if(!voiceJoinSoundArmed||String(channelId||'')!==String(voiceChannel?.id||''))return;
 const oldMap=new Map((before||[]).map(p=>[String(p.user_id||''),p]).filter(([id])=>id));
 const newMap=new Map((after||[]).map(p=>[String(p.user_id||''),p]).filter(([id])=>id));
 for(const [uid,row] of newMap)if(uid!==String(user?.id||'')&&!oldMap.has(uid))ycVoiceAnnounceOnce(row,'join');
 for(const [uid,row] of oldMap)if(uid!==String(user?.id||'')&&!newMap.has(uid))ycVoiceAnnounceOnce(row,'leave');
}
function ycSoundboardVolume(){
 const n=Number(localStorage.getItem(YC_SOUNDBOARD_VOLUME_KEY));
 return Number.isFinite(n)?Math.max(0,Math.min(100,n)):100;
}
function ycSoundboardScaleFor(uid){
 const mix=uid&&typeof voiceMixFor==='function'?voiceMixFor(uid):{soundboardMuted:false};
 if(mix?.soundboardMuted)return 0;
 return ycSoundboardVolume()/100;
}
function ycMountSoundboardVolume(){
 const panel=$('soundboardPanel');if(!panel||panel.querySelector('[data-yc-sb-volume]'))return;
 const note=panel.querySelector('.soundboard-note'),wrap=document.createElement('div');wrap.className='yc-soundboard-volume';wrap.dataset.ycSbVolume='1';
 const value=ycSoundboardVolume();
 wrap.innerHTML='<label><span>Hlasitost soundboardu</span><strong data-yc-sb-volume-value>'+value+' %</strong></label><input data-yc-sb-volume-range type="range" min="0" max="100" step="5" value="'+value+'">';
 (note?.parentElement||panel).insertBefore(wrap,note||null);
 const input=wrap.querySelector('[data-yc-sb-volume-range]'),out=wrap.querySelector('[data-yc-sb-volume-value]');
 input.oninput=()=>{const v=Math.max(0,Math.min(100,Number(input.value)||0));localStorage.setItem(YC_SOUNDBOARD_VOLUME_KEY,String(v));out.textContent=v+' %'};
}
const ycVoiceExperienceBaseRenderSoundboard=renderSoundboardPanel;
renderSoundboardPanel=function(...args){const out=ycVoiceExperienceBaseRenderSoundboard.apply(this,args);ycMountSoundboardVolume();return out};

const ycVoiceExperienceBaseUserMenu=openVoiceUserMenu;
openVoiceUserMenu=function(uid,name,x,y){
 const out=ycVoiceExperienceBaseUserMenu.call(this,uid,name,x,y),m=$('voiceUserContextMenu');if(!m||!uid||uid===user?.id)return out;
 const mix=voiceMixFor(uid),btn=document.createElement('button');btn.type='button';btn.className='voice-user-menu-row';btn.dataset.ycSoundboardMuteUser=uid;
 btn.textContent=mix.soundboardMuted?'🔊 Povolit jeho soundboard':'🔇 Ztlumit jeho soundboard';
 const reset=$('voiceUserResetBtn');m.insertBefore(btn,reset||null);
 btn.onclick=()=>{const cur=voiceMixFor(uid);setVoiceUserMix(uid,{soundboardMuted:!cur.soundboardMuted});openVoiceUserMenu(uid,name,x,y)};
 return out;
};

function ycVoiceCommunityId(){
 return String(voiceChannel?.community_id||voiceChannel?.communityId||currentCommunity?.id||'');
}
function ycVoiceExperienceSettingsHtml(){
 const mode=ycVoiceAnnounceMode(),volume=ycSoundboardVolume();
 const opt=(v,label)=>'<option value="'+v+'" '+(mode===v?'selected':'')+'>'+label+'</option>';
 return '<div class="yc-voice-experience-settings">'+
  '<div class="field"><label>Oznámení vstupu a odchodu z voice</label><select id="ycVoiceAnnounceMode">'+opt('speech','Přečíst jméno hlasem')+opt('cue','Jen krátký zvuk')+opt('off','Vypnuto')+'</select></div>'+
  '<div class="field" data-yc-voice-select-wrap><label>Skutečný hlas pro čtení jmen</label><select id="ycVoiceAnnounceVoice"><option value="">Automaticky · preferovat češtinu</option></select><small data-yc-real-voice-note>Seznam obsahuje skutečné hlasy, které poskytuje Windows/Electron. Mužský/ženský štítek se zobrazí jen u hlasů, které lze bezpečně rozpoznat podle názvu.</small></div>'+
  '<div class="yc-voice-preview-row"><button type="button" id="ycVoiceAnnounceTest">▶ Vyzkoušet hlas</button><button type="button" id="ycVoiceJoinTest" hidden>▶ JOIN zvuk</button><button type="button" id="ycVoiceLeaveTest" hidden>▶ LEAVE zvuk</button></div>'+
  '<div class="field"><label>Hlasitost soundboardu · <span id="ycSoundboardVolumeValue">'+volume+' %</span></label><input id="ycSoundboardVolumeRange" type="range" min="0" max="100" step="5" value="'+volume+'"></div>'+
  '<p class="yc-settings-note">Hlasitost lidí a lokální mute zůstávají zvlášť pro každého uživatele. Pravým kliknutím na člověka ve voice můžeš navíc ztlumit jen jeho soundboard.</p>'+
 '</div>';
}
function ycBindVoiceExperienceSettings(root){
 if(!root)return;
 const mode=root.querySelector('#ycVoiceAnnounceMode'),voiceSelect=root.querySelector('#ycVoiceAnnounceVoice');
 const syncVisibility=()=>{const speech=mode?.value==='speech',cue=mode?.value==='cue';root.querySelector('[data-yc-voice-select-wrap]')?.toggleAttribute('hidden',!speech);root.querySelector('#ycVoiceAnnounceTest')?.toggleAttribute('hidden',!speech);root.querySelector('#ycVoiceJoinTest')?.toggleAttribute('hidden',!cue);root.querySelector('#ycVoiceLeaveTest')?.toggleAttribute('hidden',!cue)};
 const fillVoices=()=>{
  if(!voiceSelect)return;const chosen=localStorage.getItem(YC_VOICE_ANNOUNCE_VOICE_KEY)||'',voices=ycVoiceAvailableVoices();
  voiceSelect.innerHTML='<option value="">Automaticky · preferovat češtinu</option>'+ycVoiceOptionsHtml(voices);
  voiceSelect.value=[...voiceSelect.options].some(o=>o.value===chosen)?chosen:'';
  const note=root.querySelector('[data-yc-real-voice-note]');
  if(note)note.textContent=voices.length
   ?'Nalezeno '+voices.length+' skutečných systémových hlasů. Výběr mění voiceURI, ne rychlost nebo výšku jednoho hlasu.'
   :'Windows/Electron zatím nevrátil žádný systémový hlas. Pokud se hlasy načtou později, seznam se automaticky obnoví.';
 };
 fillVoices();try{speechSynthesis?.addEventListener?.('voiceschanged',fillVoices,{once:true})}catch{}
 mode.onchange=()=>{localStorage.setItem(YC_VOICE_ANNOUNCE_MODE_KEY,mode.value);syncVisibility()};
 voiceSelect.onchange=()=>{localStorage.setItem(YC_VOICE_ANNOUNCE_VOICE_KEY,voiceSelect.value);try{speechSynthesis.cancel()}catch{}};
 const sb=root.querySelector('#ycSoundboardVolumeRange'),sbv=root.querySelector('#ycSoundboardVolumeValue');
 sb.oninput=()=>{const v=Math.max(0,Math.min(100,Number(sb.value)||0));localStorage.setItem(YC_SOUNDBOARD_VOLUME_KEY,String(v));sbv.textContent=v+' %'};
 const previewButtons=[...root.querySelectorAll('#ycVoiceAnnounceTest,#ycVoiceJoinTest,#ycVoiceLeaveTest')];let previewBusy=false,previewTimer=0;
 const previewUnlock=()=>{previewBusy=false;clearTimeout(previewTimer);previewButtons.forEach(b=>b.disabled=false)};
 const previewRun=(runner,minLock=2600)=>{if(previewBusy)return;previewBusy=true;previewButtons.forEach(b=>b.disabled=true);const started=Date.now(),done=()=>{const rest=Math.max(0,minLock-(Date.now()-started));clearTimeout(previewTimer);previewTimer=setTimeout(previewUnlock,rest)};previewTimer=setTimeout(previewUnlock,Math.max(minLock,6000));try{runner(done)}catch(e){done();console.warn('voice preview',e)}};
 root.querySelector('#ycVoiceAnnounceTest').onclick=()=>previewRun(done=>{try{speechSynthesis.cancel()}catch{};ycVoiceSpeakEnhanced((profile?.display_name||profile?.username||'Yamachat')+' se připojil do místnosti',done)},3600);
 root.querySelector('#ycVoiceJoinTest').onclick=()=>previewRun(done=>void ycPlayVoiceFileCue('join',done),2600);
 root.querySelector('#ycVoiceLeaveTest').onclick=()=>previewRun(done=>void ycPlayVoiceFileCue('leave',done),2600);
 syncVisibility();
}
ycRegisterAppSettingsSection({
 id:'voice-experience',
 title:'Voice a zvuky',
 description:'Oznámení lidí ve voice, hlas čtení a osobní hlasitost soundboardu.',
 render:ycVoiceExperienceSettingsHtml,
 bind:ycBindVoiceExperienceSettings
});
`;
const style=String.raw`
<style id="ycVoiceExperienceStyle">
.yc-voice-experience-settings{display:grid;gap:10px}
.yc-voice-experience-settings .field{display:grid;gap:6px}
.yc-voice-experience-settings select,.yc-voice-experience-settings input[type="range"]{width:100%}
.yc-voice-experience-settings select{padding:9px 10px;border-radius:9px;border:1px solid color-mix(in srgb,var(--yc-theme,#e056fd) 34%,#35566a);background:#0c1d28;color:#e9f7fc}
.yc-voice-experience-settings button{min-height:38px;border:1px solid color-mix(in srgb,var(--yc-theme,#e056fd) 42%,#385b6f);border-radius:9px;background:#112936;color:#e9f8ff;font-weight:800}.yc-voice-experience-settings button:disabled{opacity:.48;cursor:wait}.yc-voice-preview-row{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.yc-voice-preview-row>#ycVoiceAnnounceTest{grid-column:1/-1}.yc-voice-preview-row>[hidden]{display:none!important}
.yc-soundboard-volume{display:grid;gap:6px;padding:9px 10px;border:1px solid color-mix(in srgb,var(--yc-theme,#e056fd) 24%,#29495d);border-radius:9px;background:#091923}
.yc-soundboard-volume label{display:flex;justify-content:space-between;gap:10px;color:#a8c4d0;font-size:10px}
.yc-soundboard-volume input{width:100%;accent-color:var(--yc-theme,#e056fd)}
</style>
`;
export function withVoiceExperience(html){
 const marker='// Register every feature before restoring a cached session.';
 for(const part of [
  marker,
  "function voiceMixFor(uid)",
  "function subscribeVoiceParticipants()",
  "function playPresetSound(key)",
  "async function playCustomSound(soundId)",
  "async function handleSoundboardEvent(row)",
  "function ycAutoPresenceState()",
  "function ycVoiceHandleAnnouncement(payload)"
 ]) if(!html.includes(part))throw Error('Voice experience insertion boundary missing: '+part);
 if(html.includes('ycVoiceExperienceStyle'))return html;

 // Manual AFK/DND/invisible always wins. While voice is connected, automatic AFK is based on
 // prolonged microphone silence (or total inactivity), never merely on browsing another server or hiding the window.
 const oldPresence="function ycAutoPresenceState(){const pref=ycPresencePreference();if(pref!=='online')return pref;return document.hidden||Date.now()-ycLastInputAt>=300000?'afk':'online'}";
 const newPresence="function ycAutoPresenceState(){const pref=ycPresencePreference();if(pref!=='online')return pref;const voiceLive=!!voiceChannel&&!!voiceStream?.getAudioTracks?.().some(t=>t.readyState==='live');if(voiceLive){const lastVoiceActivity=Math.max(Number(window.__ycVoiceLastMicActivityAt||0),Number(ycLastInputAt||0));return Date.now()-lastVoiceActivity>=300000?'afk':'online'}return document.hidden||Date.now()-ycLastInputAt>=300000?'afk':'online'}";
 if(!html.includes(oldPresence))throw Error('Voice AFK boundary missing');
 html=html.replace(oldPresence,newPresence);

 // Reuse the existing VAD so AFK follows real microphone activity without adding a second audio capture/analyser.
 const oldVadStart="function startVoiceActivityDetector(){stopVoiceActivityDetector();if(!voiceStream)return;try{";
 const newVadStart="function startVoiceActivityDetector(){stopVoiceActivityDetector();if(!voiceStream)return;window.__ycVoiceLastMicActivityAt=Date.now();try{";
 const oldVadHit="if(!voiceMuted&&!voiceDeafened&&rms>threshold)speakingUntil=now+420;";
 const newVadHit="if(!voiceMuted&&!voiceDeafened&&rms>threshold){speakingUntil=now+420;window.__ycVoiceLastMicActivityAt=Date.now()}";
 const oldVadState="if(next!==lastState&&now-lastSend>80){lastState=next;lastSend=now;voiceSpeaking=next;trackVoicePresence().catch(()=>{});renderVoiceChannels(voiceChannelDefs)}";
 const newVadState="if(next!==lastState&&now-lastSend>80){lastState=next;lastSend=now;voiceSpeaking=next;if(next&&ycLastPresenceSig.startsWith('afk|'))void ycTouchPresence(true);trackVoicePresence().catch(()=>{});renderVoiceChannels(voiceChannelDefs)}";
 for(const boundary of [oldVadStart,oldVadHit,oldVadState])if(!html.includes(boundary))throw Error('Voice microphone AFK boundary missing: '+boundary);
 html=html.replace(oldVadStart,newVadStart).replace(oldVadHit,newVadHit).replace(oldVadState,newVadState);

 // Preserve the existing per-user voice volume/mute store and extend it with soundboard mute.
 const oldMix="return{muted:!!raw.muted,volume}}";
 if(!html.includes(oldMix))throw Error('Voice user mix boundary missing');
 html=html.replace(oldMix,"return{muted:!!raw.muted,volume,soundboardMuted:!!raw.soundboardMuted}}");

 // Use exactly one participant-announcement source: the refreshed participant diff below.
 // Do not announce directly from INSERT/DELETE because older Yamachat clients can create parallel sessions.
 const oldLeave="if(uid!==user.id){if(voiceJoinSoundArmed&&(!id||voiceChannel?.id===id))playVoiceCue('other-leave');closeVoicePeer(uid)}";
 const newLeave="if(uid!==user.id){closeVoicePeer(uid)}";
 const oldJoin="if(payload.eventType==='INSERT'&&uid!==user.id&&voiceJoinSoundArmed&&voiceChannel?.id===id)playVoiceCue('other-join');";
 const newJoin="if(payload.eventType==='INSERT'&&uid!==user.id&&voiceJoinSoundArmed&&voiceChannel?.id===id)void 0;";
 if(!html.includes(oldLeave)||!html.includes(oldJoin))throw Error('Voice participant announcement boundary missing');
 html=html.replace(oldLeave,newLeave).replace(oldJoin,newJoin);

 // Preserve the cached participant until refresh. That lets the diff keep the username and also
 // prevents a false LEAVE when the same user still has another web/desktop session in the room.
 const oldDeleteCache="if(id){voicePresenceByChannel[id]=(voicePresenceByChannel[id]||[]).filter(p=>p.user_id!==uid);if(voiceChannel?.id===id)syncVoicePeers()}else{for(const key of Object.keys(voicePresenceByChannel))voicePresenceByChannel[key]=(voicePresenceByChannel[key]||[]).filter(p=>p.user_id!==uid)}renderVoiceChannels(voiceChannelDefs)";
 const newDeleteCache="if(id){if(voiceChannel?.id===id)syncVoicePeers()}renderVoiceChannels(voiceChannelDefs)";
 if(!html.includes(oldDeleteCache))throw Error('Voice participant DELETE cache boundary missing');
 html=html.replace(oldDeleteCache,newDeleteCache);

 // Disable both legacy TTS announcement paths. The participant diff below is authoritative.
 html=html.replace("function ycVoiceHandleAnnouncement(payload){\n  try{","function ycVoiceHandleAnnouncement(payload){\n  if(window.__ycVoiceParticipantAnnouncements)return;\n  try{");
 html=html.replace("function ycVoiceSpeakPerson(row,action){\n  try{","function ycVoiceSpeakPerson(row,action){\n  if(window.__ycVoiceParticipantAnnouncements)return;\n  try{");

 // Never mutate soundboard administration on a different server merely because voice stays connected there.
 const oldCanManageSoundboard="function soundboardCanManage(){return canCommunityPermission('manage_soundboard')}";
 const newCanManageSoundboard="function soundboardCanManage(){return !!currentCommunity&&String(currentCommunity.id)===ycVoiceCommunityId()&&canCommunityPermission('manage_soundboard')}";
 if(!html.includes(oldCanManageSoundboard))throw Error('Soundboard management context boundary missing');
 html=html.replace(oldCanManageSoundboard,newCanManageSoundboard);

 // Realtime DELETE can contain only a primary key. Diff the refreshed participant list so leave
 // announcements keep the cached username/channel even when the DELETE row is sparse.
 const oldRefresh="async function refreshVoiceParticipants(id){if(!id)return;const cutoff=new Date(Date.now()-20000).toISOString();const {data,error}=await sb.from('voice_participants').select('channel_id,user_id,session_id,username,muted,deafened,speaking,joined_at,last_seen').eq('channel_id',id).gt('last_seen',cutoff).order('joined_at');if(error){console.warn('voice participants',error);return}voicePresenceByChannel[id]=data||[];renderVoiceChannels(voiceChannelDefs);if(voiceChannel?.id===id)syncVoicePeers()}";
 const newRefresh="async function refreshVoiceParticipants(id){if(!id)return;const before=[...(voicePresenceByChannel[id]||[])],cutoff=new Date(Date.now()-20000).toISOString();const {data,error}=await sb.from('voice_participants').select('channel_id,user_id,session_id,username,muted,deafened,speaking,joined_at,last_seen').eq('channel_id',id).gt('last_seen',cutoff).order('joined_at');if(error){console.warn('voice participants',error);return}const after=data||[];voicePresenceByChannel[id]=after;ycVoiceDiffAnnouncements(id,before,after);renderVoiceChannels(voiceChannelDefs);if(voiceChannel?.id===id)syncVoicePeers()}";
 if(!html.includes(oldRefresh))throw Error('Voice participant refresh boundary missing');
 html=html.replace(oldRefresh,newRefresh);

 // Soundboard global volume + per-sender mute, while preserving existing presets/custom loading.
 html=html.replace("function playPresetSound(key){","function playPresetSound(key,gainScale=1){");
 html=html.replace("g.gain.exponentialRampToValueAtTime(gain,now+start+.015);","g.gain.exponentialRampToValueAtTime(gain*Math.max(0,Number(gainScale)||0),now+start+.015);");
 html=html.replace("async function playCustomSound(soundId){","async function playCustomSound(soundId,gainScale=1){");
 html=html.replace("g.gain.value=.72;src.buffer=buf;","g.gain.value=.72*Math.max(0,Number(gainScale)||0);src.buffer=buf;");
 const oldHandle="async function handleSoundboardEvent(row){if(!row||!voiceChannel||row.channel_id!==voiceChannel.id||soundboardEventSeen.has(row.id))return;soundboardEventSeen.add(row.id);if(soundboardEventSeen.size>300)soundboardEventSeen.clear();if(row.sound_key)playPresetSound(row.sound_key);else if(row.sound_id)await playCustomSound(row.sound_id)}";
 const newHandle="async function handleSoundboardEvent(row){if(!row||!voiceChannel||row.channel_id!==voiceChannel.id||soundboardEventSeen.has(row.id))return;soundboardEventSeen.add(row.id);if(soundboardEventSeen.size>300)soundboardEventSeen.clear();const scale=ycSoundboardScaleFor(row.user_id);if(scale<=0)return;if(row.sound_key)playPresetSound(row.sound_key,scale);else if(row.sound_id)await playCustomSound(row.sound_id,scale)}";
 if(!html.includes(oldHandle))throw Error('Soundboard event boundary missing');
 html=html.replace(oldHandle,newHandle);
 html=html.replace("if(soundKey)playPresetSound(soundKey);else if(soundId)void playCustomSound(soundId);","const ycSbScale=ycSoundboardScaleFor(user?.id);if(soundKey)playPresetSound(soundKey,ycSbScale);else if(soundId)void playCustomSound(soundId,ycSbScale);");

 // Soundboard follows the community where the voice channel lives, not whichever server is being browsed.
 const oldLoad="async function loadSoundboardSounds(){if(!currentCommunity)return[];const {data,error}=await sb.from('soundboard_sounds').select('*').eq('community_id',currentCommunity.id).order('created_at');";
 const newLoad="async function loadSoundboardSounds(){const ycVoiceCid=ycVoiceCommunityId();if(!ycVoiceCid)return[];const {data,error}=await sb.from('soundboard_sounds').select('*').eq('community_id',ycVoiceCid).order('created_at');";
 if(!html.includes(oldLoad))throw Error('Soundboard community boundary missing');
 html=html.replace(oldLoad,newLoad);

 // Stream presence must also stay attached to the voice server while browsing elsewhere.
 const oldStream="if(!screenShareActive||!user?.id||!currentCommunity?.id||!voiceChannel?.id)return;const now=new Date().toISOString(),row={user_id:user.id,community_id:currentCommunity.id,channel_id:voiceChannel.id,updated_at:now};";
 const newStream="const ycVoiceCommunity=voiceChannel?.community_id||voiceChannel?.communityId||currentCommunity?.id;if(!screenShareActive||!user?.id||!ycVoiceCommunity||!voiceChannel?.id)return;const now=new Date().toISOString(),row={user_id:user.id,community_id:ycVoiceCommunity,channel_id:voiceChannel.id,updated_at:now};";
 if(!html.includes(oldStream))throw Error('Voice stream community boundary missing');
 html=html.replace(oldStream,newStream);

 return html.replace(marker,runtime+'\n'+marker).replace('</body>',style+'\n</body>');
}
