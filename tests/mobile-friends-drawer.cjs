
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const baseMock=fs.readFileSync(path.join(__dirname,'supabase-fixture.js'),'utf8');

function socialMock(){
 let mock=baseMock;
 mock=mock.replace(
  "const profile={id:'audit-user',username:'tester',display_name:'Místní test',status:'online',ui_theme_color:'#ff0000'};",
  "const profile={id:'audit-user',username:'tester',display_name:'Místní test',status:'online',ui_theme_color:'#e056fd'};const peer={id:'peer',username:'pyronosh',display_name:'Pyronosh',status:'online',ui_theme_color:'#e056fd'};"
 );
 mock=mock.replace(
  "if(table==='profiles')data=[profile];",
  "if(table==='profiles')data=[profile,peer];if(table==='friendships')data=[{requester_id:'audit-user',addressee_id:'peer',status:'accepted',created_at:'2026-09-20T10:00:00Z'}];if(table==='profile_stats')data=[{user_id:'audit-user',xp:1800,message_count:10},{user_id:'peer',xp:3900,message_count:22}];if(table==='user_presence')data=[{user_id:'audit-user',state:'online',activity_text:'V Yamachatu',last_seen_at:new Date().toISOString()},{user_id:'peer',state:'online',activity_text:'V Yamachatu',last_seen_at:new Date().toISOString()}];if(table==='direct_thread_members')data=[{thread_id:'dm-a',user_id:'audit-user'},{thread_id:'dm-a',user_id:'peer'}];"
 );
 return mock;
}
async function boot(browser,width,height){
 const page=await browser.newPage({viewport:{width,height},serviceWorkers:'block',hasTouch:true,isMobile:true});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const mock=socialMock();
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
 await page.waitForFunction(()=>window.__ycClientReady,{},{timeout:15000});
 await page.waitForSelector('#ycMobileNavBtn');
 await page.waitForSelector('#ycMobileMembersBtn');
 return {page,errors};
}
async function expectDrawer(page,kind){
 const state=await page.evaluate(()=>{
  const nav=document.getElementById('ycGlobalNav'),side=document.getElementById('side'),right=document.querySelector('.yc-v3-content-grid>.right');
  return {
   nav:nav?.classList.contains('yc-mobile-open')||false,
   side:side?.classList.contains('mobile-open')||false,
   right:right?.classList.contains('yc-mobile-open')||false,
   app:document.getElementById('app')?.classList.contains('yc-mobile-drawer-open')||false,
   navExpanded:document.getElementById('ycMobileNavBtn')?.getAttribute('aria-expanded'),
   sideExpanded:document.getElementById('mobileMenu')?.getAttribute('aria-expanded'),
   rightExpanded:document.getElementById('ycMobileMembersBtn')?.getAttribute('aria-expanded')
  };
 });
 assert.equal(state.app,true,JSON.stringify({kind,state}));
 assert.equal(state.nav,kind==='nav',JSON.stringify({kind,state}));
 assert.equal(state.side,kind==='side',JSON.stringify({kind,state}));
 assert.equal(state.right,kind==='right',JSON.stringify({kind,state}));
 assert.equal(state.navExpanded,kind==='nav'?'true':'false',JSON.stringify({kind,state}));
 assert.equal(state.sideExpanded,kind==='side'?'true':'false',JSON.stringify({kind,state}));
 assert.equal(state.rightExpanded,kind==='right'?'true':'false',JSON.stringify({kind,state}));
}
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  for(const [width,height] of [[390,844],[844,390]]){
   const {page,errors}=await boot(browser,width,height);

   // Global mobile navigation -> Friends must replace the open nav drawer
   // with the social drawer in a single tap.
   await page.locator('#ycMobileNavBtn').click();
   await expectDrawer(page,'nav');
   await page.locator('#ycV3Friends').click();
   await page.waitForFunction(()=>document.querySelector('.yc-v3-content-grid>.right')?.classList.contains('yc-mobile-open'));
   await expectDrawer(page,'right');
   assert.equal(await page.locator('#friendsTab').evaluate(el=>el.classList.contains('active')),true);
   assert.equal(await page.locator('#membersTab').evaluate(el=>el.classList.contains('active')),false);

   // Close through the real mobile scrim, then repeat to catch stale
   // activeDrawer state across a full close/open cycle.
   await page.locator('#ycMobileScrim').click();
   await page.waitForFunction(()=>!document.getElementById('app')?.classList.contains('yc-mobile-drawer-open'));
   await page.locator('#ycMobileNavBtn').click();
   await expectDrawer(page,'nav');
   await page.locator('#ycV3Friends').click();
   await page.waitForFunction(()=>document.querySelector('.yc-v3-content-grid>.right')?.classList.contains('yc-mobile-open'));
   await expectDrawer(page,'right');

   // Friends home -> "show all friends" must replace the side drawer directly.
   await page.locator('#ycMobileScrim').click();
   await page.waitForFunction(()=>!document.getElementById('app')?.classList.contains('yc-mobile-drawer-open'));
   await page.evaluate(()=>window.ycShowFriendsHome?.());
   await page.locator('#mobileMenu').click();
   await expectDrawer(page,'side');
   await page.locator('#ycOpenFriendsList').click();
   await page.waitForFunction(()=>document.querySelector('.yc-v3-content-grid>.right')?.classList.contains('yc-mobile-open'));
   await expectDrawer(page,'right');

   assert.deepEqual(errors,[]);
   await page.close();
  }
  console.log('PASS mobile Friends drawer switch: nav/side are replaced by Friends in one tap in portrait and landscape.');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
