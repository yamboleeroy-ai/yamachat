const {test}=require('node:test'),assert=require('node:assert/strict');
const {IdentityController,validatePolicy,availableProviders,PENDING}=require('../preview/dist/identity-core.js');
const AUTHORITY='https://bxjvmjdppmqgbxfcowpf.supabase.co',callback='https://portal.test/auth-callback.html',androidCallback='yamaconvert://auth-callback';
const base={schemaVersion:1,authorityUrl:AUTHORITY,approvedCallbackUrls:[callback,androidCallback],manualLinkingVerified:true,providers:[{id:'google',name:'Google',scopes:'openid email profile'},{id:'custom:seznam',name:'Seznam',scopes:'identity',customProviderVerified:false}]};
function harness({user=null,now=1000000,url=AUTHORITY+'/auth/v1/authorize?provider=google',error=null,callbackUrl=null}={}){const calls=[],values=new Map();const storage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};const location={href:'https://portal.test/',assign(url){calls.push({navigate:url});}};let verified=user;const client={auth:{async getUser(){return verified?{data:{user:verified}}:{error:{name:'AuthSessionMissingError'},data:{}};},async signInWithOAuth(input){calls.push({signin:input});return {data:{url},error};},async linkIdentity(input){calls.push({link:input});return {data:{url},error};},async exchangeCodeForSession(code){calls.push({exchange:code});return {data:{session:{user:verified}},error};},async signOut(opts){calls.push({logout:opts});}}};const instance=new IdentityController({client,policy:structuredClone(base),fetch:async()=>({ok:true,json:async()=>({external:{google:true}})}),storage,location,callbackUrl,now:()=>now});return {instance,calls,storage,location,setUser(value){verified=value;}};}
test('built-in and custom providers need backend proof and approved callback',()=>{const providers=availableProviders(base,{external:{google:true}},callback);assert.equal(providers[0].ready,true);assert.equal(providers[1].ready,false);assert.equal(availableProviders(base,{external:{google:true}},null)[0].ready,false);assert.equal(availableProviders(base,null,callback)[0].ready,false);assert.throws(()=>validatePolicy({...base,providers:[{id:'made-up'}]}));});
test('OAuth request is SDK PKCE compatible and contains minimal scopes',async()=>{const h=harness();await h.instance.discover();await h.instance.begin('google');assert.equal(h.calls[0].signin.options.redirectTo,callback);assert.equal(h.calls[0].signin.options.skipBrowserRedirect,true);assert.equal(h.calls[0].signin.options.scopes,'openid email profile');const pending=JSON.parse(h.storage.getItem(PENDING));assert.equal(pending.mode,'signin');assert.equal(Object.keys(pending).some(k=>/token|secret|password/i.test(k)),false);});
test('signed-in account cannot accidentally create another account through sign-in button',async()=>{const h=harness({user:{id:'existing'}});await h.instance.discover();await assert.rejects(()=>h.instance.begin('google'),/Už jsi přihlášený/);assert.equal(h.calls.length,0);});
test('link flow targets existing account and accepts its verified provider URL',async()=>{const h=harness({user:{id:'existing'},url:'https://accounts.google.com/o/oauth2/v2/auth?state=opaque'});await h.instance.discover();await h.instance.begin('google','link');assert.ok(h.calls[0].link);assert.equal(JSON.parse(h.storage.getItem(PENDING)).userId,'existing');});
test('unknown callback and attacker authorization host fail closed',async()=>{const h=harness({url:'https://attacker.test/auth'});await h.instance.discover();await assert.rejects(()=>h.instance.begin('google'),/neplatný/);assert.equal(h.storage.getItem(PENDING),null);h.instance.policy.approvedCallbackUrls=[];await assert.rejects(()=>h.instance.begin('google'),/připravuje/);});
test('overlapping flows cannot overwrite the pending verifier context',async()=>{const h=harness();await h.instance.discover();await h.instance.begin('google');const saved=h.storage.getItem(PENDING);await assert.rejects(()=>h.instance.begin('google'),/předchozí/);assert.equal(h.storage.getItem(PENDING),saved);});

test('cancelled external sign-in can restart immediately without waiting ten minutes',async()=>{
 const h=harness();await h.instance.discover();await h.instance.begin('google');assert.equal(h.instance.hasPending(),true);
 h.instance.cancel();assert.equal(h.instance.hasPending(),false);
 await assert.rejects(()=>h.instance.finish(callback+'?code=cancelled-code'));
 assert.equal(h.calls.some(item=>item.exchange),false);
 await h.instance.begin('google');assert.equal(h.calls.filter(item=>item.signin).length,2);assert.equal(h.instance.hasPending(),true);
});

test('cancelling while provider setup is pending prevents late navigation and permits retry',async()=>{
 const h=harness();await h.instance.discover();let release;
 const original=h.instance.client.auth.signInWithOAuth;
 h.instance.client.auth.signInWithOAuth=()=>new Promise(resolve=>{release=resolve;});
 const starting=h.instance.begin('google');
 while(!release)await new Promise(resolve=>setImmediate(resolve));
 h.instance.cancel();release({data:{url:AUTHORITY+'/auth/v1/authorize?provider=google'}});
 await assert.rejects(()=>starting,/zrušené/);assert.equal(h.calls.some(item=>item.navigate),false);assert.equal(h.storage.getItem(PENDING),null);
 h.instance.client.auth.signInWithOAuth=original;await h.instance.begin('google');assert.equal(h.instance.hasPending(),true);
});
test('successful callback exchanges code once, verifies identity and clears pending state',async()=>{const h=harness();await h.instance.discover();await h.instance.begin('google');h.setUser({id:'portal-account',identities:[{provider:'google'}]});const result=await h.instance.finish(callback+'?code=test-code');assert.equal(result.userId,'portal-account');assert.equal(h.calls.filter(x=>x.exchange).length,1);assert.equal(h.storage.getItem(PENDING),null);await assert.rejects(()=>h.instance.finish(callback+'?code=test-code'));});
test('link callback cannot replace the owning account',async()=>{const h=harness({user:{id:'original'}});await h.instance.discover();await h.instance.begin('google','link');h.setUser({id:'other'});await assert.rejects(()=>h.instance.finish(callback+'?code=test-code'),/identitu/);assert.deepEqual(h.calls.find(x=>x.logout).logout,{scope:'local'});});
test('expired, error and implicit-token callbacks cannot exchange authorization code',async()=>{for(const suffix of ['?error=access_denied','#access_token=synthetic']){const h=harness();await h.instance.discover();await h.instance.begin('google');await assert.rejects(()=>h.instance.finish(callback+suffix));assert.equal(h.calls.some(x=>x.exchange),false);}const h=harness();h.storage.setItem(PENDING,JSON.stringify({createdAt:0,callback}));await assert.rejects(()=>h.instance.finish(callback+'?code=test-code'));assert.equal(h.calls.length,0);});
test('callback cannot claim success without the requested provider identity',async()=>{const h=harness();await h.instance.discover();await h.instance.begin('google');h.setUser({id:'portal-account',identities:[{provider:'discord'}]});await assert.rejects(()=>h.instance.finish(callback+'?code=test-code'),/vybrané služby/);assert.deepEqual(h.calls.find(x=>x.logout).logout,{scope:'local'});});
test('external navigation failure clears pending authorization',async()=>{const h=harness();await h.instance.discover();h.location.assign=async()=>{throw Error('browser blocked');};await assert.rejects(()=>h.instance.begin('google'));assert.equal(h.storage.getItem(PENDING),null);});

test('HTTPS callback survives exact clean HTML redirect without widening origin or path',async()=>{
 const h=harness();await h.instance.discover();await h.instance.begin('google');h.setUser({id:'portal-account',identities:[{provider:'google'}]});const result=await h.instance.finish('https://portal.test/auth-callback?code=test-code');assert.equal(result.userId,'portal-account');assert.equal(h.calls.filter(x=>x.exchange).length,1);
 for(const destination of ['https://attacker.test/auth-callback?code=test-code','https://portal.test/other/auth-callback?code=test-code','https://portal.test/auth-callback-extra?code=test-code']){const bad=harness();await bad.instance.discover();await bad.instance.begin('google');await assert.rejects(()=>bad.instance.finish(destination));assert.equal(bad.calls.some(x=>x.exchange),false);}
});

test('Android OAuth uses its app-only callback and exchanges the code in the retained WebView session',async()=>{
 const h=harness({callbackUrl:androidCallback});await h.instance.discover();await h.instance.begin('google');
 assert.equal(h.calls[0].signin.options.redirectTo,androidCallback);
 assert.equal(h.instance.providers()[0].ready,true);
 h.setUser({id:'portal-account',identities:[{provider:'google'}]});
 const result=await h.instance.finish(androidCallback+'?code=android-test-code');
 assert.equal(result.userId,'portal-account');assert.equal(h.calls.filter(x=>x.exchange).length,1);
});

test('Android callback cannot be enabled unless it is explicitly allowlisted',()=>{
 const h=harness({callbackUrl:'yamaconvert://attacker'});assert.equal(h.instance.providers()[0].ready,false);
});

