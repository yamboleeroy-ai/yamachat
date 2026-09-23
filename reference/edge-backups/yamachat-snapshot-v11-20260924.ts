import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.95.0'

const SOURCE='https://bxjvmjdppmqgbxfcowpf.supabase.co/functions/v1/yamachat-source'

Deno.serve(async()=>{
  try{
    const r=await fetch(SOURCE,{cache:'no-store'})
    const html=await r.text()
    if(!r.ok) throw new Error('source HTTP '+r.status)
    const url=Deno.env.get('SUPABASE_URL')!
    const key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const sb=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}})
    const {error}=await sb.from('internal_app_snapshots').upsert({name:'v11',html,created_at:new Date().toISOString()})
    if(error) throw error
    return new Response(JSON.stringify({ok:true,length:html.length}),{headers:{'content-type':'application/json'}})
  }catch(e){
    return new Response(JSON.stringify({ok:false,error:e instanceof Error?e.message:String(e)}),{status:500,headers:{'content-type':'application/json'}})
  }
})