
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const baseMock=fs.readFileSync(path.join(__dirname,'supabase-fixture.js'),'utf8');

function mock(){
 let s=baseMock.replace(
  "const profile={id:'audit-user',username:'tester',display_name:'Místní test',status:'online',ui_theme_color:'#ff0000'};",
  "const profile={id:'audit-user',username:'tester',display_name:'Místní test',status:'online',ui_theme_color:'#e056fd'};const peer={id:'peer',username:'pyronosh',display_name:'Pyronosh',status:'online',ui_theme_color:'#e056fd'};"
 );
 s=s.replace("if(table==='profiles')data=[profile];",
  "if(table==='profiles')data=[profile,peer];if(table==='friendships')data=[{requester_id:'audit-user',addressee_id:'peer',status:'accepted',created_at:'2026-09-20T10:00:00Z'}];if(table==='profile_stats')data=[{user_id:'audit-user',xp:1800,message_count:10},{user_id:'peer',xp:3900,message_count:22}];if(table==='user_presence')data=[{user_id:'audit-user',state:'online',activity_text:'V Yamachatu',last_seen_at:new Date().toISOString()},{user_id:'peer',state:'online',activity_text:'V Yamachatu',last_seen_at:new Date().toISOString()}];if(table==='direct_thread_members')data=[{thread_id:'dm-a',user_id:'audit-user'},{thread_id:'dm-a',user_id:'peer'}];");
 s=s.replace(
  "const communities=[{id:'community-a',name:'Testovací server',owner_id:'audit-user',server_color:'#1a9fff'}];",
  "const communities=[{id:'community-a',name:'Testovací server',description:'Popis testovacího serveru',created_at:'2026-09-20T10:00:00Z',owner_id:'audit-user',server_color:'#1a9fff',is_public:true}];"
 );
 return s;
}
async function boot(browser,width,height,mobile=false){
 const page=await browser.newPage({viewport:{width,height},serviceWorkers:'block',hasTouch:mobile,isMobile:mobile});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const supabase=mock();
 await page.route('**/*',route=>{
  const u=new URL(route.request().url());
  if(u.hostname!=='127.0.0.1')return route.abort();
  if(u.pathname==='/vendor/supabase.js')return route.fulfill({contentType:'application/javascript',body:supabase});
  const file=path.join(root,u.pathname==='/'?'index.html':decodeURIComponent(u.pathname));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:''});
  if(u.pathname==='/')return route.fulfill({contentType:'text/html',body:fs.readFileSync(file,'utf8')});
  return route.fulfill({path:file});
 });
 await page.goto('http://127.0.0.1/');
 await page.waitForFunction(()=>window.__ycClientReady,{},{timeout:12000});
 await page.waitForFunction(()=>document.documentElement.dataset.ycFriendsRefresh==='1');
 return {page,errors};
}
function inside(b,w,h){return b&&b.width>0&&b.height>0&&b.x>=-1&&b.y>=-1&&b.x+b.width<=w+1&&b.y+b.height<=h+1}

(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  {
   const {page,errors}=await boot(browser,1440,900,false);
   await page.locator('#ycV3Friends').click();
   await page.waitForSelector('#ycFriendsHome:not(.hidden)');
   assert.equal(await page.locator('#ycFriendsHome').getAttribute('data-yc-modern-friends'),'1');
   assert.equal(await page.locator('#ycFriendsStatusBtn').getAttribute('data-yc-modern-status'),'1');
   const pseudo=await page.locator('.yc-v3-nav-fill').evaluate(el=>getComputedStyle(el,'::after').content);
   assert(['none','normal','""',"''"].includes(pseudo),pseudo);
   await page.locator('#friendsTab').click();
   await page.waitForFunction(()=>document.querySelector('#rightContent .steam-friend-row'));
   const row=page.locator('#rightContent .steam-friend-row').first();
   await row.evaluate(el=>el.dataset.keep='1');
   await page.locator('#friendsTab').click();await page.waitForTimeout(100);
   assert.equal(await row.getAttribute('data-keep'),'1','Unchanged friends list repainted on generated web');
   assert.deepEqual(errors,[]);
   await page.close();
  }
  for(const [w,h] of [[390,844],[844,390]]){
   const {page,errors}=await boot(browser,w,h,true);
   const card=page.locator('#rail [data-community="community-a"]');
   let target=card;
   if(!await card.isVisible()){target=page.locator('#ycMobileServerMenuBtn');await target.waitFor({state:'visible'})}
   const b=await target.boundingBox();assert(b);
   const x=b.x+b.width/2,y=b.y+b.height/2;
   await target.dispatchEvent('pointerdown',{pointerType:'touch',pointerId:51,isPrimary:true,button:0,clientX:x,clientY:y});
   await page.waitForTimeout(610);
   await target.dispatchEvent('pointerup',{pointerType:'touch',pointerId:51,isPrimary:true,button:0,clientX:x,clientY:y});
   await page.waitForSelector('#ycUiMenuRoot:not(.hidden)');
   assert.equal(await page.locator('#ycUiMenuRoot').getAttribute('data-yc-server-card-menu'),'mobile');
   assert(inside(await page.locator('#ycUiMenuRoot').boundingBox(),w,h));
   await page.locator('[data-yc-menu-item="server-info"]').click();
   await page.waitForSelector('.yc-server-info-modal');
   await page.waitForFunction(()=>!document.querySelector('.yc-server-info-loading'));
   assert(inside(await page.locator('.yc-server-info-modal').boundingBox(),w,h));
   assert.deepEqual(errors,[]);
   await page.close();
  }
  console.log('PASS generated web/mobile social release: Friends refresh stable and server context works in desktop plus portrait/landscape touch layouts.');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
