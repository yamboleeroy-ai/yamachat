/* The reset session stays in memory, isolated from any existing Yamachat login. */
(()=>{
  'use strict';
  const byId=id=>document.getElementById(id);
  const fragment=new URLSearchParams(location.hash.slice(1));
  let token=fragment.get('token_hash');
  const isRecovery=fragment.get('type')==='recovery';
  const hadFragment=!!location.hash;
  // Remove secrets from the address bar before any request or navigation.
  if(hadFragment)history.replaceState(null,'',location.pathname+location.search);
  const status=(message,error=false)=>{const el=byId('recoveryStatus');el.textContent=message;el.classList.remove('hidden');el.classList.toggle('error',error);el.focus()};
  const expired=()=>{token=null;byId('passwordForm').classList.add('hidden');byId('retryLink').classList.remove('hidden');status('Odkaz je neplatný, byl již použitý nebo jeho platnost vypršela. Požádej o nový odkaz.',true)};
  if(!window.supabase?.createClient){status('Obnovu hesla se nepodařilo načíst. Obnov stránku a zkus to znovu.',true);byId('requestSubmit').disabled=true;return}
  const client=window.supabase.createClient(__PUBLIC_SUPABASE_URL__,__PUBLIC_SUPABASE_KEY__,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false,storageKey:'yc-password-recovery-temporary'}});
  let busy=false,verified=false;
  if(hadFragment){byId('requestSection').classList.add('hidden');byId('passwordSection').classList.remove('hidden');if(!isRecovery||!token||!/^[a-f0-9]{32,256}$/i.test(token)){expired();return}}
  byId('requestForm').addEventListener('submit',async event=>{
    event.preventDefault();if(busy||!byId('requestForm').reportValidity())return;
    busy=true;byId('requestSubmit').disabled=true;status('Odesíláme žádost…');
    let slowTimer=null,hardTimer=null;
    try{
      slowTimer=setTimeout(()=>{if(busy)status('E-mailový server odpovídá pomalu. Ještě čekáme na potvrzení…')},8000);
      const timeout=new Promise((_,reject)=>{hardTimer=setTimeout(()=>{const e=new Error('Recovery request timeout');e.code='yc_recovery_timeout';reject(e)},55000)});
      const {error}=await Promise.race([client.auth.resetPasswordForEmail(byId('recoveryEmail').value.trim(),{redirectTo:'https://yamachat.eu/reset-password.html'}),timeout]);
      if(error){
        if(error.status===0||error.name==='AuthRetryableFetchError')throw error;
        status(error.status===429?'Příliš mnoho žádostí. Počkej chvíli a zkus to znovu.':error.status===504||error.code==='request_timeout'?'E-mailový server neodpověděl včas. Zkus to za chvíli znovu.':'E-mail teď nelze odeslat. Zkus to prosím později.',true);return
      }
      // The same result for existing and unknown addresses prevents account disclosure.
      status('Pokud k této adrese existuje účet Yamachat, požadavek byl přijat. Zkontroluj doručenou poštu i Spam.');
      byId('requestForm').classList.add('hidden');
    }catch(error){status(error?.code==='yc_recovery_timeout'?'Odesílání trvá příliš dlouho. E-mailová služba může být dočasně nedostupná. Zkus to za chvíli znovu.':'Nepodařilo se připojit. Zkontroluj internet a zkus to znovu.',true)}
    finally{clearTimeout(slowTimer);clearTimeout(hardTimer);busy=false;byId('requestSubmit').disabled=false}
  });
  byId('passwordForm').addEventListener('submit',async event=>{
    event.preventDefault();if(busy||!byId('passwordForm').reportValidity())return;
    const password=byId('newPassword').value;
    if(password!==byId('confirmNewPassword').value){status('Hesla se neshodují. Zadej obě hesla znovu.',true);return}
    busy=true;byId('passwordSubmit').disabled=true;status('Ukládáme nové heslo…');
    try{
      // Do not consume the one-time link on page load (email scanners may open it).
      if(!verified){
        if(!token){expired();return}
        const {data,error}=await client.auth.verifyOtp({token_hash:token,type:'recovery'});
        if(error&&(error.status===0||error.status>=500||error.name==='AuthRetryableFetchError'))throw error;
        if(error||!data?.session){expired();return}
        verified=true;token=null;
      }
      const {error}=await client.auth.updateUser({password});
      if(error){
        if(['session_not_found','refresh_token_not_found','refresh_token_already_used'].includes(error.code)||error.status===401){expired();return}
        status(error.code==='same_password'?'Nové heslo musí být jiné než původní.':error.code==='weak_password'||error.name==='AuthWeakPasswordError'?'Heslo nesplňuje požadavky zabezpečení. Zvol delší a silnější heslo.':'Heslo se nepodařilo uložit. Zkus to znovu.',true);return;
      }
      byId('passwordForm').reset();byId('passwordForm').classList.add('hidden');
      status('Heslo bylo změněno. Teď se můžeš přihlásit do Yamachatu novým heslem.');
      try{await client.auth.signOut({scope:'local'})}catch{/* No recovery session is persisted. */}
    }catch{status('Spojení se přerušilo. Zkus akci znovu; pokud odkaz přestal platit, požádej o nový.',true);byId('retryLink').classList.remove('hidden')}
    finally{busy=false;byId('passwordSubmit').disabled=false}
  });
})();
