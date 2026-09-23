const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {chromium}=require('playwright');
const repo=path.resolve(__dirname,'../..');const root=path.join(repo,'mobile/android/app/src/main/assets/public');
(async()=>{const browser=await chromium.launch({...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{}),headless:true});
const results=[];const output=process.env.ANDROID_TEST_OUTPUT; if(output)fs.mkdirSync(output,{recursive:true});
for(const width of [320,390,412,600])for(const inset of [0,24,48]){
 const page=await browser.newPage({viewport:{width,height:844},serviceWorkers:'block'});
 await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.hostname!=='yamachat.test')return route.abort();const f=u.pathname==='/vendor/supabase.js'?'tests/supabase-fixture.js':u.pathname==='/'?'index.html':u.pathname.slice(1);const file=path.join(f.startsWith('tests/')?repo:root,f);return fs.existsSync(file)?route.fulfill({path:file}):route.abort()});
 await page.addInitScript(({inset})=>document.addEventListener('DOMContentLoaded',()=>{document.documentElement.classList.add('yc-native-android');document.documentElement.style.setProperty('--safe-area-inset-bottom',inset+'px')}),{inset});
 const cdp=await page.context().newCDPSession(page);await cdp.send('Emulation.setSafeAreaInsetsOverride',{insets:{bottom:inset}});
 await page.goto('http://yamachat.test');await page.waitForFunction(()=>window.__ycClientReady);await page.locator('.voice-controls').waitFor();
 for(const active of [false,true]){
 await page.evaluate(active=>{document.querySelector('.voice-controls').classList.toggle('is-idle',!active)},active);
 const r=await page.evaluate(()=>{const rect=s=>document.querySelector(s).getBoundingClientRect().toJSON();return {composer:rect('.composer-wrap'),host:rect('.yc-v3-voice-host'),voice:rect('.voice-controls'),self:rect('.yc-voice-self-row'),buttons:[...document.querySelectorAll('.voice-btn')].filter(e=>e.getBoundingClientRect().height>0).map(e=>e.getBoundingClientRect().toJSON()),scroll:document.documentElement.scrollWidth}});
 assert(r.composer.bottom<=r.voice.top,JSON.stringify(r));assert(r.voice.top-r.composer.bottom<=2,JSON.stringify(r));assert.equal(r.voice.height,68);assert(Math.abs(r.voice.bottom-(844-52))<=1,JSON.stringify(r));assert(Math.abs(r.host.height-120)<=1,JSON.stringify(r));assert(Math.abs(r.host.bottom-844)<=1,JSON.stringify(r));if(r.self.height)assert(r.self.top>=r.voice.top&&r.self.bottom<=r.voice.bottom,JSON.stringify(r));for(const b of r.buttons)assert(b.top>=r.voice.top&&b.bottom<=r.voice.bottom,JSON.stringify(r));assert(r.scroll<=width);
 results.push({width,inset,active,composerBottom:r.composer.bottom,voiceTop:r.voice.top,voiceBottom:r.voice.bottom,hostBottom:r.host.bottom});
 }
 if(output&&width===390&&inset===48)await page.screenshot({path:path.join(output,'android-portrait.png')});
 await page.evaluate(()=>{document.documentElement.dataset.nativeKeyboard='true';document.documentElement.classList.add('yc-keyboard-open')});
 const keyboard=await page.evaluate(()=>({dock:getComputedStyle(document.querySelector('.yc-v3-voice-host')).display,composer:document.querySelector('.composer-wrap').getBoundingClientRect().toJSON()}));
 assert.equal(keyboard.dock,'none');assert(keyboard.composer.bottom<=844);
 await page.close();
}
if(output)fs.writeFileSync(path.join(output,'layout-results.json'),JSON.stringify(results,null,2));await browser.close();console.log('PASS '+results.length+' portrait layout cases, fixed 52px Android navigation reservation, idle/active voice');process.exit(0)
})().catch(e=>{console.error(e);process.exit(1)});
