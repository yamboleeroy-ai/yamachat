export function withWindowsWnsClient(html){
  if(html.includes('ycRegisterWindowsWnsPush')) return html;
  const marker="// keep speaking indicator alive after microphone restart";
  if(!html.includes(marker)) throw new Error('Windows WNS client insertion boundary missing');

  const patch=String.raw`
let ycWnsRegistering=false,ycWnsLastRegisteredAt=0;
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

async function ycRegisterWindowsWnsPush(force=false){
  if(!user?.id||ycWnsRegistering)return false;
  if(!force&&window.__ycWnsActive&&Date.now()-ycWnsLastRegisteredAt<6*60*60*1000)return true;
  ycWnsRegistering=true;
  try{
    const channel=await ycWnsDesktopRequest('get-wns-channel');
    if(!channel?.ok||!/^https:\/\//i.test(String(channel.channelUri||''))){
      window.__ycWnsActive=false;
      return false;
    }
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
    window.__ycWnsActive=true;
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

ycOnLifecycle('init',()=>setTimeout(()=>void ycRegisterWindowsWnsPush(true),900));
ycOnLifecycle('beforeAuth',()=>{window.__ycWnsActive=false;ycWnsLastRegisteredAt=0});
window.addEventListener('online',()=>setTimeout(()=>void ycRegisterWindowsWnsPush(false),1200));
setInterval(()=>{if(user?.id)void ycRegisterWindowsWnsPush(false)},60*60*1000);
`;

  html=html.replace(marker,patch+"\n\n"+marker);

  const notifyGuard="  if(typeof ycPresencePreference==='function'&&ycPresencePreference()==='dnd')return";
  if(!html.includes(notifyGuard)) throw new Error('Windows notification WNS dedupe boundary missing');
  html=html.replace(notifyGuard,notifyGuard+"\n  if(window.__ycWnsActive===true)return");

  return html;
}
