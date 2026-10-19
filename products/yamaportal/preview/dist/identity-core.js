(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.YamaIdentityCore=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const AUTHORITY='https://bxjvmjdppmqgbxfcowpf.supabase.co';
  const KNOWN=new Set(['google','azure','custom:seznam','apple','facebook','discord','github','custom:mojeid']);
  const PENDING='yamaportal-oauth-pending-v1';
  const LINK_HOSTS={google:['accounts.google.com'],azure:['login.microsoftonline.com'], 'custom:seznam':['login.seznam.cz'],apple:['appleid.apple.com'],facebook:['www.facebook.com','facebook.com'],discord:['discord.com'],github:['github.com'],'custom:mojeid':['mojeid.cz','www.mojeid.cz']};
  function validatePolicy(policy){if(policy?.schemaVersion!==1||policy.authorityUrl!==AUTHORITY||!Array.isArray(policy.providers)||!Array.isArray(policy.approvedCallbackUrls))throw new Error('Konfigurace přihlášení není platná.');const ids=new Set();for(const provider of policy.providers){if(!KNOWN.has(provider.id)||ids.has(provider.id))throw new Error('Nepodporovaná přihlašovací služba.');ids.add(provider.id);}return policy;}
  function callbackFor(location,policy){const url=new URL('./auth-callback.html',location.href);if(!policy.approvedCallbackUrls.includes(url.href))return null;if(url.protocol!=='https:'&&!(url.protocol==='http:'&&['127.0.0.1','localhost'].includes(url.hostname)))return null;return url.href;}
  function availableProviders(policy,settings,callback,mode='signin'){return policy.providers.map(provider=>{const enabled=provider.id.startsWith('custom:')?provider.customProviderVerified===true&&settings?.external?.[provider.id]===true:settings?.external?.[provider.id]===true;const reason=!settings?'unavailable':!enabled?'setup':!callback?'callback':mode==='link'&&policy.manualLinkingVerified!==true?'linking':null;return {...provider,enabled,ready:reason===null,reason};});}
  class IdentityController{
    constructor({client,policy,fetch,storage,location,now=Date.now}){this.client=client;this.policy=validatePolicy(policy);this.fetch=fetch;this.storage=storage;this.location=location;this.now=now;this.settings=null;this.busy=false;this.attempt=0;}
    hasPending(){try{const item=JSON.parse(this.storage.getItem(PENDING));return !!item&&Number.isFinite(item.createdAt)&&this.now()>=item.createdAt&&this.now()-item.createdAt<600000;}catch{return false;}}
    async discover(){try{const response=await this.fetch(AUTHORITY+'/auth/v1/settings');if(!response.ok)throw new Error();this.settings=await response.json();}catch{this.settings=null;}return this.providers();}
    providers(mode='signin'){return availableProviders(this.policy,this.settings,callbackFor(this.location,this.policy),mode);}
    async begin(providerId,mode='signin'){
      if(this.busy)throw new Error('Přihlášení už probíhá.');if(!['signin','link'].includes(mode))throw new Error('Neplatný způsob přihlášení.');
      const provider=this.providers(mode).find(item=>item.id===providerId);if(!provider?.ready)throw new Error('Tato možnost přihlášení se ještě připravuje.');
      const prior=this.storage.getItem(PENDING);if(prior){try{if(this.now()-JSON.parse(prior).createdAt<600000)throw new Error('Dokonči předchozí přihlášení nebo ho zruš.');}catch(error){if(error.message.startsWith('Dokonči'))throw error;}this.storage.removeItem(PENDING);}
      this.busy=true;const attempt=++this.attempt;
      try{
        const {data:identity,error:identityError}=await this.client.auth.getUser();
        if(attempt!==this.attempt)throw new Error('Přihlášení bylo zrušené.');
        if(identityError&&!['AuthSessionMissingError'].includes(identityError.name)&&identityError.code!=='session_not_found')throw new Error('Relaci se nepodařilo ověřit. Zkontroluj připojení a zkus to znovu.');
        if(mode==='link'&&(identityError||!identity?.user))throw new Error('Pro přidání služby se nejdřív přihlas ke svému účtu Yamaportal.');
        if(mode==='signin'&&identity?.user)throw new Error('Už jsi přihlášený. Další službu přidej v propojených účtech.');
        const callback=callbackFor(this.location,this.policy);const options={redirectTo:callback,scopes:provider.scopes,skipBrowserRedirect:true};
        // Supabase SDK owns state and the PKCE verifier. Never create a client secret in a public app.
        this.storage.setItem(PENDING,JSON.stringify({provider:provider.id,mode,userId:mode==='link'?identity.user.id:null,createdAt:this.now(),callback}));
        const result=mode==='link'?await this.client.auth.linkIdentity({provider:provider.id,options}):await this.client.auth.signInWithOAuth({provider:provider.id,options});
        if(attempt!==this.attempt)throw new Error('Přihlášení bylo zrušené.');
        if(result.error||!result.data?.url)throw new Error('Přihlášení se nepodařilo zahájit. Zkus to znovu.');
        const target=new URL(result.data.url);const safe=target.protocol==='https:'&&!target.port&&!target.username&&!target.password;const authEndpoint=safe&&target.origin===AUTHORITY&&['/auth/v1/authorize','/auth/v1/user/identities/authorize'].includes(target.pathname);const providerEndpoint=safe&&mode==='link'&&LINK_HOSTS[providerId]?.includes(target.hostname);if(!authEndpoint&&!providerEndpoint)throw new Error('Server vrátil neplatný přihlašovací odkaz.');
        await this.location.assign(target.href);
      }catch(error){this.storage.removeItem(PENDING);throw error;}finally{this.busy=false;}
    }
    async finish(url){
      const callback=callbackFor(this.location,this.policy);const current=new URL(url);const stored=this.storage.getItem(PENDING);let pending;try{pending=JSON.parse(stored);}catch{}
      if(!pending||!callback||!(current.origin+current.pathname===callback||(callback.startsWith('https://')&&current.origin+current.pathname===callback.replace(/\.html$/,'')))||pending.callback!==callback||this.now()-pending.createdAt>600000||this.now()<pending.createdAt){this.storage.removeItem(PENDING);throw new Error('Přihlášení nelze ověřit. Spusť ho znovu v tomto prohlížeči.');}
      this.storage.removeItem(PENDING);
      if(current.searchParams.has('error')||!current.searchParams.get('code')||current.hash)throw new Error('Přihlášení bylo zrušené nebo odkaz není platný.');
      const {data,error}=await this.client.auth.exchangeCodeForSession(current.searchParams.get('code'));
      if(error||!data?.session)throw new Error('Platnost přihlášení vypršela. Zkus to znovu.');
      const {data:verified,error:verificationError}=await this.client.auth.getUser();if(verificationError||!verified?.user){await this.client.auth.signOut({scope:'local'});throw new Error('Přihlášený účet se nepodařilo ověřit.');}
      if(pending.mode==='link'&&verified.user.id!==pending.userId){await this.client.auth.signOut({scope:'local'});throw new Error('Propojení změnilo identitu účtu. Z bezpečnostních důvodů bylo zastaveno.');}
      if(!verified.user.identities?.some(item=>item.provider===pending.provider||'custom:'+item.provider===pending.provider)){await this.client.auth.signOut({scope:'local'});throw new Error('Přihlášení vybrané služby se nepodařilo potvrdit.');}
      return {userId:verified.user.id,mode:pending.mode};
    }
    cancel(){this.attempt++;this.storage.removeItem(PENDING);}
  }
  return {IdentityController,validatePolicy,availableProviders,callbackFor,PENDING};
});
