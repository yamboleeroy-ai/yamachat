const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function setup(){
 const handlers={},saved=new Map();let claimed=0,waiting=0;
 const scope='https://portal.test/';
 const self={registration:{scope},location:{origin:'https://portal.test'},addEventListener:(name,fn)=>handlers[name]=fn,skipWaiting:async()=>waiting++,clients:{claim:async()=>claimed++}};
 const caches={open:async()=>({addAll:async paths=>paths.forEach(p=>saved.set(new URL(p,scope).href,new Response('public shell')))}),keys:async()=>[],delete:async()=>true,match:async request=>saved.get(typeof request==='string'?request:request.url)?.clone()};
 vm.runInNewContext(fs.readFileSync(require.resolve('../preview/dist/sw.js'),'utf8'),{self,caches,URL,Response,fetch:async()=>{throw new Error('offline');}});
 return {handlers,stats:()=>({claimed,waiting}),request(url,options={}){let response;handlers.fetch({request:{url:new URL(url,scope).href,method:'GET',mode:'navigate',headers:new Headers(),...options},respondWith:value=>response=value});return response;}};
}
test('prepared shell opens offline with a versioned public entry and activates immediately',async()=>{
 const f=setup();for(const event of ['install','activate']){let task;f.handlers[event]({waitUntil:value=>task=value});await task;}
 assert.deepEqual(f.stats(),{claimed:1,waiting:1});
 for(const url of ['/','/index.html','/?v=18','/index.html?v=20'])assert.equal(await (await f.request(url)).text(),'public shell');
});
test('offline navigation never captures authentication callbacks or token-bearing URLs',()=>{
 const f=setup();for(const url of ['/auth-callback?code=synthetic','/?code=synthetic','/?v=20&access_token=synthetic','/rest/v1/profiles','https://backend.test/'])assert.equal(f.request(url),undefined);
 assert.equal(f.request('/',{headers:new Headers({authorization:'Bearer synthetic'})}),undefined);
});
