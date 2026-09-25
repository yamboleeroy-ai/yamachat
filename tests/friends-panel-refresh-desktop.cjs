
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
 const page=await browser.newPage({viewport:{width,height},serviceWorkers:'block'});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const mock=socialMock();
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
 await page.waitForFunction(()=>window.__ycClientReady,{},{timeout:12000});
 await page.waitForSelector('#ycGlobalNav');
 await page.waitForFunction(()=>document.documentElement.dataset.ycFriendsRefresh==='1');
 return {page,errors};
}
function near(a,b,t=1.1){return Math.abs(a-b)<=t}
async function stableTabGeometry(page){
 const members=page.locator('#membersTab'),friends=page.locator('#friendsTab');
 const m=await members.boundingBox(),f=await friends.boundingBox();
 assert(m&&f);
 return {m,f};
}
async function assertNavButtonReachable(page,id){
 const btn=page.locator('#'+id);await btn.scrollIntoViewIfNeeded();await page.waitForTimeout(30);
 await btn.click({trial:true,timeout:3000});
 const hit=await btn.evaluate(el=>{
  const r=el.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;
  const top=document.elementFromPoint(x,y);
  return {visible:r.width>0&&r.height>0&&r.top>=0&&r.bottom<=innerHeight+1,hit:!!top&&(top===el||el.contains(top)),tag:top?.id||top?.className||top?.tagName||''};
 });
 assert(hit.visible,JSON.stringify({id,hit}));
 assert(hit.hit,JSON.stringify({id,hit}));
}
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
 try{
  // Normal desktop: refreshed friends home and stable right tabs.
  {
   const {page,errors}=await boot(browser,1440,900);
   const pseudo=await page.locator('.yc-v3-nav-fill').evaluate(el=>getComputedStyle(el,'::after').content);
   assert(['none','normal','""',"''"].includes(pseudo),pseudo);
   await page.locator('#ycV3Friends').click();
   await page.waitForSelector('#ycFriendsHome:not(.hidden)');
   assert.equal(await page.locator('#ycFriendsHome').getAttribute('data-yc-modern-friends'),'1');
   assert.equal(await page.locator('#ycFriendsStatusBtn').getAttribute('data-yc-modern-status'),'1');
   assert.equal(await page.locator('#ycOpenFriendsList').getAttribute('data-yc-modern-open'),'1');
   assert.match(await page.locator('.yc-friends-modern-title').innerText(),/Přátelé/);
   await page.waitForFunction(()=>document.querySelectorAll('#dmList .yc-dm-social-row').length>=1);
   const dm=page.locator('#dmList .yc-dm-social-row').first(),dmBox=await dm.boundingBox(),sideBox=await page.locator('#side').boundingBox();
   assert(dmBox&&sideBox&&dmBox.x>=sideBox.x-1&&dmBox.x+dmBox.width<=sideBox.x+sideBox.width+1);

   const before=await stableTabGeometry(page);
   for(let i=0;i<4;i++){
    await page.locator('#membersTab').click();await page.waitForFunction(()=>document.querySelector('#membersTab')?.classList.contains('active')&&!document.querySelector('#friendsTab')?.classList.contains('active'));
    await page.locator('#friendsTab').click();await page.waitForFunction(()=>document.querySelector('#friendsTab')?.classList.contains('active')&&!document.querySelector('#membersTab')?.classList.contains('active'));
   }
   const after=await stableTabGeometry(page);
   for(const k of ['x','y','width','height']){assert(near(before.m[k],after.m[k]),JSON.stringify({k,before,after}));assert(near(before.f[k],after.f[k]),JSON.stringify({k,before,after}))}
   const transition=await page.locator('#friendsTab').evaluate(el=>getComputedStyle(el).transitionDuration);
   assert(/^0s(?:, 0s)*$/.test(transition),transition);

   // Simulate an unwanted repaint/class churn; observer must restore the mode.
   await page.evaluate(()=>{document.getElementById('friendsTab').classList.remove('active');document.getElementById('membersTab').classList.add('active')});
   await page.waitForFunction(()=>document.querySelector('#friendsTab')?.classList.contains('active')&&!document.querySelector('#membersTab')?.classList.contains('active'));
   assert.deepEqual(errors,[]);
   await page.close();
  }

  // Short desktop windows: the primary nav scrolls and no decorative layer blocks controls.
  for(const [width,height] of [[1100,650],[980,560],[900,480]]){
   const {page,errors}=await boot(browser,width,height);
   const nav=page.locator('#ycGlobalNav');
   const overflow=await nav.evaluate(el=>getComputedStyle(el).overflowY);
   assert(['auto','scroll'].includes(overflow),JSON.stringify({width,height,overflow}));
   const pseudo=await page.locator('.yc-v3-nav-fill').evaluate(el=>getComputedStyle(el,'::after').content);
   assert(['none','normal','""',"''"].includes(pseudo),JSON.stringify({width,height,pseudo}));
   for(const id of ['profileBtn','appSettingsBtn','logoutBtn'])await assertNavButtonReachable(page,id);
   const metrics=await nav.evaluate(el=>({clientHeight:el.clientHeight,scrollHeight:el.scrollHeight,scrollTop:el.scrollTop}));
   assert(metrics.clientHeight>0&&metrics.scrollHeight>=metrics.clientHeight,JSON.stringify({width,height,metrics}));
   assert.deepEqual(errors,[]);
   await page.close();
  }
  console.log('PASS friends refresh: modern Friends/DM panel, stable Members/Friends tabs, decorative nav text removed, and Profile/Settings/Logout remain reachable at short desktop heights.');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
