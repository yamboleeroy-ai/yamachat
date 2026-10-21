(async()=>{
  'use strict';
  const callbackUrl=location.href;
  history.replaceState(null,'',location.pathname);
  const status=document.querySelector('#callback-status');
  try{
    const [configResponse,policyResponse]=await Promise.all([fetch('./account-config.json',{cache:'no-store'}),fetch('./identity-providers.json',{cache:'no-store'})]);
    if(!configResponse.ok||!policyResponse.ok)throw new Error('Konfigurace přihlášení není dostupná.');
    const config=YamaAccountCore.validateConfig(await configResponse.json());const policy=YamaIdentityCore.validatePolicy(await policyResponse.json());
    const client=supabase.createClient(config.authorityUrl,config.publishableKey,{auth:{storageKey:'yamaportal-auth-v1',persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,flowType:'pkce',...(window.YamaNative?.storage?{storage:window.YamaNative.storage}:{})}});
    const identity=new YamaIdentityCore.IdentityController({client,policy,fetch,storage:localStorage,location});
    await identity.finish(callbackUrl);status.textContent='Přihlášení je ověřené. Otevírám tvůj profil Yamaportal.';location.replace('./#profil');
  }catch(error){status.textContent=error.message||'Přihlášení se nepodařilo dokončit.';}
})();

