import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2.57.4'
import { sendPushNotification } from 'npm:@mmmike/web-push@1.3.0/send'

const SOURCE='https://bxjvmjdppmqgbxfcowpf.supabase.co/functions/v1/yamachat-web-v16-1-test'
const PUSH_ROUTE='/yamachat-source/push'
const CORS={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type, x-yamachat-push-secret','Cache-Control':'no-store, max-age=0'}

function adminKey(){const modern=Deno.env.get('SUPABASE_SECRET_KEYS');if(modern){try{const x=JSON.parse(modern);return x.default||Object.values(x)[0]||''}catch{}}return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||''}
const admin=createClient(Deno.env.get('SUPABASE_URL')||'',adminKey(),{auth:{persistSession:false,autoRefreshToken:false}})
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...CORS,'Content-Type':'application/json'}})
async function runtimeConfig(){const {data,error}=await admin.rpc('yc_push_runtime_config');if(error)throw error;return data as any}
function bearer(req:Request){const h=req.headers.get('authorization')||'';return h.toLowerCase().startsWith('bearer ')?h.slice(7).trim():''}
async function requestUser(req:Request){const token=bearer(req);if(!token)return null;const {data,error}=await admin.auth.getUser(token);return error?null:data.user}
function cleanTarget(c:any){return{messageId:String(c.messageId||''),channelId:String(c.channelId||''),threadId:String(c.threadId||''),communityId:String(c.communityId||'')}}

async function webPush(row:any,c:any,cfg:any){
  try{
    await sendPushNotification(
      {endpoint:row.endpoint,keys:{p256dh:row.p256dh,auth:row.auth}},
      {
        title:'Yamachat · '+String(c.sender||'Nová zpráva'),
        body:[c.where,c.body].filter(Boolean).join(' · '),
        icon:'https://yamachat.eu/icons/icon-192.png',
        badge:'https://yamachat.eu/build/yamachat-logo-symbol.png',
        tag:'yamachat-msg-'+String(c.messageId||Date.now()),
        data:{target:cleanTarget(c)},
        timestamp:Date.now()
      },
      {subject:'https://yamachat.eu',publicKey:cfg.vapid_public,privateKey:cfg.vapid_private},
      {urgency:'high',TTL:86400}
    )
    return {ok:true}
  }catch(error:any){
    const status=Number(error?.statusCode||error?.status||0)
    if(status===404||status===410){await admin.from('push_subscriptions').delete().eq('id',row.id);return{ok:false,gone:true}}
    console.error('webpush',status,error?.message||error);return{ok:false,status}
  }
}

async function fcmPush(row:any,c:any,cfg:any){
  const raw=Deno.env.get('YAMACHAT_FCM_SERVICE_ACCOUNT_JSON')||String(cfg?.fcm_service_account||'')
  if(!raw)return{ok:false,blocked:'missing-fcm-service-account'}
  try{
    const credentials=JSON.parse(raw)
    const {GoogleAuth}=await import('npm:google-auth-library@10.3.0')
    const auth=new GoogleAuth({credentials,scopes:['https://www.googleapis.com/auth/firebase.messaging']})
    const client=await auth.getClient(),access=(await client.getAccessToken()).token
    if(!access)throw new Error('FCM OAuth token unavailable')
    const response=await fetch('https://fcm.googleapis.com/v1/projects/'+encodeURIComponent(credentials.project_id)+'/messages:send',{
      method:'POST',headers:{Authorization:'Bearer '+access,'Content-Type':'application/json'},
      body:JSON.stringify({message:{
        token:row.token,
        notification:{title:'Yamachat · '+String(c.sender||'Nová zpráva'),body:[c.where,c.body].filter(Boolean).join(' · '),image:'https://yamachat.eu/icons/icon-192.png'},
        data:cleanTarget(c),
        android:{priority:'high',notification:{channel_id:'yamachat-messages-v2',icon:'ic_yamachat_notification',color:'#E056FD',sound:'yamachat_message',tag:'yamachat-msg-'+String(c.messageId||Date.now()),visibility:'PRIVATE'}}
      }})
    })
    if(response.ok)return{ok:true}
    const body=await response.text()
    if(response.status===404||body.includes('UNREGISTERED')){await admin.from('push_subscriptions').delete().eq('id',row.id);return{ok:false,gone:true}}
    console.error('fcm',response.status,body.slice(0,400));return{ok:false,status:response.status}
  }catch(error:any){console.error('fcm exception',error?.message||error);return{ok:false,error:String(error?.message||error)}}
}

function wnsCredentials(cfg:any){
  return {
    tenant:String(Deno.env.get('WNS_TENANT_ID')||cfg?.wns_tenant_id||'').trim(),
    clientId:String(Deno.env.get('WNS_CLIENT_ID')||cfg?.wns_app_id||'').trim(),
    secret:String(Deno.env.get('WNS_CLIENT_SECRET')||cfg?.wns_client_secret||''),
    objectId:String(Deno.env.get('WNS_OBJECT_ID')||'').trim()
  }
}
async function wnsAccessToken(cfg:any){
  const {tenant,clientId,secret}=wnsCredentials(cfg)
  if(!tenant||!clientId||!secret)return null
  const body=new URLSearchParams({grant_type:'client_credentials',client_id:clientId,client_secret:secret,scope:'https://wns.windows.com/.default'})
  const response=await fetch('https://login.microsoftonline.com/'+encodeURIComponent(tenant)+'/oauth2/v2.0/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body})
  if(!response.ok){console.error('wns oauth',response.status);return null}
  const data=await response.json().catch(()=>({}))
  return String(data?.access_token||'')||null
}
function xmlEscape(value:any){return String(value??'').replace(/[&<>\"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&apos;'}[ch]||ch))}
function wnsLaunch(c:any){const q=new URLSearchParams(cleanTarget(c) as Record<string,string>);return 'yamachat://notification?'+q.toString()}
async function wnsPush(row:any,c:any,cfg:any){
  const access=await wnsAccessToken(cfg);if(!access)return{ok:false,blocked:'missing-wns-credential'}
  const launch=xmlEscape(wnsLaunch(c)),title=xmlEscape('Yamachat · '+String(c.sender||'Nová zpráva')),body=xmlEscape([c.where,c.body].filter(Boolean).join(' · '))
  const xml='<toast launch="'+launch+'"><visual><binding template="ToastGeneric"><text>'+title+'</text><text>'+body+'</text><image placement="appLogoOverride" hint-crop="circle" src="https://yamachat.eu/icons/icon-192.png"/></binding></visual><audio src="ms-appx:///audio/yamachat_message.mp3"/></toast>'
  try{
    const response=await fetch(String(row.endpoint||''),{method:'POST',headers:{Authorization:'Bearer '+access,'Content-Type':'text/xml','X-WNS-Type':'wns/toast','X-WNS-RequestForStatus':'true'},body:xml})
    if(response.ok)return{ok:true}
    const status=response.status;if(status===404||status===410){await admin.from('push_subscriptions').delete().eq('id',row.id);return{ok:false,gone:true}}
    console.error('wns',status,(await response.text()).slice(0,400));return{ok:false,status}
  }catch(error:any){console.error('wns exception',error?.message||error);return{ok:false,error:String(error?.message||error)}}
}

let ycTtsVoices:any[]=[],ycTtsVoicesAt=0;
const ycTtsRate=new Map<string,number[]>();
function ycSpeechConfig(){
  const key=(Deno.env.get('AZURE_SPEECH_KEY')||'').trim();
  const region=(Deno.env.get('AZURE_SPEECH_REGION')||'').trim().toLowerCase();
  return key&&/^[a-z0-9-]{2,40}$/.test(region)?{key,region}:null;
}
function ycTtsAllow(userId:string){
  const now=Date.now(),recent=(ycTtsRate.get(userId)||[]).filter(ts=>now-ts<60000);
  if(recent.length>=40){ycTtsRate.set(userId,recent);return false}
  recent.push(now);ycTtsRate.set(userId,recent);return true;
}
function ycTtsXml(value:any){return String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[ch]||ch))}
function ycTtsBase64(bytes:Uint8Array){let out='';for(let i=0;i<bytes.length;i+=32768)out+=String.fromCharCode(...bytes.subarray(i,Math.min(bytes.length,i+32768)));return btoa(out)}
async function ycAzureVoices(cfg:{key:string,region:string}){
  if(ycTtsVoices.length&&Date.now()-ycTtsVoicesAt<900000)return ycTtsVoices;
  const r=await fetch('https://'+cfg.region+'.tts.speech.microsoft.com/cognitiveservices/voices/list',{headers:{'Ocp-Apim-Subscription-Key':cfg.key}});
  if(!r.ok)throw new Error('azure-voices-http-'+r.status);
  const raw=await r.json();
  ycTtsVoices=(Array.isArray(raw)?raw:[]).filter((v:any)=>String(v?.VoiceType||'').toLowerCase()==='neural').map((v:any)=>({
    shortName:String(v.ShortName||''),displayName:String(v.DisplayName||v.LocalName||v.ShortName||''),localName:String(v.LocalName||v.DisplayName||v.ShortName||''),
    gender:String(v.Gender||''),locale:String(v.Locale||''),localeName:String(v.LocaleName||''),voiceType:String(v.VoiceType||''),status:String(v.Status||'')
  })).filter((v:any)=>v.shortName&&v.locale);
  ycTtsVoicesAt=Date.now();return ycTtsVoices;
}
async function ttsHandler(req:Request){
  try{
    const user=await requestUser(req);if(!user)return json({error:'unauthorized'},401);
    const cfg=ycSpeechConfig();if(!cfg)return json({configured:false,error:'azure-speech-not-configured'},503);
    const body=await req.json().catch(()=>({})),action=String(body?.action||'');
    if(action==='tts-voices'){
      return json({configured:true,provider:'microsoft-azure-speech',voices:await ycAzureVoices(cfg)});
    }
    if(action==='tts-synthesize'){
      if(!ycTtsAllow(user.id))return json({error:'rate-limit'},429);
      const text=String(body?.text||'').trim(),voice=String(body?.voice||'').trim();
      if(!text||text.length>220)return json({error:'invalid-text'},400);
      if(!/^[a-z]{2}-[A-Z]{2}-[A-Za-z0-9:-]{3,100}$/.test(voice))return json({error:'invalid-voice'},400);
      const locale=/^[a-z]{2}-[A-Z]{2}/.exec(voice)?.[0]||'cs-CZ';
      const ssml='<speak version="1.0" xml:lang="'+ycTtsXml(locale)+'"><voice name="'+ycTtsXml(voice)+'">'+ycTtsXml(text)+'</voice></speak>';
      const r=await fetch('https://'+cfg.region+'.tts.speech.microsoft.com/cognitiveservices/v1',{method:'POST',headers:{
        'Ocp-Apim-Subscription-Key':cfg.key,'Content-Type':'application/ssml+xml','X-Microsoft-OutputFormat':'audio-24khz-96kbitrate-mono-mp3','User-Agent':'Yamachat'
      },body:ssml});
      if(!r.ok){console.error('azure tts',r.status,(await r.text()).slice(0,300));return json({error:'azure-synthesis-failed',status:r.status},502)}
      const bytes=new Uint8Array(await r.arrayBuffer());
      return json({configured:true,provider:'microsoft-azure-speech',voice,mimeType:'audio/mpeg',audioBase64:ycTtsBase64(bytes)});
    }
    return json({error:'unknown-tts-action'},400);
  }catch(e){console.error('yamachat tts',e);return json({error:'tts-failed',detail:e instanceof Error?e.message:String(e)},500)}
}

async function pushHandler(req:Request){
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:CORS})
  try{
    if(req.method==='GET'){const cfg=await runtimeConfig(),wns=wnsCredentials(cfg);return json({ok:true,vapidPublicKey:cfg.vapid_public,androidFcmConfigured:!!(Deno.env.get('YAMACHAT_FCM_SERVICE_ACCOUNT_JSON')||cfg.fcm_service_account),windowsWnsConfigured:!!(wns.tenant&&wns.clientId&&wns.secret),windowsWnsObjectConfigured:!!wns.objectId})}
    if(req.method!=='POST')return json({error:'method-not-allowed'},405)
    const body=await req.json().catch(()=>({})),action=String(body?.action||'')
    if(action==='register'){
      const user=await requestUser(req);if(!user)return json({error:'unauthorized'},401)
      const transport=String(body.transport||''),platform=String(body.platform||'')
      if(!['webpush','fcm','apns','wns'].includes(transport)||!['web','pwa-ios','android','ios-native','desktop'].includes(platform))return json({error:'bad-registration'},400)
      if(transport==='webpush'){
        const endpoint=String(body.endpoint||'').trim(),p256dh=String(body.keys?.p256dh||'').trim(),auth=String(body.keys?.auth||'').trim()
        if(!endpoint.startsWith('https://')||!p256dh||!auth)return json({error:'bad-web-subscription'},400)
        await admin.from('push_subscriptions').delete().eq('endpoint',endpoint)
        const {error}=await admin.from('push_subscriptions').insert({user_id:user.id,transport,platform,endpoint,p256dh,auth,user_agent:String(body.userAgent||'').slice(0,500),active:true,last_seen_at:new Date().toISOString()})
        if(error)throw error;return json({ok:true})
      }
      if(transport==='wns'){
        const endpoint=String(body.endpoint||'').trim();let endpointUrl:URL
        try{endpointUrl=new URL(endpoint)}catch{return json({error:'bad-wns-channel'},400)}
        if(endpointUrl.protocol!=='https:'||!/(^|\.)notify\.windows\.com$/i.test(endpointUrl.hostname))return json({error:'bad-wns-channel'},400)
        await admin.from('push_subscriptions').delete().eq('user_id',user.id).eq('transport','wns').eq('platform','desktop')
        const {error}=await admin.from('push_subscriptions').insert({user_id:user.id,transport,platform,endpoint,user_agent:String(body.userAgent||'').slice(0,500),active:true,last_seen_at:new Date().toISOString()})
        if(error)throw error;return json({ok:true})
      }
      const token=String(body.token||'').trim();if(!token)return json({error:'missing-token'},400)
      await admin.from('push_subscriptions').delete().eq('token',token)
      const {error}=await admin.from('push_subscriptions').insert({user_id:user.id,transport,platform,token,user_agent:String(body.userAgent||'').slice(0,500),active:true,last_seen_at:new Date().toISOString()})
      if(error)throw error;return json({ok:true})
    }
    if(action==='unregister'){
      const user=await requestUser(req);if(!user)return json({error:'unauthorized'},401)
      const endpoint=String(body.endpoint||'').trim(),token=String(body.token||'').trim();let q=admin.from('push_subscriptions').delete().eq('user_id',user.id)
      if(endpoint)q=q.eq('endpoint',endpoint);else if(token)q=q.eq('token',token);else return json({error:'missing-target'},400)
      const {error}=await q;if(error)throw error;return json({ok:true})
    }
    if(action==='message_insert'){
      const cfg=await runtimeConfig();if((req.headers.get('x-yamachat-push-secret')||'')!==cfg.internal_secret)return json({error:'unauthorized'},401)
      const messageId=String(body.message_id||'');if(!messageId)return json({error:'missing-message'},400)
      const {data:ctx,error:ctxError}=await admin.rpc('yc_push_message_context',{p_message_id:messageId});if(ctxError)throw ctxError;if(!ctx)return json({ok:true,skipped:'no-context'})
      const ids=Array.isArray(ctx.recipientIds)?ctx.recipientIds:[];if(!ids.length)return json({ok:true,delivered:0})
      const {data:rows,error}=await admin.from('push_subscriptions').select('*').in('user_id',ids).eq('active',true);if(error)throw error
      let delivered=0,blocked=0,failed=0
      for(const row of rows||[]){const result=row.transport==='webpush'?await webPush(row,ctx,cfg):row.transport==='fcm'?await fcmPush(row,ctx,cfg):row.transport==='wns'?await wnsPush(row,ctx,cfg):{ok:false,blocked:'apns-not-configured'};if(result.ok)delivered++;else if('blocked'in result)blocked++;else failed++}
      return json({ok:true,subscriptions:(rows||[]).length,delivered,blocked,failed})
    }
    return json({error:'unknown-action'},400)
  }catch(e){console.error('yamachat push',e);return json({error:'push-failed'},500)}
}

Deno.serve(async(req:Request)=>{
  const incoming=new URL(req.url)
  if(incoming.pathname.endsWith(PUSH_ROUTE)||incoming.pathname.endsWith('/push'))return pushHandler(req)
  if(req.method==='POST'&&incoming.pathname.endsWith('/yamachat-source'))return ttsHandler(req)
  const headers={...CORS,'Access-Control-Allow-Methods':'GET, OPTIONS'}
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers})
  try{
    const upstream=new URL(SOURCE);for(const [k,v] of incoming.searchParams)upstream.searchParams.set(k,v)
    const r=await fetch(upstream,{cache:'no-store'}),body=await r.arrayBuffer()
    if(!r.ok)throw new Error('canonical web HTTP '+r.status)
    return new Response(body,{status:200,headers:{...headers,'Content-Type':r.headers.get('content-type')||'text/html; charset=utf-8','X-Yamachat-Version':'web-canonical-v3.0.25-desktop-parity','X-Yamachat-Upstream':'yamachat-web-v16-1-test'}})
  }catch(e){return new Response('Yamachat web unavailable: '+(e instanceof Error?e.message:String(e)),{status:502,headers:{...headers,'Content-Type':'text/plain; charset=utf-8'}})}
})