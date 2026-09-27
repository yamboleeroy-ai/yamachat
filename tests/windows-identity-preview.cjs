const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const clientPath=path.join(root,'desktop','desktop-client.html');
const mainPath=path.join(root,'desktop','main.js');
const baseMock=fs.readFileSync(path.join(__dirname,'supabase-fixture.js'),'utf8');

const html=fs.readFileSync(clientPath,'utf8');
const main=fs.readFileSync(mainPath,'utf8');

assert(html.includes('id="ycWindowsIdentityPreviewStyle"'),'Windows identity preview style missing');
for(const legacy of ['discord-voice-buttons','class="discord-link"','.discord-link','yc-discord-avatar-','ycDiscordAvatarChoice','ycGetDiscordIdentity','/* global Steam x Discord skin  */','/* Discord avatar source choice */','// Discord avatar is optional.']){
  assert(!html.includes(legacy),'Legacy Discord-shaped runtime identity remains: '+legacy);
}
for(const kept of ["provider==='discord'","discord_avatar_url","use_discord_avatar"]){
  assert(html.includes(kept),'Discord provider compatibility was removed unexpectedly: '+kept);
}
for(const term of ['Nastavení komunity','Opustit komunitu','Veřejná komunita','Soukromá komunita','Miniatura komunity']){
  assert(html.includes(term),'Community terminology missing: '+term);
}
for(const term of ['Nastavení serveru','Opustit server','Veřejný server','Soukromý server','Miniatura serveru']){
  assert(!html.includes(term),'Old user-visible server terminology remains in Windows runtime: '+term);
}
assert(main.includes("app.setName('Yamachat Identity Preview')"),'Identity preview app name missing');
assert(main.includes("'Yamachat-Identity-Preview'"),'Identity preview userData isolation missing');
assert(!main.includes("'Yamachat-Stream-Preview'"),'Old shared preview profile remains');

function identityMock(){
  let s=baseMock.replace(
    "const profile={id:'audit-user',username:'tester',display_name:'Místní test',status:'online',ui_theme_color:'#ff0000'};",
    "const profile={id:'audit-user',username:'tester',display_name:'Místní test',status:'online',ui_theme_color:'#e056fd'};const peer={id:'peer',username:'pyronosh',display_name:'Pyronosh',status:'online',ui_theme_color:'#35e7ff'};"
  );
  s=s.replace(
    "const communities=[{id:'community-a',name:'Testovací server',owner_id:'audit-user',server_color:'#1a9fff'}];",
    "const communities=[{id:'community-a',name:'Testovací komunita',description:'Vlastní Yamachat prostor',created_at:'2026-09-20T10:00:00Z',owner_id:'audit-user',server_color:'#b45de0',is_public:true,icon_path:null}];"
  );
  s=s.replace(
    "if(table==='profiles')data=[profile];",
    "if(table==='profiles')data=[profile,peer];if(table==='friendships')data=[{requester_id:'audit-user',addressee_id:'peer',status:'accepted',created_at:'2026-09-20T10:00:00Z'}];if(table==='profile_stats')data=[{user_id:'audit-user',xp:1800,message_count:10},{user_id:'peer',xp:3900,message_count:22}];if(table==='user_presence')data=[{user_id:'audit-user',state:'online',activity_text:'V Yamachatu',last_seen_at:new Date().toISOString()},{user_id:'peer',state:'online',activity_text:'V Yamachatu',last_seen_at:new Date().toISOString()}];if(table==='direct_thread_members')data=[];"
  );
  s=s.replace(
    "if(table==='community_members')data=[{user_id:'audit-user',community_id:'community-a',role:'owner',profiles:profile}];",
    "if(table==='community_members')data=[{user_id:'audit-user',community_id:'community-a',role:'owner',profiles:profile},{user_id:'peer',community_id:'community-a',role:'member',profiles:peer}];"
  );
  return s;
}

async function boot(browser,width,height){
  const page=await browser.newPage({viewport:{width,height},serviceWorkers:'block'});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const mock=identityMock();
  await page.route('**/*',route=>{
    const u=new URL(route.request().url());
    if(u.hostname!=='127.0.0.1')return route.abort();
    if(u.pathname==='/vendor/supabase.js'||u.pathname==='/desktop/node_modules/@supabase/supabase-js/dist/umd/supabase.js')return route.fulfill({contentType:'application/javascript',body:mock});
    const decoded=decodeURIComponent(u.pathname);
    const rel=decoded==='/desktop/desktop-client.html'?'desktop/desktop-client.html':decoded.replace(/^\//,'');
    const file=path.join(root,rel);
    if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:''});
    return route.fulfill({path:file});
  });
  await page.goto('http://127.0.0.1/desktop/desktop-client.html');
  await page.waitForFunction(()=>window.__ycClientReady,{},{timeout:15000});
  await page.waitForSelector('#app:not(.hidden), .app:not(.hidden)',{timeout:15000});
  await page.waitForSelector('#rail [data-community="community-a"]',{timeout:15000});
  return {page,errors};
}

(async()=>{
  fs.mkdirSync(path.join(root,'artifacts'),{recursive:true});
  const browser=await chromium.launch({headless:true});
  try{
    const {page,errors}=await boot(browser,1440,900);
    const card=page.locator('#rail [data-community="community-a"]');
    await page.waitForFunction(()=>document.querySelector('#rail [data-community="community-a"] .yc-v3-community-copy strong')?.textContent?.includes('Testovací komunita'));

    const cardBox=await card.boundingBox();assert(cardBox,'Community card has no box');
    assert(cardBox.width>=90&&cardBox.width<=120,'Desktop community card width out of target range: '+cardBox.width);
    assert(cardBox.height>=60&&cardBox.height<=76,'Desktop community card height unexpected: '+cardBox.height);
    assert(await card.locator('.yc-v3-community-mark').count(),'Community thumbnail/initial mark missing');
    assert.equal(await card.locator('.yc-v3-community-copy strong').innerText(),'Testovací komunita');
    assert(await card.evaluate(el=>el.classList.contains('active')),'Current community card is not active');

    const chatBox=await page.locator('.yc-v3-content-grid>.chat').boundingBox();
    const rightBox=await page.locator('.yc-v3-content-grid>.right').boundingBox();
    assert(chatBox&&chatBox.width>350,'Chat panel collapsed after rail change');
    assert(rightBox&&rightBox.width>250,'Right panel collapsed after rail change');
    assert(chatBox.x+chatBox.width<=rightBox.x+1,'Chat overlaps the right panel');

    await card.click({button:'right'});
    await page.waitForSelector('#ycUiMenuRoot:not(.hidden)');
    assert.equal(await page.locator('#ycUiMenuRoot').getAttribute('data-yc-server-card-menu'),'desktop');
    const menuText=await page.locator('#ycUiMenuRoot').innerText();
    assert.match(menuText,/Info o serveru/);
    assert.match(menuText,/Nastavení komunity/);
    await page.locator('[data-yc-menu-item="server-info"]').click();
    await page.waitForSelector('.yc-server-info-modal');
    await page.waitForFunction(()=>!document.querySelector('.yc-server-info-loading'),null,{timeout:5000});
    const infoText=await page.locator('.yc-server-info-modal').innerText();
    assert.match(infoText,/Veřejná komunita/i);
    assert.match(infoText,/Nastavení komunity/i);
    await page.locator('.yc-server-info-close').click();

    await page.locator('#membersTab').click();
    await page.waitForSelector('#rightContent .steam-member-row[data-member-id="peer"]',{timeout:5000});
    const memberDiamond=page.locator('#rightContent .steam-member-row[data-member-id="peer"] .yc-avatar-presence-dot');
    await memberDiamond.waitFor({state:'visible'});
    const memberShape=await memberDiamond.evaluate(el=>({clip:getComputedStyle(el).clipPath,borderRadius:getComputedStyle(el).borderRadius}));
    assert.match(memberShape.clip,/polygon/i,'Member presence is not a Yamachat diamond');

    await page.locator('#friendsTab').click();
    await page.waitForSelector('#rightContent .steam-friend-row[data-profile-user="peer"]',{timeout:5000});
    const friendDot=page.locator('#rightContent .steam-friend-row[data-profile-user="peer"] .yc-avatar-presence-dot');
    await friendDot.waitFor({state:'visible'});
    assert.match(await friendDot.evaluate(el=>getComputedStyle(el).clipPath),/polygon/i,'Friend presence is not a Yamachat diamond');

    const ownShape=await page.locator('.me').evaluate(el=>getComputedStyle(el,'::after').clipPath);
    assert.match(ownShape,/polygon/i,'Own profile presence is not a Yamachat diamond');

    // Desktop width adaptation: stay compact and leave the desktop content usable.
    await page.setViewportSize({width:1180,height:760});
    await page.waitForTimeout(100);
    const compactBox=await card.boundingBox();assert(compactBox);
    assert(compactBox.width>=90&&compactBox.width<=105,'Compact desktop community card width unexpected: '+compactBox.width);
    const compactChat=await page.locator('.yc-v3-content-grid>.chat').boundingBox();
    assert(compactChat&&compactChat.width>250,'Compact desktop chat became unusable');

    await page.setViewportSize({width:1440,height:900});
    await page.waitForTimeout(120);
    await page.locator('#membersTab').click();
    await page.waitForSelector('#rightContent .steam-member-row');
    await page.screenshot({path:path.join(root,'artifacts','yamachat-windows-identity-preview.png'),fullPage:true});

    assert.deepEqual(errors,[],'Renderer errors: '+JSON.stringify(errors));
    console.log('PASS Windows identity preview: isolated desktop UI, compact community cards, context/info, Friends/Members presence diamonds, resize and screenshot.');
  }finally{
    await browser.close();
  }
})().catch(error=>{console.error(error);process.exitCode=1});
