 // This runs inside the existing profile renderer, sharing its user and handlers.
 const title=document.createElement('strong');title.className='yc-profile-actions-title';title.textContent='Akce uživatele';row.prepend(title);
 const mute=document.createElement('button');mute.type='button';mute.className='yc-profile-action-btn';mute.dataset.ycProfileMute='';
 const syncMute=()=>{const muted=voiceMixFor(uid).muted;mute.textContent=muted?'Zrušit ztlumení hlasu':'Ztlumit hlas pro mě';mute.setAttribute('aria-pressed',String(muted))};
 syncMute();mute.onclick=()=>{setVoiceUserMix(uid,{muted:!voiceMixFor(uid).muted});syncMute()};row.appendChild(mute);
 const note=document.createElement('small');note.className='yc-profile-actions-note';note.textContent='Ztlumení platí jen pro tebe na tomto zařízení.';row.appendChild(note);
 if(friendError||blockError){
   const warning=document.createElement('p');warning.className='yc-profile-actions-note';warning.setAttribute('role','status');warning.textContent='Stav přátelství nebo blokování se nepodařilo načíst. Zavři profil a zkus to znovu.';row.appendChild(warning);
   // An unknown block state must not be presented as an unblocked user.
   for(const button of row.querySelectorAll('[data-yc-profile-friend],[data-yc-profile-reject],[data-yc-profile-block],[data-yc-profile-message]'))button.disabled=true;
   row.querySelector('[data-yc-profile-friend]').textContent='Stav není dostupný';
   if(blockError)row.querySelector('[data-yc-profile-block]').textContent='Blokování není dostupné';
 }
 let busy=false;
 for(const button of row.querySelectorAll('button')){
   button.type='button';const action=button.onclick;if(!action)continue;
   button.onclick=async event=>{
     if(busy||button.disabled||!row.isConnected||user?.id!==actor)return;
     busy=true;const states=[...row.querySelectorAll('button')].map(b=>[b,b.disabled]);states.forEach(([b])=>b.disabled=true);row.setAttribute('aria-busy','true');
     try{await action(event)}catch(error){toast('Akci se nepodařilo dokončit. Zkus to znovu.',true);console.warn('Profile action failed',error)}
     finally{busy=false;if(row.isConnected){states.forEach(([b,disabled])=>b.disabled=disabled);row.removeAttribute('aria-busy')}}
   };
 }
