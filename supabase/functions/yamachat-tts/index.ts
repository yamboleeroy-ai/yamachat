import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

const CORS={
  'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Methods':'POST, OPTIONS',
  'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type',
  'Cache-Control':'no-store, max-age=0'
}

const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...CORS,'Content-Type':'application/json'}})
const voiceCache:{at:number,voices:any[]}|null=null
let cachedVoices:any[]=[]
let cachedVoicesAt=0
const perUser=new Map<string,number[]>()

function speechConfig(){
  const key=(Deno.env.get('AZURE_SPEECH_KEY')||'').trim()
  const region=(Deno.env.get('AZURE_SPEECH_REGION')||'').trim().toLowerCase()
  if(!key||!/^[a-z0-9-]{2,40}$/.test(region))return null
  return {key,region}
}
function jwtSub(req:Request){
  try{
    const token=(req.headers.get('authorization')||'').replace(/^Bearer\s+/i,'')
    const part=token.split('.')[1];if(!part)return ''
    const raw=atob(part.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(part.length/4)*4,'='))
    return String(JSON.parse(raw)?.sub||'')
  }catch{return ''}
}
function allowSynthesis(userId:string){
  const now=Date.now(),windowMs=60_000,limit=40
  const recent=(perUser.get(userId)||[]).filter(ts=>now-ts<windowMs)
  if(recent.length>=limit){perUser.set(userId,recent);return false}
  recent.push(now);perUser.set(userId,recent);return true
}
function xmlEscape(value:string){
  return String(value||'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[ch]||ch))
}
function bytesToBase64(bytes:Uint8Array){
  let out='',i=0
  for(;i<bytes.length;i+=0x8000)out+=String.fromCharCode(...bytes.subarray(i,Math.min(bytes.length,i+0x8000)))
  return btoa(out)
}
async function azureVoices(cfg:{key:string,region:string}){
  if(cachedVoices.length&&Date.now()-cachedVoicesAt<15*60_000)return cachedVoices
  const r=await fetch(`https://${cfg.region}.tts.speech.microsoft.com/cognitiveservices/voices/list`,{
    headers:{'Ocp-Apim-Subscription-Key':cfg.key}
  })
  if(!r.ok)throw new Error('azure-voices-http-'+r.status)
  const raw=await r.json()
  cachedVoices=(Array.isArray(raw)?raw:[]).filter((v:any)=>String(v?.VoiceType||'').toLowerCase()==='neural').map((v:any)=>({
    shortName:String(v.ShortName||''),
    displayName:String(v.DisplayName||v.LocalName||v.ShortName||''),
    localName:String(v.LocalName||v.DisplayName||v.ShortName||''),
    gender:String(v.Gender||''),
    locale:String(v.Locale||''),
    localeName:String(v.LocaleName||''),
    voiceType:String(v.VoiceType||''),
    status:String(v.Status||'')
  })).filter((v:any)=>v.shortName&&v.locale)
  cachedVoicesAt=Date.now()
  return cachedVoices
}

Deno.serve(async(req:Request)=>{
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:CORS})
  if(req.method!=='POST')return json({error:'method-not-allowed'},405)
  const cfg=speechConfig()
  if(!cfg)return json({configured:false,error:'azure-speech-not-configured'},503)
  try{
    const body=await req.json().catch(()=>({})),action=String(body?.action||'')
    if(action==='voices'){
      const voices=await azureVoices(cfg)
      return json({configured:true,provider:'microsoft-azure-speech',voices})
    }
    if(action==='synthesize'){
      const userId=jwtSub(req);if(!userId)return json({error:'unauthorized'},401)
      if(!allowSynthesis(userId))return json({error:'rate-limit'},429)
      const text=String(body?.text||'').trim(),voice=String(body?.voice||'').trim()
      if(!text||text.length>220)return json({error:'invalid-text'},400)
      if(!/^[a-z]{2}-[A-Z]{2}-[A-Za-z0-9:-]{3,100}$/.test(voice))return json({error:'invalid-voice'},400)
      const locale=/^[a-z]{2}-[A-Z]{2}/.exec(voice)?.[0]||'cs-CZ'
      const ssml=`<speak version="1.0" xml:lang="${xmlEscape(locale)}"><voice name="${xmlEscape(voice)}">${xmlEscape(text)}</voice></speak>`
      const r=await fetch(`https://${cfg.region}.tts.speech.microsoft.com/cognitiveservices/v1`,{
        method:'POST',
        headers:{
          'Ocp-Apim-Subscription-Key':cfg.key,
          'Content-Type':'application/ssml+xml',
          'X-Microsoft-OutputFormat':'audio-24khz-96kbitrate-mono-mp3',
          'User-Agent':'Yamachat'
        },
        body:ssml
      })
      if(!r.ok){console.error('azure tts',r.status,(await r.text()).slice(0,300));return json({error:'azure-synthesis-failed',status:r.status},502)}
      const bytes=new Uint8Array(await r.arrayBuffer())
      return json({configured:true,provider:'microsoft-azure-speech',voice,mimeType:'audio/mpeg',audioBase64:bytesToBase64(bytes)})
    }
    return json({error:'unknown-action'},400)
  }catch(e){
    console.error('yamachat-tts',e)
    return json({error:'tts-failed',detail:e instanceof Error?e.message:String(e)},500)
  }
})
