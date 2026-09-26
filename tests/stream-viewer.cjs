const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const fixture=require('./stream-viewer-fixture.cjs');
const out=process.env.STREAM_TEST_OUTPUT||path.join(fixture.root,'test-results');fs.mkdirSync(out,{recursive:true});
const results=[];
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
 try{
  for(const [platform,width,height,touch] of [['web',1440,900,false],['desktop',650,500,false],['android',390,844,true],['ios-layout',390,844,true]]){
   const page=await browser.newPage({viewport:{width,height},hasTouch:touch,isMobile:touch,serviceWorkers:'block'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/*',route=>{
    const u=new URL(route.request().url());if(u.hostname!=='127.0.0.1')return route.abort();
    if(u.pathname.endsWith('/supabase.js'))return route.fulfill({contentType:'text/javascript',body:fixture.mock()});
    if(u.pathname==='/')return route.fulfill({contentType:'text/html',body:fixture.html(platform==='desktop')});
    const file=path.resolve(fixture.root,'.'+u.pathname);if(!file.startsWith(fixture.root+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:''});return route.fulfill({path:file});
   });
   await page.goto('http://127.0.0.1/');await page.waitForFunction(()=>window.__ycClientReady);
   await page.evaluate(()=>Object.defineProperty(navigator.mediaDevices,'getDisplayMedia',{value:undefined,configurable:true}));
   await page.evaluate(()=>streamTest.start());
   await page.waitForFunction(()=>document.querySelector('.yc-stream-viewer video')?.videoWidth>0);
   const video=page.locator('.yc-stream-viewer video');
   const initialTime=await video.evaluate(v=>v.currentTime);
   await page.waitForFunction(t=>document.querySelector('.yc-stream-viewer video').currentTime>t+.1,initialTime);
   const chatBefore=await page.locator('#messages').boundingBox();
   await page.locator('[data-action="minimize"]').click();
   const chatAfter=await page.locator('#messages').boundingBox();assert.deepEqual(chatAfter,chatBefore,'viewer must not resize chat');
   await page.locator('.yc-sv-media').click();
   for(const where of ['channel','server','friends','dm','settings']){
    await page.evaluate(w=>streamTest.navigate(w),where);
    assert(await page.evaluate(()=>streamTest.same()),platform+' player/peer survived '+where);
    assert(await page.locator('.yc-stream-viewer').isVisible());
   }
   // Settings stays operable; dismiss only its own dialog for pointer tests.
   await page.evaluate(()=>document.getElementById('modalRoot').replaceChildren());
   await page.locator('[data-action="minimize"]').click();
   assert.equal(await page.locator('.yc-stream-viewer').getAttribute('data-mode'),'mini');
   await page.waitForTimeout(550);
   const overlaps=await page.evaluate(()=>{
    const r=document.querySelector('.yc-stream-viewer').getBoundingClientRect();
    return [...document.querySelectorAll('.composer-wrap,.voice-controls,#ycMobileVoiceDock,#ycGlobalNav,#rail,#ycMobileHeader,#mobileMenu,#ycMobileNavBtn')].filter(n=>{const b=n.getBoundingClientRect();return b.width&&b.height&&getComputedStyle(n).visibility!=='hidden'&&Math.min(r.right,b.right)>Math.max(r.left,b.left)+1&&Math.min(r.bottom,b.bottom)>Math.max(r.top,b.top)+1}).map(n=>n.id||n.className);
   });assert.deepEqual(overlaps,[],platform+' mini overlaps controls');
   await page.screenshot({path:path.join(out,platform+'-mini.png')});
   await page.locator('.yc-sv-media').click();
   assert.equal(await page.locator('.yc-stream-viewer').getAttribute('data-mode'),'floating');
   if(!touch){
    await page.locator('[data-action="maximize"]').click();assert.equal(await page.locator('.yc-stream-viewer').getAttribute('data-mode'),'maximized');
    await page.keyboard.press('Escape');
    await page.locator('.yc-sv-resize').focus();await page.keyboard.press('ArrowLeft');await page.keyboard.press('ArrowUp');
    const panel=page.locator('.yc-stream-viewer'),old=await panel.boundingBox(),handle=await page.locator('.yc-sv-header').boundingBox();
    await page.mouse.move(handle.x+50,handle.y+20);await page.mouse.down();await page.mouse.move(handle.x+65,handle.y+35);await page.mouse.up();
    const moved=await panel.boundingBox();assert(moved.x!==old.x||moved.y!==old.y,'drag moves viewer');
    await page.locator('.yc-sv-resize').focus();await page.keyboard.press('ArrowLeft');assert((await panel.boundingBox()).width<moved.width,'keyboard resize');
   }
   for(const [w,h] of touch?[[844,390],[390,844],[320,568]]:[[900,620],[1920,1080],[650,500]]){
    await page.setViewportSize({width:w,height:h});await page.waitForTimeout(100);
    const r=await page.locator('.yc-stream-viewer').boundingBox();assert(r.x>=0&&r.y>=0&&r.x+r.width<=w+1&&r.y+r.height<=h+1,JSON.stringify({platform,w,h,r}));
    assert(await page.evaluate(()=>streamTest.same()));
    assert.equal(await page.locator('.yc-stream-viewer').getAttribute('data-mobile'),String(touch),'desktop web stays floating when narrow');
   }
   await page.evaluate(()=>streamTest.pending());assert.equal(await page.locator('.yc-stream-viewer').getAttribute('data-state'),'connecting');
   await page.evaluate(()=>streamTest.restored());assert.equal(await page.locator('.yc-stream-viewer').getAttribute('data-state'),'playing');
   await page.context().setOffline(true);await page.waitForTimeout(100);assert.equal(await page.locator('.yc-stream-viewer').getAttribute('data-state'),'connecting');
   await page.context().setOffline(false);await page.waitForTimeout(150);assert(await page.evaluate(()=>streamTest.same()),'short offline does not destroy session');
   await page.evaluate(()=>streamTest.recovery());assert(await page.evaluate(()=>streamTest.same()),'recovery preserves node');
   const recoveredTime=await video.evaluate(v=>v.currentTime);await page.waitForFunction(t=>document.querySelector('.yc-stream-viewer video').currentTime>t+.2,recoveredTime);
   await page.locator('[data-action="fullscreen"]').click();
   await page.waitForFunction(()=>!!document.fullscreenElement||document.querySelector('.yc-stream-viewer')?.dataset.mode==='maximized');
   assert(await page.evaluate(()=>!!document.fullscreenElement||document.querySelector('.yc-stream-viewer').dataset.mode==='maximized'),'fullscreen or app fallback');
   await page.evaluate(async()=>{if(document.fullscreenElement)await document.exitFullscreen()});
   await page.screenshot({path:path.join(out,platform+'-viewer.png')});
   await page.locator('[data-action="close"]').click();assert.equal(await page.locator('.yc-stream-viewer').count(),0);assert.equal(await page.evaluate(()=>streamTest.watched()),false);
   assert.equal(await page.evaluate(()=>streamTest.receiver.connectionState),'connected','closing viewer retains voice peer');
   await page.evaluate(()=>streamTest.cleanup());
   await page.evaluate(()=>streamTest.start());await page.waitForFunction(()=>document.querySelector('.yc-stream-viewer video')?.videoWidth>0);
   await page.evaluate(()=>streamTest.stop());assert.equal(await page.locator('.yc-stream-viewer').count(),0,'stream stop clears viewer');
   await page.evaluate(()=>streamTest.cleanup());await page.evaluate(()=>streamTest.start());await page.waitForFunction(()=>document.querySelector('.yc-stream-viewer video')?.videoWidth>0);
   await page.evaluate(()=>streamTest.detach());assert.equal(await page.locator('.yc-stream-viewer').count(),0,'peer leaving clears viewer');
   await page.evaluate(()=>streamTest.cleanup());assert.deepEqual(errors,[],platform+' runtime errors');
   if(platform==='web'){
    await page.evaluate(()=>streamTest.unavailable());assert.equal(await page.locator('.yc-stream-viewer').getAttribute('data-state'),'connecting');
    await page.waitForFunction(()=>!document.querySelector('.yc-stream-viewer'),null,{timeout:15000});
   }
   results.push({platform,engine:'Chromium',width,height,touch,passed:true});await page.close();
  }
 }finally{await browser.close();fs.writeFileSync(path.join(out,'stream-results.json'),JSON.stringify(results,null,2))}
 console.log('PASS: real loopback WebRTC video, navigation identity, mini exclusion, drag/resize, orientation, recovery and cleanup on 4 client configurations.');
})().catch(e=>{console.error(e);process.exit(1)});
