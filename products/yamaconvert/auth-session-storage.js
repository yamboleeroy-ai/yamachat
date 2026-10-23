(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.YamaAuthStorage=api;})(typeof globalThis!=='undefined'?globalThis:this,function(root){
  'use strict';
  const PREFERENCE_KEY='yamaportal-remember-session-v1';
  const defaultRemember=true;
  function safeStorage(storage){try{const key='__yama_storage_test__';storage.setItem(key,'1');storage.removeItem(key);return storage;}catch{return null;}}
  function preference(storage){try{return storage?.getItem(PREFERENCE_KEY)==='false'?false:defaultRemember;}catch{return defaultRemember;}}
  function create(storageKey,provided={}){
    const local=safeStorage(provided.localStorage||globalThis.localStorage),session=safeStorage(provided.sessionStorage||globalThis.sessionStorage);
    const eventRoot=provided.eventRoot||root;
    if(!local||!session)throw new Error('Úložiště relace není dostupné.');
    let remember=preference(local);
    const prefix=storageKey;
    const matching=storage=>{const keys=[];for(let i=0;i<storage.length;i++){const key=storage.key(i);if(key===prefix||key?.startsWith(prefix+'-'))keys.push(key);}return keys;};
    const move=(from,to)=>{for(const key of matching(from)){const value=from.getItem(key);if(value!==null)to.setItem(key,value);from.removeItem(key);}};
    const active=()=>remember?local:session;
    move(remember?session:local,active());
    const applyPreference=()=>{const next=preference(local);if(next===remember)return;const from=active();remember=next;move(from,active());};
    eventRoot.addEventListener?.('yama-remember-session-changed',applyPreference);
    eventRoot.addEventListener?.('storage',event=>{if(event.key===PREFERENCE_KEY)applyPreference();});
    const storage={
      getItem(key){return active().getItem(key);},
      setItem(key,value){active().setItem(key,value);},
      removeItem(key){local.removeItem(key);session.removeItem(key);},
      setRemember(value){const previous=remember;const next=Boolean(value);try{local.setItem(PREFERENCE_KEY,String(next));if(next!==remember){const from=active();remember=next;move(from,active());}if(typeof eventRoot.dispatchEvent==='function')eventRoot.dispatchEvent({type:'yama-remember-session-changed'});}catch(error){remember=previous;try{local.setItem(PREFERENCE_KEY,String(previous));}catch{}throw new Error('Nastavení přihlášení se nepodařilo uložit. '+error.message);}},
      getRemember(){return remember;}
    };
    return Object.freeze(storage);
  }
  return Object.freeze({PREFERENCE_KEY,create,remember(storage){return storage?.getRemember?.()??defaultRemember;}});
});
