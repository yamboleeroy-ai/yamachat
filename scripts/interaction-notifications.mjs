import fs from 'node:fs';

const runtime=fs.readFileSync(new URL('../web/interaction-notifications.js',import.meta.url),'utf8');
const style=String.raw`
<style id="ycInteractionNotificationStyle">
#channelList [data-channel],#voiceChannelList .voice-channel[data-voice],.voice-user[data-user-id],#rightContent .steam-member-row[data-member-id],#rightContent .steam-friend-row[data-profile-user],.yc-dm-social-row[data-profile-user]{-webkit-touch-callout:none}
@media(pointer:coarse){
 #channelList [data-channel],#voiceChannelList .voice-channel[data-voice],.voice-user[data-user-id],#rightContent .steam-member-row[data-member-id],#rightContent .steam-friend-row[data-profile-user],.yc-dm-social-row[data-profile-user]{touch-action:pan-y}
}
</style>
`;

function replaceOnce(html,before,after,label){
 if(!html.includes(before))throw Error('Interaction/notification boundary missing: '+label);
 return html.replace(before,after);
}

export function withInteractionNotifications(html){
 if(html.includes('ycInteractionNotificationStyle'))return html;
 const marker='// Register every feature before restoring a cached session.';
 if(!html.includes(marker))throw Error('Interaction runtime insertion boundary missing');

 // Microphone test owns a temporary outbound voice mute without changing the user's saved mute choice.
 html=replaceOnce(
  html,
  'let ycMicTestStream=null,ycMicTestAudio=null,ycMicTestMeterStop=null',
  'let ycMicTestStream=null,ycMicTestAudio=null,ycMicTestMeterStop=null,ycMicTestWanted=false,ycMicTestStarting=false,ycMicTestRestartTimer=null,ycMicTestVoiceHold=false',
  'mic test state'
 );

 const oldStop="function ycStopMicTest(){++ycMicTestGeneration;ycResetThresholdMeter();if(ycMicTestMeterStop){try{ycMicTestMeterStop()}catch{}ycMicTestMeterStop=null}if(ycMicTestAudio){try{ycMicTestAudio.pause();ycMicTestAudio.srcObject=null;ycMicTestAudio.remove()}catch{}ycMicTestAudio=null}if(ycMicTestStream){const old=ycMicTestStream;ycMicTestStream=null;void ycStopManagedMicStream(old)}const b=$('voiceMicTestBtn');if(b){b.classList.remove('active');b.textContent='🎙 Spustit test mikrofonu'}}";
 const newStop=String.raw`
function ycApplyMicTestVoiceHold(){
 try{if(voiceStream)voiceStream.getAudioTracks().forEach(t=>t.enabled=ycMicTestVoiceHold?false:!voiceMuted&&!voiceDeafened)}catch{}
 if(ycMicTestVoiceHold){voiceSpeaking=false;if(voiceChannel)void trackVoicePresence().catch(()=>{})}
 else if(voiceChannel){void trackVoicePresence().catch(()=>{});renderVoiceControls()}
}
function ycSetMicTestVoiceHold(active){ycMicTestVoiceHold=!!active;ycApplyMicTestVoiceHold()}
function ycCleanupMicTest({restoreVoice=false,clearWanted=false}={}){
 ++ycMicTestGeneration;if(clearWanted)ycMicTestWanted=false;
 ycResetThresholdMeter();
 if(ycMicTestMeterStop){try{ycMicTestMeterStop()}catch{}ycMicTestMeterStop=null}
 if(ycMicTestAudio){try{ycMicTestAudio.pause();ycMicTestAudio.srcObject=null;ycMicTestAudio.remove()}catch{}ycMicTestAudio=null}
 if(ycMicTestStream){const old=ycMicTestStream;ycMicTestStream=null;void ycStopManagedMicStream(old)}
 ycMicTestStarting=false;
 const b=$('voiceMicTestBtn');if(b){b.classList.remove('active');b.disabled=false;b.textContent='🎙 Spustit test mikrofonu'}
 if(restoreVoice)ycSetMicTestVoiceHold(false);
}
function ycStopMicTest(){clearTimeout(ycMicTestRestartTimer);ycMicTestRestartTimer=null;ycCleanupMicTest({restoreVoice:true,clearWanted:true})}
`.trim();
 html=replaceOnce(html,oldStop,newStop,'mic test stop');

 const oldToggle="async function ycToggleMicTest(){const generation=++ycMicTestGeneration;if(ycMicTestStream){ycStopMicTest();return}const btn=$('voiceMicTestBtn');if(btn){btn.disabled=true;btn.textContent='Spouštím test…'}try{const media=getVoiceMediaDevices();if(!media?.getUserMedia)throw new Error('Mikrofon není dostupný');const device=$('voiceMicSelect')?.value||voiceDeviceId||'';const mode=ycNoiseModeFromUi(),audio=ycNoiseConstraints(mode,device,$('voiceEchoCheck')?.checked??voiceEcho,$('voiceAgcCheck')?.checked??voiceAgc),raw=await media.getUserMedia({audio});const processed=await ycPrepareMicStream(raw,mode,ycMicDraft());if(generation!==ycMicTestGeneration||!$('voiceMicTestBtn')){await ycStopManagedMicStream(processed);return}ycMicTestStream=processed;ycMicTestAudio=document.createElement('audio');ycMicTestAudio.autoplay=true;ycMicTestAudio.playsInline=true;ycMicTestAudio.volume=.85;ycMicTestAudio.srcObject=ycMicTestStream;ycMicTestAudio.style.display='none';document.body.appendChild(ycMicTestAudio);const sink=$('voiceOutputSelect')?.value||voiceOutputId||'default';if(typeof ycMicTestAudio.setSinkId==='function')try{await ycMicTestAudio.setSinkId(sink)}catch{}await ycMicTestAudio.play().catch(()=>{});ycStartMicTestMeter(ycMicTestStream);if(btn){btn.classList.add('active');btn.textContent='⏹ Zastavit test mikrofonu'}}catch(e){ycStopMicTest();toast('Test mikrofonu se nepodařilo spustit: '+(e?.message||e),true)}finally{if(btn)btn.disabled=false}}";
 const newToggle=String.raw`
async function ycStartMicTestInternal(){
 if(!ycMicTestWanted)return;
 const generation=++ycMicTestGeneration,btn=$('voiceMicTestBtn');ycMicTestStarting=true;ycSetMicTestVoiceHold(true);
 if(btn){btn.disabled=true;btn.textContent='Spouštím test…'}
 try{
  const media=getVoiceMediaDevices();if(!media?.getUserMedia)throw new Error('Mikrofon není dostupný');
  const device=$('voiceMicSelect')?.value||voiceDeviceId||'',mode=ycNoiseModeFromUi(),audio=ycNoiseConstraints(mode,device,$('voiceEchoCheck')?.checked??voiceEcho,$('voiceAgcCheck')?.checked??voiceAgc),raw=await media.getUserMedia({audio});
  const processed=await ycPrepareMicStream(raw,mode,ycMicDraft());
  if(generation!==ycMicTestGeneration||!ycMicTestWanted||!$('voiceMicTestBtn')){await ycStopManagedMicStream(processed);return}
  ycMicTestStream=processed;ycMicTestAudio=document.createElement('audio');ycMicTestAudio.autoplay=true;ycMicTestAudio.playsInline=true;ycMicTestAudio.volume=.85;ycMicTestAudio.srcObject=ycMicTestStream;ycMicTestAudio.style.display='none';document.body.appendChild(ycMicTestAudio);
  const sink=$('voiceOutputSelect')?.value||voiceOutputId||'default';if(typeof ycMicTestAudio.setSinkId==='function')try{await ycMicTestAudio.setSinkId(sink)}catch{}
  await ycMicTestAudio.play().catch(()=>{});ycStartMicTestMeter(ycMicTestStream);ycApplyMicTestVoiceHold();
  if(btn){btn.classList.add('active');btn.textContent='⏹ Zastavit test mikrofonu'}
 }catch(e){
  if(generation===ycMicTestGeneration){ycMicTestWanted=false;ycCleanupMicTest({restoreVoice:true});toast('Test mikrofonu se nepodařilo spustit: '+(e?.message||e),true)}
 }finally{ycMicTestStarting=false;if(btn?.isConnected)btn.disabled=false}
}
async function ycToggleMicTest(){if(ycMicTestWanted){ycStopMicTest();return}ycMicTestWanted=true;ycSetMicTestVoiceHold(true);await ycStartMicTestInternal()}
function ycRestartMicTest(){
 if(!ycMicTestWanted)return;
 clearTimeout(ycMicTestRestartTimer);ycCleanupMicTest({restoreVoice:false,clearWanted:false});ycSetMicTestVoiceHold(true);
 const b=$('voiceMicTestBtn');if(b){b.disabled=true;b.textContent='Aktualizuji test…'}
 ycMicTestRestartTimer=setTimeout(()=>{ycMicTestRestartTimer=null;void ycStartMicTestInternal()},90);
}
function ycMicTestSettingChanged(event){
 if(!ycMicTestWanted)return;
 if(event?.target?.id==='voiceOutputSelect'){
  const sink=event.target.value||'default';if(ycMicTestAudio&&typeof ycMicTestAudio.setSinkId==='function')void ycMicTestAudio.setSinkId(sink).catch(()=>{});return;
 }
 ycRestartMicTest();
}
`.trim();
 html=replaceOnce(html,oldToggle,newToggle,'mic test toggle');

 const oldFocus="$('ycVoiceFocus').value=o.focus;$('ycVoiceFocus').onchange=()=>{if($('ycVoiceFocus').value!=='off'&&ycNoiseModeFromUi()!=='ai'){$('ycNoiseModeSelect').value='ai';ycStopMicTest();ycRenderNoiseModeHint();toast('Zapnuto YamaClean AI. Spusť znovu test mikrofonu.')}else ycMicUpdateTest()};";
 const newFocus="$('ycVoiceFocus').value=o.focus;$('ycVoiceFocus').onchange=()=>{if($('ycVoiceFocus').value!=='off'&&ycNoiseModeFromUi()!=='ai'){$('ycNoiseModeSelect').value='ai';ycRenderNoiseModeHint();ycRestartMicTest();toast('Zapnuto YamaClean AI. Test mikrofonu pokračuje s novým režimem.')}else ycMicUpdateTest()};";
 html=replaceOnce(html,oldFocus,newFocus,'voice focus mic-test restart');

 if(!html.includes("for(const id of ['voiceMicSelect','voiceOutputSelect','voiceEchoCheck','voiceAgcCheck'])$(id)?.addEventListener('change',ycStopMicTest);"))
   throw Error('Mic settings change boundary missing');
 html=html.replace("for(const id of ['voiceMicSelect','voiceOutputSelect','voiceEchoCheck','voiceAgcCheck'])$(id)?.addEventListener('change',ycStopMicTest);",
                   "for(const id of ['voiceMicSelect','voiceOutputSelect','voiceEchoCheck','voiceAgcCheck'])$(id)?.addEventListener('change',ycMicTestSettingChanged);");

 if(!html.includes("$('ycNoiseModeSelect').onchange=()=>{ycStopMicTest();ycRenderNoiseModeHint()}"))
   throw Error('Noise mode mic-test boundary missing');
 html=html.replace("$('ycNoiseModeSelect').onchange=()=>{ycStopMicTest();ycRenderNoiseModeHint()}",
                   "$('ycNoiseModeSelect').onchange=()=>{ycRenderNoiseModeHint();ycRestartMicTest()}");

 // Any voice track created/restarted while the test is active remains physically disabled.
 html=html.replaceAll('!voiceMuted&&!voiceDeafened','!voiceMuted&&!voiceDeafened&&!ycMicTestVoiceHold');
 html=html.replaceAll('muted=voiceMuted,deafened=voiceDeafened','muted=voiceMuted||ycMicTestVoiceHold,deafened=voiceDeafened');
 html=html.replaceAll('muted:voiceMuted,deafened:voiceDeafened','muted:voiceMuted||ycMicTestVoiceHold,deafened:voiceDeafened');

 // Add notification controls to existing desktop/right-click menus.
 const oldChannel="}else items.push({id:'text-open',icon:'#',label:'Otevřít chat',action:async()=>{const all=await getChannels();await selectChannel(ch.id,all)}})\n  items.push({separator:true},{id:'channel-copy-id',icon:'ID',label:'Kopírovat ID kanálu',action:()=>ycCopyChannelId(ch)})";
 const newChannel="}else{items.push({id:'text-open',icon:'#',label:'Otevřít chat',action:async()=>{const all=await getChannels();await selectChannel(ch.id,all)}});const notifyItems=await ycNotificationMenuItems('channel',ch.id,'z kanálu',{serverId:ch.community_id});items.push({separator:true},...notifyItems)}\n  items.push({separator:true},{id:'channel-copy-id',icon:'ID',label:'Kopírovat ID kanálu',action:()=>ycCopyChannelId(ch)})";
 html=replaceOnce(html,oldChannel,newChannel,'text channel notification menu');

 const oldFinalChannel="  else items.push({id:'text-open',icon:'#',label:'Otevřít chat',action:async()=>{const all=await getChannels();await selectChannel(ch.id,all)}});\n  items.push({separator:true},{id:'channel-copy-id',icon:'ID',label:'Kopírovat ID kanálu',action:()=>ycCopyChannelId(ch)});";
 const newFinalChannel="  else{items.push({id:'text-open',icon:'#',label:'Otevřít chat',action:async()=>{const all=await getChannels();await selectChannel(ch.id,all)}});const notifyItems=await ycNotificationMenuItems('channel',ch.id,'z kanálu',{serverId:ch.community_id});items.push({separator:true},...notifyItems)}\n  items.push({separator:true},{id:'channel-copy-id',icon:'ID',label:'Kopírovat ID kanálu',action:()=>ycCopyChannelId(ch)});";
 html=replaceOnce(html,oldFinalChannel,newFinalChannel,'final hidden/password channel notification menu');

 const oldMember="async function ycOpenMemberMenu(row,e){if(!row)return;ycHoverHide?.();const uid=row.dataset.memberId||row.dataset.profileUser,blockedByMe=await ycIsBlockedByMe(uid);ycOpenUiMenu({kind:'member',title:row.dataset.memberName||'Uživatel',x:e.clientX,y:e.clientY,items:ycMemberMenuItems(row,blockedByMe),context:{row}})}";
 const newMember="async function ycOpenMemberMenu(row,e){if(!row)return;ycHoverHide?.();const uid=row.dataset.memberId||row.dataset.profileUser,blockedByMe=await ycIsBlockedByMe(uid),items=ycMemberMenuItems(row,blockedByMe),notifyItems=await ycNotificationMenuItems('user',uid,'od uživatele');items.push({separator:true},...notifyItems);ycOpenUiMenu({kind:'member',title:row.dataset.memberName||'Uživatel',x:e.clientX,y:e.clientY,items,context:{row}})}";
 html=replaceOnce(html,oldMember,newMember,'member notification menu');

 const oldFriendStart="async function ycOpenFriendUserMenu(row,e){if(!row)return;ycHoverHide?.();const uid=row.dataset.profileUser,name=row.dataset.userName||'Uživatel';if(!uid||uid===user?.id)return;const [rel,blockedByMe]=await Promise.all([ycFriendRelation(uid).catch(()=>null),ycIsBlockedByMe(uid)]),items=[{id:'profile',icon:'👤',label:'Profil',action:()=>openUserProfile(uid)}];";
 const newFriendStart="async function ycOpenFriendUserMenu(row,e){if(!row)return;ycHoverHide?.();const uid=row.dataset.profileUser,name=row.dataset.userName||'Uživatel';if(!uid||uid===user?.id)return;const [rel,blockedByMe,notifyItems]=await Promise.all([ycFriendRelation(uid).catch(()=>null),ycIsBlockedByMe(uid),ycNotificationMenuItems('user',uid,'od uživatele')]),items=[{id:'profile',icon:'👤',label:'Profil',action:()=>openUserProfile(uid)}];";
 html=replaceOnce(html,oldFriendStart,newFriendStart,'friend notification menu');
 const oldFriendEnd="items.push({separator:true},{id:'block-user',icon:blockedByMe?'✓':'⛔',label:blockedByMe?'Odblokovat uživatele':'Zablokovat uživatele',danger:!blockedByMe,action:()=>blockedByMe?ycUnblockUser(uid,name):ycBlockUser(uid,name)});ycOpenUiMenu({kind:'friend-user'";
 const newFriendEnd="items.push({separator:true},...notifyItems,{separator:true},{id:'block-user',icon:blockedByMe?'✓':'⛔',label:blockedByMe?'Odblokovat uživatele':'Zablokovat uživatele',danger:!blockedByMe,action:()=>blockedByMe?ycUnblockUser(uid,name):ycBlockUser(uid,name)});ycOpenUiMenu({kind:'friend-user'";
 html=replaceOnce(html,oldFriendEnd,newFriendEnd,'friend notification items');

 const oldServerSeq="const seq=++ycServerCardMenuSeq,canManage=await ycServerCardCanManage(c);if(seq!==ycServerCardMenuSeq)return;";
 const newServerSeq="const seq=++ycServerCardMenuSeq,[canManage,notifyItems]=await Promise.all([ycServerCardCanManage(c),ycNotificationMenuItems('server',c.id,'ze serveru')]);if(seq!==ycServerCardMenuSeq)return;";
 html=replaceOnce(html,oldServerSeq,newServerSeq,'server notification load');
 const oldServerItems="{id:'server-settings',icon:'⚙',label:'Nastavení serveru',visible:canManage,action:()=>ycServerCardOpenSettings(c.id)},\n  {separator:true},\n  {id:'server-leave'";
 const newServerItems="{id:'server-settings',icon:'⚙',label:'Nastavení serveru',visible:canManage,action:()=>ycServerCardOpenSettings(c.id)},\n  {separator:true},\n  ...notifyItems,\n  {separator:true},\n  {id:'server-leave'";
 html=replaceOnce(html,oldServerItems,newServerItems,'server notification item');

 // Respect the same preference while the app is open, not only in FCM/WNS/WebPush.
 const oldWin="if(!m||!user?.id||m.author_id===user.id)return\n  if(typeof ycPresencePreference==='function'&&ycPresencePreference()==='dnd')return";
 const newWin="if(!m||!user?.id||m.author_id===user.id)return\n  if(!await ycShouldNotifyMessage(m))return\n  if(typeof ycPresencePreference==='function'&&ycPresencePreference()==='dnd')return";
 html=replaceOnce(html,oldWin,newWin,'foreground desktop notification filter');
 const oldDm="ycDmUnreadByThread[tid]=(ycDmUnreadByThread[tid]||0)+1;ycUpdateDmBadge();ycDecorateDmRows();ycPlayDmSound()}).subscribe()";
 const newDm="ycDmUnreadByThread[tid]=(ycDmUnreadByThread[tid]||0)+1;ycUpdateDmBadge();ycDecorateDmRows();if(await ycShouldNotifyMessage(m))ycPlayDmSound()}).subscribe()";
 html=replaceOnce(html,oldDm,newDm,'DM foreground sound filter');

 html=html.replace(marker,runtime+'\n'+marker);
 html=html.replace('</head>',style+'\n</head>');
 return html;
}
