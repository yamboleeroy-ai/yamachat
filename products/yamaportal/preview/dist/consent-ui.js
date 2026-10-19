(()=>{
 'use strict';let details=null,client=null,policy=null,busy=false;
 const status=message=>{const target=document.querySelector('#consent-status');if(target)target.textContent=message;};
 async function show(){
  const host=document.querySelector('#page');host.innerHTML='<section class="panel page-content"><h2>Propojit YamaSearch s Yamaportalem</h2><p>YamaSearch získá tvoji identitu, e-mail a základní profil. Místní historie a oblíbené zůstanou v prohlížeči.</p><p id="consent-status" role="status">Ověřuji žádost…</p><div id="consent-actions"></div></section>';
  details=null;
  try{
   const id=new URL(location.href).searchParams.get('authorization_id');if(!id||! /^[a-zA-Z0-9_-]{16,128}$/.test(id))throw new Error('Chybí platná žádost o propojení.');
   await YamaAccountUI.init();if(!YamaAccountUI.isSignedIn()){status('Nejdřív se přihlas ke svému původnímu účtu Yamaportal.');document.querySelector('#consent-actions').innerHTML='<button class="primary" data-account="login">Přihlásit se</button>';return;}
   policy=await (await fetch('consent-policy.json',{cache:'no-store'})).json();if(!policy.enabled)throw new Error('Propojení YamaSearch čeká na aktivaci a ověření serveru.');
   client=YamaPortalIntegration.sharedClient(location.origin);const result=await client.auth.oauth.getAuthorizationDetails(id);if(result.error)throw result.error;
   if(!result.data?.authorization_id)throw new Error('Žádost již byla zpracována. Spusť propojení znovu v YamaSearch.');
   YamaConsentCore.validate(result.data,policy);details={id,owner:(await client.auth.getUser()).data.user?.id};if(!details.owner||result.data.user?.id!==details.owner)throw new Error('Přihlášení vypršelo.');
   status('Povolit aplikaci YamaSearch přihlášení tvým účtem Yamaportal?');document.querySelector('#consent-actions').innerHTML='<button class="primary" data-consent="approve">Povolit propojení</button><button class="secondary" data-consent="deny">Zamítnout</button>';
  }catch{status('Propojení není připravené nebo žádost vypršela. Vrať se do YamaSearch.');}
 }
 document.addEventListener('click',async event=>{
  const button=event.target.closest('[data-consent]');if(!button||!details||busy)return;busy=true;button.disabled=true;
  try{const {data,error}=await client.auth.getUser();if(error||data.user?.id!==details.owner)throw new Error('Účet se změnil.');const result=await client.auth.oauth[button.dataset.consent==='approve'?'approveAuthorization':'denyAuthorization'](details.id,{skipBrowserRedirect:true});if(result.error)throw result.error;location.assign(YamaConsentCore.redirect(result.data.redirect_url));}catch{details=null;status('Propojení se nepodařilo dokončit. Začni znovu v YamaSearch.');}finally{busy=false;button.disabled=false;}
 });
 window.YamaConsent={show};
})();
