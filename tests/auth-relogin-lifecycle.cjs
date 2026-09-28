const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),base=fs.readFileSync(path.join(__dirname,'supabase-fixture.js'),'utf8');

function source(platform){return fs.readFileSync(path.join(root,platform==='desktop'?'desktop/desktop-client.html':'index.html'),'utf8')}
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
    const loggedIn=await page.evaluate(()=>({active:[...window.__auditActiveChannels].sort(),creates:window.__auditChannelCreates,listeners:JSON.parse(JSON.stringify(window.__auditGlobalAdds)),heap:performance.memory?.usedJSHeapSize||0}));
    await page.evaluate(()=>document.querySelector('#logoutBtn')?.click());await page.waitForSelector('#auth:not(.hidden)',{timeout:15000});await page.waitForTimeout(100);
    const loggedOut=await page.evaluate(()=>({active:[...window.__auditActiveChannels].sort(),creates:window.__auditChannelCreates,listeners:JSON.parse(JSON.stringify(window.__auditGlobalAdds)),heap:performance.memory?.usedJSHeapSize||0}));
    snapshots.push({cycle:cycle+1,loggedIn,loggedOut});
   }
   const firstIn=snapshots[0].loggedIn.active.length,firstOut=snapshots[0].loggedOut.active.length;
   for(const snap of snapshots){
    assert(snap.loggedIn.active.length<=firstIn+1,cfg.platform+' realtime channels grow after relogin: '+JSON.stringify(snap));
    assert(snap.loggedOut.active.length<=firstOut,cfg.platform+' realtime channels remain after logout: '+JSON.stringify(snap));
   }
   const listenerKeys=['focus','online','offline','visibilitychange','pointerdown','keydown','touchstart','mousemove'];
   const firstListeners=snapshots[0].loggedOut.listeners,lastListeners=snapshots.at(-1).loggedOut.listeners;
   for(const k of listenerKeys){
    const before=(firstListeners.window[k]||0)+(firstListeners.document[k]||0),after=(lastListeners.window[k]||0)+(lastListeners.document[k]||0);
    assert(after<=before+1,cfg.platform+' global '+k+' listener count grows across relogins: '+before+' -> '+after);
   }
   assert.deepEqual(errors,[],cfg.platform+' relogin runtime errors');
   console.log('AUDIT_RELOGIN '+cfg.platform+' '+JSON.stringify(snapshots));
   await context.close();
  }
 }finally{await browser.close()}
 console.log('PASS 5x login/logout lifecycle on desktop, web, Android and iOS-PWA: realtime subscriptions and global lifecycle listeners do not grow across relogins.');
})().catch(e=>{console.error(e);process.exit(1)});
