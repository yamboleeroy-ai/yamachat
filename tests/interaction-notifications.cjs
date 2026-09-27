const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const baseMock=fs.readFileSync(path.join(__dirname,'supabase-fixture.js'),'utf8');
execFileSync(process.execPath,[path.join(root,'scripts/build-web.mjs')],{cwd:root,stdio:'inherit'});

function interactionMock(){
 let mock=baseMock;
 mock=mock.replace(
  "const profile={id:'audit-user',username:'tester',display_name:'Místní test',status:'online',ui_theme_color:'#ff0000'};",
  "const profile={id:'audit-user',username:'tester',display_name:'Místní test',status:'online',ui_theme_color:'#e056fd'};const peer={id:'peer',username:'peer',display_name:'Testovací kolega',status:'online',ui_theme_color:'#35e7ff'};"
 );
 mock=mock.replace(
  "if(table==='profiles')data=[profile];",
  "if(table==='profiles')data=[profile,peer];"
 );
 mock=mock.replace(
  "if(table==='community_members')data=[{user_id:'audit-user',community_id:'community-a',role:'owner',profiles:profile}];",
  "if(table==='community_members')data=[{user_id:'audit-user',community_id:'community-a',role:'owner',profiles:profile},{user_id:'peer',community_id:'community-a',role:'member',profiles:peer}];"
 );
 return mock;
}
async function longPress(page,selector){
 const box=await page.locator(selector).first().boundingBox();assert(box,'Missing long-press target '+selector);
 const x=box.x+Math.min(24,Math.max(4,box.width/2)),y=box.y+Math.min(24,Math.max(4,box.height/2));
 const cdp=await page.context().newCDPSession(page);
 try{
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:71,radiusX:2,radiusY:2,force:1}]} );
  await page.waitForTimeout(620);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 }finally{await cdp.detach().catch(()=>{})}
}
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844},serviceWorkers:'block',hasTouch:true,isMobile:true});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const mock=interactionMock();
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
  await page.waitForSelector('#mobileMenu');

  // A touch hold on a text channel must invoke the existing right-click menu.
  await page.locator('#mobileMenu').click();
  await page.waitForSelector('#channelList [data-channel]');
  await longPress(page,'#channelList [data-channel]');
  await page.waitForFunction(()=>window.__ycLongPressLastOpen?.kind==='text-channel',null,{timeout:3000});
  await page.waitForTimeout(350);
  const channelState=await page.evaluate(()=>({last:window.__ycLongPressLastOpen,menu:document.getElementById('ycUiMenuRoot')?.textContent||'',hidden:document.getElementById('ycUiMenuRoot')?.classList.contains('hidden'),community:window.currentCommunity?.id||null}));
  assert.equal(channelState.hidden,false,JSON.stringify(channelState));
  assert.match(channelState.menu,/oznámen/i,JSON.stringify(channelState));
  const channelMenu=await page.locator('#ycUiMenuRoot').innerText();
  assert.match(channelMenu,/Vypnout oznámení z kanálu|Zapnout oznámení z kanálu/);
  await page.getByText(/Vypnout oznámení z kanálu|Zapnout oznámení z kanálu/).click();
  await page.waitForFunction(()=>window.__mockWrites.some(x=>x==='notification_preferences:upsert'));

  // A touch hold on another user must invoke that user's menu and expose notification control.
  await page.locator('#ycMobileMembersBtn').click();
  await page.waitForSelector('#rightContent .steam-member-row[data-member-id="peer"]');
  await longPress(page,'#rightContent .steam-member-row[data-member-id="peer"]');
  await page.waitForFunction(()=>window.__ycLongPressLastOpen?.kind==='member',null,{timeout:3000});
  await page.waitForTimeout(350);
  const userState=await page.evaluate(()=>({last:window.__ycLongPressLastOpen,menu:document.getElementById('ycUiMenuRoot')?.textContent||'',hidden:document.getElementById('ycUiMenuRoot')?.classList.contains('hidden')}));
  assert.equal(userState.hidden,false,JSON.stringify(userState));
  assert.match(userState.menu,/oznámen/i,JSON.stringify(userState));
  const userMenu=await page.locator('#ycUiMenuRoot').innerText();
  assert.match(userMenu,/Vypnout oznámení od uživatele|Zapnout oznámení od uživatele/);

  // The generated mic-test path must preserve an active-test intent and physically
  // hold the outbound voice track disabled until the test finishes.
  const source=fs.readFileSync(path.join(root,'index.html'),'utf8');
  for(const marker of [
   'ycMicTestWanted=true;ycSetMicTestVoiceHold(true)',
   'function ycRestartMicTest()',
   "addEventListener('change',ycMicTestSettingChanged)",
   '!voiceMuted&&!voiceDeafened&&!ycMicTestVoiceHold',
   'muted=voiceMuted||ycMicTestVoiceHold',
   "ycNotificationMenuItems('server'"
  ]) assert(source.includes(marker),'Missing generated interaction marker: '+marker);

  assert.deepEqual(errors,[]);
  console.log('PASS mobile long-press menus, notification preference action and mic-test voice-mute/restart guards.');
  await page.close();
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
