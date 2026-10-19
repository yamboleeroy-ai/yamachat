(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.YamaAccountCore=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const AUTHORITY='https://bxjvmjdppmqgbxfcowpf.supabase.co';
  const RECOVERY='https://yamachat.eu/reset-password.html';
  const PROFILE_FIELDS='id,username,display_name,bio,avatar_path,discord_avatar_url,use_discord_avatar';
  function validateConfig(config){
    if(config?.schemaVersion!==1||config.authorityUrl!==AUTHORITY||config.recoveryUrl!==RECOVERY)throw new Error('Konfigurace společného účtu není platná.');
    const key=String(config.publishableKey||'');
    if(key.startsWith('eyJ')){try{const claims=JSON.parse(atob(key.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));if(claims.role!=='anon')throw new Error();}catch{throw new Error('Klíč musí být veřejný klientský klíč.');}}
    else if(!key.startsWith('sb_publishable_'))throw new Error('Chybí veřejný klíč účtu.');
    return config;
  }
  function validateProfile(values){
    const display_name=String(values.display_name||'').trim();const bio=String(values.bio||'').trim();
    if(!display_name||display_name.length>80)throw new Error('Zobrazované jméno musí mít 1 až 80 znaků.');
    if(bio.length>500)throw new Error('Popis profilu může mít nejvýše 500 znaků.');
    return {display_name,bio};
  }
  function authMessage(error){
    if(error?.status===429)return 'Příliš mnoho pokusů. Chvíli počkej a zkus to znovu.';
    if(error?.code==='email_not_confirmed')return 'Nejdřív ověř e-mail pomocí odkazu v doručené poště.';
    if(error?.code==='invalid_credentials'||error?.status===400)return 'E-mail nebo heslo nejsou správné.';
    if(error?.status===0||error?.name==='AuthRetryableFetchError'||error instanceof TypeError)return 'Server účtu je nedostupný. Zkontroluj připojení a zkus to znovu.';
    return 'Operaci se nepodařilo dokončit. Zkus to prosím znovu.';
  }
  class AccountController{
    constructor(client,config,{recoveryAuth=client.auth}={}){this.client=client;this.recoveryAuth=recoveryAuth;this.config=validateConfig(config);this.state={phase:'loading',user:null,profile:null,error:''};this.listeners=new Set();this.generation=0;this.disposed=false;this.busy=false;this.subscription=null;this.startPromise=null;}
    snapshot(){return {...this.state,user:this.state.user?{...this.state.user}:null,profile:this.state.profile?{...this.state.profile}:null};}
    subscribe(listener){this.listeners.add(listener);listener(this.snapshot());return ()=>this.listeners.delete(listener);}
    publish(patch){if(this.disposed)return;Object.assign(this.state,patch);for(const listener of this.listeners)listener(this.snapshot());}
    start(){if(this.startPromise)return this.startPromise;const {data}=this.client.auth.onAuthStateChange((event,session)=>{
      if(this.disposed)return;
      if(event==='SIGNED_OUT'){this.generation++;this.publish({phase:'signed-out',user:null,profile:null,error:''});return;}
      if(event==='INITIAL_SESSION')return;
      // Do not start another Auth operation inside the SDK callback/lock.
      const providers=user=>(user?.identities||[]).map(item=>item.provider).sort().join('|');
      const changed=session?.user?.id!==this.state.user?.id||(Array.isArray(session?.user?.identities)&&providers(session.user)!==providers(this.state.user));
      if(((event==='SIGNED_IN'&&!this.busy&&changed)||(event==='TOKEN_REFRESHED'&&changed)||event==='USER_UPDATED')&&!this.restoreQueued){this.restoreQueued=true;setTimeout(()=>{this.restoreQueued=false;if(!this.disposed)void this.restore();},0);}
    });this.subscription=data?.subscription;this.startPromise=this.restore();return this.startPromise;}
    async restore(){
      const generation=++this.generation;
      this.publish({phase:'loading',error:''});
      try{
        const {data:stored,error:storedError}=await this.client.auth.getSession();if(storedError)throw storedError;
        if(generation!==this.generation||this.disposed)return;
        if(!stored?.session){this.publish({phase:'signed-out',user:null,profile:null});return;}
        const {data,error}=await this.client.auth.getUser();if(error)throw error;
        if(!data?.user)throw new Error('Chybí ověřený uživatel.');
        if(generation!==this.generation||this.disposed)return;
        // UI receives identity only, never access/refresh tokens or authorization claims.
        const user={id:data.user.id,email:data.user.email||'',identities:(data.user.identities||[]).map(identity=>({provider:String(identity.provider||'')}))};
        const {data:profile,error:profileError}=await this.client.from('profiles').select(PROFILE_FIELDS).eq('id',user.id).maybeSingle();
        if(generation!==this.generation||this.disposed)return;
        if(profileError){this.publish({phase:'profile-error',user,profile:null,error:'Profil se nepodařilo načíst. Zkus načtení znovu.'});return;}
        this.publish({phase:'signed-in',user,profile:profile||null,error:profile?'':'Účet je přihlášený, profil ale chybí. Původní data nepřepisujeme.'});
      }catch(error){
        if(generation!==this.generation||this.disposed)return;
        const invalid=error?.status===401||error?.status===403||['refresh_token_not_found','refresh_token_already_used','session_not_found'].includes(error?.code);
        if(invalid){await this.client.auth.signOut({scope:'local'}).catch(()=>{});if(this.disposed)return;this.publish({phase:'signed-out',user:null,profile:null,error:'Relace vypršela. Přihlas se znovu.'});}
        else this.publish({phase:'offline',user:null,profile:null,error:authMessage(error)});
      }
    }
    async run(operation){if(this.busy)throw new Error('Počkej na dokončení předchozí operace.');this.busy=true;try{return await operation();}finally{this.busy=false;}}
    async signIn(email,password){return this.run(async()=>{
      if(!String(email).trim()||!password)throw new Error('Vyplň e-mail a heslo.');
      const {error}=await this.client.auth.signInWithPassword({email:String(email).trim(),password});if(error)throw new Error(authMessage(error));
      await this.restore();if(this.state.phase!=='signed-in'&&this.state.phase!=='profile-error')throw new Error(this.state.error||'Přihlášení se nepodařilo ověřit.');
    });}
    async signUp({email,password,confirmation,username}){return this.run(async()=>{
      email=String(email).trim();username=String(username).trim();
      if(this.state.user)throw new Error('Nejdřív se odhlas. Stávající účet nepřepisujeme.');
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)throw new Error('Vyplň platný e-mail.');
      if(!/^[a-zA-Z0-9_.-]{3,32}$/.test(username))throw new Error('Jméno musí mít 3–32 znaků: písmena, čísla, _, . nebo -.');
      if(typeof password!=='string'||password.length<8)throw new Error('Heslo musí mít alespoň 8 znaků.');
      if(password!==confirmation)throw new Error('Hesla se neshodují.');
      const {data,error}=await this.client.auth.signUp({email,password,options:{data:{username,display_name:username}}});
      if(error)throw new Error('Registraci se nepodařilo dokončit. Zkus přihlášení nebo obnovu hesla, případně registraci zopakuj později.');
      if(data?.session){await this.restore();if(!this.state.user)throw new Error('Přihlášení po registraci se nepodařilo ověřit. Přihlas se znovu.');return 'Účet je přihlášený.';}
      return 'Žádost o registraci byla přijata. Zkontroluj e-mail pro případné ověření a potom se přihlas. Pokud účet už máš, použij přihlášení nebo obnovu hesla.';
    });}
    async saveProfile(values){return this.run(async()=>{
      const patch=validateProfile(values);if(this.state.phase!=='signed-in'||!this.state.profile||!this.state.user)throw new Error('Pro úpravu profilu se přihlas.');
      const id=this.state.user.id;const generation=this.generation;
      const {data:verified,error:authError}=await this.client.auth.getUser();if(authError||verified?.user?.id!==id)throw new Error('Relaci se nepodařilo ověřit. Přihlas se znovu.');
      if(generation!==this.generation)throw new Error('Relace se změnila. Zkus to znovu.');
      const {data,error}=await this.client.from('profiles').update({...patch,updated_at:new Date().toISOString()}).eq('id',id).select(PROFILE_FIELDS).single();
      if(generation!==this.generation||this.disposed)return false;
      if(error)throw new Error('Profil se nepodařilo uložit. Původní profil zůstává zachovaný.');
      this.publish({profile:data,error:''});return true;
    });}
    async requestRecovery(email){return this.run(async()=>{
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim()))throw new Error('Vyplň platnou e-mailovou adresu.');
      // Existing Yamachat mail uses token_hash and an isolated recovery page.
      const {error}=await this.recoveryAuth.resetPasswordForEmail(String(email).trim(),{redirectTo:RECOVERY});
      if(error)throw new Error(error.status===429?'Příliš mnoho žádostí. Počkej chvíli a zkus to znovu.':'Odkaz se nepodařilo odeslat. Zkus to později.');
      return 'Pokud k této adrese existuje účet Yamaportal, žádost byla přijata. Zkontroluj poštu i Spam.';
    });}
    async signOut(){return this.run(async()=>{
      const {error}=await this.client.auth.signOut({scope:'local'});if(error)throw new Error('Odhlášení se nepodařilo potvrdit. Zkontroluj připojení a zkus to znovu.');
      this.generation++;this.publish({phase:'signed-out',user:null,profile:null,error:''});
    });}
    dispose(){this.disposed=true;this.generation++;this.subscription?.unsubscribe();this.listeners.clear();this.client.auth.stopAutoRefresh?.();}
  }
  return {AccountController,validateConfig,validateProfile,authMessage,AUTHORITY,RECOVERY};
});


