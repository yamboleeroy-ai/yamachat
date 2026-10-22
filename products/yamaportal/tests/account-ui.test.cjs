const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const core=require('../preview/dist/account-core.js');
async function harness({android=false,earlyCallback=null,initialCallback=null}={}){
  const handlers={};let authCallback;let renders=0;
  const windowHandlers={},finishedCallbacks=[];let identityInstance=null;
  const profile={id:'test-user',username:'Tester',display_name:'Tester',bio:''};
  const user={id:'test-user',email:'test@example.invalid'};
  const status={textContent:'',classList:{remove(){},add(){}}},button={disabled:false};
  const form={id:'portal-profile',reportValidity(){return true;},querySelector(selector){return {'#profile-status':status,'[type=submit]':button,'#profile-name':{value:'Tester'},'#profile-bio':{value:''}}[selector];}};
  const header={innerHTML:'',setAttribute(){}};const dialog={open:true,innerHTML:'private account menu',close(){this.open=false;}};let notice=null;
  const client={auth:{onAuthStateChange(fn){authCallback=fn;return {data:{subscription:{unsubscribe(){}}}};},async getSession(){return {data:{session:{user}}};},async getUser(){return {data:{user}};}},from(){return {select(){return this;},eq(){return this;},async maybeSingle(){return {data:profile};},update(){return this;},async single(){return {data:{...profile}};}};}};
  const window={addEventListener(name,fn){windowHandlers[name]=fn;},supabase:{createClient(){return client;}}};
  if(android){window.YamaConvertAndroid={};if(initialCallback)window.__yamaconvertOAuthCallback=initialCallback;}
  const identityCore=android?{ANDROID_CALLBACK:'yamaconvert://auth-callback',callbackFor:()=> 'yamaconvert://auth-callback',validatePolicy:policy=>policy,IdentityController:class{constructor(){identityInstance=this;}async discover(){return [];}providers(){return [];}hasPending(){return false;}async finish(url){finishedCallbacks.push(url);}}}:undefined;
  const values=new Map(),storage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
  const context={window,YamaAccountCore:core,YamaIdentityCore:identityCore,localStorage:storage,AbortController,setTimeout,clearTimeout,CustomEvent:class{constructor(type){this.type=type;}},location:{hash:'#profil'},fetch:async url=>url==='identity-providers.json'||url.endsWith('/identity-providers.json')?({ok:true,json:async()=>({schemaVersion:1,authorityUrl:core.AUTHORITY,providers:[],approvedCallbackUrls:['yamaconvert://auth-callback']})}):({ok:true,json:async()=>({schemaVersion:1,authorityUrl:core.AUTHORITY,publishableKey:'sb_publishable_test',recoveryUrl:core.RECOVERY})}),document:{querySelector(selector){return selector==='#account-menu-button'?header:selector==='#account-dialog'?dialog:selector==='#oauth-notice'?notice:selector==='main'?{prepend(element){notice=element;}}:null;},createElement(){return {setAttribute(){},className:'',textContent:''};},querySelectorAll(){return [];},addEventListener(name,fn){handlers[name]=fn;},dispatchEvent(event){if(event.type==='yama-account-state'&&window.YamaAccountUI.shouldRender())renders++;}}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../preview/dist/account-ui.js'),'utf8'),context);
  if(earlyCallback)windowHandlers['yamaconvert-oauth-callback']?.({detail:earlyCallback});
  await window.YamaAccountUI.init();
  return {window,handlers,status,button,form,dialog,renders:()=>renders,emit:()=>authCallback('SIGNED_OUT',null),finishedCallbacks,identityInstance};
}
test('saving an unchanged profile retains visible completion status instead of rerendering the form',async()=>{
  const h=await harness();const before=h.renders();
  h.handlers.submit({target:h.form,preventDefault(){}});
  for(let i=0;i<10&&h.button.disabled;i++)await new Promise(resolve=>setImmediate(resolve));
  assert.equal(h.status.textContent,'Společný profil byl uložen.');
  assert.equal(h.renders(),before);assert.equal(h.button.disabled,false);assert.equal(h.window.YamaAccountUI.shouldRender(),true);
});
test('dirty profile form must not prevent clearing private UI on signout',async()=>{
  const h=await harness();h.handlers.input({target:{closest(){return h.form;}}});
  assert.equal(h.window.YamaAccountUI.shouldRender(),false);const before=h.renders();h.emit();
  assert.ok(h.renders()>before);assert.equal(h.window.YamaAccountUI.shouldRender(),true);
});
test('signout from another tab closes and clears the account dialog',async()=>{const h=await harness();assert.equal(h.dialog.open,true);h.emit();assert.equal(h.dialog.open,false);assert.equal(h.dialog.innerHTML,'');});
test('Android OAuth callback arriving before identity setup is queued and completed',async()=>{
  const callback='yamaconvert://auth-callback?code=android-test-code';
  for(const options of [{earlyCallback:callback},{initialCallback:callback}]){
    const h=await harness({android:true,...options});
    assert.ok(h.identityInstance,'identity controller is initialized');
    assert.deepEqual(h.finishedCallbacks,[callback]);
  }
});
