const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');

const baseMock=fs.readFileSync(path.join(__dirname,'supabase-fixture.js'),'utf8');
const mock=baseMock
  .replace(
    /const communities=\[[^\n]+\];/,
    "const communities=[{id:'community-a',name:'Testovací server A',owner_id:'audit-user',server_color:'#1a9fff'},{id:'community-b',name:'Testovací server B',owner_id:'audit-user',server_color:'#b34dff'}];"
  )
  .replace(
    /const channels=\[[^\n]+\];/,
    "const channels=[{id:'chat-a',community_id:'community-a',name:'obecný-a',kind:'text'},{id:'chat-b',community_id:'community-a',name:'druhý-a',kind:'text'},{id:'chat-c',community_id:'community-b',name:'obecný-b',kind:'text'}];"
  )
  .replace(
    /if\(table==='community_members'\)data=\[[^\n]+\];/,
    "if(table==='community_members')data=[{user_id:'audit-user',community_id:'community-a',role:'owner',profiles:profile},{user_id:'audit-user',community_id:'community-b',role:'owner',profiles:profile}];"
  );

(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
 try{
  for(const target of ['index.html','desktop-client-dist/desktop-client.html']){
   const page=await browser.newPage({viewport:{width:1440,height:960},serviceWorkers:'block'});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/*',route=>{
    const u=new URL(route.request().url());
    if(u.hostname!=='127.0.0.1')return route.abort();
    if(u.pathname==='/vendor/supabase.js'||u.pathname.endsWith('/node_modules/@supabase/supabase-js/dist/umd/supabase.js')){
      return route.fulfill({contentType:'application/javascript',body:mock});
    }
    if(u.pathname==='/'){
      return route.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(root,target),'utf8')});
    }
    const file=path.join(root,decodeURIComponent(u.pathname));
    if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:''});
    return route.fulfill({path:file});
   });

   await page.goto('http://127.0.0.1/');
   await page.waitForFunction(()=>window.__ycClientReady,{},{timeout:15000});
   await page.waitForFunction(()=>document.getElementById('app')?.classList.contains('yc-active-server-context'),{},{timeout:5000});

   let state=await page.evaluate(()=>({
    app:document.getElementById('app')?.classList.contains('yc-active-server-context'),
    id:document.getElementById('app')?.dataset.ycActiveServerContext||'',
    highlighted:[...document.querySelectorAll('[data-community].yc-active-server-context-card')].map(x=>x.dataset.community),
    frameVisible:document.getElementById('ycActiveServerConnectedFrame')?.classList.contains('show')||false,
    frameCommunity:document.getElementById('ycActiveServerConnectedFrame')?.dataset.community||'',
    frameMode:document.getElementById('ycActiveServerConnectedFrame')?.dataset.frameMode||'',
    framePath:document.querySelector('#ycActiveServerConnectedFrame .yc-active-server-frame-core')?.getAttribute('d')||''
   }));
   assert.equal(state.app,true,target+' should start in server context');
   assert.equal(state.id,'community-a',target+' should highlight first active server');
   assert.deepEqual(state.highlighted,['community-a']);
   assert.equal(state.frameVisible,true,target+' connected frame must be visible');
   assert.equal(state.frameCommunity,'community-a');
   assert.equal(state.frameMode,'connected-tab');
   assert.match(state.framePath,/^M /,target+' connected frame path must be drawn');
   const firstFramePath=state.framePath;

   await page.locator('#ycV3Friends').click();
   await page.waitForFunction(()=>!document.getElementById('app')?.classList.contains('yc-active-server-context'));
   assert.equal(await page.locator('[data-community].yc-active-server-context-card').count(),0,target+' friends context must have no server highlight');
   assert.equal(await page.locator('#ycActiveServerConnectedFrame.show').count(),0,target+' friends context must hide connected frame');

   await page.locator('[data-community="community-b"]').click();
   await page.waitForFunction(()=>document.getElementById('app')?.dataset.ycActiveServerContext==='community-b',{},{timeout:5000});
   assert.equal(await page.locator('[data-community="community-b"].yc-active-server-context-card').count(),1,target+' must move highlight to clicked server');
   assert.equal(await page.locator('[data-community="community-a"].yc-active-server-context-card').count(),0,target+' old server highlight must clear');
   const secondFrame=await page.evaluate(()=>({
    community:document.getElementById('ycActiveServerConnectedFrame')?.dataset.community||'',
    path:document.querySelector('#ycActiveServerConnectedFrame .yc-active-server-frame-core')?.getAttribute('d')||''
   }));
   assert.equal(secondFrame.community,'community-b',target+' connected frame must follow clicked server');
   assert.notEqual(secondFrame.path,firstFramePath,target+' connected frame geometry must move with the active card');

   await page.locator('#ycV3Home').click();
   await page.waitForFunction(()=>!document.getElementById('app')?.classList.contains('yc-active-server-context'));
   assert.equal(await page.locator('[data-community].yc-active-server-context-card').count(),0,target+' global Home must not show server context outline');
   assert.equal(await page.locator('#ycActiveServerConnectedFrame.show').count(),0,target+' Home must hide connected frame');

   await page.locator('[data-channel="chat-c"]').click();
   await page.waitForFunction(()=>document.getElementById('app')?.dataset.ycActiveServerContext==='community-b',{},{timeout:5000});
   assert.equal(await page.locator('[data-community="community-b"].yc-active-server-context-card').count(),1,target+' server channel returns server context');

   assert.deepEqual(errors,[],target+' page errors: '+JSON.stringify(errors));
   await page.close();
   console.log('PASS active server context:',target);
  }
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
