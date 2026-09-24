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
  for(const [target,platform] of [['index.html','web'],['index.html','android'],['index.html','ios-pwa'],['desktop-client-dist/desktop-client.html','desktop']]){
   const adapt=html=>platform==='android'?html.replace('<head>','<head><script>document.documentElement.classList.add("yc-native-android");<\/script>'):html;
   const options=platform==='ios-pwa'?{userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'}:{};
   const page=await browser.newPage({viewport:{width:1440,height:960},serviceWorkers:'block',...options});
   if(platform==='ios-pwa')await page.addInitScript(()=>Object.defineProperty(navigator,'standalone',{get:()=>true}));
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/*',route=>{
    const u=new URL(route.request().url());
    if(u.hostname!=='127.0.0.1')return route.abort();
    if(u.pathname==='/vendor/supabase.js'||u.pathname.endsWith('/node_modules/@supabase/supabase-js/dist/umd/supabase.js')){
      return route.fulfill({contentType:'application/javascript',body:mock});
    }
    if(u.pathname==='/'){
      return route.fulfill({contentType:'text/html',body:adapt(fs.readFileSync(path.join(root,target),'utf8'))});
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

   // Mobile drawers exist only in the web/PWA/mobile build. They must stay
   // above the decorative frame and remain fully interactive.
   if(target==='index.html'){
    await page.setViewportSize({width:390,height:844});
    await page.waitForTimeout(120);
    await page.locator('#mobileMenu').click();
    await page.waitForFunction(()=>document.getElementById('app')?.classList.contains('yc-mobile-drawer-open'));
    assert.equal(await page.locator('#ycActiveServerConnectedFrame.show').count(),0,target+' connected frame must hide while a drawer is open');
    assert(await page.locator('#side.mobile-open').isVisible(),target+' channel drawer must remain visible');
    await page.locator('[data-channel="chat-b"]').click();
    await page.waitForFunction(()=>!document.getElementById('app')?.classList.contains('yc-mobile-drawer-open'));
    await page.waitForFunction(()=>document.getElementById('ycActiveServerConnectedFrame')?.classList.contains('show'));
    await page.locator('#mobileMenu').click();
    await page.waitForFunction(()=>document.getElementById('app')?.classList.contains('yc-mobile-drawer-open'));
    const scrimBox=await page.locator('#ycMobileScrim').boundingBox();
    assert(scrimBox,target+' mobile scrim must have geometry');
    await page.mouse.click(scrimBox.x+scrimBox.width-6,scrimBox.y+Math.min(300,scrimBox.height/2));
    await page.waitForFunction(()=>!document.getElementById('app')?.classList.contains('yc-mobile-drawer-open'));
    await page.waitForFunction(()=>document.getElementById('ycActiveServerConnectedFrame')?.classList.contains('show'));
    await page.setViewportSize({width:1440,height:960});
    await page.waitForTimeout(120);
   }

   // Validate real app geometry against the same document without the visual.
   const css=fs.readFileSync(path.join(root,'web/active-server-context.css'),'utf8');
   const visual=fs.readFileSync(path.join(root,'web/active-server-context.js'),'utf8');
   const boxes=()=>Object.fromEntries(['.yc-v3-content-grid','.yc-v3-content-grid>.chat','.composer-wrap','.yc-v3-voice-host'].map(sel=>{
     const r=document.querySelector(sel)?.getBoundingClientRect();return [sel,r?{x:r.x,y:r.y,width:r.width,height:r.height}:null];
   }));
   for(const [width,height] of target==='index.html'?[[390,844],[844,390],[320,740],[768,1024],[1440,960]]:[[1440,960]]){
     await page.setViewportSize({width,height});
     await page.waitForTimeout(200);
     const before=await page.evaluate(boxes);
     const geometry=await page.evaluate(()=>{
       const svg=document.getElementById('ycActiveServerConnectedFrame'),voice=document.querySelector('.yc-v3-voice-host')?.getBoundingClientRect();
       const path=svg?.querySelector('.yc-active-server-frame-core'),box=path?.getBBox();
       return {pointer:svg&&getComputedStyle(svg).pointerEvents,stroke:path&&getComputedStyle(path).strokeWidth,bottom:box&&box.y+box.height,voiceBottom:voice?.bottom,visible:svg?.classList.contains('show'),overflow:document.documentElement.scrollWidth>innerWidth};
     });
     assert.equal(geometry.pointer,'none');assert.equal(geometry.stroke,'2px');assert.equal(geometry.visible,true);
     assert.equal(geometry.overflow,false,'frame must not create horizontal overflow');
     if(geometry.voiceBottom>0)assert(geometry.bottom>=Math.min(height-3,geometry.voiceBottom)-4,'frame must contain existing voice dock');
     await page.screenshot({path:path.join(__dirname,`connected-frame-${platform}-${width}x${height}.png`)});
     // Rendering the frame must not continually reschedule itself while idle.
     await page.evaluate(()=>{window.__frameChanges=0;window.__frameAudit=new MutationObserver(rs=>window.__frameChanges+=rs.filter(r=>r.attributeName==='d').length);window.__frameAudit.observe(document.getElementById('ycActiveServerConnectedFrame'),{subtree:true,attributes:true})});
     await page.waitForTimeout(350);
     assert((await page.evaluate(()=>window.__frameChanges))<8,'frame must settle when app is idle');
     await page.evaluate(()=>window.__frameAudit.disconnect());
     const html=fs.readFileSync(path.join(root,target),'utf8').replace(visual,'').replace(css,'');
     const base=await browser.newPage({viewport:{width,height},serviceWorkers:'block',...options});
     if(platform==='ios-pwa')await base.addInitScript(()=>Object.defineProperty(navigator,'standalone',{get:()=>true}));
     await base.route('**/*',route=>{
       const u=new URL(route.request().url());if(u.hostname!=='127.0.0.1')return route.abort();
       if(u.pathname==='/')return route.fulfill({contentType:'text/html',body:adapt(html)});
       if(u.pathname==='/vendor/supabase.js'||u.pathname.endsWith('/node_modules/@supabase/supabase-js/dist/umd/supabase.js'))return route.fulfill({contentType:'application/javascript',body:mock});
       const file=path.join(root,decodeURIComponent(u.pathname));return file.startsWith(root+path.sep)&&fs.existsSync(file)?route.fulfill({path:file}):route.fulfill({status:404,body:''});
     });
     await base.goto('http://127.0.0.1/');await base.waitForFunction(()=>window.__ycClientReady);await base.waitForTimeout(200);
     assert.deepEqual(before,await base.evaluate(boxes),'frame must not move chat/composer/voice '+width);
     await base.close();
   }
   await page.setViewportSize({width:1440,height:960});await page.waitForTimeout(120);

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
   console.log('PASS active server context:',target,platform);
  }
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
