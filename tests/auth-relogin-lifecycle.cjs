const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),base=fs.readFileSync(path.join(__dirname,'supabase-fixture.js'),'utf8');

function source(platform){
 const doc=fs.readFileSync(path.join(root,platform==='desktop'?'desktop/desktop-client.html':'index.html'),'utf8'),marker='window.__ycClientReady=true;';
 assert(doc.includes(marker),platform+' client-ready marker missing');
 assert(doc.includes("while(ycHoverCache.size>=128)"),platform+' hover cache must stay bounded');
 assert(doc.includes("ycWinNotifyCache.size>=256"),platform+' notification lookup cache must stay bounded');
 assert(doc.includes("ycChatScrollMemory.clear();ycChatLastRendered.clear();ycLastGoodChannelsByCommunity.clear()"),platform+' auth exit must clear session caches');
 const bridge=`
window.__ycAuthCleanupRace={
 arm(){
  window.__ycRaceObservedUser=null;
  window.__ycRaceArmGeneration=ycAuthGeneration;
  window.__ycRaceObservedGeneration=null;
  const baseStop=stopScreenShare;let restored=false;
  stopScreenShare=async function(...args){
   await new Promise(resolve=>setTimeout(resolve,900));
   window.__ycRaceObservedUser=user?.id||'';
   window.__ycRaceObservedGeneration=ycAuthGeneration;
   if(!restored){restored=true;stopScreenShare=baseStop}
   return baseStop.apply(this,args)
  };
  voiceChannel={id:'voice-race-room',name:'Race room',community_id:'community-a'};
  voiceSessionId='voice-race-session';
 },
 observed:()=>({user:window.__ycRaceObservedUser,generation:window.__ycRaceObservedGeneration,armedGeneration:window.__ycRaceArmGeneration}),
 seedCaches(){
  ycChatScrollMemory.set('audit-scroll',{top:1});ycChatLastRendered.set('audit-scroll','message-a');
  ycLastGoodChannelsByCommunity.set('audit-community',[{id:'audit-channel'}]);
  ycHoverCache.set('audit-user',{ts:Date.now(),data:{p:{id:'audit-user'}}});
  ycWinNotifyCache.set('profile:audit-user',{id:'audit-user'});
  ycPresenceRowsByUser.set('audit-user',{user_id:'audit-user',state:'online',last_seen_at:new Date().toISOString()});
  ycPresenceRenderedStateByUser.set('audit-user','online');ycVisibleMemberIds.add('audit-user');
  return this.cacheSizes();
 },
 cacheSizes(){return{scroll:ycChatScrollMemory.size,lastRendered:ycChatLastRendered.size,channels:ycLastGoodChannelsByCommunity.size,hover:ycHoverCache.size,notify:ycWinNotifyCache.size,presence:ycPresenceRowsByUser.size,presenceRendered:ycPresenceRenderedStateByUser.size,visibleMembers:ycVisibleMemberIds.size}}
};
`;
 return doc.replace(marker,bridge+marker)
}
function fixture(){
 let s=base
  .replace(
   "const channel=()=>{const c={on:()=>c,subscribe:()=>c,track:async()=>{},untrack:async()=>{},send:async()=>{},presenceState:()=>({})};return c};",
   "const channel=(name)=>{const c={__name:String(name),__active:false,on:()=>c,subscribe:(cb)=>{if(!c.__active){c.__active=true;window.__auditActiveChannels.add(c.__name);window.__auditChannelCreates++}queueMicrotask(()=>cb?.('SUBSCRIBED'));return c},track:async()=>{},untrack:async()=>{},send:async()=>{},presenceState:()=>({})};return c};"
  )
  .replace(
   "return {from:query,rpc:async()=>({data:false,error:null}),channel,removeChannel:async()=>{},auth:",
   "return {from:query,rpc:async()=>({data:false,error:null}),channel,removeChannel:async(c)=>{if(c?.__name)window.__auditActiveChannels.delete(c.__name);if(c)c.__active=false},auth:"
  )
  .replace(
   "getSession:async()=>({data:{session:{user:{id:'audit-user'}}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),getUser:async()=>({data:{user:{id:'audit-user',identities:[]}}}),signOut:async()=>({error:null})",
   "getSession:async()=>({data:{session:null},error:null}),onAuthStateChange:(cb)=>{window.__authCb=cb;return {data:{subscription:{unsubscribe(){window.__authCb=null}}}}},getUser:async()=>({data:{user:window.__authSession?.user||null}}),signInWithPassword:async({email,password})=>{if(email!=='audit@example.test'||password!=='StrongPass123!')return {data:{session:null},error:new Error('Invalid login')};const session={user:{id:'audit-user'},access_token:'fixture'};window.__authSession=session;queueMicrotask(()=>window.__authCb?.('SIGNED_IN',session));return {data:{session},error:null}},signOut:async()=>{window.__authSession=null;queueMicrotask(()=>window.__authCb?.('SIGNED_OUT',null));return {error:null}}"
  );
 return s+";window.__authSession=null;window.__auditActiveChannels=new Set();window.__auditChannelCreates=0;";
}

(async()=>{
 const browser=await chromium.launch({headless:true,args:['--enable-precise-memory-info']});
 try{
  for(const cfg of [
   {platform:'desktop',width:1280,height:800},
   {platform:'web',width:1440,height:900},
   {platform:'android',width:390,height:844,touch:true},
   {platform:'ios-pwa',width:390,height:844,touch:true,ios:true}
  ]){
   const context=await browser.newContext({viewport:{width:cfg.width,height:cfg.height},hasTouch:!!cfg.touch,isMobile:!!cfg.touch,serviceWorkers:'block',...(cfg.ios?{userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1'}:{})});
   await context.addInitScript(()=>{
    if(navigator.userAgent.includes('iPhone'))Object.defineProperty(navigator,'standalone',{value:true,configurable:true});
    window.__auditGlobalAdds={window:{},document:{}};
    window.__auditObservers={created:0,observeCalls:0,disconnectCalls:0};
    const NativeMutationObserver=window.MutationObserver;
    window.MutationObserver=function(callback){
      const observer=new NativeMutationObserver(callback);window.__auditObservers.created++;
      const observe=observer.observe.bind(observer),disconnect=observer.disconnect.bind(observer);
      observer.observe=(...args)=>{window.__auditObservers.observeCalls++;return observe(...args)};
      observer.disconnect=(...args)=>{window.__auditObservers.disconnectCalls++;return disconnect(...args)};
      return observer;
    };
    window.MutationObserver.prototype=NativeMutationObserver.prototype;
    const base=EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener=function(type,fn,opts){
      const bucket=this===window?window.__auditGlobalAdds.window:this===document?window.__auditGlobalAdds.document:null;
      if(bucket)bucket[type]=(bucket[type]||0)+1;
      return base.call(this,type,fn,opts);
    };
   });
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/*',route=>{
    const u=new URL(route.request().url());if(u.hostname!=='127.0.0.1')return route.abort();
    if(u.pathname.endsWith('/supabase.js'))return route.fulfill({contentType:'text/javascript',body:fixture()});
    if(u.pathname==='/')return route.fulfill({contentType:'text/html',body:source(cfg.platform)});
    const file=path.resolve(root,'.'+decodeURIComponent(u.pathname));if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||fs.statSync(file).isDirectory())return route.fulfill({status:404,body:''});return route.fulfill({path:file});
   });
   await page.goto('http://127.0.0.1/');await page.waitForFunction(()=>window.__ycClientReady,{},{timeout:20000});await page.waitForSelector('#auth:not(.hidden)');
   const snapshots=[];
   for(let cycle=0;cycle<5;cycle++){
    await page.locator('#email').fill('audit@example.test');await page.locator('#password').fill('StrongPass123!');await page.locator('#authSubmit').click();await page.waitForSelector('#app:not(.hidden)',{timeout:20000});
    await page.waitForTimeout(100);
    const loggedIn=await page.evaluate(()=>({active:[...window.__auditActiveChannels].sort(),creates:window.__auditChannelCreates,listeners:JSON.parse(JSON.stringify(window.__auditGlobalAdds)),observers:{...window.__auditObservers},heap:performance.memory?.usedJSHeapSize||0}));
    const seeded=await page.evaluate(()=>window.__ycAuthCleanupRace.seedCaches());assert(Object.values(seeded).every(n=>n>0),cfg.platform+' cache seed failed: '+JSON.stringify(seeded));
    await page.evaluate(()=>document.querySelector('#logoutBtn')?.click());await page.waitForSelector('#auth:not(.hidden)',{timeout:15000});await page.waitForTimeout(100);
    const loggedOut=await page.evaluate(()=>({active:[...window.__auditActiveChannels].sort(),creates:window.__auditChannelCreates,listeners:JSON.parse(JSON.stringify(window.__auditGlobalAdds)),observers:{...window.__auditObservers},heap:performance.memory?.usedJSHeapSize||0,caches:window.__ycAuthCleanupRace.cacheSizes()}));
    assert(Object.values(loggedOut.caches).every(n=>n===0),cfg.platform+' session caches survive logout: '+JSON.stringify(loggedOut.caches));
    snapshots.push({cycle:cycle+1,loggedIn,loggedOut});
   }
   const firstIn=snapshots[0].loggedIn.active.length,firstOut=snapshots[0].loggedOut.active.length;
   for(const snap of snapshots){
    assert(snap.loggedIn.active.length<=firstIn+1,cfg.platform+' realtime channels grow after relogin: '+JSON.stringify(snap));
    assert(snap.loggedOut.active.length<=firstOut,cfg.platform+' realtime channels remain after logout: '+JSON.stringify(snap));
   }
   // Deliberately keep the old voice cleanup pending while a new login starts.
   await page.locator('#email').fill('audit@example.test');await page.locator('#password').fill('StrongPass123!');await page.locator('#authSubmit').click();
   await page.waitForSelector('#app:not(.hidden)',{timeout:20000});
   await page.evaluate(()=>window.__ycAuthCleanupRace.arm());
   await page.evaluate(()=>document.querySelector('#logoutBtn')?.click());
   await page.waitForSelector('#auth:not(.hidden)',{timeout:15000});
   await page.locator('#email').fill('audit@example.test');await page.locator('#password').fill('StrongPass123!');await page.locator('#authSubmit').click();
   await page.waitForSelector('#app:not(.hidden)',{timeout:20000});
   const raceObserved=await page.evaluate(()=>window.__ycAuthCleanupRace.observed());
   assert(raceObserved&&raceObserved.generation!==null,cfg.platform+' previous voice cleanup did not finish before the new app became ready');
   assert.equal(raceObserved.generation,raceObserved.armedGeneration,cfg.platform+' previous voice cleanup crossed into a newer auth generation: '+JSON.stringify(raceObserved));
   await page.evaluate(()=>document.querySelector('#logoutBtn')?.click());await page.waitForSelector('#auth:not(.hidden)',{timeout:15000});

   const listenerKeys=['focus','online','offline','visibilitychange','pointerdown','keydown','touchstart','mousemove','click'];
   const firstListeners=snapshots[0].loggedOut.listeners,lastListeners=snapshots.at(-1).loggedOut.listeners;
   for(const k of listenerKeys){
    const before=(firstListeners.window[k]||0)+(firstListeners.document[k]||0),after=(lastListeners.window[k]||0)+(lastListeners.document[k]||0);
    assert(after<=before+1,cfg.platform+' global '+k+' listener count grows across relogins: '+before+' -> '+after);
   }
   const firstObserverCreates=snapshots[0].loggedOut.observers.created,lastObserverCreates=snapshots.at(-1).loggedOut.observers.created;
   assert.equal(lastObserverCreates,firstObserverCreates,cfg.platform+' MutationObserver instances grow across relogins: '+firstObserverCreates+' -> '+lastObserverCreates);
   assert.deepEqual(errors,[],cfg.platform+' relogin runtime errors');
   console.log('AUDIT_RELOGIN '+cfg.platform+' '+JSON.stringify(snapshots));
   await context.close();
  }
 }finally{await browser.close()}
 console.log('PASS repeated login/logout lifecycle on desktop, web, Android and iOS-PWA: realtime subscriptions, global lifecycle listeners and MutationObserver instances remain bounded, and previous voice cleanup cannot cross into a new auth session.');
})().catch(e=>{console.error(e);process.exit(1)});
