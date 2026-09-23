// Web integration: retain the desktop client's chat/voice logic.
ycAppSettingsSections.delete('window');
ycAppSettingsSections.delete('updates');
ycWinPermission=async()=>('Notification' in window)&&Notification.permission==='granted';
let ycWebInstallPrompt=null,ycWebRegistration=null,ycWebWakeLock=null,ycWebWakePending=false;
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();ycWebInstallPrompt=event;ycWebSyncInstallButtons()});
window.addEventListener('appinstalled',()=>{ycWebInstallPrompt=null;ycWebSyncInstallButtons();toast('Webová verze Yamachatu je nainstalovaná.')});
function ycWebIsInstalled(){return matchMedia('(display-mode: standalone)').matches||navigator.standalone===true}
function ycWebSyncInstallButtons(){document.querySelectorAll('[data-yc-web-install]').forEach(b=>{b.hidden=ycWebIsInstalled();b.disabled=ycWebIsInstalled();b.textContent='Nainstalovat webovou verzi'})}
async function ycWebInstall(){if(ycWebInstallPrompt){const prompt=ycWebInstallPrompt;ycWebInstallPrompt=null;await prompt.prompt();await prompt.userChoice;ycWebSyncInstallButtons()}else toast('V menu prohlížeče zvol Nainstalovat aplikaci nebo Přidat na plochu.')}
function ycWebNotificationStatus(){if(!('Notification' in window))return 'Tento prohlížeč systémová oznámení nepodporuje.';return Notification.permission==='granted'?'Oznámení jsou povolená.':Notification.permission==='denied'?'Oznámení jsou blokovaná. Povol je v nastavení tohoto webu v prohlížeči.':'Oznámení zatím nejsou povolená.'}

const ycWindowsReleasePage='https://github.com/yamboleeroy-ai/yamachat/releases/latest';
async function ycWebLoadWindowsDownload(root){
  const link=root.querySelector('[data-yc-windows-download]');
  const status=root.querySelector('[data-yc-windows-status]');
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),8000);
  try{
    const response=await fetch('https://api.github.com/repos/yamboleeroy-ai/yamachat/releases/latest',{signal:controller.signal,credentials:'omit',headers:{Accept:'application/vnd.github+json'}});
    if(!response.ok)throw new Error('Release unavailable');
    const release=await response.json();
    const asset=!release.draft&&!release.prerelease&&release.assets?.find(a=>/^Yamachat-Setup-\d+\.\d+\.\d+\.exe$/.test(a.name)&&a.state==='uploaded');
    if(!asset)throw new Error('Installer unavailable');
    const url=new URL(asset.browser_download_url);
    if(url.origin!=='https://github.com'||!url.pathname.startsWith('/yamboleeroy-ai/yamachat/releases/download/')||decodeURIComponent(url.pathname.split('/').pop())!==asset.name||url.search||url.hash)throw new Error('Unexpected installer URL');
    link.href=url.href;
    link.textContent='Stáhnout Yamachat pro Windows';
    status.textContent='Verze '+asset.name.slice(15,-4)+' · Po stažení otevři instalátor a dokonči instalaci.';
  }catch{
    link.href=ycWindowsReleasePage;
    link.textContent='Otevřít stažení pro Windows';
    status.textContent='Aktuální instalátor najdeš na stránce vydání v části Assets. Stáhni soubor Yamachat-Setup s příponou .exe.';
  }finally{clearTimeout(timeout)}
}
ycRegisterAppSettingsSection({
  id:'windows-download',title:'Yamachat pro Windows',
  description:'Naše desktopová aplikace s automatickými aktualizacemi.',
  render:()=>'<a class="ghost yc-windows-download" data-yc-windows-download href="'+ycWindowsReleasePage+'" target="_blank" rel="noopener noreferrer">Otevřít stažení pro Windows</a><p data-yc-windows-status role="status">Zjišťuji nejnovější verzi…</p><p>Stáhni instalátor, otevři jej a přihlas se svým účtem Yamachat. Další aktualizace nabídne desktopová aplikace.</p>',
  bind:root=>{void ycWebLoadWindowsDownload(root)}
});

ycRegisterAppSettingsSection({id:'web',title:'Webová verze v prohlížeči',description:'Volitelná webová aplikace pro telefon a další zařízení. Instaluje se přímo z prohlížeče.',render:()=>'<button type="button" class="ghost" data-yc-web-install>Nainstalovat webovou verzi</button><p>Hlas a oznámení fungují, dokud je aplikace otevřená. Zavřením okna se hlasové spojení ukončí.</p><p>'+esc(ycWebNotificationStatus())+'</p><button type="button" class="ghost" id="ycWebAllowNotify">Povolit oznámení</button><p>Na telefonu mohou hlas a sdílení omezovat možnosti prohlížeče.</p><button type="button" class="ghost" id="ycWebUpdate" '+(ycWebRegistration?.waiting?'':'hidden')+'>Načíst novou verzi</button>',bind:root=>{root.querySelector('[data-yc-web-install]').onclick=()=>void ycWebInstall();ycWebSyncInstallButtons();const b=root.querySelector('#ycWebAllowNotify');b.disabled=!('Notification' in window)||Notification.permission==='granted';b.onclick=async()=>{try{await Notification.requestPermission();toast(ycWebNotificationStatus());b.disabled=Notification.permission==='granted'}catch{toast('Oznámení povol v nastavení prohlížeče.',true)}};root.querySelector('#ycWebUpdate').onclick=()=>{if(voiceChannel||screenShareActive){toast('Před aktualizací ukonči hlas a sdílení obrazovky.');return}ycWebRegistration?.waiting?.postMessage({type:'SKIP_WAITING'});location.reload()}}});
if(!window.Capacitor?.isNativePlatform?.()&&'serviceWorker' in navigator){navigator.serviceWorker.register('./sw.js').then(reg=>{ycWebRegistration=reg;reg.addEventListener('updatefound',()=>{const worker=reg.installing;worker?.addEventListener('statechange',()=>{if(worker.state==='installed'&&navigator.serviceWorker.controller){toast('Nová verze je dostupná v Nastavení aplikace.');document.getElementById('ycWebUpdate')?.removeAttribute('hidden')}})});reg.update().catch(()=>{})}).catch(e=>console.warn('Yamachat offline registration',e));navigator.serviceWorker.addEventListener('message',event=>{if(event.data?.type==='yamachat:web-notification'&&user)void window.ycOpenDesktopNotificationTarget(event.data.target)})}
window.yamachatDesktop={...window.yamachatDesktop,showNotification:async payload=>{if(!(await ycWinPermission()))return false;const opts={body:[payload.where,payload.body].filter(Boolean).join(' · '),icon:payload.avatar||'./icons/icon-192.png',badge:'./icons/icon-192.png',tag:'yamachat-msg-'+String(payload.target?.messageId||Date.now()),data:{target:payload.target||{}}};if(ycWebRegistration){await ycWebRegistration.showNotification(payload.title||'Yamachat',opts);return true}return false}};
window.addEventListener('online',()=>{toast('Připojení bylo obnoveno.');try{sb.realtime.connect()}catch{}});
window.addEventListener('offline',()=>toast('Připojení se přerušilo. Zprávy a hlas potřebují internet.',true));

const YC_IOS_VOICE_RESUME_KEY='yc_ios_voice_resume_v1';
const YC_IOS_VOICE_RESUME_TTL=15*60*1000;
const ycWebIsIosDevice=()=>/iP(?:hone|ad|od)/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
const ycWebIsIosPwa=()=>ycWebIsIosDevice()&&(navigator.standalone===true||matchMedia('(display-mode: standalone)').matches);
let ycIosVoiceHiddenAt=0,ycIosVoiceReconnectBusy=false,ycIosVoiceReconnectPromise=null,ycIosVoiceReconnectLastAt=0;
function ycIosVoiceSaveTarget(channel=voiceChannel){
  if(!ycWebIsIosPwa()||!channel?.id||!user?.id)return;
  try{localStorage.setItem(YC_IOS_VOICE_RESUME_KEY,JSON.stringify({userId:String(user.id),communityId:String(currentCommunity?.id||''),channelId:String(channel.id),name:String(channel.name||'Hlasový kanál'),savedAt:Date.now()}))}catch{}
}
function ycIosVoiceReadTarget(){
  if(!ycWebIsIosPwa()||!user?.id)return null;
  try{
    const value=JSON.parse(localStorage.getItem(YC_IOS_VOICE_RESUME_KEY)||'null');
    if(!value||String(value.userId||'')!==String(user.id)||!value.channelId)return null;
    if(Date.now()-Number(value.savedAt||0)>YC_IOS_VOICE_RESUME_TTL){localStorage.removeItem(YC_IOS_VOICE_RESUME_KEY);return null}
    return value;
  }catch{return null}
}
function ycIosVoiceClearTarget(){try{localStorage.removeItem(YC_IOS_VOICE_RESUME_KEY)}catch{}}
function ycIosVoiceFindChannel(target){
  if(!target)return null;
  if(target.communityId&&currentCommunity?.id&&String(target.communityId)!==String(currentCommunity.id))return null;
  if(voiceChannel&&String(voiceChannel.id)===String(target.channelId))return voiceChannel;
  return (voiceChannelDefs||[]).find(ch=>String(ch.id)===String(target.channelId))||null;
}
async function ycIosVoiceReconnect(reason='resume'){
  if(!ycWebIsIosPwa()||document.visibilityState!=='visible'||!user)return false;
  if(ycIosVoiceReconnectBusy)return ycIosVoiceReconnectPromise||false;
  const now=Date.now();
  if(now-ycIosVoiceReconnectLastAt<2500)return false;
  const stored=ycIosVoiceReadTarget();
  const live=voiceChannel;
  const target=live?{userId:String(user.id),communityId:String(currentCommunity?.id||''),channelId:String(live.id),name:String(live.name||'Hlasový kanál'),savedAt:now}:stored;
  if(!target)return false;
  const hiddenFor=ycIosVoiceHiddenAt?now-ycIosVoiceHiddenAt:0;
  const track=voiceStream?.getAudioTracks?.()[0]||null;
  const peerBroken=[...voicePeerStates.values()].some(state=>state==='failed'||state==='disconnected'||state==='closed');
  const streamBroken=!track||track.readyState!=='live';
  if(live&&hiddenFor<1200&&!streamBroken&&!peerBroken&&reason!=='online')return false;
  const channel=ycIosVoiceFindChannel(target);
  if(!channel)return false;
  ycIosVoiceReconnectLastAt=now;
  ycIosVoiceReconnectBusy=true;
  ycIosVoiceReconnectPromise=(async()=>{
    try{
      ycIosVoiceSaveTarget(channel);
      try{ycEnsureRealtime()}catch{}
      await new Promise(resolve=>setTimeout(resolve,180));
      if(voiceChannel)await leaveVoiceChannel(true);
      await joinVoiceChannel(channel);
      const ok=String(voiceChannel?.id||'')===String(channel.id);
      if(ok){ycIosVoiceSaveTarget(voiceChannel);return true}
      toast('Hlas se po návratu nepodařilo automaticky obnovit. Klepni znovu na hlasový kanál.',true);
      return false;
    }catch(error){
      console.warn('iOS PWA voice resume reconnect',error);
      toast('Hlas se po návratu nepodařilo obnovit.',true);
      return false;
    }finally{
      ycIosVoiceReconnectBusy=false;
      ycIosVoiceReconnectPromise=null;
      ycIosVoiceHiddenAt=0;
    }
  })();
  return ycIosVoiceReconnectPromise;
}
const ycIosVoiceJoinBase=joinVoiceChannel;
joinVoiceChannel=async function(...args){
  const result=await ycIosVoiceJoinBase.apply(this,args);
  if(ycWebIsIosPwa()&&voiceChannel)ycIosVoiceSaveTarget(voiceChannel);
  return result;
};
const ycIosVoiceLeaveBase=leaveVoiceChannel;
leaveVoiceChannel=async function(...args){
  const result=await ycIosVoiceLeaveBase.apply(this,args);
  if(ycWebIsIosPwa()&&!ycIosVoiceReconnectBusy&&!voiceChannel)ycIosVoiceClearTarget();
  return result;
};
document.addEventListener('visibilitychange',()=>{
  if(!ycWebIsIosPwa())return;
  if(document.hidden){ycIosVoiceHiddenAt=Date.now();if(voiceChannel)ycIosVoiceSaveTarget(voiceChannel);return}
  setTimeout(()=>void ycIosVoiceReconnect('visibility'),220);
});
window.addEventListener('pageshow',()=>{if(ycWebIsIosPwa())setTimeout(()=>void ycIosVoiceReconnect('pageshow'),260)});
window.addEventListener('focus',()=>{if(ycWebIsIosPwa())setTimeout(()=>void ycIosVoiceReconnect('focus'),320)});
window.addEventListener('online',()=>{if(ycWebIsIosPwa())setTimeout(()=>void ycIosVoiceReconnect('online'),420)});
ycOnLifecycle('community',()=>{if(ycWebIsIosPwa())setTimeout(()=>void ycIosVoiceReconnect('community'),500)});
ycOnLifecycle('beforeAuth',()=>{if(ycWebIsIosPwa())ycIosVoiceClearTarget()});
async function ycWebSyncWakeLock(){if(!('wakeLock' in navigator))return;const needed=!!voiceChannel&&document.visibilityState==='visible';if(!needed){if(ycWebWakeLock){const lock=ycWebWakeLock;ycWebWakeLock=null;await lock.release().catch(()=>{})}return}if(ycWebWakeLock||ycWebWakePending)return;ycWebWakePending=true;try{const lock=await navigator.wakeLock.request('screen');ycWebWakeLock=lock;lock.addEventListener('release',()=>{if(ycWebWakeLock===lock)ycWebWakeLock=null});if(!voiceChannel||document.visibilityState!=='visible'){ycWebWakeLock=null;await lock.release()}}catch{}finally{ycWebWakePending=false}}
document.addEventListener('visibilitychange',()=>void ycWebSyncWakeLock());
setInterval(()=>{void ycWebSyncWakeLock();const count=window.__ycDesktopState?.().notificationUnreadCount||0;document.title=(count?'('+count+') ':'')+'Yamachat';try{if(count)navigator.setAppBadge?.(count)?.catch(()=>{});else navigator.clearAppBadge?.()?.catch(()=>{})}catch{}},3000);
window.addEventListener('beforeunload',event=>{if(voiceChannel||screenShareActive){event.preventDefault();event.returnValue=''}});
ycOnLifecycle('beforeAuth',()=>{void ycWebSyncWakeLock();navigator.clearAppBadge?.()?.catch(()=>{})});
const ycWebInstallButton=document.createElement('button');ycWebInstallButton.type='button';ycWebInstallButton.className='ghost';ycWebInstallButton.dataset.ycWebInstall='';ycWebInstallButton.style.cssText='width:100%;margin-top:12px';ycWebInstallButton.textContent='Nainstalovat Yamachat';ycWebInstallButton.onclick=()=>void ycWebInstall();document.querySelector('.auth-card')?.appendChild(ycWebInstallButton);ycWebSyncInstallButtons();
