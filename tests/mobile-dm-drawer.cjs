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
 return {page,errors};
}
async function assertClosed(page,label){
 await page.waitForFunction(()=>!document.getElementById('app')?.classList.contains('yc-mobile-drawer-open'));
 const state=await page.evaluate(()=>({
  nav:document.getElementById('ycGlobalNav')?.classList.contains('yc-mobile-open')||false,
  side:document.getElementById('side')?.classList.contains('mobile-open')||false,
  right:document.querySelector('.yc-v3-content-grid>.right')?.classList.contains('yc-mobile-open')||false
 }));
 assert.deepEqual(state,{nav:false,side:false,right:false},label+': '+JSON.stringify(state));
 await page.waitForFunction(()=>document.getElementById('chatTitle')?.textContent?.includes('Pyronosh'));
}

(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  for(const [width,height] of [[390,844],[844,390]]){
   {
    const {page,errors}=await boot(browser,width,height);
    await page.evaluate(()=>window.ycShowFriendsHome?.());
    await page.locator('#mobileMenu').click();
    await page.waitForFunction(()=>document.getElementById('side')?.classList.contains('mobile-open'));
    const thread=page.locator('#dmList [data-thread="dm-a"]');
    await thread.waitFor({state:'visible'});
    const box=await thread.boundingBox();assert(box,JSON.stringify({width,height}));
    // Tap the row's right-side free area rather than the profile/avatar child.
    await page.mouse.click(box.x+box.width-8,box.y+box.height/2);
    await assertClosed(page,'direct thread '+width+'x'+height);
    assert.deepEqual(errors,[]);
    await page.close();
   }
   {
    const {page,errors}=await boot(browser,width,height);
    await page.locator('#ycMobileNavBtn').click();
    await page.locator('#ycV3Friends').click();
    await page.waitForFunction(()=>document.querySelector('.yc-v3-content-grid>.right')?.classList.contains('yc-mobile-open'));
    const dm=page.locator('[data-dm="peer"]');
    await dm.waitFor({state:'visible'});
    await dm.click();
    await assertClosed(page,'Friends DM button '+width+'x'+height);
    assert.deepEqual(errors,[]);
    await page.close();
   }
  }
  console.log('PASS mobile DM navigation: direct-thread rows and Friends DM buttons close drawers and open chat in portrait and landscape.');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
