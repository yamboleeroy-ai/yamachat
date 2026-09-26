
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const fixture=fs.readFileSync(path.join(__dirname,'supabase-fixture.js'),'utf8');

async function boot(browser,width,height,mobile=false){
 const page=await browser.newPage({viewport:{width,height},serviceWorkers:'block',hasTouch:mobile,isMobile:mobile});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>{
  const u=new URL(route.request().url());
  if(u.hostname!=='127.0.0.1')return route.abort();
  if(u.pathname==='/vendor/supabase.js')return route.fulfill({contentType:'application/javascript',body:fixture});
  const file=path.join(root,u.pathname==='/'?'index.html':decodeURIComponent(u.pathname));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:''});
  if(u.pathname==='/')return route.fulfill({contentType:'text/html',body:fs.readFileSync(file,'utf8')});
  return route.fulfill({path:file});
 });
 await page.goto('http://127.0.0.1/');
 await page.waitForFunction(()=>window.__ycClientReady,{},{timeout:15000});
 await page.waitForSelector('#voiceControls',{state:'attached'});
 return {page,errors};
}
async function snapshot(page,color,glow){
 return await page.evaluate(async({color,glow})=>{
  const root=document.documentElement,voice=document.getElementById('voiceControls'),panel=document.getElementById('voiceConnectionPanel'),messages=document.getElementById('messages'),composer=document.querySelector('.composer-wrap'),nav=document.getElementById('ycGlobalNav');
  root.style.setProperty('--yc-theme',color);root.style.setProperty('--yc-theme-glow',glow);
  panel.classList.remove('hidden');voice.classList.remove('is-idle');voice.classList.add('is-connected');
  await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
  const vr=voice.getBoundingClientRect(),vs=getComputedStyle(voice),ps=getComputedStyle(panel),ms=getComputedStyle(messages);
  const cr=composer?.getBoundingClientRect(),cs=composer?getComputedStyle(composer):null,nr=nav?.getBoundingClientRect(),ns=nav?getComputedStyle(nav):null;
  return {
   border:vs.borderColor,
   shadow:vs.boxShadow,
   width:vr.width,height:vr.height,
   bottom:ps.borderBottomWidth,
   right:ps.borderRightWidth,
   scrollbar:ms.getPropertyValue('scrollbar-color').trim(),
   composerBorder:cs?.borderColor||'',composerW:cr?.width||0,composerH:cr?.height||0,
   navOutline:ns?.outlineColor||'',navW:nr?.width||0,navH:nr?.height||0,
   styleText:document.getElementById('ycVoiceThemePolishStyle')?.textContent||''
  };
 },{color,glow});
}
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  for(const [width,height,mobile] of [[1440,900,false],[390,844,true],[844,390,true]]){
   const {page,errors}=await boot(browser,width,height,mobile);
   const a=await snapshot(page,'#00bcd4','rgba(0,188,212,.35)');
   const b=await snapshot(page,'#ff7a00','rgba(255,122,0,.35)');
   assert.notEqual(a.border,b.border,JSON.stringify({width,height,a:a.border,b:b.border}));
   assert.notEqual(a.scrollbar,b.scrollbar,JSON.stringify({width,height,a:a.scrollbar,b:b.scrollbar}));
   assert.equal(b.bottom,'0px',JSON.stringify({width,height,bottom:b.bottom}));
   assert.equal(b.right,'0px',JSON.stringify({width,height,right:b.right}));
   assert(Math.abs(a.width-b.width)<0.2&&Math.abs(a.height-b.height)<0.2,JSON.stringify({width,height,a,b}));
   assert.match(b.styleText,/--yc-themed-scroll-track/);
   assert.match(b.styleText,/var\(--yc-theme/);
   assert.deepEqual(errors,[]);
   await page.close();
  }
  console.log('PASS voice theme polish: theme-driven voice outline and scrollbars, clean connected panel, unchanged geometry on desktop/portrait/landscape.');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
