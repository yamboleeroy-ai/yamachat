const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const mock=fs.readFileSync(path.join(__dirname,'supabase-fixture.js'),'utf8').replace("if(table==='profiles')data=[profile];","if(table==='profiles')data=[profile,{id:'peer',username:'peer',display_name:'Testovací přítel',bio:'Profil pro kontrolu rozložení.'}];");
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
 try{
 for(const [width,height,platform] of [[1440,960,'web'],[390,844,'ios'],[320,568,'android'],[844,390,'android']]){
  const page=await browser.newPage({viewport:{width,height},serviceWorkers:'block'});const errors=[];page.on('console',msg=>{if(msg.type()==='warning'||msg.type()==='error')console.log(msg.text())});page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>{
   const u=new URL(route.request().url());if(u.hostname!=='127.0.0.1')return route.abort();
   if(u.pathname==='/vendor/supabase.js')return route.fulfill({contentType:'application/javascript',body:mock});
   const file=path.join(root,u.pathname==='/'?'index.html':decodeURIComponent(u.pathname));
   if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:''});
   if(u.pathname==='/')return route.fulfill({contentType:'text/html',body:fs.readFileSync(file,'utf8').replace("await window.parent?.YamachatDesktopAppearance?.prepare('');","window.testProfile={open:openUserProfile};await window.parent?.YamachatDesktopAppearance?.prepare('');")});
   return route.fulfill({path:file});
  });
  await page.goto('http://127.0.0.1/');await page.waitForFunction(()=>window.__ycClientReady);
  await page.evaluate(async platform=>{if(platform==='ios')document.documentElement.classList.add('yc-ios-pwa');if(platform==='android')document.documentElement.classList.add('yc-native-android');await testProfile.open('peer')},platform);
  assert.equal(await page.locator('[data-yc-profile-mute]').count(),1);
  for(const button of await page.locator('.yc-profile-actions-v1028 button').all()){
   await button.scrollIntoViewIfNeeded();const b=await button.boundingBox();assert(b.width>0&&b.height>=44&&b.x>=0&&b.x+b.width<=width+1&&b.y>=0&&b.y+b.height<=height+1,JSON.stringify({width,height,b}));
  }
  await page.locator('[data-yc-profile-mute]').click();assert.equal(await page.locator('[data-yc-profile-mute]').getAttribute('aria-pressed'),'true');
  assert.deepEqual(errors,[]);
  await page.screenshot({path:path.join(__dirname,'profile-actions-'+platform+'-'+width+'.png')});
  await page.close();console.log('PASS complete client profile layout:',platform,width,height);
 }
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
