/* The reset session stays in memory, isolated from any existing Yamachat login. */
(()=>{
  'use strict';
  const byId=id=>document.getElementById(id);
  const fragment=new URLSearchParams(location.hash.slice(1));
  let token=fragment.get('token_hash');
  let accessToken=fragment.get('access_token');
  let refreshToken=fragment.get('refresh_token');
  const flowType=fragment.get('type');
  const fragmentError=fragment.get('error_description')||fragment.get('error_code')||fragment.get('error');
  const isRecovery=flowType==='recovery';
  const hasTokenHash=!!token&&/^[a-f0-9]{32,256}$/i.test(token);
  const hasImplicitSession=!!accessToken&&!!refreshToken;
  const hadFragment=!!location.hash;

  // Copy recovery credentials into memory, then remove them from the address bar immediately.
  if(hadFragment)history.replaceState(null,'',location.pathname+location.search);

  const status=(message,error=false)=>{
    const el=byId('recoveryStatus');
    el.textContent=message;
    el.classList.remove('hidden');
    el.classList.toggle('error',error);
    el.focus();
  };
  const expired=()=>{
    token=null;accessToken=null;refreshToken=null;
    byId('passwordForm').classList.add('hidden');
    byId('retryLink').classList.remove('hidden');
    status('Odkaz je neplatný, byl již použitý nebo jeho platnost vypršela. Požádej o nový odkaz.',true);
  };
  const transientAuthError=error=>error&&(error.status===0||error.status>=500||error.name==='AuthRetryableFetchError');

  if(!window.supabase?.createClient){
    status('Obnovu hesla se nepodařilo načíst. Obnov stránku a zkus to znovu.',true);
    byId('requestSubmit').disabled=true;
    return;
  }

  const client=window.supabase.createClient(
    "https://bxjvmjdppmqgbxfcowpf.supabase.co",
    "sb_publishable_LCIW_v-MjpfTu1hHRfdxng_wvvuYSEY",
    {auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false,storageKey:'yc-password-recovery-temporary'}}
  );

  let busy=false,verified=false,implicitSessionPromise=null,implicitSessionError=null;

  if(hadFragment){
    byId('requestSection').classList.add('hidden');
    byId('passwordSection').classList.remove('hidden');

    if(fragmentError||!isRecovery||(!hasTokenHash&&!hasImplicitSession)){
      expired();
      return;
    }

    // Supabase's standard recovery link redirects with an access/refresh-token pair.
    // Establish only an in-memory recovery session; nothing is persisted to localStorage.
    if(hasImplicitSession){
      const credentials={access_token:accessToken,refresh_token:refreshToken};
      accessToken=null;refreshToken=null;
      status('Odkaz byl přijat. Ověřujeme zabezpečenou relaci…');
      implicitSessionPromise=(async()=>{
        const {data,error}=await client.auth.setSession(credentials);
        if(error||!data?.session){
          implicitSessionError=error||new Error('Recovery session missing');
          throw implicitSessionError;
        }
        verified=true;
        status('Odkaz je platný. Nastav si nové heslo.');
        return data.session;
      })();
      // Avoid an unhandled rejection while keeping the rejected promise available to submit.
      implicitSessionPromise.catch(error=>{
        implicitSessionError=error;
        if(transientAuthError(error)){
          status('Ověření odkazu se nepodařilo kvůli připojení. Zkus formulář za chvíli znovu.',true);
          byId('retryLink').classList.remove('hidden');
        }else expired();
      });
    }
  }

  byId('requestForm').addEventListener('submit',async event=>{
    event.preventDefault();
    if(busy||!byId('requestForm').reportValidity())return;
    busy=true;byId('requestSubmit').disabled=true;status('Odesíláme žádost…');
    let slowTimer=null,hardTimer=null;
    try{
      slowTimer=setTimeout(()=>{if(busy)status('E-mailový server odpovídá pomalu. Ještě čekáme na potvrzení…')},8000);
      const timeout=new Promise((_,reject)=>{hardTimer=setTimeout(()=>{const e=new Error('Recovery request timeout');e.code='yc_recovery_timeout';reject(e)},55000)});
      const {error}=await Promise.race([
        client.auth.resetPasswordForEmail(byId('recoveryEmail').value.trim(),{redirectTo:'https://yamachat.eu/reset-password.html'}),
        timeout
      ]);
      if(error){
        if(error.status===0||error.name==='AuthRetryableFetchError')throw error;
        status(
          error.status===429
            ?'Příliš mnoho žádostí. Počkej chvíli a zkus to znovu.'
            :error.status===504||error.code==='request_timeout'
              ?'E-mailový server neodpověděl včas. Zkus to za chvíli znovu.'
              :'E-mail teď nelze odeslat. Zkus to prosím později.',
          true
        );
        return;
      }
      // The same result for existing and unknown addresses prevents account disclosure.
      status('Pokud k této adrese existuje účet Yamachat, požadavek byl přijat. Zkontroluj doručenou poštu i Spam.');
      byId('requestForm').classList.add('hidden');
    }catch(error){
      status(
        error?.code==='yc_recovery_timeout'
          ?'Odesílání trvá příliš dlouho. E-mailová služba může být dočasně nedostupná. Zkus to za chvíli znovu.'
          :'Nepodařilo se připojit. Zkontroluj internet a zkus to znovu.',
        true
      );
    }finally{
      clearTimeout(slowTimer);clearTimeout(hardTimer);
      busy=false;byId('requestSubmit').disabled=false;
    }
  });

  byId('passwordForm').addEventListener('submit',async event=>{
    event.preventDefault();
    if(busy||!byId('passwordForm').reportValidity())return;
    const password=byId('newPassword').value;
    if(password!==byId('confirmNewPassword').value){
      status('Hesla se neshodují. Zadej obě hesla znovu.',true);
      return;
    }

    busy=true;byId('passwordSubmit').disabled=true;status('Ukládáme nové heslo…');
    try{
      if(implicitSessionPromise&&!verified){
        try{await implicitSessionPromise}catch(error){
          if(transientAuthError(error)){
            status('Ověření odkazu se nepodařilo kvůli připojení. Zkus to znovu; případně si vyžádej nový odkaz.',true);
            byId('retryLink').classList.remove('hidden');
          }else expired();
          return;
        }
      }

      // Custom Yamachat template: verify token_hash only when the user actually submits.
      // This avoids consuming that one-time token on a passive page load.
      if(!verified){
        if(!token){expired();return}
        const {data,error}=await client.auth.verifyOtp({token_hash:token,type:'recovery'});
        if(transientAuthError(error))throw error;
        if(error||!data?.session){expired();return}
        verified=true;token=null;
      }

      const {error}=await client.auth.updateUser({password});
      if(error){
        if(['session_not_found','refresh_token_not_found','refresh_token_already_used'].includes(error.code)||error.status===401){
          expired();return;
        }
        status(
          error.code==='same_password'
            ?'Nové heslo musí být jiné než původní.'
            :error.code==='weak_password'||error.name==='AuthWeakPasswordError'
              ?'Heslo nesplňuje požadavky zabezpečení. Zvol delší a silnější heslo.'
              :'Heslo se nepodařilo uložit. Zkus to znovu.',
          true
        );
        return;
      }

      byId('passwordForm').reset();
      byId('passwordForm').classList.add('hidden');
      status('Heslo bylo změněno. Teď se můžeš přihlásit do Yamachatu novým heslem.');
      try{await client.auth.signOut({scope:'local'})}catch{/* Recovery session is never persisted. */}
    }catch{
      status('Spojení se přerušilo. Zkus akci znovu; pokud odkaz přestal platit, požádej o nový.',true);
      byId('retryLink').classList.remove('hidden');
    }finally{
      busy=false;byId('passwordSubmit').disabled=false;
    }
  });
})();
