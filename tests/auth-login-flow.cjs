const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const base=fs.readFileSync(path.join(__dirname,'supabase-fixture.js'),'utf8');

function source(platform){return fs.readFileSync(path.join(root,platform==='desktop'?'desktop/desktop-client.html':'index.html'),'utf8')}
function authFixture(){
  let s=base;
  s=s.replace(
    "getSession:async()=>({data:{session:{user:{id:'audit-user'}}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),getUser:async()=>({data:{user:{id:'audit-user',identities:[]}}}),signOut:async()=>({error:null})",
    "getSession:async()=>({data:{session:null},error:null}),onAuthStateChange:(cb)=>{window.__authCb=cb;return {data:{subscription:{unsubscribe(){window.__authCb=null}}}}},getUser:async()=>({data:{user:window.__authSession?.user||null}}),signInWithPassword:async({email,password})=>{window.__loginAttempts=(window.__loginAttempts||0)+1;if(email!=='journey@example.test'||password!=='StrongPass123!')return {data:{session:null},error:new Error('Invalid login')};const session={user:{id:'audit-user'},access_token:'fixture-token'};window.__authSession=session;queueMicrotask(()=>window.__authCb?.('SIGNED_IN',session));return {data:{session},error:null}},signOut:async()=>{window.__authSession=null;queueMicrotask(()=>window.__authCb?.('SIGNED_OUT',null));return {error:null}}"
  );
  return s+";window.__loginAttempts=0;window.__authSession=null;";
}

(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  for(const cfg of [
   {platform:'desktop',width:1280,height:800,touch:false},
   {platform:'web',width:1440,height:900,touch:false},
   {platform:'android',width:390,height:844,touch:true},
   {platform:'ios-pwa',width:390,height:844,touch:true,ios:true}
  ]){
   const context=await browser.newContext({viewport:{width:cfg.width,height:cfg.height},hasTouch:cfg.touch,isMobile:cfg.touch,serviceWorkers:'block',...(cfg.ios?{userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1'}:{})});
   if(cfg.ios)await context.addInitScript(()=>Object.defineProperty(navigator,'standalone',{value:true,configurable:true}));
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/*',route=>{
    const u=new URL(route.request().url());if(u.hostname!=='127.0.0.1')return route.abort();
    if(u.pathname.endsWith('/supabase.js'))return route.fulfill({contentType:'text/javascript',body:authFixture()});
    if(u.pathname==='/')return route.fulfill({contentType:'text/html',body:source(cfg.platform)});
    const file=path.resolve(root,'.'+decodeURIComponent(u.pathname));
    if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||fs.statSync(file).isDirectory())return route.fulfill({status:404,body:''});
    return route.fulfill({path:file});
   });
   await page.goto('http://127.0.0.1/');
   await page.waitForFunction(()=>window.__ycClientReady,{},{timeout:20000});
   await page.waitForSelector('#auth:not(.hidden)');
   assert(await page.locator('#app').evaluate(el=>el.classList.contains('hidden')),cfg.platform+' app visible before login');
   await page.locator('#email').fill('journey@example.test');
   await page.locator('#password').fill('StrongPass123!');
   await page.locator('#authSubmit').click();
   await page.waitForSelector('#app:not(.hidden)',{timeout:20000});
   const state=await page.evaluate(()=>({uid:user?.id,community:currentCommunity?.id,channel:currentChannel?.id,attempts:window.__loginAttempts,authHidden:document.querySelector('#auth')?.classList.contains('hidden')}));
   assert.equal(state.uid,'audit-user',cfg.platform+' login did not create authenticated app state');
   assert.equal(state.community,'community-a',cfg.platform+' login did not load communities');
   assert.equal(state.channel,'chat-a',cfg.platform+' login did not select text channel');
   assert.equal(state.attempts,1,cfg.platform+' login submitted more than once');
   assert.equal(state.authHidden,true,cfg.platform+' auth screen remained visible after login');
   await page.locator('#logoutBtn').click();
   await page.waitForSelector('#auth:not(.hidden)');
   assert.equal(await page.evaluate(()=>user),null,cfg.platform+' logout did not clear user state');
   assert.deepEqual(errors,[],cfg.platform+' login flow page errors');
   await context.close();
  }
 }finally{await browser.close()}
 console.log('PASS auth login/logout and initial community/channel bootstrap on desktop, web, Android layout and iOS PWA.');
})().catch(e=>{console.error(e);process.exit(1)});
