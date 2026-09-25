
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const baseMock=fs.readFileSync(path.join(__dirname,'supabase-fixture.js'),'utf8');

function mockFor(role,delegated){
 let mock=baseMock.replace("role:'owner',profiles:profile","role:'"+role+"',profiles:profile");
 mock=mock.replace(
  "const communities=[{id:'community-a',name:'Testovací server',owner_id:'audit-user',server_color:'#1a9fff'}];",
  "const communities=[{id:'community-a',name:'Testovací server',description:'Popis testovacího serveru',created_at:'2026-09-20T10:00:00Z',owner_id:'audit-user',server_color:'#1a9fff',is_public:true}];"
 );
 if(delegated){
  mock=mock.replace(
   "if(table==='communities')data=communities;",
   "if(table==='communities')data=communities;if(table==='community_member_permissions')data=[{can_manage_server:true,can_manage_channels:false,can_manage_members:false,can_manage_permissions:false,can_manage_invites:false,can_manage_emojis:false,can_manage_soundboard:false}];"
  );
 }
 return mock;
}

async function boot(browser,{width,height,role,delegated=false,mobile=false}){
 const page=await browser.newPage({viewport:{width,height},serviceWorkers:'block',hasTouch:mobile,isMobile:mobile});
 const errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 const mock=mockFor(role,delegated);
 await page.route('**/*',route=>{
  const u=new URL(route.request().url());
  if(u.hostname!=='127.0.0.1')return route.abort();
  if(u.pathname==='/node_modules/@supabase/supabase-js/dist/umd/supabase.js')return route.fulfill({contentType:'application/javascript',body:mock});
  const file=path.join(root,u.pathname==='/'?'desktop/desktop-client.html':decodeURIComponent(u.pathname));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:''});
  if(u.pathname==='/')return route.fulfill({contentType:'text/html',body:fs.readFileSync(file,'utf8')});
  return route.fulfill({path:file});
 });
 await page.goto('http://127.0.0.1/');
 await page.waitForFunction(()=>window.__ycClientReady,{},{timeout:10000});
 await page.waitForSelector('#rail [data-community="community-a"]');
 return {page,errors};
}

async function openDesktopMenu(page){
 const card=page.locator('#rail [data-community="community-a"]');
 await card.click({button:'right'});
 await page.waitForSelector('#ycUiMenuRoot:not(.hidden)');
}
async function openTouchMenu(page){
 const card=page.locator('#rail [data-community="community-a"]');
 const box=await card.boundingBox();assert(box);
 const x=box.x+box.width/2,y=box.y+box.height/2;
 await card.dispatchEvent('pointerdown',{pointerType:'touch',pointerId:41,isPrimary:true,button:0,clientX:x,clientY:y});
 await page.waitForTimeout(610);
 await card.dispatchEvent('pointerup',{pointerType:'touch',pointerId:41,isPrimary:true,button:0,clientX:x,clientY:y});
 await page.waitForSelector('#ycUiMenuRoot:not(.hidden)');
}
function inside(box,width,height){
 return box&&box.width>0&&box.height>0&&box.x>=-1&&box.y>=-1&&box.x+box.width<=width+1&&box.y+box.height<=height+1;
}

(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
 try{
  for(const state of [
   {width:1440,height:900,role:'owner',settings:true,leave:false,mobile:false},
   {width:1440,height:900,role:'member',settings:false,leave:true,mobile:false},
   {width:1440,height:900,role:'member',delegated:true,settings:true,leave:true,mobile:false}
  ]){
   const {page,errors}=await boot(browser,state);
   await openDesktopMenu(page);
   assert.equal(await page.locator('[data-yc-menu-item="server-info"]').count(),1);
   assert.equal(await page.locator('[data-yc-menu-item="server-settings"]').count(),state.settings?1:0);
   assert.equal(await page.locator('[data-yc-menu-item="server-leave"]').count(),state.leave?1:0);
   const menu=await page.locator('#ycUiMenuRoot').boundingBox();
   assert(inside(menu,state.width,state.height),JSON.stringify({state,menu}));
   await page.keyboard.press('Escape');
   assert(await page.locator('#ycUiMenuRoot').evaluate(el=>el.classList.contains('hidden')));

   await openDesktopMenu(page);
   await page.locator('[data-yc-menu-item="server-info"]').click();
   await page.waitForSelector('.yc-server-info-modal');
   await page.waitForFunction(()=>!document.querySelector('.yc-server-info-loading'));
   const text=await page.locator('.yc-server-info-modal').innerText();
   assert.match(text,/Testovací server/);
   assert.match(text,/Popis testovacího serveru/);
   assert.match(text,/členové/i);
   assert.match(text,/textové kanály/i);
   assert.match(text,/hlasové kanály/i);
   const info=await page.locator('.yc-server-info-modal').boundingBox();
   assert(inside(info,state.width,state.height),JSON.stringify({state,info}));
   await page.keyboard.press('Escape');
   assert.equal(await page.locator('.yc-server-info-modal').count(),0);
   assert.deepEqual(errors,[]);
   await page.close();
  }

  for(const [width,height] of [[390,844],[320,568],[844,390]]){
   const {page,errors}=await boot(browser,{width,height,role:'member',mobile:true});
   await openTouchMenu(page);
   const rootMenu=page.locator('#ycUiMenuRoot');
   assert.equal(await rootMenu.getAttribute('data-yc-server-card-menu'),'mobile');
   const menu=await rootMenu.boundingBox();
   assert(inside(menu,width,height),JSON.stringify({width,height,menu}));
   assert.equal(await page.locator('[data-yc-menu-item="server-info"]').count(),1);
   assert.equal(await page.locator('[data-yc-menu-item="server-settings"]').count(),0);
   assert.equal(await page.locator('[data-yc-menu-item="server-leave"]').count(),1);

   await page.locator('[data-yc-menu-item="server-info"]').click();
   await page.waitForSelector('.yc-server-info-modal');
   await page.waitForFunction(()=>!document.querySelector('.yc-server-info-loading'));
   const box=await page.locator('.yc-server-info-modal').boundingBox();
   assert(inside(box,width,height),JSON.stringify({width,height,box}));
   const buttons=await page.locator('.yc-server-info-modal button').all();
   for(const button of buttons){const b=await button.boundingBox();if(b)assert(b.height>=40,JSON.stringify({width,height,b}))}
   assert.deepEqual(errors,[]);
   await page.close();
  }
  console.log('PASS desktop server-card context: owner/member/delegated permissions, right-click, touch long-press, info modal, Escape and portrait/landscape bounds.');
 }finally{
  await browser.close();
 }
})().catch(error=>{console.error(error);process.exitCode=1});
