const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const mock=fs.readFileSync(path.join(__dirname,'supabase-fixture.js'),'utf8');

async function boot(browser,width,height,platform='web'){
 const page=await browser.newPage({viewport:{width,height},serviceWorkers:'block',hasTouch:platform!=='web',isMobile:platform!=='web'});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>{
  const u=new URL(route.request().url());if(u.hostname!=='127.0.0.1')return route.abort();
  if(u.pathname==='/vendor/supabase.js')return route.fulfill({contentType:'application/javascript',body:mock});
  const file=path.join(root,u.pathname==='/'?'index.html':decodeURIComponent(u.pathname));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:''});
  if(u.pathname==='/')return route.fulfill({contentType:'text/html',body:fs.readFileSync(file,'utf8')});
  return route.fulfill({path:file});
 });
 await page.goto('http://127.0.0.1/');
 await page.waitForFunction(()=>window.__ycClientReady,{},{timeout:12000});
 await page.evaluate(platform=>{
  if(platform==='android')document.documentElement.classList.add('yc-native-android');
  if(platform==='ios-pwa')document.documentElement.classList.add('yc-ios-pwa','yc-ios-mobile');
 },platform);
 return {page,errors};
}

async function themeSnapshot(page,theme){
 return await page.evaluate(theme=>{
  document.documentElement.style.setProperty('--yc-theme',theme);
  const voice=document.querySelector('.yc-v3-voice-host .voice-controls');
  const top=document.querySelector('.yc-v3-voice-host .voice-card-top');
  const scroll=document.querySelector('.messages')||document.documentElement;
  const host=document.querySelector('.yc-v3-voice-host');
  const vs=getComputedStyle(voice),ts=getComputedStyle(top),ss=getComputedStyle(scroll),hs=getComputedStyle(host);
  return {
   voiceBorder:vs.borderTopColor,
   voiceShadow:vs.boxShadow,
   topBorderRight:ts.borderRightWidth,
   scrollbar:ss.scrollbarColor,
   hostBorder:hs.borderTopColor,
   hostShadow:hs.boxShadow
  };
 },theme);
}

(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  {
   const {page,errors}=await boot(browser,1440,900,'web');
   const a=await themeSnapshot(page,'#ff3300'),b=await themeSnapshot(page,'#00cc66');
   assert.notEqual(a.voiceBorder,b.voiceBorder,JSON.stringify({a,b}));
   assert.notEqual(a.voiceShadow,b.voiceShadow,JSON.stringify({a,b}));
   assert.notEqual(a.scrollbar,b.scrollbar,JSON.stringify({a,b}));
   assert.equal(a.topBorderRight,'0px',JSON.stringify(a));
   assert.equal(b.topBorderRight,'0px',JSON.stringify(b));
   assert.deepEqual(errors,[]);
   await page.close();
  }
  for(const platform of ['android','ios-pwa']){
   const {page,errors}=await boot(browser,390,844,platform);
   const a=await themeSnapshot(page,'#ff3300'),b=await themeSnapshot(page,'#00cc66');
   assert.notEqual(a.scrollbar,b.scrollbar,JSON.stringify({platform,a,b}));
   if(platform==='android'){
    assert.notEqual(a.hostBorder,b.hostBorder,JSON.stringify({platform,a,b}));
    assert.notEqual(a.hostShadow,b.hostShadow,JSON.stringify({platform,a,b}));
   }
   assert.deepEqual(errors,[]);
   await page.close();
  }
  console.log('PASS theme accent: voice outline/glow and scrollbars follow the user theme; connected voice separator border is removed; Android dock seam follows the same accent.');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
