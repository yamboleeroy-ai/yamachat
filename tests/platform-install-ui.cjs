const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const mock=fs.readFileSync(path.join(__dirname,'supabase-fixture.js'),'utf8');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'update-manifest.json'),'utf8'));

async function boot(browser,width,height,mobile=false){
  const page=await browser.newPage({viewport:{width,height},serviceWorkers:'block',hasTouch:mobile,isMobile:mobile});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>{
    const u=new URL(route.request().url());
    if(u.hostname!=='127.0.0.1')return route.abort();
    if(u.pathname==='/vendor/supabase.js')return route.fulfill({contentType:'application/javascript',body:mock});
    const file=path.join(root,u.pathname==='/'?'index.html':decodeURIComponent(u.pathname));
    if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:''});
    if(u.pathname==='/')return route.fulfill({contentType:'text/html',body:fs.readFileSync(file,'utf8')});
    return route.fulfill({path:file});
  });
  await page.goto('http://127.0.0.1/');
  await page.waitForFunction(()=>window.__ycClientReady&&window.YamachatPlatformInstall&&window.YamachatLegalUI,{},{timeout:15000});
  await page.evaluate(()=>{document.getElementById('app')?.classList.add('hidden');document.getElementById('auth')?.classList.remove('hidden')});
  await page.locator('#auth').waitFor({state:'visible'});
  return {page,errors};
}
function inside(b,w,h){return b&&b.width>0&&b.height>0&&b.x>=-1&&b.y>=-1&&b.x+b.width<=w+1&&b.y+b.height<=h+1}

(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  for(const [w,h,mobile] of [[1440,900,false],[390,844,true],[844,390,true],[320,568,true]]){
   const {page,errors}=await boot(browser,w,h,mobile);
   const forgot=page.locator('#ycForgotPassword'),row=page.locator('.yc-platform-login'),yamaHelp=page.locator('.yc-yamahelp-login'),legal=page.locator('.yc-auth-legal-links');
   await row.waitFor({state:'visible'});
   await row.scrollIntoViewIfNeeded();
   const fb=await forgot.boundingBox(),rb=await row.boundingBox(),lb=await legal.boundingBox();
   const order=await page.evaluate(()=>['ycForgotPassword','yc-platform-login','yc-yamahelp-login','yc-auth-legal-links'].map(id=>{
     const el=id.startsWith('yc')&&id!=='ycForgotPassword'?document.querySelector('.'+id):document.getElementById(id);
     return el?.getBoundingClientRect().top??-1;
   }));
   assert(fb&&rb&&lb&&order[0]<order[1]&&order[1]<order[2]&&order[2]<order[3],'Platform and YamaHelp rows must be between forgot password and legal links');
   assert(inside(rb,w,h),`Platform row must be reachable inside scrollable auth viewport at ${w}x${h}`);
   await yamaHelp.scrollIntoViewIfNeeded();
   const yb=await yamaHelp.boundingBox();
   assert(inside(yb,w,h),`YamaHelp row must be reachable inside scrollable auth viewport at ${w}x${h}`);
   assert.equal(await page.locator('[data-yc-platform]').count(),5);
   assert.equal(await page.locator('#ycAuthDownloads').count(),0,'Legacy login download block must not duplicate compact platform launcher');
   assert.equal(await yamaHelp.locator('a').count(),2,'YamaHelp v73 must provide Portable and Installer downloads');
   assert.equal(await yamaHelp.locator('a').nth(0).getAttribute('href'),'https://updates.yamachat.eu/yamahelp/YamaHelp-Portable-v73.zip');
   assert.equal(await yamaHelp.locator('a').nth(1).getAttribute('href'),'https://updates.yamachat.eu/yamahelp/YamaHelp-Setup-v73.exe');
   assert.match(await yamaHelp.textContent(),/Soubor(?:y)? jsou určen[ée] pro Windows PC/i);

   const expected={
    windows:String(manifest.windows.installerUrl),
    android:String(manifest.android.apkUrl),
    web:'https://yamachat.eu/',
    pwa:'https://yamachat.eu/',
    ios:'https://yamachat.eu/'
   };
   for(const id of ['windows','android','web','pwa','ios']){
    await page.locator('[data-yc-platform="'+id+'"]').click();
    const dialog=page.locator('.yc-platform-dialog');await dialog.waitFor({state:'visible'});
    assert(inside(await dialog.boundingBox(),w,h),`${id} dialog outside viewport at ${w}x${h}`);
    const href=await dialog.locator('.yc-platform-action').getAttribute('href');
    assert.equal(href,expected[id],id+' unexpected install URL');
    const text=await dialog.textContent();
    assert(!/Google Play|App Store/i.test(text)||/Není vydaný přes Google Play|Veřejná aplikace v App Store není/i.test(text),id+' must not imply store availability');
    if(id==='windows'){
      assert(/code-signing podpis/i.test(text),'Windows signing notice missing');
      assert(/SmartScreen/i.test(text),'Windows SmartScreen explanation missing');
      assert(/neznamená, že soubor je virus/i.test(text),'Windows false-positive explanation missing');
    }
    if(id==='pwa'){
      assert(/webovou aplikaci \(PWA\)/i.test(text),'Desktop PWA explanation missing');
      assert(/nabídce \/ nastavení prohlížeče/i.test(text),'Browser menu installation step missing');
      assert(/Nainstalovat tento web jako aplikaci/i.test(text),'Install-as-app instruction missing');
    }
    await dialog.locator('[data-yc-platform-close]').click();await dialog.waitFor({state:'detached'});
   }
   assert.deepEqual(errors,[]);
   await page.close();
  }

  const {page,errors}=await boot(browser,390,844,true);
  await page.locator('[data-yc-auth-legal="terms"]').click();
  await page.locator('#ycLegalDialog').waitFor({state:'visible'});
  assert.equal(await page.locator('#ycLegalPortal #ycLegalTitle').textContent(),'Podmínky používání');
  assert.equal(await page.locator('#modalRoot #ycLegalDialog').count(),0,'Legal dialog must not depend on hidden app modalRoot');
  await page.locator('[data-yc-legal-close]').click();
  await page.locator('[data-yc-auth-legal="privacy"]').click();
  await page.locator('#ycLegalDialog').waitFor({state:'visible'});
  assert.equal(await page.locator('#ycLegalPortal #ycLegalTitle').textContent(),'Ochrana osobních údajů');
  assert.deepEqual(errors,[]);
  await page.close();

  console.log('PASS platform install UI: placement, responsive dialogs, official URLs and login legal portal.');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
