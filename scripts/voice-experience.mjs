const runtime=String.raw`
const YC_MESSAGE_UHOH_URI='data:audio/mpeg;base64,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';
const YC_VOICE_EXP_VERSION='20260926-1';
let ycMessageNotifyAudio=null,ycMessageSoundLastAt=0,ycVoiceExpParticipantSub=null,ycVoiceExpBrowseSnapshot=null,ycVoiceExpLastSpeechAt=Date.now(),ycVoiceExpLastRoom='';
const ycVoiceExpAnnounceSeen=new Map(),ycVoiceExpNameCache=new Map();

function ycExpRead(key,fallback=''){try{const v=localStorage.getItem(key);return v===null?fallback:v}catch{return fallback}}
function ycExpWrite(key,value){try{localStorage.setItem(key,String(value))}catch{}}
function ycExpBool(key,fallback=true){const v=ycExpRead(key,fallback?'1':'0');return v!=='0'&&v!=='false'}
function ycExpNum(key,fallback,min,max){let n=Number(ycExpRead(key,String(fallback)));if(!Number.isFinite(n))n=fallback;return Math.max(min,Math.min(max,n))}
function ycVoiceAnnounceMode(){const v=ycExpRead('yc_voice_announce_mode','both');return ['off','sound','speech','both'].includes(v)?v:'both'}
function ycVoiceAnnouncePreset(){const v=ycExpRead('yc_voice_announce_preset','auto');return ['auto','female','male','soft','deep'].includes(v)?v:'auto'}
function ycVoiceAnnounceSound(){const v=ycExpRead('yc_voice_announce_sound','classic');return ['classic','soft','short'].includes(v)?v:'classic'}
function ycVoiceAnnounceVolume(){return ycExpNum('yc_voice_announce_volume',92,0,100)/100}
function ycSoundboardGain(){return ycExpBool('yc_soundboard_enabled',true)?ycExpNum('yc_soundboard_volume',100,0,100)/100:0}
function ycSoundboardMutedMap(){try{const x=JSON.parse(ycExpRead('yc_soundboard_muted_users','{}'));return x&&typeof x==='object'?x:{}}catch{return{}}}
function ycSoundboardUserMuted(uid){if(!uid||String(uid)===String(user?.id||''))return false;return !!ycSoundboardMutedMap()[String(uid)]}
function ycSetSoundboardUserMuted(uid,muted){if(!uid)return;const map=ycSoundboardMutedMap();if(muted)map[String(uid)]=1;else delete map[String(uid)];ycExpWrite('yc_soundboard_muted_users',JSON.stringify(map))}
function ycMessageSoundAllowedFor(pref){pref=String(pref||'online').toLowerCase();return ycExpBool('yc_message_sound_enabled',true)&&pref!=='dnd'&&pref!=='invisible'}
function ycMessageSoundAllowed(){const pref=typeof ycPresencePreference==='function'?ycPresencePreference():'online';return ycMessageSoundAllowedFor(pref)}
function ycMessageSoundVolume(){return ycExpNum('yc_message_sound_volume',85,0,100)/100}
function ycEnsureMessageNotifyAudio(){if(!ycMessageNotifyAudio){ycMessageNotifyAudio=new Audio(YC_MESSAGE_UHOH_URI);ycMessageNotifyAudio.preload='auto';ycMessageNotifyAudio.playsInline=true}return ycMessageNotifyAudio}
let ycMessageNotifyUnlocked=false;
function ycUnlockMessageNotifyAudio(){
 if(ycMessageNotifyUnlocked)return;try{const a=ycEnsureMessageNotifyAudio(),old=a.volume;a.volume=0;const p=a.play();if(p&&typeof p.then==='function')p.then(()=>{a.pause();a.currentTime=0;a.volume=old;ycMessageNotifyUnlocked=true}).catch(()=>{a.volume=old});else{a.pause();a.currentTime=0;a.volume=old;ycMessageNotifyUnlocked=true}}catch{}
}
window.addEventListener('pointerdown',ycUnlockMessageNotifyAudio,{passive:true});window.addEventListener('keydown',ycUnlockMessageNotifyAudio);
function ycPlayMessageNotifySound(force=false){try{if(!force&&!ycMessageSoundAllowed())return false;const now=Date.now();if(!force&&now-ycMessageSoundLastAt<450)return false;ycMessageSoundLastAt=now;const a=ycEnsureMessageNotifyAudio();a.pause();a.currentTime=0;a.volume=ycMessageSoundVolume();const p=a.play();if(p&&typeof p.catch==='function')p.catch(()=>{});return true}catch(e){console.warn('message sound',e);return false}}
ycPlayDmSound=()=>ycPlayMessageNotifySound(false);
const ycVoiceExpWinShowMessageBase=typeof ycWinShowMessage==='function'?ycWinShowMessage:null;
if(ycVoiceExpWinShowMessageBase){
 ycWinShowMessage=async function(m){
  const pref=typeof ycPresencePreference==='function'?ycPresencePreference():'online';
  if(pref==='dnd'||pref==='invisible')return;
  try{
   const mentioned=typeof ycWinMentioned==='function'?ycWinMentioned(m?.body):false;
   const focused=typeof ycWinHasFocus==='function'?ycWinHasFocus():document.hasFocus();
   if(!focused||mentioned)ycPlayMessageNotifySound(false)
  }catch{}
  return ycVoiceExpWinShowMessageBase.apply(this,arguments)
 }
}

function ycVoiceExpVoices(){try{return speechSynthesis.getVoices?.()||[]}catch{return[]}}
function ycVoiceExpPickVoice(){
 const voices=ycVoiceExpVoices();if(!voices.length)return null;
 const uri=ycExpRead('yc_voice_announce_voice','');if(uri){const exact=voices.find(v=>v.voiceURI===uri);if(exact)return exact}
 const cs=voices.filter(v=>String(v.lang||'').toLowerCase().startsWith('cs')),pool=cs.length?cs:voices,preset=ycVoiceAnnouncePreset();
 const name=v=>String(v?.name||'').toLowerCase();
 if(preset==='female'){return pool.find(v=>/(zuzana|iveta|tereza|female|woman|žena)/i.test(name(v)))||pool[1]||pool[0]}
 if(preset==='male'){return pool.find(v=>/(jakub|ondrej|ondřej|male|man|muž)/i.test(name(v)))||pool[0]}
 return pool[0]
}
function ycVoiceExpSpeechTuning(){const p=ycVoiceAnnouncePreset();if(p==='soft')return{rate:.96,pitch:1.14};if(p==='deep')return{rate:.91,pitch:.78};if(p==='female')return{rate:.98,pitch:1.08};if(p==='male')return{rate:.94,pitch:.88};return{rate:.98,pitch:1}}
ycVoiceSpeak=function(text){
 try{
  const mode=ycVoiceAnnounceMode();if(!text||!(mode==='speech'||mode==='both')||!('speechSynthesis' in window))return false;
  const u=new SpeechSynthesisUtterance(text),v=ycVoiceExpPickVoice(),t=ycVoiceExpSpeechTuning();u.lang=v?.lang||'cs-CZ';u.rate=t.rate;u.pitch=t.pitch;u.volume=ycVoiceAnnounceVolume();if(v)u.voice=v;speechSynthesis.speak(u);return true
 }catch(e){console.warn('voice announcement TTS',e);return false}
};
const ycVoiceExpCueBase=playVoiceCue;
function ycVoiceExpCustomCue(type){
 try{
  unlockVoiceAudio();const ctx=voiceAudioContext;if(!ctx)return;const now=ctx.currentTime,preset=ycVoiceAnnounceSound(),join=type==='other-join';
  const tones=preset==='soft'?(join?[[620,0,.08],[760,.09,.09]]:[[520,0,.08],[410,.09,.10]]):preset==='short'?(join?[[820,0,.08]]:[[390,0,.09]]):null;
  if(!tones)return ycVoiceExpCueBase(type);
  for(const [freq,delay,dur] of tones){const o=ctx.createOscillator(),g=ctx.createGain();o.type='sine';o.frequency.setValueAtTime(freq,now+delay);g.gain.setValueAtTime(.0001,now+delay);g.gain.exponentialRampToValueAtTime(.045,now+delay+.01);g.gain.exponentialRampToValueAtTime(.0001,now+delay+dur);o.connect(g).connect(ctx.destination);o.start(now+delay);o.stop(now+delay+dur+.02)}
 }catch{}
}
playVoiceCue=function(type){
 if(type==='other-join'||type==='other-leave'){const mode=ycVoiceAnnounceMode();if(!(mode==='sound'||mode==='both'))return;return ycVoiceExpCustomCue(type)}
 return ycVoiceExpCueBase(type)
};
function ycVoiceExpAnnouncementKey(action,uid){return String(action||'')+'|'+String(uid||'')}
function ycVoiceExpAnnouncementText(action,name){name=String(name||'Uživatel').trim()||'Uživatel';return action==='leave'?name+' opustil místnost':name+' se připojil do místnosti'}
function ycVoiceExpResolveName(row){
 const uid=String(row?.user_id||''),cached=(voicePresenceByChannel?.[voiceChannel?.id]||[]).find(p=>String(p.user_id)===uid);
 const name=String(row?.username||cached?.username||ycVoiceExpNameCache.get(uid)||'Uživatel').trim()||'Uživatel';
 if(uid&&name!=='Uživatel')ycVoiceExpNameCache.set(uid,name);return name
}
function ycVoiceExpSpeakParticipant(action,row){
 try{
  if(!row||String(row.user_id||'')===String(user?.id||''))return;
  if(String(row.channel_id||'')!==String(voiceChannel?.id||''))return;
  const key=ycVoiceExpAnnouncementKey(action,row.user_id),now=Date.now(),last=ycVoiceExpAnnounceSeen.get(key)||0;if(now-last<2400)return;ycVoiceExpAnnounceSeen.set(key,now);
  const name=ycVoiceExpResolveName(row);ycVoiceSpeak(ycVoiceExpAnnouncementText(action,name))
 }catch(e){console.warn('voice participant announcement',e)}
}
ycVoiceHandleAnnouncement=function(payload){
 try{if(!payload||String(payload.user_id||'')===String(user?.id||''))return;if(String(payload.room_id||'')!==String(voiceChannel?.id||''))return;ycVoiceExpSpeakParticipant(payload.action==='leave'?'leave':'join',{user_id:payload.user_id,channel_id:payload.room_id,username:payload.name})}catch(e){console.warn('voice announcement receive',e)}
};
const ycVoiceExpUsesCoreNameEvents=typeof ycEnsureVoiceNamesRealtime==='function'&&typeof ycVoiceSpeakPerson==='function';
if(ycVoiceExpUsesCoreNameEvents){
 ycVoiceSpeakPerson=function(row,action){ycVoiceExpSpeakParticipant(action==='leave'?'leave':'join',row)}
}
async function ycVoiceExpStartParticipantAnnouncements(){
 if(ycVoiceExpUsesCoreNameEvents){try{ycEnsureVoiceNamesRealtime()}catch{};return}
 if(!user?.id)return;if(ycVoiceExpParticipantSub){try{await sb.removeChannel(ycVoiceExpParticipantSub)}catch{}ycVoiceExpParticipantSub=null}
 ycVoiceExpParticipantSub=sb.channel('yc-voice-exp-'+user.id+'-'+Date.now()).on('postgres_changes',{event:'*',schema:'public',table:'voice_participants'},payload=>{
  const row=payload.new||payload.old||{};if(!row?.user_id)return;
  if(payload.eventType==='INSERT')ycVoiceExpSpeakParticipant('join',row);else if(payload.eventType==='DELETE')ycVoiceExpSpeakParticipant('leave',row)
 }).subscribe()
}
async function ycVoiceExpStopParticipantAnnouncements(){if(ycVoiceExpUsesCoreNameEvents)return;const ch=ycVoiceExpParticipantSub;ycVoiceExpParticipantSub=null;if(ch)try{await sb.removeChannel(ch)}catch{}}
ycOnLifecycle('init',()=>{void ycVoiceExpStartParticipantAnnouncements()});
ycOnLifecycle('beforeAuth',()=>{void ycVoiceExpStopParticipantAnnouncements();ycVoiceExpNameCache.clear();try{speechSynthesis.cancel()}catch{}});

const ycVoiceExpOpenUserMenuBase=openVoiceUserMenu;
openVoiceUserMenu=function(uid,name,x,y){
 const out=ycVoiceExpOpenUserMenuBase.apply(this,arguments),m=$('voiceUserContextMenu');if(!m||!uid||uid===user?.id)return out;
 let b=m.querySelector('[data-yc-sb-user-mute]');if(!b){b=document.createElement('button');b.type='button';b.className='voice-user-menu-row';b.dataset.ycSbUserMute=String(uid);const note=m.querySelector('.voice-user-menu-note');m.insertBefore(b,note||null)}
 const sync=()=>{const muted=ycSoundboardUserMuted(uid);b.textContent=muted?'🔔 Povolit soundboard od '+(name||'uživatele'):'🔕 Ztlumit soundboard od '+(name||'uživatele');b.setAttribute('aria-pressed',String(muted))};sync();b.onclick=()=>{ycSetSoundboardUserMuted(uid,!ycSoundboardUserMuted(uid));sync()};return out
};

let ycVoiceExpUserPress=null,ycVoiceExpSuppressUserClickUntil=0;
function ycVoiceExpCancelUserPress(){if(ycVoiceExpUserPress?.timer)clearTimeout(ycVoiceExpUserPress.timer);ycVoiceExpUserPress=null}
document.addEventListener('pointerdown',event=>{
 if(event.pointerType==='mouse'||event.button!==0||event.isPrimary===false)return;
 const row=event.target.closest?.('.voice-user[data-user-id]');if(!row||String(row.dataset.userId||'')===String(user?.id||''))return;
 ycVoiceExpCancelUserPress();const state={row,pointerId:event.pointerId,x:event.clientX,y:event.clientY,timer:null};
 state.timer=setTimeout(()=>{if(ycVoiceExpUserPress!==state||!row.isConnected)return;ycVoiceExpSuppressUserClickUntil=Date.now()+800;try{navigator.vibrate?.(10)}catch{};openVoiceUserMenu(row.dataset.userId,row.dataset.userName||'Uživatel',Math.max(8,state.x),Math.max(8,state.y))},520);
 ycVoiceExpUserPress=state
},true);
document.addEventListener('pointermove',event=>{const p=ycVoiceExpUserPress;if(!p||event.pointerId!==p.pointerId)return;if(Math.hypot(event.clientX-p.x,event.clientY-p.y)>12)ycVoiceExpCancelUserPress()},true);
for(const type of ['pointerup','pointercancel'])document.addEventListener(type,event=>{if(ycVoiceExpUserPress&&event.pointerId===ycVoiceExpUserPress.pointerId)ycVoiceExpCancelUserPress()},true);
document.addEventListener('click',event=>{if(Date.now()>ycVoiceExpSuppressUserClickUntil||!event.target.closest?.('.voice-user[data-user-id]'))return;event.preventDefault();event.stopImmediatePropagation();ycVoiceExpSuppressUserClickUntil=0},true);

const ycVoiceExpLoadSoundboardBase=loadSoundboardSounds;
loadSoundboardSounds=async function(){
 const cid=voiceChannel?.community_id||currentCommunity?.id;if(!cid)return[];
 try{const {data,error}=await sb.from('soundboard_sounds').select('*').eq('community_id',cid).order('created_at');if(error)throw error;soundboardSounds=data||[];if(!$('soundboardPanel')?.classList.contains('hidden'))renderSoundboardPanel();return soundboardSounds}catch(e){console.warn('soundboard sounds',e);return soundboardSounds}
};
const ycVoiceExpSoundboardManageBase=soundboardCanManage;
soundboardCanManage=function(){if(voiceChannel?.community_id&&currentCommunity?.id&&String(voiceChannel.community_id)!==String(currentCommunity.id))return false;return ycVoiceExpSoundboardManageBase()};
const ycVoiceExpRenderSoundboardBase=renderSoundboardPanel;
renderSoundboardPanel=function(){
 const out=ycVoiceExpRenderSoundboardBase.apply(this,arguments),panel=$('soundboardPanel');if(!panel)return out;
 const grid=panel.querySelector('.soundboard-grid');if(grid&&!panel.querySelector('.yc-soundboard-folders')){
  const presets=[...grid.querySelectorAll('[data-sound-key]')],custom=[...grid.querySelectorAll('[data-sound-id]')],folders=document.createElement('div');folders.className='yc-soundboard-folders';
  const make=(title,items,open)=>{const d=document.createElement('details');d.className='yc-soundboard-folder';d.open=open;const s=document.createElement('summary');s.textContent=title+' · '+items.length;const g=document.createElement('div');g.className='soundboard-grid';items.forEach(x=>g.appendChild(x));d.append(s,g);return d};
  folders.append(make('Vestavěné zvuky',presets,true),make('Vlastní zvuky',custom,custom.length>0));grid.replaceWith(folders)
 }
 if(!panel.querySelector('.yc-soundboard-master')){
  const head=panel.querySelector('.soundboard-head'),row=document.createElement('div');row.className='yc-soundboard-master';row.innerHTML='<label><span>Hlasitost soundboardu</span><strong data-yc-sb-volume-label></strong></label><input data-yc-sb-volume type="range" min="0" max="100" step="5"><label class="yc-sb-enable"><input data-yc-sb-enable type="checkbox"> Přehrávat soundboard</label>';head?.after(row);
  const range=row.querySelector('[data-yc-sb-volume]'),label=row.querySelector('[data-yc-sb-volume-label]'),enable=row.querySelector('[data-yc-sb-enable]');range.value=String(Math.round(ycSoundboardGain()*100));enable.checked=ycExpBool('yc_soundboard_enabled',true);const sync=()=>label.textContent=range.value+' %';sync();range.oninput=()=>{ycExpWrite('yc_soundboard_volume',range.value);sync()};enable.onchange=()=>ycExpWrite('yc_soundboard_enabled',enable.checked?'1':'0')
 }
 return out
};

let ycVoiceExpSelectBase=selectCommunity;
selectCommunity=async function(...args){
 const snap=voiceChannel&&voiceStream?{channel:voiceChannel,stream:voiceStream,sessionId:voiceSessionId,action:voiceActionSeq}:null;ycVoiceExpBrowseSnapshot=snap;
 const out=await ycVoiceExpSelectBase.apply(this,args);
 if(snap&&voiceActionSeq===snap.action){
  const live=snap.stream?.getAudioTracks?.().some(t=>t.readyState==='live');
  if(!voiceChannel&&live&&snap.sessionId){voiceChannel=snap.channel;voiceStream=snap.stream;voiceSessionId=snap.sessionId;console.warn('Yamachat restored voice after server browse')}
  if(voiceChannel&&String(voiceChannel.id)===String(snap.channel.id)&&live){ensureVoiceRooms([...(voiceChannelDefs||[]),voiceChannel]);if(!voiceHeartbeatTimer)startVoiceHeartbeat();if(!voiceSignalSub)void subscribeVoiceSignals();if(!soundboardSub)void subscribeSoundboardEvents();void trackVoicePresence();renderVoiceControls()}
 }
 ycVoiceExpBrowseSnapshot=null;return out
};
setInterval(()=>{try{if(voiceChannel&&voiceStream?.getAudioTracks?.().some(t=>t.readyState==='live')){if(!voiceHeartbeatTimer)startVoiceHeartbeat();if(!voiceRooms.has(voiceChannel.id))ensureVoiceRooms([...(voiceChannelDefs||[]),voiceChannel]);if(voiceSpeaking)ycVoiceExpLastSpeechAt=Date.now()}}catch{}},4000);

const ycVoiceExpPresenceBase=ycAutoPresenceState;
function ycVoiceExpPresenceFor(pref,connected,speaking,silentMs,minutes,fallback='online'){
 pref=String(pref||'online').toLowerCase();if(pref!=='online')return pref;
 if(!connected)return fallback;
 if(speaking||Number(minutes)===0)return'online';
 return Number(silentMs)<Number(minutes)*60000?'online':'afk'
}
ycAutoPresenceState=function(){
 const pref=ycPresencePreference(),base=ycVoiceExpPresenceBase();
 if(pref!=='online')return pref;
 if(voiceChannel){
  if(voiceSpeaking)ycVoiceExpLastSpeechAt=Date.now();
  const minutes=ycExpNum('yc_voice_afk_minutes',20,0,120);
  if(!ycVoiceExpLastRoom||ycVoiceExpLastRoom!==String(voiceChannel.id)){ycVoiceExpLastRoom=String(voiceChannel.id);ycVoiceExpLastSpeechAt=Date.now()}
  return ycVoiceExpPresenceFor(pref,true,voiceSpeaking,Date.now()-ycVoiceExpLastSpeechAt,minutes,base)
 }
 ycVoiceExpLastRoom='';return ycVoiceExpPresenceFor(pref,false,false,0,0,base)
};

function ycVoiceExpSettingsHtml(){
 return '<div class="yc-exp-settings">'+
 '<div class="yc-exp-card"><strong>Voice · připojení a odpojení</strong><label>Oznámení<select data-yc-ann-mode><option value="both">Zvuk + přečíst jméno</option><option value="speech">Jen přečíst jméno</option><option value="sound">Jen zvuk</option><option value="off">Vypnuto</option></select></label><label>Typ hlasu<select data-yc-ann-preset><option value="auto">Automaticky</option><option value="female">Ženský (pokud je dostupný)</option><option value="male">Mužský (pokud je dostupný)</option><option value="soft">Jemnější</option><option value="deep">Hlubší</option></select></label><label>Konkrétní systémový hlas<select data-yc-ann-voice><option value="">Automaticky podle zařízení</option></select></label><label>Zvuk připojení<select data-yc-ann-sound><option value="classic">Yamachat</option><option value="soft">Jemný</option><option value="short">Krátký</option></select></label><label>Hlasitost oznámení <strong data-yc-ann-vol-label></strong><input data-yc-ann-vol type="range" min="0" max="100" step="5"></label><button type="button" class="ghost" data-yc-ann-test>▶ Vyzkoušet oznámení</button></div>'+
 '<div class="yc-exp-card"><strong>Soundboard</strong><label>Hlasitost <strong data-yc-sb-vol-label></strong><input data-yc-sb-vol type="range" min="0" max="100" step="5"></label><label class="yc-exp-check"><input data-yc-sb-enabled type="checkbox"> Přehrávat soundboard</label><small>Jednotlivého uživatele můžeš okamžitě ztlumit pravým klikem na jeho jméno ve voice.</small></div>'+
 '<div class="yc-exp-card"><strong>Zvuk nové soukromé zprávy</strong><label class="yc-exp-check"><input data-yc-msg-enabled type="checkbox"> Přehrát zvuk „Uh‑Oh“</label><label>Hlasitost <strong data-yc-msg-vol-label></strong><input data-yc-msg-vol type="range" min="0" max="100" step="5"></label><button type="button" class="ghost" data-yc-msg-test>▶ Vyzkoušet zvuk</button><small>Při režimu Nerušit nebo Neviditelný zůstane jen vizuální upozornění v aplikaci.</small></div>'+
 '<div class="yc-exp-card"><strong>AFK ve voice</strong><label>Označit jako AFK po tichu<select data-yc-afk><option value="5">5 minut</option><option value="10">10 minut</option><option value="20">20 minut</option><option value="30">30 minut</option><option value="0">Nikdy během voice</option></select></label><small>Aktivní mluvení okamžitě obnoví stav Online. Ruční DND/Neviditelný má vždy přednost.</small></div></div>'
}
function ycVoiceExpBindSettings(root){
 const bindSelect=(sel,key,val)=>{const e=root.querySelector(sel);if(!e)return;e.value=val();e.onchange=()=>ycExpWrite(key,e.value)};
 bindSelect('[data-yc-ann-mode]','yc_voice_announce_mode',ycVoiceAnnounceMode);bindSelect('[data-yc-ann-preset]','yc_voice_announce_preset',ycVoiceAnnouncePreset);bindSelect('[data-yc-ann-sound]','yc_voice_announce_sound',ycVoiceAnnounceSound);
 const voiceSel=root.querySelector('[data-yc-ann-voice]'),fillVoices=()=>{if(!voiceSel)return;const saved=ycExpRead('yc_voice_announce_voice',''),voices=ycVoiceExpVoices();voiceSel.innerHTML='<option value="">Automaticky podle zařízení</option>'+voices.map(v=>'<option value="'+esc(v.voiceURI)+'">'+esc(v.name+' · '+v.lang)+'</option>').join('');voiceSel.value=voices.some(v=>v.voiceURI===saved)?saved:''};fillVoices();if('speechSynthesis'in window)speechSynthesis.addEventListener?.('voiceschanged',fillVoices,{once:true});if(voiceSel)voiceSel.onchange=()=>ycExpWrite('yc_voice_announce_voice',voiceSel.value);
 const range=(sel,label,key,def)=>{const e=root.querySelector(sel),l=root.querySelector(label);if(!e)return;e.value=String(ycExpNum(key,def,0,100));const sync=()=>{if(l)l.textContent=e.value+' %'};sync();e.oninput=()=>{ycExpWrite(key,e.value);sync()}};
 range('[data-yc-ann-vol]','[data-yc-ann-vol-label]','yc_voice_announce_volume',92);range('[data-yc-sb-vol]','[data-yc-sb-vol-label]','yc_soundboard_volume',100);range('[data-yc-msg-vol]','[data-yc-msg-vol-label]','yc_message_sound_volume',85);
 const sb=root.querySelector('[data-yc-sb-enabled]');if(sb){sb.checked=ycExpBool('yc_soundboard_enabled',true);sb.onchange=()=>ycExpWrite('yc_soundboard_enabled',sb.checked?'1':'0')}
 const msg=root.querySelector('[data-yc-msg-enabled]');if(msg){msg.checked=ycExpBool('yc_message_sound_enabled',true);msg.onchange=()=>ycExpWrite('yc_message_sound_enabled',msg.checked?'1':'0')}
 const afk=root.querySelector('[data-yc-afk]');if(afk){afk.value=String(ycExpNum('yc_voice_afk_minutes',20,0,120));afk.onchange=()=>ycExpWrite('yc_voice_afk_minutes',afk.value)}
 root.querySelector('[data-yc-ann-test]')?.addEventListener('click',()=>{const mode=ycVoiceAnnounceMode();if(mode==='sound'||mode==='both')playVoiceCue('other-join');if(mode==='speech'||mode==='both')ycVoiceSpeak('Testovací uživatel se připojil do místnosti')});
 root.querySelector('[data-yc-msg-test]')?.addEventListener('click',()=>ycPlayMessageNotifySound(true))
}
ycRegisterAppSettingsSection({id:'voice-experience',title:'Zvuky, voice a oznámení',description:'Osobní nastavení hlasových oznámení, soundboardu, AFK a zvuku nových zpráv. Ukládá se na tomto zařízení.',render:ycVoiceExpSettingsHtml,bind:ycVoiceExpBindSettings});
window.YamachatVoiceExperience=Object.freeze({
 version:YC_VOICE_EXP_VERSION,
 snapshot:()=>Object.freeze({
  voiceConnected:!!voiceChannel,
  voiceChannelId:String(voiceChannel?.id||''),
  voiceCommunityId:String(voiceChannel?.community_id||''),
  voiceSessionId:String(voiceSessionId||''),
  micLive:!!voiceStream?.getAudioTracks?.().some(t=>t.readyState==='live'),
  heartbeat:!!voiceHeartbeatTimer,
  announceMode:ycVoiceAnnounceMode(),
  soundboardGain:ycSoundboardGain(),
  messageSoundAllowed:ycMessageSoundAllowed(),
  messageSoundEmbedded:YC_MESSAGE_UHOH_URI.startsWith('data:audio/mpeg;base64,')&&YC_MESSAGE_UHOH_URI.length>4000,
  afkMinutes:ycExpNum('yc_voice_afk_minutes',20,0,120)
 }),
 messageSoundAllowedFor:mode=>ycMessageSoundAllowedFor(mode),
 isSoundboardUserMuted:uid=>ycSoundboardUserMuted(uid),
 announcementText:(action,name)=>ycVoiceExpAnnouncementText(action,name),
 presenceFor:(pref,connected,speaking,silentMs,minutes,fallback='online')=>ycVoiceExpPresenceFor(pref,!!connected,!!speaking,Number(silentMs)||0,Number(minutes)||0,fallback)
});
`;
const style=String.raw`
<style id="ycVoiceExperienceStyle">
:root{--yc-exp-ring:color-mix(in srgb,var(--yc-theme,#e056fd) 48%,rgba(99,132,151,.38))}
.yc-v3-workspace>.top,#ycGlobalNav,#side,.yc-v3-content-grid>.chat>.chat-head,.yc-v3-content-grid>.right,.right-tabs,#voiceControls,.composer-wrap,#ycNotifyPanel{
 outline:1px solid var(--yc-exp-ring)!important;outline-offset:-1px!important
}
.composer-wrap{border-color:color-mix(in srgb,var(--yc-theme,#e056fd) 46%,#355466)!important;box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--yc-theme,#e056fd) 8%,transparent),0 0 16px var(--yc-theme-soft,rgba(224,86,253,.08))!important}
input[type="range"]{accent-color:var(--yc-theme,#e056fd)!important}
input[type="range"]::-webkit-slider-thumb{background:var(--yc-theme,#e056fd)!important}
.yc-soundboard-master{display:grid;gap:7px;margin:0 0 9px;padding:9px;border:1px solid color-mix(in srgb,var(--yc-theme,#e056fd) 25%,#33495c);border-radius:10px;background:#101d27}.yc-soundboard-master>label:first-child{display:flex;align-items:center;justify-content:space-between;gap:8px;color:#a8becb;font-size:10px}.yc-soundboard-master input[type=range]{width:100%}.yc-sb-enable{font-size:10px;color:#91a8b8;display:flex;gap:7px;align-items:center}
.yc-soundboard-folders{display:grid;gap:7px}.yc-soundboard-folder{border:1px solid #2c4353;border-radius:9px;background:#0d1922;overflow:hidden}.yc-soundboard-folder summary{cursor:pointer;padding:8px 10px;color:#9cb6c6;font-size:10px;font-weight:900;letter-spacing:.04em}.yc-soundboard-folder>.soundboard-grid{padding:0 8px 8px}
.voice-user-menu [data-yc-sb-user-mute]{color:#d9edf6}.voice-user-menu [data-yc-sb-user-mute][aria-pressed="true"]{color:#ffb2bd}
@media(max-width:1100px),(pointer:coarse){.voice-user-menu{max-width:calc(100vw - 20px)!important;min-width:min(300px,calc(100vw - 20px))!important}.voice-user-menu-row{min-height:44px!important}.voice-user-volume input[type=range]{min-height:34px}}
.yc-exp-settings{display:grid;gap:10px}.yc-exp-card{display:grid;gap:9px;padding:12px;border:1px solid color-mix(in srgb,var(--yc-theme,#e056fd) 24%,#345062);border-radius:12px;background:linear-gradient(145deg,color-mix(in srgb,var(--yc-theme,#e056fd) 5%,#10202b),#0b1720)}.yc-exp-card>strong{color:#e4f5fb}.yc-exp-card label:not(.yc-exp-check){display:grid;gap:5px;color:#91aab9;font-size:10px}.yc-exp-card select{width:100%;padding:9px;border-radius:8px;border:1px solid #365164;background:#0b1720;color:#e2f2f8}.yc-exp-card input[type=range]{width:100%}.yc-exp-check{display:flex;align-items:center;gap:8px;color:#c4d8e2;font-size:11px}.yc-exp-card small{color:#748e9e;line-height:1.4}
@media(max-width:1100px){.yc-exp-card{padding:10px}.yc-v3-workspace>.top,#ycGlobalNav,#side,.yc-v3-content-grid>.right,.composer-wrap,#voiceControls{outline-color:color-mix(in srgb,var(--yc-theme,#e056fd) 55%,#355466)!important}}
</style>
`;
export function withVoiceExperience(html){
 const marker='// Register every feature before restoring a cached session.';
 for(const part of [marker,'function playPresetSound','async function playCustomSound','async function handleSoundboardEvent','function ycAutoPresenceState','function ycPlayDmSound','function ycVoiceSpeak','function renderSoundboardPanel','function openVoiceUserMenu','async function selectCommunity'])
   if(!html.includes(part))throw Error('Voice experience insertion boundary missing: '+part);
 if(html.includes('ycVoiceExperienceStyle'))return html;
 html=html.replace('g.gain.exponentialRampToValueAtTime(gain,now+start+.015);','g.gain.exponentialRampToValueAtTime(gain*ycSoundboardGain(),now+start+.015);');
 html=html.replace('g.gain.value=.72;src.buffer=buf;','g.gain.value=.72*ycSoundboardGain();src.buffer=buf;');
 html=html.replace('soundboardEventSeen.add(row.id);if(soundboardEventSeen.size>300)soundboardEventSeen.clear();if(row.sound_key)','soundboardEventSeen.add(row.id);if(soundboardEventSeen.size>300)soundboardEventSeen.clear();if(ycSoundboardUserMuted(row.user_id))return;if(row.sound_key)');
 const presenceJoin=".on('presence',{event:'join'},()=>refreshVoiceParticipants(id))";
 const presenceLeave=".on('presence',{event:'leave'},()=>{setTimeout(()=>refreshVoiceParticipants(id),250);setTimeout(()=>refreshVoiceParticipants(id),1000)})";
 if(!html.includes(presenceJoin)||!html.includes(presenceLeave))throw Error('Voice experience presence announcement boundary missing');
 html=html.replace(presenceJoin,".on('presence',{event:'join'},payload=>{for(const p of payload?.newPresences||[])ycVoiceExpSpeakParticipant('join',{user_id:p.user_id,channel_id:id,username:p.username});refreshVoiceParticipants(id)})");
 html=html.replace(presenceLeave,".on('presence',{event:'leave'},payload=>{for(const p of payload?.leftPresences||[])ycVoiceExpSpeakParticipant('leave',{user_id:p.user_id,channel_id:id,username:p.username});setTimeout(()=>refreshVoiceParticipants(id),250);setTimeout(()=>refreshVoiceParticipants(id),1000)})");
 return html.replace(marker,runtime+'\n'+marker).replace('</body>',style+'\n</body>');
}
