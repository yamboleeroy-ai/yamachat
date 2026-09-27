
// Mobile long-press + notification preferences.
const YC_CONTEXT_LONGPRESS_SELECTOR=[
 '#channelList [data-channel]',
 '#voiceChannelList .voice-channel[data-voice]',
 '.voice-user[data-user-id]',
 '#rightContent .steam-member-row[data-member-id]',
 '#rightContent .steam-friend-row[data-profile-user]',
 '.yc-dm-social-row[data-profile-user]'
].join(',');
let ycContextLongPress=null,ycContextLongPressSuppressUntil=0;

function ycCancelContextLongPress(){
 if(ycContextLongPress?.timer)clearTimeout(ycContextLongPress.timer);
 ycContextLongPress=null;
}
document.addEventListener('pointerdown',event=>{
 if(event.pointerType==='mouse'||event.button!==0||event.isPrimary===false)return;
 const target=event.target.closest?.(YC_CONTEXT_LONGPRESS_SELECTOR);if(!target)return;
 ycCancelContextLongPress();
 const state={target,pointerId:event.pointerId,x:event.clientX,y:event.clientY,opened:false,timer:null};
 state.timer=setTimeout(()=>{
  if(ycContextLongPress!==state||!target.isConnected)return;
  state.opened=true;ycContextLongPressSuppressUntil=Date.now()+900;
  try{navigator.vibrate?.(10)}catch{}
  target.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:state.x,clientY:state.y,button:2,buttons:0,view:window}));
 },520);
 ycContextLongPress=state;
},true);
document.addEventListener('pointermove',event=>{
 const p=ycContextLongPress;if(!p||event.pointerId!==p.pointerId||p.opened)return;
 if(Math.hypot(event.clientX-p.x,event.clientY-p.y)>12)ycCancelContextLongPress();
},true);
for(const type of ['pointerup','pointercancel'])document.addEventListener(type,event=>{
 if(ycContextLongPress&&event.pointerId===ycContextLongPress.pointerId)ycCancelContextLongPress();
},true);
document.addEventListener('scroll',ycCancelContextLongPress,true);
document.addEventListener('click',event=>{
 if(Date.now()>ycContextLongPressSuppressUntil||!event.target.closest?.(YC_CONTEXT_LONGPRESS_SELECTOR))return;
 event.preventDefault();event.stopImmediatePropagation();ycContextLongPressSuppressUntil=0;
},true);

const ycNotificationPrefCache=new Map();
let ycNotificationPrefsUser='',ycNotificationPrefsLoading=null;
function ycNotificationPrefKey(scopeType,scopeId){return String(scopeType)+'|'+String(scopeId||'')}
function ycNotificationCacheReset(){ycNotificationPrefCache.clear();ycNotificationPrefsUser='';ycNotificationPrefsLoading=null}
async function ycLoadNotificationPreferences(force=false){
 const uid=user?.id;if(!uid){ycNotificationCacheReset();return ycNotificationPrefCache}
 if(!force&&ycNotificationPrefsUser===uid)return ycNotificationPrefCache;
 if(ycNotificationPrefsLoading)return ycNotificationPrefsLoading;
 ycNotificationPrefsLoading=(async()=>{
  const {data,error}=await sb.from('notification_preferences').select('scope_type,scope_id,enabled').eq('user_id',uid);
  if(error)throw error;
  ycNotificationPrefCache.clear();
  for(const row of data||[])ycNotificationPrefCache.set(ycNotificationPrefKey(row.scope_type,row.scope_id),!!row.enabled);
  ycNotificationPrefsUser=uid;return ycNotificationPrefCache;
 })().catch(error=>{console.warn('notification preferences',error);return ycNotificationPrefCache}).finally(()=>{ycNotificationPrefsLoading=null});
 return ycNotificationPrefsLoading;
}
function ycNotificationDirect(scopeType,scopeId){
 const key=ycNotificationPrefKey(scopeType,scopeId);
 return ycNotificationPrefCache.has(key)?ycNotificationPrefCache.get(key):null;
}
async function ycNotificationEffective(scopeType,scopeId,{serverId=''}={}){
 await ycLoadNotificationPreferences();
 if(scopeType==='user'){
  const direct=ycNotificationDirect('user',scopeId);return direct===null?true:direct;
 }
 if(scopeType==='channel'){
  const direct=ycNotificationDirect('channel',scopeId);if(direct!==null)return direct;
  if(serverId){const server=ycNotificationDirect('server',serverId);if(server!==null)return server}
  return true;
 }
 if(scopeType==='server'){
  const direct=ycNotificationDirect('server',scopeId);return direct===null?true:direct;
 }
 return true;
}
async function ycSetNotificationPreference(scopeType,scopeId,enabled){
 if(!user?.id||!scopeId)return false;
 const row={user_id:user.id,scope_type:String(scopeType),scope_id:String(scopeId),enabled:!!enabled,updated_at:new Date().toISOString()};
 const {error}=await sb.from('notification_preferences').upsert(row,{onConflict:'user_id,scope_type,scope_id'});
 if(error){toast('Nastavení oznámení: '+error.message,true);return false}
 ycNotificationPrefCache.set(ycNotificationPrefKey(scopeType,scopeId),!!enabled);ycNotificationPrefsUser=user.id;
 toast(enabled?'Oznámení zapnuta.':'Oznámení vypnuta.');return true;
}
async function ycResetNotificationPreference(scopeType,scopeId){
 if(!user?.id||!scopeId)return false;
 const {error}=await sb.from('notification_preferences').delete().eq('user_id',user.id).eq('scope_type',scopeType).eq('scope_id',scopeId);
 if(error){toast('Nastavení oznámení: '+error.message,true);return false}
 ycNotificationPrefCache.delete(ycNotificationPrefKey(scopeType,scopeId));ycNotificationPrefsUser=user.id;
 toast('Obnoveno výchozí nastavení oznámení.');return true;
}
async function ycNotificationMenuItems(scopeType,scopeId,label,{serverId=''}={}){
 if(!scopeId||!user?.id)return[];
 await ycLoadNotificationPreferences();
 const direct=ycNotificationDirect(scopeType,scopeId),effective=await ycNotificationEffective(scopeType,scopeId,{serverId});
 const items=[{
  id:'notification-'+scopeType,
  icon:effective?'🔕':'🔔',
  label:effective?'Vypnout oznámení '+label:'Zapnout oznámení '+label,
  hint:direct===null?(scopeType==='channel'&&serverId?'Dědí ze serveru':'Výchozí'):direct?'Zapnuto':'Vypnuto',
  action:()=>ycSetNotificationPreference(scopeType,scopeId,!effective)
 }];
 if(direct!==null&&scopeType!=='server')items.push({
  id:'notification-'+scopeType+'-reset',icon:'↺',
  label:scopeType==='channel'?'Použít nastavení serveru':'Použít výchozí nastavení',
  action:()=>ycResetNotificationPreference(scopeType,scopeId)
 });
 return items;
}
async function ycShouldNotifyMessage(message,channel=null){
 const m=message||{};if(!user?.id||!m.author_id||String(m.author_id)===String(user.id))return false;
 await ycLoadNotificationPreferences();
 const userPref=ycNotificationDirect('user',m.author_id);if(userPref!==null)return userPref;
 if(m.channel_id){
  let ch=channel;
  if(!ch||String(ch.id)!==String(m.channel_id)){
   try{const {data}=await sb.from('channels').select('id,community_id').eq('id',m.channel_id).maybeSingle();ch=data||null}catch{}
  }
  const channelPref=ycNotificationDirect('channel',m.channel_id);if(channelPref!==null)return channelPref;
  if(ch?.community_id){const serverPref=ycNotificationDirect('server',ch.community_id);if(serverPref!==null)return serverPref}
 }
 return true;
}
async function ycBindVoiceNotificationButton(uid,name,x,y){
 const menu=$('voiceUserContextMenu');if(!menu||!uid||String(uid)===String(user?.id))return;
 const items=await ycNotificationMenuItems('user',uid,'od uživatele');if(!menu.isConnected||voiceContextUser!==uid||!items.length)return;
 let btn=menu.querySelector('[data-yc-notification-user]');
 if(!btn){btn=document.createElement('button');btn.type='button';btn.className='voice-user-menu-row';btn.dataset.ycNotificationUser=uid;menu.appendChild(btn)}
 const primary=items[0];btn.textContent=primary.icon+' '+primary.label;
 btn.onclick=async()=>{closeVoiceUserMenu();if(await ycSetNotificationPreference('user',uid,!await ycNotificationEffective('user',uid)))openVoiceUserMenu(uid,name,x,y)};
 const resetExisting=menu.querySelector('[data-yc-notification-user-reset]');resetExisting?.remove();
 if(items.length>1){
  const reset=document.createElement('button');reset.type='button';reset.className='voice-user-menu-row secondary';reset.dataset.ycNotificationUserReset=uid;reset.textContent='↺ Použít výchozí nastavení';
  reset.onclick=async()=>{closeVoiceUserMenu();if(await ycResetNotificationPreference('user',uid))openVoiceUserMenu(uid,name,x,y)};
  menu.appendChild(reset);
 }
 menu.style.top=Math.max(8,Math.min(parseFloat(menu.style.top)||8,innerHeight-menu.offsetHeight-8))+'px';
}
const ycNotificationBaseVoiceUserMenu=openVoiceUserMenu;
openVoiceUserMenu=function(uid,name,x,y){
 const out=ycNotificationBaseVoiceUserMenu.call(this,uid,name,x,y);
 void ycBindVoiceNotificationButton(uid,name,x,y);
 return out;
};

ycOnLifecycle('init',()=>{void ycLoadNotificationPreferences(true)});
ycOnLifecycle('beforeAuth',ycNotificationCacheReset);
window.YamachatNotificationPreferences={
 reload:()=>ycLoadNotificationPreferences(true),
 effective:ycNotificationEffective,
 set:ycSetNotificationPreference,
 reset:ycResetNotificationPreference
};
