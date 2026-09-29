const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),cp=require('node:child_process');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),base=fs.readFileSync(path.join(__dirname,'supabase-fixture.js'),'utf8');
const profiles=[
 {platform:'desktop',width:1280,height:800},
 {platform:'web',width:1366,height:768},
 {platform:'android',width:390,height:844,touch:true},
 {platform:'ios-pwa',width:390,height:844,touch:true,ios:true}
];
const configs=Array.from({length:20},(_,i)=>({id:'load-'+(i+1),...profiles[i%profiles.length]}));

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
  console.log('AUDIT_20_PROCESS '+JSON.stringify({label,chromium_processes:out.length,rss_kb:rss,cpu_percent_sum:Number(cpu.toFixed(1))}));
 }catch(e){console.log('AUDIT_20_PROCESS '+JSON.stringify({label,error:e.message}))}
}
async function snapshot(client){
 return client.page.evaluate(()=>{
  try{globalThis.gc?.();globalThis.gc?.()}catch{}
  return {
   channels:window.__auditActiveChannels.size,
   channelCreates:window.__auditChannelCreates,
   observers:{...window.__auditObservers},
   listeners:JSON.parse(JSON.stringify(window.__auditGlobalAdds)),
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
    window.__auditGlobalAdds={window:{},document:{}};
    window.__auditObservers={created:0,observeCalls:0,disconnectCalls:0};
    window.__auditTimers={timeouts:new Set(),intervals:new Set(),timeoutCreates:0,intervalCreates:0};
    const nativeSetTimeout=window.setTimeout.bind(window),nativeClearTimeout=window.clearTimeout.bind(window),nativeSetInterval=window.setInterval.bind(window),nativeClearInterval=window.clearInterval.bind(window);
    window.setTimeout=(fn,delay,...args)=>{let id;const wrapped=typeof fn==='function'?function(...cbArgs){window.__auditTimers.timeouts.delete(id);return fn.apply(this,cbArgs)}:fn;id=nativeSetTimeout(wrapped,delay,...args);window.__auditTimers.timeouts.add(id);window.__auditTimers.timeoutCreates++;return id};
    window.clearTimeout=id=>{window.__auditTimers.timeouts.delete(id);window.__auditTimers.intervals.delete(id);return nativeClearTimeout(id)};
    window.setInterval=(fn,delay,...args)=>{const id=nativeSetInterval(fn,delay,...args);window.__auditTimers.intervals.add(id);window.__auditTimers.intervalCreates++;return id};
    window.clearInterval=id=>{window.__auditTimers.intervals.delete(id);window.__auditTimers.timeouts.delete(id);return nativeClearInterval(id)};
    const NativeMutationObserver=window.MutationObserver;
    window.MutationObserver=function(callback){const observer=new NativeMutationObserver(callback);window.__auditObservers.created++;const observe=observer.observe.bind(observer),disconnect=observer.disconnect.bind(observer);observer.observe=(...args)=>{window.__auditObservers.observeCalls++;return observe(...args)};observer.disconnect=(...args)=>{window.__auditObservers.disconnectCalls++;return disconnect(...args)};return observer};
    window.MutationObserver.prototype=NativeMutationObserver.prototype;
    const add=EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener=function(type,fn,opts){const bucket=this===window?window.__auditGlobalAdds.window:this===document?window.__auditGlobalAdds.document:null;if(bucket)bucket[type]=(bucket[type]||0)+1;return add.call(this,type,fn,opts)};
   });
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e.message||e)));
   await page.route('**/*',route=>{
    const u=new URL(route.request().url());if(u.hostname!=='127.0.0.1')return route.abort();
    if(u.pathname.endsWith('/supabase.js'))return route.fulfill({contentType:'text/javascript',body:fixture(cfg.id)});
    if(u.pathname==='/')return route.fulfill({contentType:'text/html',body:source(cfg.platform)});
    const file=path.resolve(root,'.'+decodeURIComponent(u.pathname));if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||fs.statSync(file).isDirectory())return route.fulfill({status:404,body:''});return route.fulfill({path:file});
   });
   await page.goto('http://127.0.0.1/');await page.waitForFunction(()=>window.__ycClientReady,{},{timeout:25000});await page.waitForSelector('#auth:not(.hidden)');
   clients.push({cfg,context,page,errors,snaps:[]});
  }
  processSnapshot('20_ready_auth');
  await Promise.all(clients.map(c=>c.page.waitForTimeout(1000)));
  const ready=await Promise.all(clients.map(snapshot));
  clients.forEach((c,i)=>c.ready=ready[i]);

  for(let cycle=0;cycle<2;cycle++){
   await Promise.all(clients.map(async c=>{await c.page.locator('#email').fill('audit@example.test');await c.page.locator('#password').fill('StrongPass123!');await c.page.locator('#authSubmit').click();await c.page.waitForSelector('#app:not(.hidden)',{timeout:25000})}));
   await Promise.all(clients.map(c=>c.page.waitForTimeout(150)));
   const loggedIn=await Promise.all(clients.map(snapshot));
   processSnapshot('20_logged_in_cycle_'+(cycle+1));
   await Promise.all(clients.map(async c=>{await c.page.evaluate(()=>document.querySelector('#logoutBtn')?.click());await c.page.waitForSelector('#auth:not(.hidden)',{timeout:20000});await c.page.waitForTimeout(1000)}));
   const loggedOut=await Promise.all(clients.map(snapshot));
   clients.forEach((c,i)=>c.snaps.push({cycle:cycle+1,loggedIn:loggedIn[i],loggedOut:loggedOut[i]}));
  }

  const listenerKeys=['focus','online','offline','visibilitychange','pointerdown','keydown','touchstart','mousemove','click'];
  for(const c of clients){
   assert.deepEqual(c.errors,[],c.cfg.id+' page errors');
   const first=c.snaps[0],last=c.snaps.at(-1);
   assert(last.loggedIn.channels<=first.loggedIn.channels+1,c.cfg.id+' realtime channels grew across relogin');
   assert(last.loggedOut.channels<=first.loggedOut.channels,c.cfg.id+' realtime channels remained/grow after logout');
   assert.equal(last.loggedOut.observers.created,first.loggedOut.observers.created,c.cfg.id+' MutationObserver instances grew across relogin');
   assert(first.loggedOut.timers.activeIntervals<=c.ready.timers.activeIntervals+2,c.cfg.id+' intervals did not return near auth baseline after first logout');
   assert(last.loggedOut.timers.activeIntervals<=first.loggedOut.timers.activeIntervals+1,c.cfg.id+' active intervals grew across relogin');
   assert(first.loggedOut.timers.activeTimeouts<=c.ready.timers.activeTimeouts+6,c.cfg.id+' timeouts did not settle near auth baseline after first logout');
   assert(last.loggedOut.timers.activeTimeouts<=first.loggedOut.timers.activeTimeouts+4,c.cfg.id+' active timeouts grew across relogin');
   const intervalCreates1=first.loggedOut.timers.intervalCreates-c.ready.timers.intervalCreates,intervalCreates2=last.loggedOut.timers.intervalCreates-first.loggedOut.timers.intervalCreates;
   assert(intervalCreates2<=intervalCreates1+2,c.cfg.id+' interval creation accelerated '+intervalCreates1+' -> '+intervalCreates2);
   const timeoutCreates1=first.loggedOut.timers.timeoutCreates-c.ready.timers.timeoutCreates,timeoutCreates2=last.loggedOut.timers.timeoutCreates-first.loggedOut.timers.timeoutCreates;
   assert(timeoutCreates2<=timeoutCreates1*1.5+20,c.cfg.id+' timeout creation accelerated '+timeoutCreates1+' -> '+timeoutCreates2);
   const query1=first.loggedOut.supabase.queries-c.ready.supabase.queries,query2=last.loggedOut.supabase.queries-first.loggedOut.supabase.queries;
   assert(query2<=query1*1.5+12,c.cfg.id+' Supabase query work accelerated '+query1+' -> '+query2);
   const rpc1=first.loggedOut.supabase.rpcs-c.ready.supabase.rpcs,rpc2=last.loggedOut.supabase.rpcs-first.loggedOut.supabase.rpcs;
   assert(rpc2<=rpc1*1.5+6,c.cfg.id+' Supabase RPC work accelerated '+rpc1+' -> '+rpc2);
   if(first.loggedOut.heap&&last.loggedOut.heap)assert(last.loggedOut.heap<=first.loggedOut.heap*1.5+2000000,c.cfg.id+' forced-GC JS heap grew excessively '+first.loggedOut.heap+' -> '+last.loggedOut.heap);
   for(const key of listenerKeys){
    const a=(first.loggedOut.listeners.window[key]||0)+(first.loggedOut.listeners.document[key]||0);
    const b=(last.loggedOut.listeners.window[key]||0)+(last.loggedOut.listeners.document[key]||0);
    assert(b<=a+1,c.cfg.id+' global '+key+' listeners grew '+a+' -> '+b);
   }
  }
  const summary=clients.map(c=>({id:c.cfg.id,platform:c.cfg.platform,first:c.snaps[0],last:c.snaps.at(-1)}));
  console.log('AUDIT_20_CLIENTS '+JSON.stringify(summary));
  processSnapshot('20_after_cleanup');
  console.log('PASS 20 simultaneous Chromium client lifecycle stress: five desktop, five web, five Android-layout and five iOS-PWA profiles completed two concurrent login/logout cycles with bounded realtime channels, observers, global listeners, active timers, Supabase query/RPC work and forced-GC JS heap. Supabase is mocked; this validates client lifecycle/resource behavior, not production backend capacity.');
 }finally{
  await Promise.all(clients.map(c=>c.context.close().catch(()=>{})));
  await browser.close().catch(()=>{});
 }
})().catch(e=>{console.error(e);process.exit(1)});
