(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.YamaConsentCore=api;})(globalThis,()=>{
 'use strict';
 const callback='https://bdfrzupieygsutraxyjx.supabase.co/auth/v1/callback';
 function validate(details,policy){
  if(!policy?.enabled||!policy.clientId||details?.client?.id!==policy.clientId||details.redirect_uri!==callback)throw new Error('Tato aplikace zatím nemá povolené propojení.');
  const scopes=String(details.scope||'').split(/\s+/).filter(Boolean);
  if(!scopes.includes('openid')||scopes.some(scope=>!['openid','email','profile'].includes(scope)))throw new Error('Nepovolená oprávnění.');
  return scopes;
 }
 function redirect(value){const url=new URL(value);if(url.origin+url.pathname!==callback||url.username||url.password||url.hash||url.searchParams.has('access_token')||url.searchParams.has('refresh_token'))throw new Error('Nepovolený návrat.');return url.href;}
 return {validate,redirect};
});
