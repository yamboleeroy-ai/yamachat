'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {create}=require('../preview/dist/auth-session-storage.js');
const root=path.resolve(__dirname,'../../..');
class MemoryStorage{
  constructor(){this.values=new Map();}
  get length(){return this.values.size;}
  key(index){return [...this.values.keys()][index]??null;}
  getItem(key){return this.values.has(key)?this.values.get(key):null;}
  setItem(key,value){this.values.set(String(key),String(value));}
  removeItem(key){this.values.delete(key);}
}
const local=new MemoryStorage(),session=new MemoryStorage();
local.setItem('yamaportal-auth-v1','existing-session');
const storage=create('yamaportal-auth-v1',{localStorage:local,sessionStorage:session});
assert.equal(storage.getRemember(),true,'existing users keep persistent sessions by default');
assert.equal(storage.getItem('yamaportal-auth-v1'),'existing-session');
storage.setItem('yamaportal-auth-v1-code-verifier','pkce-verifier');
storage.setRemember(false);
assert.equal(local.getItem('yamaportal-auth-v1'),null,'turning remember off removes persistent session');
assert.equal(session.getItem('yamaportal-auth-v1'),'existing-session','current session remains usable');
assert.equal(session.getItem('yamaportal-auth-v1-code-verifier'),'pkce-verifier','PKCE verifier moves with session');
assert.equal(storage.getItem('yamaportal-auth-v1'),'existing-session');
storage.setItem('yamaportal-auth-v1','refreshed-session');
storage.setRemember(true);
assert.equal(session.getItem('yamaportal-auth-v1'),null,'turning remember on clears temporary session copy');
assert.equal(local.getItem('yamaportal-auth-v1'),'refreshed-session','current session moves back to persistent storage');
assert.equal(local.getItem('yamaportal-auth-v1-code-verifier'),'pkce-verifier');
storage.removeItem('yamaportal-auth-v1');
assert.equal(local.getItem('yamaportal-auth-v1'),null);
assert.equal(session.getItem('yamaportal-auth-v1'),null);
assert.equal(fs.readFileSync(path.join(__dirname,'../../../desktop/auth-session-storage.js'),'utf8'),fs.readFileSync(path.join(__dirname,'../preview/dist/auth-session-storage.js'),'utf8'),'Windows Yamachat uses the same reviewed storage adapter');
class Events{constructor(){this.listeners=new Map();}addEventListener(type,fn){const list=this.listeners.get(type)||[];list.push(fn);this.listeners.set(type,list);}dispatchEvent(event){for(const fn of this.listeners.get(event.type)||[])fn(event);}}
const sharedLocal=new MemoryStorage(),sharedSession=new MemoryStorage(),events=new Events();
sharedLocal.setItem('yamaportal-auth-v1','portal-session');sharedLocal.setItem('sb-chat-auth-token','chat-session');
const portal=create('yamaportal-auth-v1',{localStorage:sharedLocal,sessionStorage:sharedSession,eventRoot:events});
const chat=create('sb-chat-auth-token',{localStorage:sharedLocal,sessionStorage:sharedSession,eventRoot:events});
portal.setRemember(false);
assert.equal(portal.getRemember(),false);assert.equal(chat.getRemember(),false,'the preference stays consistent for all clients');
assert.equal(sharedLocal.getItem('sb-chat-auth-token'),null,'other clients also remove persistent tokens');
assert.equal(sharedSession.getItem('sb-chat-auth-token'),'chat-session','other clients retain only the current session');
const sharedTabStorage=new MemoryStorage(),sharedPortalTabStorage=new MemoryStorage();
sharedPortalTabStorage.setItem('yamaportal-auth-v1','portal-session-for-web');
const portalTab=create('yamaportal-auth-v1',{localStorage:sharedPortalTabStorage,sessionStorage:new MemoryStorage()});
const yamachatTab=create('yamaportal-auth-v1',{localStorage:sharedPortalTabStorage,sessionStorage:sharedTabStorage});
assert.equal(yamachatTab.getItem('yamaportal-auth-v1'),portalTab.getItem('yamaportal-auth-v1'),'standalone Yamachat and Yamaportal read the same browser session key');
const web=fs.readFileSync(path.join(root,'index.html'),'utf8');
assert.match(web,/id="ycPortalSignIn" href="\/#profil"/,'Web sign-in directs users to the central Yamaportal account');
assert.match(web,/storageKey:'yamaportal-auth-v1',storage:ycPortalStorage/,'Standalone web auth uses the shared Portal session');
assert.match(web,/class="yc-auth-fallback"><summary>Přihlásit se e-mailem/,'Email login remains available as a secondary fallback');
const desktop=fs.readFileSync(path.join(root,'desktop','desktop-client.html'),'utf8');
assert.doesNotMatch(desktop,/ycPortalSignIn|yc-auth-fallback/,'The Windows authentication experience is unchanged');
console.log('Web auth session preference storage passed.');
