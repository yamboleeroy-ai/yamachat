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

async function pushHandler(req:Request){
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:CORS})
  try{
    if(req.method==='GET'){const cfg=await runtimeConfig();return json({ok:true,vapidPublicKey:cfg.vapid_public,androidFcmConfigured:!!(Deno.env.get('YAMACHAT_FCM_SERVICE_ACCOUNT_JSON')||cfg.fcm_service_account)})}
    if(req.method!=='POST')return json({error:'method-not-allowed'},405)
    const body=await req.json().catch(()=>({})),action=String(body?.action||'')
    if(action==='register'){
      const user=await requestUser(req);if(!user)return json({error:'unauthorized'},401)
      const transport=String(body.transport||''),platform=String(body.platform||'')
      if(!['webpush','fcm','apns'].includes(transport)||!['web','pwa-ios','android','ios-native','desktop'].includes(platform))return json({error:'bad-registration'},400)
      if(transport==='webpush'){
        const endpoint=String(body.endpoint||'').trim(),p256dh=String(body.keys?.p256dh||'').trim(),auth=String(body.keys?.auth||'').trim()
        if(!endpoint.startsWith('https://')||!p256dh||!auth)return json({error:'bad-web-subscription'},400)
        await admin.from('push_subscriptions').delete().eq('endpoint',endpoint)
        const {error}=await admin.from('push_subscriptions').insert({user_id:user.id,transport,platform,endpoint,p256dh,auth,user_agent:String(body.userAgent||'').slice(0,500),active:true,last_seen_at:new Date().toISOString()})
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
      for(const row of rows||[]){const result=row.transport==='webpush'?await webPush(row,ctx,cfg):row.transport==='fcm'?await fcmPush(row,ctx,cfg):{ok:false,blocked:'apns-not-configured'};if(result.ok)delivered++;else if('blocked'in result)blocked++;else failed++}
      return json({ok:true,subscriptions:(rows||[]).length,delivered,blocked,failed})
    }
    return json({error:'unknown-action'},400)
  }catch(e){console.error('yamachat push',e);return json({error:'push-failed'},500)}
}

Deno.serve(async(req:Request)=>{
  const incoming=new URL(req.url)
  if(incoming.pathname.endsWith(PUSH_ROUTE)||incoming.pathname.endsWith('/push'))return pushHandler(req)
  const headers={...CORS,'Access-Control-Allow-Methods':'GET, OPTIONS'}
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers})
  try{
    const upstream=new URL(SOURCE);for(const [k,v] of incoming.searchParams)upstream.searchParams.set(k,v)
    const r=await fetch(upstream,{cache:'no-store'}),body=await r.arrayBuffer()
    if(!r.ok)throw new Error('canonical web HTTP '+r.status)
    return new Response(body,{status:200,headers:{...headers,'Content-Type':r.headers.get('content-type')||'text/html; charset=utf-8','X-Yamachat-Version':'web-canonical-v3.0.25-desktop-parity','X-Yamachat-Upstream':'yamachat-web-v16-1-test'}})
  }catch(e){return new Response('Yamachat web unavailable: '+(e instanceof Error?e.message:String(e)),{status:502,headers:{...headers,'Content-Type':'text/plain; charset=utf-8'}})}
})