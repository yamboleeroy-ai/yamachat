export function withWindowsWnsClient(html){
  if(html.includes('ycRegisterWindowsWnsPush')) return html;
  const marker="// keep speaking indicator alive after microphone restart";
  if(!html.includes(marker)) throw new Error('Windows WNS client insertion boundary missing');

  const patch=String.raw`
let ycWnsRegistering=false,ycWnsLastRegisteredAt=0,ycWnsEndpoint='',ycWnsGeneration=0;
window.__ycWnsActive=false;

function ycWnsDesktopRequest(action){
  return new Promise((resolve,reject)=>{
    const requestId='yc-wns-'+Date.now()+'-'+Math.random().toString(36).slice(2);
    const timer=setTimeout(()=>{window.removeEventListener('message',onMessage);reject(new Error('WNS desktop request timeout'))},95000);
    const onMessage=(event)=>{
      if(event.source!==window.parent)return;
      const data=event.data||{};
      if(data.type!=='yamachat:desktop-response'||data.requestId!==requestId)return;
      clearTimeout(timer);window.removeEventListener('message',onMessage);
      if(data.ok)resolve(data.result||{});else reject(new Error(data.error||'WNS desktop request failed'));
    };
    window.addEventListener('message',onMessage);
    window.parent?.postMessage({type:'yamachat:desktop-request',requestId,action},'*');
  });
}

async function ycWnsUnregisterEndpoint(endpoint,access){
  const value=String(endpoint||'').trim();if(!value||!access)return false;
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),3000);
  try{const response=await fetch(SUPABASE_URL+'/functions/v1/yamachat-source/push',{method:'POST',signal:controller.signal,headers:{'Content-Type':'application/json','Authorization':'Bearer '+access,'apikey':SUPABASE_KEY},body:JSON.stringify({action:'unregister',endpoint:value})});return response.ok}
  catch(e){if(e?.name!=='AbortError')console.warn('Windows WNS detach',e);return false}
  finally{clearTimeout(timer)}
}
async function ycRegisterWindowsWnsPush(force=false){
  if(!user?.id||ycWnsRegistering)return false;
  if(!force&&window.__ycWnsActive&&Date.now()-ycWnsLastRegisteredAt<6*60*60*1000)return true;
  const ownerId=String(user.id),generation=ycWnsGeneration;
  ycWnsRegistering=true;
  try{
    const channel=await ycWnsDesktopRequest('get-wns-channel');
    if(!channel?.ok||!/^https:\/\//i.test(String(channel.channelUri||''))){
      window.__ycWnsActive=false;
      return false;
    }
    if(generation!==ycWnsGeneration||String(user?.id||'')!==ownerId)return false;
    const {data}=await sb.auth.getSession();
    const token=data?.session?.access_token||'';
    if(!token){window.__ycWnsActive=false;return false;}
    const response=await fetch(SUPABASE_URL+'/functions/v1/yamachat-source/push',{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+token,'apikey':SUPABASE_KEY},
      body:JSON.stringify({
        action:'register',
        transport:'wns',
        platform:'desktop',
        endpoint:String(channel.channelUri),
        expiresAt:String(channel.expiresAt||''),
        userAgent:navigator.userAgent
      })
    });
    if(!response.ok)throw new Error('WNS subscription HTTP '+response.status);
    const endpoint=String(channel.channelUri);
    if(generation!==ycWnsGeneration||String(user?.id||'')!==ownerId){await ycWnsUnregisterEndpoint(endpoint,token);return false}
    ycWnsEndpoint=endpoint;window.__ycWnsActive=true;
    ycWnsLastRegisteredAt=Date.now();
    return true;
  }catch(e){
    window.__ycWnsActive=false;
    console.warn('Windows WNS registration',e);
    return false;
  }finally{
    ycWnsRegistering=false;
  }
}
async function ycDetachWindowsWnsPush(){
  ++ycWnsGeneration;
  const endpoint=ycWnsEndpoint;ycWnsEndpoint='';window.__ycWnsActive=false;ycWnsLastRegisteredAt=0;
  if(!endpoint)return false;
  try{const {data}=await sb.auth.getSession(),access=data?.session?.access_token;if(!access)return false;return await ycWnsUnregisterEndpoint(endpoint,access)}catch{return false}
}
const ycPreviousPushDetach=window.ycDetachPushBeforeLogout;
window.ycDetachPushBeforeLogout=async()=>{try{await ycPreviousPushDetach?.()}catch{};await ycDetachWindowsWnsPush()};

ycOnLifecycle('init',()=>setTimeout(()=>void ycRegisterWindowsWnsPush(true),900));
ycOnLifecycle('beforeAuth',()=>{ycWnsGeneration++;ycWnsEndpoint='';window.__ycWnsActive=false;ycWnsLastRegisteredAt=0});
window.addEventListener('online',()=>setTimeout(()=>void ycRegisterWindowsWnsPush(false),1200));
setInterval(()=>{if(user?.id)void ycRegisterWindowsWnsPush(false)},60*60*1000);
`;

  html=html.replace(marker,patch+"\n\n"+marker);

  const notifyGuard="  if(typeof ycPresencePreference==='function'&&ycPresencePreference()==='dnd')return";
  if(!html.includes(notifyGuard)) throw new Error('Windows notification WNS dedupe boundary missing');
  html=html.replace(notifyGuard,notifyGuard+"\n  if(window.__ycWnsActive===true)return");

  const unsafeJump=String.raw`async function ycWinJumpToMessage(messageId){
 const id=String(messageId||'');if(!id)return false
 for(let i=0;i<12;i++){
  const row=document.querySelector('[data-message-id="'+CSS.escape(id)+'"]')
  if(row){row.scrollIntoView({behavior:'smooth',block:'center'});row.classList.add('yc-notification-jump');setTimeout(()=>row.classList.remove('yc-notification-jump'),1800);return true}
  await new Promise(r=>setTimeout(r,80))
 }
 return false
}`;
  const safeJump=String.raw`function ycWinResetRootScroll(){
 try{
  if(document.scrollingElement)document.scrollingElement.scrollTop=0
  document.documentElement.scrollTop=0
  document.body.scrollTop=0
 }catch{}
}
function ycWinScrollMessageRow(row){
 const scroller=document.getElementById('messages')
 if(!row||!scroller||!scroller.contains(row))return false
 try{
  const sr=scroller.getBoundingClientRect(),rr=row.getBoundingClientRect()
  const max=Math.max(0,scroller.scrollHeight-scroller.clientHeight)
  const delta=((rr.top+rr.bottom)-(sr.top+sr.bottom))/2
  const next=Math.max(0,Math.min(max,scroller.scrollTop+delta))
  scroller.scrollTo({top:next,behavior:'smooth'})
  ycWinResetRootScroll()
  return true
 }catch{return false}
}
async function ycWinJumpToMessage(messageId){
 const id=String(messageId||'');if(!id)return false
 ycWinResetRootScroll()
 for(let i=0;i<12;i++){
  const row=document.querySelector('[data-message-id="'+CSS.escape(id)+'"]')
  if(row){ycWinScrollMessageRow(row);row.classList.add('yc-notification-jump');setTimeout(()=>row.classList.remove('yc-notification-jump'),1800);ycWinResetRootScroll();return true}
  await new Promise(r=>setTimeout(r,80))
 }
 ycWinResetRootScroll()
 return false
}`;
  if(!html.includes(unsafeJump)) throw new Error('Windows notification jump boundary missing');
  html=html.replace(unsafeJump,safeJump);

  return html;
}
