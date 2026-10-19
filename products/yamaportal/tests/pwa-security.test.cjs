const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
test('offline worker ignores credentials, account config and backend requests',()=>{
  const handlers={};
  vm.runInNewContext(fs.readFileSync(require.resolve('../preview/dist/sw.js'),'utf8'),{self:{registration:{scope:'http://localhost:4187/'},location:{origin:'http://localhost:4187'},addEventListener(name,fn){handlers[name]=fn;}},URL,Response,fetch(){throw new Error('No backend request may be intercepted');},caches:{}});
  for(const [url,headers,method] of [
    ['http://localhost:4187/account-config.json',{},'GET'],
    ['http://localhost:4187/identity-providers.json',{},'GET'],
    ['http://localhost:4187/auth-callback.html?code=synthetic',{},'GET'],
    ['https://bxjvmjdppmqgbxfcowpf.supabase.co/auth/v1/user',{},'GET'],
    ['http://localhost:4187/index.html',{Authorization:'Bearer private'},'GET'],
    ['http://localhost:4187/',{},'POST'],
    ['http://localhost:4187/other-app/',{},'GET']
  ]){let intercepted=false;handlers.fetch({request:new Request(url,{headers,method}),respondWith(){intercepted=true;}});assert.equal(intercepted,false,url);}
});
test('PWA scope, names and start destination are relative for isolated deployment',()=>{
  const manifest=JSON.parse(fs.readFileSync(require.resolve('../preview/dist/manifest.webmanifest'),'utf8'));
  assert.equal(manifest.name,'Yamaportal');assert.equal(manifest.scope,'./');assert.equal(manifest.start_url,'./#domu');
});
