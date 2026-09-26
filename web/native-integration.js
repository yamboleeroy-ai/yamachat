if(window.Capacitor?.isNativePlatform?.()){
 ycAppSettingsSections.delete('web');
 ycWinPermission=async()=>await window.ycNativeNotificationPermission?.()||false;
 window.yamachatDesktop.showNotification=async payload=>await window.ycNativeShowNotification?.(payload)||false;
 const ycNativePushStatus={text:'',token:''};
 async function ycNativeRegisterPushToken(token,platform){
  try{
   const value=String(token||'').trim();if(!value)return false;
   const {data}=await sb.auth.getSession();const access=data?.session?.access_token;if(!access)return false;
   const transport=platform==='android'?'fcm':'apns';
   const res=await fetch(YC_PUSH_API,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+access},body:JSON.stringify({action:'register',transport,platform:platform==='android'?'android':'ios-native',token:value,userAgent:navigator.userAgent})});
   if(!res.ok)throw new Error('Push registrace '+res.status);
   ycNativePushStatus.token=value;
   ycNativePushStatus.text=platform==='android'?'Android push token je registrovaný.':'iOS push token je registrovaný.';
   return true
  }catch(e){console.warn('native push registration',e);ycNativePushStatus.text='Push token se nepodařilo uložit.';return false}
 }
 window.addEventListener('yamachat:native-push-token',e=>{const d=e.detail||{};void ycNativeRegisterPushToken(d.token,d.platform)});
 window.addEventListener('yamachat:native-push-action',e=>{const n=e.detail?.notification||e.detail||{},target=n.data?.target||n.data||n.extra||{};void window.ycOpenDesktopNotificationTarget?.(target)});
 ycOnLifecycle('init',()=>{const token=window.__ycNativePushToken;if(token)setTimeout(()=>void ycNativeRegisterPushToken(token,window.__YAMACHAT_MOBILE__?.platform||'android'),700)});
 ycRegisterAppSettingsSection({
  id:'native',title:'Telefon a oznámení',
  description:'Yamachat systémová oznámení s logem a otevřením přímo do zprávy.',
  render:()=>'<button type="button" class="ghost" id="ycNativeAllowNotify">Povolit / obnovit oznámení</button><p id="ycNativeNotifyStatus" role="status">'+esc(ycNativePushStatus.text||'Oznámení zatím nejsou ověřená.')+'</p><p>Android používá Yamachat notification channel a vlastní zvuk. Po kliknutí se otevře správná DM nebo kanál. iOS PWA používá Web Push se systémovým zvukem iOS.</p>',
  bind:root=>{root.querySelector('#ycNativeAllowNotify').onclick=async()=>{const b=root.querySelector('#ycNativeAllowNotify'),st=root.querySelector('#ycNativeNotifyStatus');b.disabled=true;const result=await window.ycNativeRequestNotifications?.();if(result?.token)await ycNativeRegisterPushToken(result.token,window.__YAMACHAT_MOBILE__?.platform||'android');st.textContent=result?.granted?(ycNativePushStatus.text||'Oznámení jsou povolená.'):'Oznámení povol v systémovém nastavení aplikace.';b.disabled=false}}
 });
}
