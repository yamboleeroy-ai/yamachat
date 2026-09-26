const runtime=String.raw`
// Voice experience preferences: local per-user choices, no new backend schema.
window.__ycVoiceParticipantAnnouncements=true;
const YC_VOICE_ANNOUNCE_MODE_KEY='yc_voice_announce_mode';
const YC_VOICE_ANNOUNCE_VOICE_KEY='yc_voice_announce_voice';
const YC_VOICE_ANNOUNCE_CHARACTER_KEY='yc_voice_announce_character';
const YC_SOUNDBOARD_VOLUME_KEY='yc_soundboard_volume_v1';

function ycVoiceAnnounceMode(){
 const v=localStorage.getItem(YC_VOICE_ANNOUNCE_MODE_KEY)||'speech';
 return ['speech','cue','off'].includes(v)?v:'speech';
}
function ycVoiceAnnounceCharacter(){
 const v=localStorage.getItem(YC_VOICE_ANNOUNCE_CHARACTER_KEY)||'natural';
 return ['low','natural','high'].includes(v)?v:'natural';
}
function ycVoiceAvailableVoices(){
 try{return [...(speechSynthesis?.getVoices?.()||[])].sort((a,b)=>{
   const ac=String(a.lang||'').toLowerCase().startsWith('cs')?0:1,bc=String(b.lang||'').toLowerCase().startsWith('cs')?0:1;
   return ac-bc||String(a.name||'').localeCompare(String(b.name||''),'cs');
 })}catch{return[]}
}
function ycVoiceSpeakEnhanced(text){
 if(!text||ycVoiceAnnounceMode()!=='speech'||!('speechSynthesis' in window))return;
 try{
  const u=new SpeechSynthesisUtterance(text),character=ycVoiceAnnounceCharacter();
  u.lang='cs-CZ';u.rate=.98;u.pitch=character==='low'?.78:character==='high'?1.22:1;u.volume=.92;
  const voices=ycVoiceAvailableVoices(),wanted=localStorage.getItem(YC_VOICE_ANNOUNCE_VOICE_KEY)||'';
  u.voice=voices.find(v=>v.voiceURI===wanted||v.name===wanted)||voices.find(v=>String(v.lang||'').toLowerCase().startsWith('cs'))||voices[0]||null;
  speechSynthesis.speak(u);
 }catch(e){console.warn('voice participant TTS',e)}
}
function ycVoiceParticipantAnnouncement(row,action){
 try{
  if(!row||String(row.user_id||'')===String(user?.id||''))return;
  if(String(row.channel_id||'')!==String(voiceChannel?.id||''))return;
  const mode=ycVoiceAnnounceMode();if(mode==='off')return;
  if(mode==='cue'){playVoiceCue(action==='join'?'other-join':'other-leave');return}
  const cached=(voicePresenceByChannel?.[row.channel_id]||[]).find(p=>String(p.user_id||'')===String(row.user_id||''));
  const name=String(row.username||cached?.username||cached?.display_name||'Uživatel').trim()||'Uživatel';
  ycVoiceSpeakEnhanced(action==='join'?name+' se připojil do místnosti':name+' opustil místnost');
 }catch(e){console.warn('voice participant announcement',e)}
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
 const mode=ycVoiceAnnounceMode(),character=ycVoiceAnnounceCharacter(),volume=ycSoundboardVolume();
 const opt=(v,label)=>'<option value="'+v+'" '+(mode===v?'selected':'')+'>'+label+'</option>';
 const chr=(v,label)=>'<option value="'+v+'" '+(character===v?'selected':'')+'>'+label+'</option>';
 return '<div class="yc-voice-experience-settings">'+
  '<div class="field"><label>Oznámení vstupu a odchodu z voice</label><select id="ycVoiceAnnounceMode">'+opt('speech','Přečíst jméno hlasem')+opt('cue','Jen krátký zvuk')+opt('off','Vypnuto')+'</select></div>'+
  '<div class="field" data-yc-voice-select-wrap><label>Hlas pro čtení jmen</label><select id="ycVoiceAnnounceVoice"><option value="">Automaticky · preferovat češtinu</option></select><small>Dostupné hlasy dodává Windows, Android, iOS nebo prohlížeč.</small></div>'+
  '<div class="field" data-yc-character-wrap><label>Charakter hlasu</label><select id="ycVoiceAnnounceCharacter">'+chr('low','Nižší tón')+chr('natural','Přirozený')+chr('high','Vyšší tón')+'</select></div>'+
  '<button type="button" id="ycVoiceAnnounceTest">▶ Vyzkoušet hlas</button>'+
  '<div class="field"><label>Hlasitost soundboardu · <span id="ycSoundboardVolumeValue">'+volume+' %</span></label><input id="ycSoundboardVolumeRange" type="range" min="0" max="100" step="5" value="'+volume+'"></div>'+
  '<p class="yc-settings-note">Hlasitost lidí a lokální mute zůstávají zvlášť pro každého uživatele. Pravým kliknutím na člověka ve voice můžeš navíc ztlumit jen jeho soundboard.</p>'+
 '</div>';
}
function ycBindVoiceExperienceSettings(root){
 if(!root)return;
 const mode=root.querySelector('#ycVoiceAnnounceMode'),voiceSelect=root.querySelector('#ycVoiceAnnounceVoice'),character=root.querySelector('#ycVoiceAnnounceCharacter');
 const syncVisibility=()=>{const speech=mode?.value==='speech';root.querySelector('[data-yc-voice-select-wrap]')?.toggleAttribute('hidden',!speech);root.querySelector('[data-yc-character-wrap]')?.toggleAttribute('hidden',!speech)};
 const fillVoices=()=>{
  if(!voiceSelect)return;const chosen=localStorage.getItem(YC_VOICE_ANNOUNCE_VOICE_KEY)||'',voices=ycVoiceAvailableVoices();
  voiceSelect.innerHTML='<option value="">Automaticky · preferovat češtinu</option>'+voices.map(v=>'<option value="'+esc(v.voiceURI||v.name)+'">'+esc(v.name)+' · '+esc(v.lang||'')+'</option>').join('');
  voiceSelect.value=[...voiceSelect.options].some(o=>o.value===chosen)?chosen:'';
 };
 fillVoices();try{speechSynthesis?.addEventListener?.('voiceschanged',fillVoices,{once:true})}catch{}
 mode.onchange=()=>{localStorage.setItem(YC_VOICE_ANNOUNCE_MODE_KEY,mode.value);syncVisibility()};
 voiceSelect.onchange=()=>localStorage.setItem(YC_VOICE_ANNOUNCE_VOICE_KEY,voiceSelect.value);
 character.onchange=()=>localStorage.setItem(YC_VOICE_ANNOUNCE_CHARACTER_KEY,character.value);
 const sb=root.querySelector('#ycSoundboardVolumeRange'),sbv=root.querySelector('#ycSoundboardVolumeValue');
 sb.oninput=()=>{const v=Math.max(0,Math.min(100,Number(sb.value)||0));localStorage.setItem(YC_SOUNDBOARD_VOLUME_KEY,String(v));sbv.textContent=v+' %'};
 root.querySelector('#ycVoiceAnnounceTest').onclick=()=>ycVoiceSpeakEnhanced((profile?.display_name||profile?.username||'Yamachat')+' se připojil do místnosti');
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
.yc-voice-experience-settings button{min-height:38px;border:1px solid color-mix(in srgb,var(--yc-theme,#e056fd) 42%,#385b6f);border-radius:9px;background:#112936;color:#e9f8ff;font-weight:800}
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

 // Keep manual AFK/DND/invisible untouched; only automatic idle is suppressed while voice is genuinely connected.
 const oldPresence="function ycAutoPresenceState(){const pref=ycPresencePreference();if(pref!=='online')return pref;return document.hidden||Date.now()-ycLastInputAt>=300000?'afk':'online'}";
 const newPresence="function ycAutoPresenceState(){const pref=ycPresencePreference();if(pref!=='online')return pref;const voiceLive=!!voiceChannel&&!!voiceStream?.getAudioTracks?.().some(t=>t.readyState==='live');if(voiceLive)return'online';return document.hidden||Date.now()-ycLastInputAt>=300000?'afk':'online'}";
 if(!html.includes(oldPresence))throw Error('Voice AFK boundary missing');
 html=html.replace(oldPresence,newPresence);

 // Preserve the existing per-user voice volume/mute store and extend it with soundboard mute.
 const oldMix="return{muted:!!raw.muted,volume}}";
 if(!html.includes(oldMix))throw Error('Voice user mix boundary missing');
 html=html.replace(oldMix,"return{muted:!!raw.muted,volume,soundboardMuted:!!raw.soundboardMuted}}");

 // Route immediate participant rows (which already include username) into the selected announcement mode.
 const oldLeave="if(uid!==user.id){if(voiceJoinSoundArmed&&(!id||voiceChannel?.id===id))playVoiceCue('other-leave');closeVoicePeer(uid)}";
 const newLeave="if(uid!==user.id){if(voiceJoinSoundArmed&&(!id||voiceChannel?.id===id))ycVoiceParticipantAnnouncement(row,'leave');closeVoicePeer(uid)}";
 const oldJoin="if(payload.eventType==='INSERT'&&uid!==user.id&&voiceJoinSoundArmed&&voiceChannel?.id===id)playVoiceCue('other-join');";
 const newJoin="if(payload.eventType==='INSERT'&&uid!==user.id&&voiceJoinSoundArmed&&voiceChannel?.id===id)ycVoiceParticipantAnnouncement(row,'join');";
 if(!html.includes(oldLeave)||!html.includes(oldJoin))throw Error('Voice participant announcement boundary missing');
 html=html.replace(oldLeave,newLeave).replace(oldJoin,newJoin);

 // Disable the older second Realtime announcement path; it is intentionally slower and would duplicate speech.
 html=html.replace("function ycVoiceHandleAnnouncement(payload){\n  try{","function ycVoiceHandleAnnouncement(payload){\n  if(window.__ycVoiceParticipantAnnouncements)return;\n  try{");

 // Never mutate soundboard administration on a different server merely because voice stays connected there.
 const oldCanManageSoundboard="function soundboardCanManage(){return canCommunityPermission('manage_soundboard')}";
 const newCanManageSoundboard="function soundboardCanManage(){return !!currentCommunity&&String(currentCommunity.id)===ycVoiceCommunityId()&&canCommunityPermission('manage_soundboard')}";
 if(!html.includes(oldCanManageSoundboard))throw Error('Soundboard management context boundary missing');
 html=html.replace(oldCanManageSoundboard,newCanManageSoundboard);

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
