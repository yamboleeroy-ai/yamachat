const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {chromium}=require('playwright');
const mock=fs.readFileSync(path.join(__dirname,'supabase-fixture.js'),'utf8');
(async()=>{
 const browser=await chromium.launch({...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{}),headless:true});
 const results=[];
 for(const logged of [false,true]){
 const page=await browser.newPage({serviceWorkers:'block'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.pathname==='/vendor/supabase.js')return route.fulfill({contentType:'application/javascript',body:logged?mock:mock.replace("session:{user:{id:'audit-user'}}","session:null")});if(u.hostname!=='127.0.0.1')return route.abort();return route.continue()});
 for(const [width,height] of [[1440,960],[1024,768],[768,1024],[390,844],[320,568],[844,390]]){
 await page.setViewportSize({width,height});await page.goto('http://127.0.0.1:4173');await page.waitForFunction(()=>window.__ycClientReady,{},{timeout:20000});
 assert.deepEqual(errors,[]);if(logged&&!(await page.locator('#app').isVisible())){console.log(await page.locator('body').innerText());await page.screenshot({path:path.join(__dirname,'failed-chat.png')});}
 if(!logged){assert(await page.locator('#auth').isVisible());assert.equal(await page.locator('#ycAuthDownloads [data-download-platform]').count(),3)}
 else{assert(await page.locator('#app').isVisible());if(width<=1100){await page.locator('#ycMobileNavBtn').click();assert(await page.locator('#ycGlobalNav').isVisible());await page.keyboard.press('Escape');await page.locator('#mobileMenu').click();await page.locator('[data-channel="chat-b"]').first().click();await page.waitForFunction(()=>document.getElementById('messages').dataset.ycRenderedChatKey?.includes('chat-b'));}}
 const dimensions=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,width:innerWidth,chat:document.getElementById('messages').getBoundingClientRect().toJSON(),composer:document.getElementById('messageInput').getBoundingClientRect().toJSON()}));
 await page.screenshot({path:path.join(__dirname,`ui-${logged?'chat':'login'}-${width}.png`)});
 if(logged)assert(dimensions.composer.bottom<=height+2,JSON.stringify({width,height,dimensions}));
 results.push({logged,width,height,dimensions});
 }await page.close();}
 fs.writeFileSync(path.join(__dirname,'ui-results.json'),JSON.stringify(results,null,2));await browser.close();console.log('PASS: login, installation offers, chat navigation and composer across 6 viewports.');
})().catch(e=>{console.error(e);process.exit(1)});
