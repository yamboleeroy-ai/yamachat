
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const fixture=fs.readFileSync(path.join(__dirname,'supabase-fixture.js'),'utf8');

async function boot(browser,width,height){
 const page=await browser.newPage({viewport:{width,height},serviceWorkers:'block'});
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
 await page.waitForFunction(()=>window.__ycClientReady,{},{timeout:12000});
 await page.waitForSelector('#voiceControls',{state:'attached'});
 return {page,errors};
}
async function snap(page,{theme,server}){
 return page.evaluate(async({theme,server})=>{
  const root=document.documentElement,voice=document.getElementById('voiceControls'),panel=document.getElementById('voiceConnectionPanel'),messages=document.getElementById('messages'),composer=document.querySelector('.composer-wrap'),nav=document.getElementById('ycGlobalNav');
  root.style.setProperty('--yc-theme',theme);root.style.setProperty('--yc-theme-glow','color-mix(in srgb,'+theme+' 35%,transparent)');
  voice.classList.add('yc-desktop-server-voice-accent','is-connected');
  voice.style.setProperty('--yc-server-color',server);
  voice.style.setProperty('--yc-server-rgb','0,255,0');
  panel.classList.remove('hidden');
  await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
  const vr=voice.getBoundingClientRect(),vs=getComputedStyle(voice),ps=getComputedStyle(panel),ms=getComputedStyle(messages);
  const cr=composer?.getBoundingClientRect(),cs=composer?getComputedStyle(composer):null,nr=nav?.getBoundingClientRect(),ns=nav?getComputedStyle(nav):null;
  return {
   border:vs.borderColor,shadow:vs.boxShadow,width:vr.width,height:vr.height,
   bottom:ps.borderBottomWidth,right:ps.borderRightWidth,
   scrollbar:ms.getPropertyValue('scrollbar-color').trim(),
   composerBorder:cs?.borderColor||'',composerW:cr?.width||0,composerH:cr?.height||0,
   navOutline:ns?.outlineColor||'',navW:nr?.width||0,navH:nr?.height||0,
   style:document.getElementById('ycVoiceThemePolishStyle')?.textContent||''
  };
 },{theme,server});
}
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
 try{
  for(const [width,height] of [[1440,900],[1100,650],[900,480]]){
   const {page,errors}=await boot(browser,width,height);
   const orangeA=await snap(page,{theme:'#ff7a00',server:'#00ff00'});
   const orangeB=await snap(page,{theme:'#ff7a00',server:'#0000ff'});
   const purple=await snap(page,{theme:'#b000ff',server:'#0000ff'});
   assert.equal(orangeA.border,orangeB.border,'Server color must not change voice outline');
   assert.notEqual(orangeB.border,purple.border,'Theme color must change voice outline');
   assert.notEqual(orangeB.scrollbar,purple.scrollbar,'Theme color must change scrollbar');
   assert.notEqual(orangeB.composerBorder,purple.composerBorder,'Theme color must change message composer outline');
   assert.notEqual(orangeB.navOutline,purple.navOutline,'Theme color must change main navigation outline');
   assert.equal(purple.bottom,'0px','Connected voice panel must not keep bottom divider');
   assert.equal(purple.right,'0px','Connected voice panel must not keep right divider');
   assert(Math.abs(orangeA.width-purple.width)<0.2&&Math.abs(orangeA.height-purple.height)<0.2,JSON.stringify({width,height,orangeA,purple}));
   assert(Math.abs(orangeA.composerW-purple.composerW)<0.2&&Math.abs(orangeA.composerH-purple.composerH)<0.2,'Composer geometry changed with theme');
   assert(Math.abs(orangeA.navW-purple.navW)<0.2&&Math.abs(orangeA.navH-purple.navH)<0.2,'Navigation geometry changed with theme');
   assert.match(purple.style,/--yc-themed-scroll-track/);
   assert.match(purple.style,/yc-desktop-server-voice-accent/);
   assert.deepEqual(errors,[]);
   await page.close();
  }
  console.log('PASS desktop voice theme polish: user theme controls voice outline/scrollbars, server color cannot override it, L divider removed, geometry stable.');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
