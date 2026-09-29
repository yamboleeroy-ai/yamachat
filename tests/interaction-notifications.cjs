const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const baseMock=fs.readFileSync(path.join(__dirname,'supabase-fixture.js'),'utf8');
const interactionSource=fs.readFileSync(path.join(root,'scripts/interaction-notifications.mjs'),'utf8');
const serverCardSource=fs.readFileSync(path.join(root,'scripts/server-card-context.mjs'),'utf8');
assert(interactionSource.includes('-webkit-user-select:none;user-select:none'),'Long-press targets must disable text selection');
assert(interactionSource.includes('.yc-ui-menu,.yc-ui-menu *'),'Touch context-menu labels must not start native text selection');
assert(interactionSource.includes('.message,.message *'),'Chat message selection exception is missing');
assert(interactionSource.includes('-webkit-user-select:text;user-select:text'),'Copyable content must explicitly remain selectable on coarse pointers');
assert(!/body\\s*\\{[^}]*user-select\\s*:\\s*none/i.test(interactionSource),'Do not disable text selection globally on body');
assert(serverCardSource.includes('#ycMobileServerMenuBtn{-webkit-touch-callout:none;-webkit-user-select:none;user-select:none}'),'Server-card long press must disable text selection');
const interactionRuntime=fs.readFileSync(path.join(root,'web/interaction-notifications.js'),'utf8');
assert(interactionRuntime.includes("window.getSelection?.()?.removeAllRanges?.()"),'Long-press runtime must clear an already-started selection');
assert(interactionRuntime.includes("'.message[data-message-id]'"),'Chat messages must share the app long-press context lifecycle');
assert(interactionRuntime.includes("kind:'message'"),'Chat message long-press must open the existing message menu');
// Exercise the reviewed current client without regenerating it.

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
 await page.evaluate(selector=>{
  const el=document.querySelector(selector);if(!el)throw Error('Missing long-press target '+selector);
  const r=el.getBoundingClientRect(),x=r.left+Math.min(24,Math.max(4,r.width/2)),y=r.top+Math.min(24,Math.max(4,r.height/2));
  el.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true,pointerId:71,pointerType:'touch',isPrimary:true,button:0,buttons:1,clientX:x,clientY:y}));
 },selector);
 await page.waitForTimeout(620);
 await page.evaluate(selector=>{
  const el=document.querySelector(selector);if(!el)return;
  const r=el.getBoundingClientRect(),x=r.left+Math.min(24,Math.max(4,r.width/2)),y=r.top+Math.min(24,Math.max(4,r.height/2));
  el.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,cancelable:true,pointerId:71,pointerType:'touch',isPrimary:true,button:0,buttons:0,clientX:x,clientY:y}));
 },selector);
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

  // Close the left mobile drawer through its existing toggle; pointer hit-testing of the scrim varies by layout.
  await page.evaluate(()=>document.getElementById('mobileMenu')?.click());
  await page.waitForTimeout(250);
  // Chat messages use the same deliberate touch hold instead of relying on a browser-specific
  // contextmenu gesture. Keep message text selectable; the hold only opens the existing app menu.
  await page.waitForSelector('.message[data-message-id="chat-a-0"]',{timeout:10000});
  await page.waitForSelector('[data-yc-react="chat-a-0"]',{state:'attached',timeout:10000});
  await longPress(page,'.message[data-message-id="chat-a-0"]');
  await page.waitForFunction(()=>window.__ycLongPressLastOpen?.kind==='message'&&window.__ycLongPressLastOpen?.id==='chat-a-0',null,{timeout:3000});
  await page.waitForSelector('[data-yc-menu-reply="chat-a-0"]',{timeout:3000});
  assert.equal(await page.locator('[data-yc-menu-react="chat-a-0"]').count()>0,true,'message long-press reaction actions missing');
  await page.evaluate(()=>document.body.dispatchEvent(new MouseEvent('click',{bubbles:true,clientX:2,clientY:2})));

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

  // Interactive controls must not summon native text selection on touch, but real
  // message/input content stays copyable/editable.
  const selectionStyles=await page.evaluate(()=>{
   const menuItem=document.querySelector('#ycUiMenuRoot .yc-ui-menu-item');
   const message=document.createElement('div');message.className='message';
   const body=document.createElement('div');body.className='m-body';body.textContent='Text zprávy musí jít označit a kopírovat.';message.appendChild(body);document.body.appendChild(message);
   const input=document.createElement('input');input.value='editovatelný text';document.body.appendChild(input);
   const result={
    menu:menuItem?getComputedStyle(menuItem).userSelect:'',
    message:getComputedStyle(body).userSelect,
    input:getComputedStyle(input).userSelect
   };
   message.remove();input.remove();return result;
  });
  assert.equal(selectionStyles.menu,'none',JSON.stringify(selectionStyles));
  assert.equal(selectionStyles.message,'text',JSON.stringify(selectionStyles));
  assert.equal(selectionStyles.input,'text',JSON.stringify(selectionStyles));

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
