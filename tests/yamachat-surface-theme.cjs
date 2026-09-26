const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const fixture=fs.readFileSync(path.join(__dirname,'supabase-fixture.js'),'utf8');

async function boot(browser){
 const page=await browser.newPage({viewport:{width:1360,height:820},serviceWorkers:'block'});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>{
  const u=new URL(route.request().url());
  if(u.hostname!=='127.0.0.1')return route.abort();
  if(u.pathname==='/node_modules/@supabase/supabase-js/dist/umd/supabase.js')return route.fulfill({contentType:'application/javascript',body:fixture});
  const file=path.join(root,u.pathname==='/'?'desktop/desktop-client.html':decodeURIComponent(u.pathname));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:''});
  if(u.pathname==='/')return route.fulfill({contentType:'text/html',body:fs.readFileSync(file,'utf8')});
  return route.fulfill({path:file});
 });
 await page.goto('http://127.0.0.1/');
 await page.waitForFunction(()=>window.__ycClientReady&&window.YamachatSurfaceTheme&&window.YamachatAppSettings,{},{timeout:12000});
 return {page,errors};
}
async function snap(page){
 return page.evaluate(()=>{
  const pick=s=>document.querySelector(s);
  const box=s=>{const el=pick(s);if(!el)return null;const r=el.getBoundingClientRect(),cs=getComputedStyle(el);return{x:r.x,y:r.y,w:r.width,h:r.height,bg:cs.backgroundImage||cs.backgroundColor,color:cs.color,border:cs.borderColor,shadow:cs.boxShadow}};
  return {
   theme:document.documentElement.dataset.ycSurfaceTheme,
   bodyClass:document.body.className,
   stored:localStorage.getItem('yc_surface_theme_v1'),
   bodyBg:getComputedStyle(document.body).backgroundImage,
   nav:box('#ycGlobalNav'),
   side:box('.yc-v3-content-grid>.side'),
   chat:box('.yc-v3-content-grid>.chat'),
   right:box('.yc-v3-content-grid>.right'),
   composer:box('.composer'),
   voice:box('#voiceControls')
  };
 });
}
function geomEqual(a,b,key){
 if(!a[key]||!b[key])return;
 for(const p of ['x','y','w','h'])assert(Math.abs(a[key][p]-b[key][p])<0.3,key+' geometry changed for '+p+': '+a[key][p]+' vs '+b[key][p]);
}
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
 try{
  const {page,errors}=await boot(browser);
  const html=fs.readFileSync(path.join(root,'desktop/desktop-client.html'),'utf8');
  for(const marker of ['ycSurfaceThemeStyle','ycSurfaceThemeRuntime','yc_surface_theme_v1','Dark · výchozí','Vzhled Yamachatu'])assert(html.includes(marker),'Missing surface theme marker: '+marker);

  const dark=await snap(page);
  assert.equal(dark.theme,'dark','Dark must be the default surface theme');
  assert(!dark.bodyClass.includes('yc-wotlk-theme'),'WotLK class must not be active after boot');

  await page.evaluate(async()=>{
   document.body.classList.add('yc-wotlk-theme');
   await new Promise(r=>setTimeout(r,20));
  });
  assert.equal(await page.evaluate(()=>document.body.classList.contains('yc-wotlk-theme')),false,'WotLK class must be stripped if legacy code adds it');

  await page.evaluate(()=>window.YamachatAppSettings.open());
  await page.waitForSelector('[data-yc-settings-section="appearance"]');
  const appearance=page.locator('[data-yc-settings-section="appearance"]');
  assert.equal(await appearance.locator('input[name="ycSurfaceTheme"][value="dark"]').isChecked(),true,'Dark radio must be selected by default');
  await appearance.locator('input[name="ycSurfaceTheme"][value="white"]').check();
  await page.waitForFunction(()=>document.documentElement.dataset.ycSurfaceTheme==='white');
  const white=await snap(page);
  assert.equal(white.theme,'white');
  assert.equal(white.stored,'white','White choice must persist locally');

  for(const key of ['nav','side','chat','right','composer','voice'])geomEqual(dark,white,key);
  assert.notEqual(dark.bodyBg,white.bodyBg,'Global background must change between Dark and White');
  for(const key of ['nav','chat','composer','voice']){
   if(dark[key]&&white[key])assert.notEqual(dark[key].bg,white[key].bg,key+' background must change between Dark and White');
  }
  if(dark.chat&&white.chat)assert.notEqual(dark.chat.color,white.chat.color,'Chat text color must change between Dark and White');

  await appearance.locator('input[name="ycSurfaceTheme"][value="dark"]').check();
  await page.waitForFunction(()=>document.documentElement.dataset.ycSurfaceTheme==='dark');
  assert.equal(await page.evaluate(()=>localStorage.getItem('yc_surface_theme_v1')),'dark','Dark choice must persist when selected again');
  assert.deepEqual(errors,[]);
  console.log('PASS Yamachat surface theme: Dark default, White user choice, WotLK disabled, whole-shell colors change without layout shifts.');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
