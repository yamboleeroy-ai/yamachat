const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),cp=require('node:child_process');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),base=fs.readFileSync(path.join(__dirname,'supabase-fixture.js'),'utf8');
const profiles=[
 {platform:'desktop',width:1280,height:800},
 {platform:'web',width:1366,height:768},
 {platform:'android',width:390,height:844,touch:true},
 {platform:'ios-pwa',width:390,height:844,touch:true,ios:true}
];
const configs=Array.from({length:10},(_,i)=>({id:'soak-'+(i+1),...profiles[i%profiles.length]}));
const minutes=Math.max(10,Number(process.env.YC_SOAK_MINUTES||10));

function source(platform){
 return fs.readFileSync(path.join(root,platform==='desktop'?'desktop/desktop-client.html':'index.html'),'utf8');
}
function fixture(id){
 let s=base
  .replace(
   "function query(table){let single=false,filters={},op='read';const q=new Proxy({}, {get:(_,key)=>key==='then'?(resolve)=>{",
   "function query(table){let single=false,filters={},op='read';const q=new Proxy({}, {get:(_,key)=>key==='then'?(resolve)=>{window.__auditDbQueries++;"
  )
  .replace(
   "const channel=()=>{const c={on:()=>c,subscribe:()=>c,track:async()=>{},untrack:async()=>{},send:async()=>{},presenceState:()=>({})};return c};",
   "const channel=(name)=>{const c={__name:String(name),__active:false,on:()=>c,subscribe:(cb)=>{if(!c.__active){c.__active=true;window.__auditActiveChannels.add(c.__name);window.__auditChannelCreates++}queueMicrotask(()=>cb?.('SUBSCRIBED'));return c},track:async()=>{},untrack:async()=>{},send:async()=>{},presenceState:()=>({})};return c};"
  )
  .replace(
   "return {from:query,rpc:async()=>({data:false,error:null}),channel,removeChannel:async()=>{},auth:",
   "return {from:query,rpc:async()=>{window.__auditRpcCalls++;return {data:false,error:null}},channel,removeChannel:async(c)=>{if(c?.__name)window.__auditActiveChannels.delete(c.__name);if(c)c.__active=false},auth:"
  )
  .replace(
   "getSession:async()=>({data:{session:{user:{id:'audit-user'}}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),getUser:async()=>({data:{user:{id:'audit-user',identities:[]}}}),signOut:async()=>({error:null})",
   "getSession:async()=>({data:{session:null},error:null}),onAuthStateChange:(cb)=>{window.__authCb=cb;return {data:{subscription:{unsubscribe(){window.__authCb=null}}}}},getUser:async()=>({data:{user:window.__authSession?.user||null}}),signInWithPassword:async()=>{const session={user:{id:'audit-user'},access_token:'fixture'};window.__authSession=session;queueMicrotask(()=>window.__authCb?.('SIGNED_IN',session));return {data:{session},error:null}},signOut:async()=>{window.__authSession=null;queueMicrotask(()=>window.__authCb?.('SIGNED_OUT',null));return {error:null}}"
  )
  .replaceAll("'audit-user'","'"+id+"'");
 return s+";window.__authSession=null;window.__auditActiveChannels=new Set();window.__auditChannelCreates=0;window.__auditDbQueries=0;window.__auditRpcCalls=0;";
}
function processSnapshot(label){
 try{
  const out=cp.execFileSync('ps',['-eo','rss=,%cpu=,comm='],{encoding:'utf8'}).trim().split(/\n+/).map(x=>x.trim().split(/\s+/)).filter(x=>/chrome|chromium/i.test(x.slice(2).join(' ')));
  const rss=out.reduce((n,x)=>n+(Number(x[0])||0),0),cpu=out.reduce((n,x)=>n+(Number(x[1])||0),0);
  console.log('AUDIT_SOAK_PROCESS '+JSON.stringify({label,chromium_processes:out.length,rss_kb:rss,cpu_percent_sum:Number(cpu.toFixed(1))}));
 }catch(e){console.log('AUDIT_SOAK_PROCESS '+JSON.stringify({label,error:e.message}))}
}
async function snapshot(c){
 return c.page.evaluate(()=>{
  try{globalThis.gc?.();globalThis.gc?.()}catch{}
  return {
   channels:window.__auditActiveChannels.size,
   channelCreates:window.__auditChannelCreates,
   observers:{...window.__auditObservers},
   listeners:JSON.parse(JSON.stringify(window.__auditGlobalListeners)),
   timers:{
    activeTimeouts:window.__auditTimers?.timeouts.size||0,
    activeIntervals:window.__auditTimers?.intervals.size||0,
    timeoutCreates:window.__auditTimers?.timeoutCreates||0,
    intervalCreates:window.__auditTimers?.intervalCreates||0
   },
   supabase:{queries:window.__auditDbQueries||0,rpcs:window.__auditRpcCalls||0},
   heap:performance.memory?.usedJSHeapSize||0
  };
 });
}

(async()=>{
 const browser=await chromium.launch({headless:true,args:['--enable-precise-memory-info','--js-flags=--expose-gc']});
 const clients=[];
 try{
  for(const cfg of configs){
   const context=await browser.newContext({viewport:{width:cfg.width,height:cfg.height},hasTouch:!!cfg.touch,isMobile:!!cfg.touch,serviceWorkers:'block',...(cfg.ios?{userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1'}:{})});
   await context.addInitScript(()=>{
    if(navigator.userAgent.includes('iPhone'))Object.defineProperty(navigator,'standalone',{value:true,configurable:true});
    window.__auditGlobalListeners={window:{},document:{}};
    window.__auditListenerRegistry={window:new Map(),document:new Map()};
    window.__auditObservers={created:0,observeCalls:0,disconnectCalls:0};
    window.__auditTimers={timeouts:new Set(),intervals:new Set(),timeoutCreates:0,intervalCreates:0};
    const st=window.setTimeout.bind(window),ct=window.clearTimeout.bind(window),si=window.setInterval.bind(window),ci=window.clearInterval.bind(window);
    window.setTimeout=(fn,delay,...args)=>{let id;const wrapped=typeof fn==='function'?function(...cbArgs){window.__auditTimers.timeouts.delete(id);return fn.apply(this,cbArgs)}:fn;id=st(wrapped,delay,...args);window.__auditTimers.timeouts.add(id);window.__auditTimers.timeoutCreates++;return id};
    window.clearTimeout=id=>{window.__auditTimers.timeouts.delete(id);window.__auditTimers.intervals.delete(id);return ct(id)};
    window.setInterval=(fn,delay,...args)=>{const id=si(fn,delay,...args);window.__auditTimers.intervals.add(id);window.__auditTimers.intervalCreates++;return id};
    window.clearInterval=id=>{window.__auditTimers.intervals.delete(id);window.__auditTimers.timeouts.delete(id);return ci(id)};
    const NativeMutationObserver=window.MutationObserver;
    window.MutationObserver=function(callback){const o=new NativeMutationObserver(callback);window.__auditObservers.created++;const observe=o.observe.bind(o),disconnect=o.disconnect.bind(o);o.observe=(...args)=>{window.__auditObservers.observeCalls++;return observe(...args)};o.disconnect=(...args)=>{window.__auditObservers.disconnectCalls++;return disconnect(...args)};return o};
    window.MutationObserver.prototype=NativeMutationObserver.prototype;
    const add=EventTarget.prototype.addEventListener,remove=EventTarget.prototype.removeEventListener;
    const targetName=t=>t===window?'window':t===document?'document':'';
    const captureOf=opts=>typeof opts==='boolean'?opts:!!opts?.capture;
    const onceOf=opts=>typeof opts==='object'&&!!opts?.once;
    EventTarget.prototype.addEventListener=function(type,fn,opts){const name=targetName(this);if(name&&fn&&!onceOf(opts)){const key=String(type)+'|'+(captureOf(opts)?'1':'0'),registry=window.__auditListenerRegistry[name];let set=registry.get(key);if(!set){set=new Set();registry.set(key,set)}if(!set.has(fn)){set.add(fn);const b=window.__auditGlobalListeners[name];b[type]=(b[type]||0)+1}}return add.call(this,type,fn,opts)};
    EventTarget.prototype.removeEventListener=function(type,fn,opts){const name=targetName(this);if(name&&fn){const key=String(type)+'|'+(captureOf(opts)?'1':'0'),registry=window.__auditListenerRegistry[name],set=registry.get(key);if(set?.delete(fn)){const b=window.__auditGlobalListeners[name];b[type]=Math.max(0,(b[type]||0)-1);if(!set.size)registry.delete(key)}}return remove.call(this,type,fn,opts)};
   });
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e.stack||e.message||e)));
   await page.route('**/*',route=>{
    const u=new URL(route.request().url());if(u.hostname!=='127.0.0.1')return route.abort();
    if(u.pathname.endsWith('/supabase.js'))return route.fulfill({contentType:'text/javascript',body:fixture(cfg.id)});
    if(u.pathname==='/')return route.fulfill({contentType:'text/html',body:source(cfg.platform)});
    const file=path.resolve(root,'.'+decodeURIComponent(u.pathname));if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||fs.statSync(file).isDirectory())return route.fulfill({status:404,body:''});return route.fulfill({path:file});
   });
   await page.goto('http://127.0.0.1/');await page.waitForFunction(()=>window.__ycClientReady,{},{timeout:25000});await page.waitForSelector('#auth:not(.hidden)');
   clients.push({cfg,context,page,errors,samples:[]});
  }

  await Promise.all(clients.map(c=>c.page.waitForTimeout(1000)));
  const authBase=await Promise.all(clients.map(snapshot));
  clients.forEach((c,i)=>c.authBase=authBase[i]);

  await Promise.all(clients.map(async c=>{
   await c.page.locator('#email').fill('audit@example.test');
   await c.page.locator('#password').fill('StrongPass123!');
   await c.page.locator('#authSubmit').click();
   await c.page.waitForSelector('#app:not(.hidden)',{timeout:25000});
   await c.page.waitForTimeout(1200);
  }));
  const initial=await Promise.all(clients.map(snapshot));
  clients.forEach((c,i)=>{c.initial=initial[i];c.samples.push({minute:0,...initial[i]})});
  processSnapshot('minute_0');

  for(let minute=1;minute<=minutes;minute++){
   await Promise.all(clients.map(c=>c.page.evaluate(()=>{
    window.dispatchEvent(new Event('online'));
    window.dispatchEvent(new Event('focus'));
    window.dispatchEvent(new Event('resize'));
    document.dispatchEvent(new Event('visibilitychange'));
   })));
   await Promise.all(clients.map(c=>c.page.waitForTimeout(60000)));
   const samples=await Promise.all(clients.map(snapshot));
   clients.forEach((c,i)=>c.samples.push({minute,...samples[i]}));
   processSnapshot('minute_'+minute);
  }

  const listenerKeys=['focus','online','offline','visibilitychange','pointerdown','keydown','touchstart','mousemove','click','message'];
  for(const c of clients){
   assert.deepEqual(c.errors,[],c.cfg.id+' page errors during soak');
   const first=c.samples[0],last=c.samples.at(-1);
   assert(last.channels<=first.channels+1,c.cfg.id+' active realtime channels grew '+first.channels+' -> '+last.channels);
   assert.equal(last.observers.created,first.observers.created,c.cfg.id+' MutationObserver instances grew '+first.observers.created+' -> '+last.observers.created);
   assert(last.timers.activeIntervals<=first.timers.activeIntervals+1,c.cfg.id+' active intervals grew '+first.timers.activeIntervals+' -> '+last.timers.activeIntervals);
   assert(last.timers.activeTimeouts<=first.timers.activeTimeouts+6,c.cfg.id+' active timeouts grew '+first.timers.activeTimeouts+' -> '+last.timers.activeTimeouts);
   for(const key of listenerKeys){
    const a=(first.listeners.window[key]||0)+(first.listeners.document[key]||0);
    const b=(last.listeners.window[key]||0)+(last.listeners.document[key]||0);
    assert(b<=a+1,c.cfg.id+' global '+key+' listeners grew '+a+' -> '+b);
   }
   if(first.heap&&last.heap)assert(last.heap<=first.heap*1.8+4000000,c.cfg.id+' forced-GC heap drift '+first.heap+' -> '+last.heap);
   const qDeltas=[];for(let i=1;i<c.samples.length;i++)qDeltas.push(c.samples[i].supabase.queries-c.samples[i-1].supabase.queries);
   const firstAvg=qDeltas.slice(0,3).reduce((a,b)=>a+b,0)/Math.max(1,Math.min(3,qDeltas.length));
   const lastAvg=qDeltas.slice(-3).reduce((a,b)=>a+b,0)/Math.max(1,Math.min(3,qDeltas.length));
   assert(lastAvg<=firstAvg*2+30,c.cfg.id+' Supabase query rate accelerated '+firstAvg.toFixed(1)+' -> '+lastAvg.toFixed(1)+' per minute');
  }

  await Promise.all(clients.map(async c=>{await c.page.evaluate(()=>document.querySelector('#logoutBtn')?.click());await c.page.waitForSelector('#auth:not(.hidden)',{timeout:20000});await c.page.waitForTimeout(2000)}));
  const after=await Promise.all(clients.map(snapshot));
  clients.forEach((c,i)=>c.after=after[i]);
  for(const c of clients){
   assert.equal(c.after.channels,0,c.cfg.id+' realtime channels remain after logout');
   assert(c.after.timers.activeIntervals<=c.authBase.timers.activeIntervals+2,c.cfg.id+' intervals did not return near auth baseline');
   assert(c.after.timers.activeTimeouts<=c.authBase.timers.activeTimeouts+6,c.cfg.id+' timeouts did not return near auth baseline');
  }
  processSnapshot('after_logout');
  console.log('AUDIT_10MIN_SOAK '+JSON.stringify(clients.map(c=>({id:c.cfg.id,platform:c.cfg.platform,authBase:c.authBase,initial:c.initial,last:c.samples.at(-1),afterLogout:c.after}))));
  console.log('PASS 10-minute 10-client lifecycle soak: continuous authenticated runtime across desktop/web/Android-layout/iOS-PWA profiles kept realtime channels, observers, global listeners, active timers, query rate and forced-GC JS heap bounded, then returned resources near auth baseline after logout. Supabase is mocked; this validates client lifecycle/resource drift, not production backend capacity.');
 }finally{
  await Promise.all(clients.map(c=>c.context.close().catch(()=>{})));
  await browser.close().catch(()=>{});
 }
})().catch(e=>{console.error(e);process.exit(1)});
