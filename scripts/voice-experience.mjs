const runtime=String.raw`
// Voice experience preferences: local per-user choices, no new backend schema.
window.__ycVoiceParticipantAnnouncements=true;
const YC_VOICE_ANNOUNCE_MODE_KEY='yc_voice_announce_mode';
const YC_VOICE_ANNOUNCE_VOICE_KEY='yc_voice_announce_voice';
const YC_VOICE_ANNOUNCE_CHARACTER_KEY='yc_voice_announce_character';
const YC_SOUNDBOARD_VOLUME_KEY='yc_soundboard_volume_v1';
const YC_VOICE_ANNOUNCE_PROFILE_KEY='yc_voice_announce_profile_v2';
const YC_VOICE_JOIN_CUE_DATA='data:audio/mpeg;base64,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X7yOTv9387I2RWhlZ1JaLq8COqmfrLUI317lUxBTUUzLjEwMFVVVVVVAAjqsckrZwjazgIQ3fv/81TE8hdYmjxex7iguRMIAlfTSU6QcCxjJDZ8UgIOpB4XVY38CSaLOSCQY5TsAVErDFr2gWb2q4/+zx3XDPud1f/1/r+n/qu9X0f9jLuNxGi/l8WKv9iJg0teluW9kKwdzelztRsxa+s6IYkyRBQHA6ps7NNF1iH/81TE/x3QphgA37CogCAJhYHhyXNRpMGRxghgCg7W38jdJFkV611gKyybf37097nI9rF1l4pHjXt7mznTUnbhzQbjOxXn0uQ+zWjS6TVQov1BKIlm5Tj5Fq/9WJAQh8ubXHKJgSAYmCaD8Ynxb51VJrGEgEiYFIH/81TE5BQAlkB+h3ZocYAwBqPUbUCEAAIjAYEQRpgMJUmB8DSKySfaQ/EHyGj9Mn92zM0+hDeZYvOaKL+GdMii2fXexC0nEWeWTXEO74dnFdFVhS1q1IXRDqjLXv3MOzhnKAaJCu6rvAlWd7YMOQ7jwDBgngdmKUj/81TE/xq4ohwKz3Ko/HaIJCcmFBlMCg4eBgTL0KWKfRxMLhY7lXDaIGFg6uKBJRQ1mqZ8j2+n1ff7P01pY4jr3azJxwqzv2d/W9ly0J1v4rdazAui9aqi/7TFvz2QAG1rF6Gy+5MBkYTIJpgrg7hAX5gBBXGKMMz/81TE/xz4phgAx7CoGU1ToY0LlpleicmGOD+DQPDA2AeBQFBgEBRgMAgqD5hOGJu/PhngTxiIDhgkAUZrLsdyKLHUjvxZiduz+ijVt33+3Wz37bOVrK/tst29vGKu07pDrvoMSy2ACN22+3W6ywQBD/tUv/3JpRb/81TE9hpIniQ0z7ig63pjMTCzRArKso8oX6+lLqv/qDiC96wiqjc5b65b1/ZZOdsJlL5RNVWbjZmvxrTmVixlYN1wLIKDNTwSour+Nb8a17Kxe7hwu6lUw1CSnMzlFX8a37rf+HPw5+HFMmupirDOKoKu51VBd3P/81TE9x2gohwBXugA93Nbua/n/zn8/+e/0Vcl/oq7r/RV3X+nXd/X/r/1/6///////////6azLaa9Laa9S2r1LavUtr//+YNGTBoyYNXy3+PqVIkWqocWRJBYNNkIIkpYLIkiVkQlE4lIiKhoRDHgqMPESoaESnj/81TE6zAq8rJfmMACKqPMKnREqJVHiKzpZUSz1Z0RKiVR5izpbEs9WdLZWezpbKz2dLZWe3J0X7i2ie3FlUxBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVX/81TElRaQlbwByTAAVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVU=';
const YC_VOICE_LEAVE_CUE_DATA='data:audio/mpeg;base64,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fcKwBfb/+hf26q/fUtt/b9PspX6bea/RFPGp9szbM12NTEFNRTMuMTAwqqqqqpADjkkckawPQRr/81TE3hPooiwA37iEoeoCGJxmNUrtFzTFq3AWxaGyELhIwNdTOQsR9f6lyx3lVdI1PBoaWntP3bv7W/VcTVp1/R6u7/6qk2a/o+boT/9tNJq0VBp4PfMXbsYAvB6Mh+k6QAwyKgBGMX8zFalTMxYSUwJgKiIJwwr/81TE+R3AohwA37qEMGQxgIqzjEC4N6AcIQxMLR4Dp0PA9qOZhoJHz8IboDwQJ0rGJv/GKc5st4FJ/dtiWKPmUfKIve3V60Vev+jiv2op/RGOajqQ96VdhFSdrRFi4deyd4BDBAq+UpXGugOBzFgQ1krMn430xhz/81TE4BLoilz+bzJOGkwXAHDAqAkMFMI8xjjfzcMHTMugqMLQHBQMF005GAJtodBEJplFYJikGqHzY4AnJ+dDhCtDuhy7k/Yirt97Nv0607o//091f7JX9V047i//0ZNqCSqREvtG/hgcQRCYiqZkKNwIImX7GI3/81TE/x14nhwI37iE8Rq2KgQEojCxAczX38Ovb0AD4Kg1Gxh7iOa2ydJgsIG1JcLWYiBrU4pUu5XSMx3oodrFau+tRFNH6hX/3leae2jf/uGipEkfl7ulG7Q7n6m6g8/WTEFNRTMuMTAwqqqqqqqqqqqqqqqqqgD/81TE9Bv4nhwA37qEHf7fbfticM4Ejr8Kd/DNyBohL7cYHaRHTFSLTt0yYA/iYM0NfrfsI6uzfR+nddnPuto7P/Wjo//lvfUmKDcWU/qoTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqlXTbj3GwMoXNoB40eF5DAz/81TE7xs4ohgA13iAjaYMMmQCLALRcw1OWObXgVNnEruY8ryhO83TFk0zgWDYCmEXzLpl1HTdor+/6aNE7//Uao7v5bZ//SW9JLcdlWS1LqraaXAEEuEpSIwDBxwqSjC2RI8hcQokYQDSoLjwUHlVWiNlX0jKQgT/81TE1xDAjlB+PqJoOylbEH7jETLhDFBUO3NaZaSlJCbpbOcaBAR8WznGlFHw7PRpRVw7OxZRVx+7OUI8VFG1Cwrioo2oWFcVFOLdYo2oWFcVFOLM7P//s6lMQU1FMy4xMDBVVVVVVVVVVVVVVVVVVVVVVVVVVVX/81TE5hRoiiwWTvBoVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVX/81TE/x1xabwAww0EVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVU=';
const ycVoiceCuePlayers=new Set();
const ycVoiceAnnouncementDedup=new Map();

function ycVoiceAnnounceMode(){
 const v=localStorage.getItem(YC_VOICE_ANNOUNCE_MODE_KEY)||'speech';
 return ['speech','cue','off'].includes(v)?v:'speech';
}
function ycVoiceAnnounceProfile(){
 const saved=localStorage.getItem(YC_VOICE_ANNOUNCE_PROFILE_KEY);
 if(['male-deep','male-natural','male-clear','female-soft','female-natural','female-bright'].includes(saved))return saved;
 const legacy=localStorage.getItem(YC_VOICE_ANNOUNCE_CHARACTER_KEY)||'natural';
 return legacy==='low'?'male-deep':legacy==='high'?'female-natural':'male-natural';
}
function ycVoiceProfile(){
 const p=ycVoiceAnnounceProfile();
 return ({
  'male-deep':{rate:.80,pitch:.55,volume:.95,gender:'male',slot:0},
  'male-natural':{rate:.94,pitch:.82,volume:.95,gender:'male',slot:1},
  'male-clear':{rate:1.12,pitch:1.05,volume:.94,gender:'male',slot:2},
  'female-soft':{rate:.86,pitch:1.18,volume:.93,gender:'female',slot:0},
  'female-natural':{rate:1.00,pitch:1.42,volume:.93,gender:'female',slot:1},
  'female-bright':{rate:1.16,pitch:1.70,volume:.92,gender:'female',slot:2}
 })[p]||{rate:.94,pitch:.82,volume:.95,gender:'male',slot:1};
}
function ycVoiceAvailableVoices(){
 try{return [...(speechSynthesis?.getVoices?.()||[])].sort((a,b)=>{
   const ac=String(a.lang||'').toLowerCase().startsWith('cs')?0:1,bc=String(b.lang||'').toLowerCase().startsWith('cs')?0:1;
   return ac-bc||String(a.name||'').localeCompare(String(b.name||''),'cs');
 })}catch{return[]}
}
function ycVoiceProfileVoice(voices,wanted,profileCfg){
 const exact=voices.find(v=>v.voiceURI===wanted||v.name===wanted);if(exact)return exact;
 const cz=voices.filter(v=>String(v.lang||'').toLowerCase().startsWith('cs')),base=cz.length?cz:voices;
 const male=/(^|\b)(jakub|anton[ií]n|ondřej|ondrej|matěj|matej|pavel|michal|david|daniel|filip|jan|adam|male)(\b|$)/i;
 const female=/(^|\b)(vlasta|zuzana|tereza|iva|mark[eé]ta|veronika|johana|lucie|anna|female)(\b|$)/i;
 const matcher=profileCfg.gender==='female'?female:male;
 const genderPool=base.filter(v=>matcher.test(String(v.name||''))),pool=genderPool.length?genderPool:base;
 if(!pool.length)return null;
 return pool[Math.min(Math.max(0,Number(profileCfg.slot)||0),pool.length-1)]||pool[0];
}
async function ycPlayVoiceFileCue(action,onDone){
 let audio=null,finished=false;
 const finish=()=>{if(finished)return;finished=true;if(audio)ycVoiceCuePlayers.delete(audio);try{onDone?.()}catch{}};
 try{
  if(voiceDeafened){finish();return null}
  const data=action==='leave'?YC_VOICE_LEAVE_CUE_DATA:YC_VOICE_JOIN_CUE_DATA;
  audio=new Audio(data);audio.preload='auto';audio.volume=.92;ycVoiceCuePlayers.add(audio);
  audio.onended=finish;audio.onerror=finish;
  if(voiceOutputId&&typeof audio.setSinkId==='function')try{await audio.setSinkId(voiceOutputId)}catch{}
  await audio.play();return audio;
 }catch(e){finish();console.warn('voice join/leave cue',e);return null}
}
function ycVoiceSpeakEnhanced(text,onDone){
 if(!text||ycVoiceAnnounceMode()!=='speech'||!('speechSynthesis' in window)){try{onDone?.()}catch{};return null}
 try{
  const u=new SpeechSynthesisUtterance(text),profileCfg=ycVoiceProfile();
  u.lang='cs-CZ';u.rate=profileCfg.rate;u.pitch=profileCfg.pitch;u.volume=profileCfg.volume;
  const voices=ycVoiceAvailableVoices(),wanted=localStorage.getItem(YC_VOICE_ANNOUNCE_VOICE_KEY)||'';
  u.voice=ycVoiceProfileVoice(voices,wanted,profileCfg);
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
  if(now-last<1800)return;ycVoiceAnnouncementDedup.set(key,now);
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
 const mode=ycVoiceAnnounceMode(),profileVoice=ycVoiceAnnounceProfile(),volume=ycSoundboardVolume();
 const opt=(v,label)=>'<option value="'+v+'" '+(mode===v?'selected':'')+'>'+label+'</option>';
 const profileOpt=(v,label)=>'<option value="'+v+'" '+(profileVoice===v?'selected':'')+'>'+label+'</option>';
 return '<div class="yc-voice-experience-settings">'+
  '<div class="field"><label>Oznámení vstupu a odchodu z voice</label><select id="ycVoiceAnnounceMode">'+opt('speech','Přečíst jméno hlasem')+opt('cue','Jen krátký zvuk')+opt('off','Vypnuto')+'</select></div>'+
  '<div class="field" data-yc-voice-select-wrap><label>Hlas pro čtení jmen</label><select id="ycVoiceAnnounceVoice"><option value="">Automaticky · preferovat češtinu</option></select><small>Dostupné hlasy dodává Windows, Android, iOS nebo prohlížeč.</small></div>'+
  '<div class="field" data-yc-character-wrap><label>Styl hlasu</label><select id="ycVoiceAnnounceProfile">'+profileOpt('male-deep','Mužský 1 · hlubší')+profileOpt('male-natural','Mužský 2 · přirozený')+profileOpt('male-clear','Mužský 3 · výraznější')+profileOpt('female-soft','Ženský 1 · jemnější')+profileOpt('female-natural','Ženský 2 · přirozený')+profileOpt('female-bright','Ženský 3 · světlejší')+'</select><small>Profil volí vhodný mužský/ženský systémový hlas, pokud je dostupný, a zároveň má výrazně odlišné tempo a výšku.</small></div>'+
  '<div class="yc-voice-preview-row"><button type="button" id="ycVoiceAnnounceTest">▶ Vyzkoušet hlas</button><button type="button" id="ycVoiceJoinTest" hidden>▶ JOIN zvuk</button><button type="button" id="ycVoiceLeaveTest" hidden>▶ LEAVE zvuk</button></div>'+
  '<div class="field"><label>Hlasitost soundboardu · <span id="ycSoundboardVolumeValue">'+volume+' %</span></label><input id="ycSoundboardVolumeRange" type="range" min="0" max="100" step="5" value="'+volume+'"></div>'+
  '<p class="yc-settings-note">Hlasitost lidí a lokální mute zůstávají zvlášť pro každého uživatele. Pravým kliknutím na člověka ve voice můžeš navíc ztlumit jen jeho soundboard.</p>'+
 '</div>';
}
function ycBindVoiceExperienceSettings(root){
 if(!root)return;
 const mode=root.querySelector('#ycVoiceAnnounceMode'),voiceSelect=root.querySelector('#ycVoiceAnnounceVoice'),profileVoice=root.querySelector('#ycVoiceAnnounceProfile');
 const syncVisibility=()=>{const speech=mode?.value==='speech',cue=mode?.value==='cue';root.querySelector('[data-yc-voice-select-wrap]')?.toggleAttribute('hidden',!speech);root.querySelector('[data-yc-character-wrap]')?.toggleAttribute('hidden',!speech);root.querySelector('#ycVoiceAnnounceTest')?.toggleAttribute('hidden',!speech);root.querySelector('#ycVoiceJoinTest')?.toggleAttribute('hidden',!cue);root.querySelector('#ycVoiceLeaveTest')?.toggleAttribute('hidden',!cue)};
 const fillVoices=()=>{
  if(!voiceSelect)return;const chosen=localStorage.getItem(YC_VOICE_ANNOUNCE_VOICE_KEY)||'',voices=ycVoiceAvailableVoices();
  voiceSelect.innerHTML='<option value="">Automaticky · preferovat češtinu</option>'+voices.map(v=>'<option value="'+esc(v.voiceURI||v.name)+'">'+esc(v.name)+' · '+esc(v.lang||'')+'</option>').join('');
  voiceSelect.value=[...voiceSelect.options].some(o=>o.value===chosen)?chosen:'';
 };
 fillVoices();try{speechSynthesis?.addEventListener?.('voiceschanged',fillVoices,{once:true})}catch{}
 mode.onchange=()=>{localStorage.setItem(YC_VOICE_ANNOUNCE_MODE_KEY,mode.value);syncVisibility()};
 voiceSelect.onchange=()=>localStorage.setItem(YC_VOICE_ANNOUNCE_VOICE_KEY,voiceSelect.value);
 profileVoice.onchange=()=>localStorage.setItem(YC_VOICE_ANNOUNCE_PROFILE_KEY,profileVoice.value);
 const sb=root.querySelector('#ycSoundboardVolumeRange'),sbv=root.querySelector('#ycSoundboardVolumeValue');
 sb.oninput=()=>{const v=Math.max(0,Math.min(100,Number(sb.value)||0));localStorage.setItem(YC_SOUNDBOARD_VOLUME_KEY,String(v));sbv.textContent=v+' %'};
 const previewButtons=[...root.querySelectorAll('#ycVoiceAnnounceTest,#ycVoiceJoinTest,#ycVoiceLeaveTest')];let previewBusy=false,previewTimer=0;
 const previewUnlock=()=>{if(!previewBusy)return;previewBusy=false;clearTimeout(previewTimer);previewButtons.forEach(b=>b.disabled=false)};
 const previewRun=runner=>{if(previewBusy)return;previewBusy=true;previewButtons.forEach(b=>b.disabled=true);previewTimer=setTimeout(previewUnlock,5400);try{runner(previewUnlock)}catch(e){previewUnlock();console.warn('voice preview',e)}};
 root.querySelector('#ycVoiceAnnounceTest').onclick=()=>previewRun(done=>{try{speechSynthesis.cancel()}catch{};ycVoiceSpeakEnhanced((profile?.display_name||profile?.username||'Yamachat')+' se připojil do místnosti',done)});
 root.querySelector('#ycVoiceJoinTest').onclick=()=>previewRun(done=>void ycPlayVoiceFileCue('join',done));
 root.querySelector('#ycVoiceLeaveTest').onclick=()=>previewRun(done=>void ycPlayVoiceFileCue('leave',done));
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

 // Route immediate participant rows (which already include username) into the selected announcement mode.
 const oldLeave="if(uid!==user.id){if(voiceJoinSoundArmed&&(!id||voiceChannel?.id===id))playVoiceCue('other-leave');closeVoicePeer(uid)}";
 const newLeave="if(uid!==user.id){if(voiceJoinSoundArmed&&(!id||voiceChannel?.id===id))ycVoiceAnnounceOnce(row,'leave');closeVoicePeer(uid)}";
 const oldJoin="if(payload.eventType==='INSERT'&&uid!==user.id&&voiceJoinSoundArmed&&voiceChannel?.id===id)playVoiceCue('other-join');";
 const newJoin="if(payload.eventType==='INSERT'&&uid!==user.id&&voiceJoinSoundArmed&&voiceChannel?.id===id)ycVoiceAnnounceOnce(row,'join');";
 if(!html.includes(oldLeave)||!html.includes(oldJoin))throw Error('Voice participant announcement boundary missing');
 html=html.replace(oldLeave,newLeave).replace(oldJoin,newJoin);

 // Disable the older second Realtime announcement path; it is intentionally slower and would duplicate speech.
 html=html.replace("function ycVoiceHandleAnnouncement(payload){\n  try{","function ycVoiceHandleAnnouncement(payload){\n  if(window.__ycVoiceParticipantAnnouncements)return;\n  try{");

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
