const {test}=require('node:test');
const assert=require('node:assert/strict');
const {availableProviders,IdentityController}=require('../preview/dist/identity-core.js');
const policy=require('../preview/dist/identity-providers.json');
test('all supported services obey server availability on web and Windows callbacks',()=>{
 for(const callback of policy.approvedCallbackUrls){
  const external=Object.fromEntries(policy.providers.map(p=>[p.id,true]));
  const ready=availableProviders(policy,{external},callback,'link');
  for(const provider of ready)assert.equal(provider.ready,!provider.id.startsWith('custom:'));
  assert.ok(ready.find(p=>p.id==='discord').ready);
  assert.equal(availableProviders(policy,null,callback)[0].reason,'unavailable');
  assert.equal(availableProviders(policy,{external:{}},callback)[0].reason,'setup');
 }
});
test('a custom provider cannot remain available after server discovery fails or disables it',()=>{
 const custom={...policy,providers:[{id:'custom:seznam',customProviderVerified:true}]};
 const callback=policy.approvedCallbackUrls[0];
 assert.equal(availableProviders(custom,null,callback)[0].ready,false);
 assert.equal(availableProviders(custom,{external:{}},callback)[0].ready,false);
 assert.equal(availableProviders(custom,{external:{'custom:seznam':true}},callback)[0].ready,true);
});
test('Discord login uses central PKCE callback and limited scopes on web and Windows',async()=>{
 for(const callback of policy.approvedCallbackUrls){
  let request,navigated;const data=new Map();
  const controller=new IdentityController({policy,location:{href:callback,assign:url=>{navigated=url;}},storage:{getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)},fetch:async()=>({ok:true,json:async()=>({external:{discord:true}})}),client:{auth:{getUser:async()=>({data:{},error:{name:'AuthSessionMissingError'}}),signInWithOAuth:async input=>{request=input;return {data:{url:policy.authorityUrl+'/auth/v1/authorize?provider=discord'}};}}}});
  await controller.discover();await controller.begin('discord');
  assert.equal(request.provider,'discord');assert.equal(request.options.redirectTo,callback);
  assert.equal(request.options.scopes,'identify email');assert.equal(request.options.skipBrowserRedirect,true);
  assert.ok(navigated.startsWith(policy.authorityUrl+'/'));
 }
});
test('Microsoft, Apple and Facebook link to the original owner on both platform callbacks',async()=>{
 for(const id of ['azure','apple','facebook'])for(const callback of policy.approvedCallbackUrls){
  const memory=new Map();let linked;const owner={id:'original-owner',identities:[{provider:id}],email:id==='apple'?'relay@example.invalid':'original@example.invalid'};
  const controller=new IdentityController({policy,location:{href:callback,assign(){}},storage:{getItem:k=>memory.get(k),setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)},fetch:async()=>({ok:true,json:async()=>({external:{[id]:true}})}),client:{auth:{getUser:async()=>({data:{user:owner}}),linkIdentity:async input=>{linked=input;return {data:{url:policy.authorityUrl+'/auth/v1/user/identities/authorize'}};},exchangeCodeForSession:async()=>({data:{session:{user:owner}}})}}});
  await controller.discover();await controller.begin(id,'link');
  assert.equal(linked.provider,id);assert.equal(linked.options.redirectTo,callback);
  assert.equal(linked.options.scopes,policy.providers.find(p=>p.id===id).scopes);
  const result=await controller.finish(callback+'?code=synthetic-code');assert.equal(result.userId,'original-owner');
 }
});
