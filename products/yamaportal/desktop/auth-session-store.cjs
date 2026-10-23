'use strict';
const fs=require('node:fs');
const path=require('node:path');
const KEYS=Object.freeze(['yamaportal-auth-v1','yamaportal-auth-v1-code-verifier','yamaportal-auth-v1-user']);
const KEY_PATTERN=/^yamaportal-auth-v1(?:-code-verifier|-user)?$/;

function createAuthSessionStore({userDataPath,safeStorage,fileSystem=fs}){
  if(!path.isAbsolute(userDataPath))throw new Error('Yamaportal session path must be absolute.');
  const preferencePath=path.join(userDataPath,'session-preference.json');
  const memory=new Map();
  let remember=true;
  try{remember=JSON.parse(fileSystem.readFileSync(preferencePath,'utf8')).remember!==false;}catch{}
  const fileFor=key=>path.join(userDataPath,key+'.encrypted');
  const requireSecure=()=>{if(!safeStorage.isEncryptionAvailable())throw new Error('Zabezpečené úložiště není dostupné.');};
  const persistPreference=value=>fileSystem.writeFileSync(preferencePath,JSON.stringify({remember:value}));
  function get(key){if(!KEY_PATTERN.test(key))throw new Error('Neplatné úložiště.');if(!remember)return memory.get(key)??null;requireSecure();try{return safeStorage.decryptString(fileSystem.readFileSync(fileFor(key)));}catch{return null;}}
  function set(key,value){if(!KEY_PATTERN.test(key))throw new Error('Neplatné úložiště.');if(typeof value!=='string'||value.length>100000)throw new Error('Neplatná relace.');if(!remember){memory.set(key,value);return;}requireSecure();fileSystem.writeFileSync(fileFor(key),safeStorage.encryptString(value));}
  function remove(key){if(!KEY_PATTERN.test(key))throw new Error('Neplatné úložiště.');memory.delete(key);fileSystem.rmSync(fileFor(key),{force:true});}
  function setRemember(next){
    if(typeof next!=='boolean')throw new Error('Neplatné nastavení přihlášení.');
    if(next===remember)return remember;
    requireSecure();
    if(next){
      const prepared=[];
      for(const [key,value] of memory)prepared.push([fileFor(key),safeStorage.encryptString(value)]);
      for(const [file,value] of prepared)fileSystem.writeFileSync(file,value);
      persistPreference(true);memory.clear();remember=true;return remember;
    }
    const prepared=new Map();
    for(const key of KEYS){try{prepared.set(key,safeStorage.decryptString(fileSystem.readFileSync(fileFor(key))));}catch{}}
    persistPreference(false);
    for(const key of KEYS)fileSystem.rmSync(fileFor(key),{force:true});
    for(const [key,value] of prepared)memory.set(key,value);
    remember=false;return remember;
  }
  return Object.freeze({get,set,remove,getRemember:()=>remember,setRemember});
}
module.exports={createAuthSessionStore};
