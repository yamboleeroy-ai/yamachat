const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
 try{
  for(const target of ['index.html','desktop-client-dist/desktop-client.html']){
   const html=fs.readFileSync(path.join(root,target),'utf8');
   const renderer=html.slice(html.indexOf('async function ycInjectProfileActions1029(uid){'),html.indexOf('// Desktop v1.0.38: shared headers and stream entry points.'));
   const page=await browser.newPage();
   await page.setContent('<div id="modalRoot"></div><style>'+fs.readFileSync(path.join(root,'web/profile-actions.css'),'utf8')+'</style>');
   await page.addScriptTag({content:`
    let user={id:'me'},rightMode='members',calls=[],relation=null,blocked=false,fail=false,delay=0,mix={muted:false,volume:175};
    const $=id=>document.getElementById(id),toast=(...a)=>calls.push(['toast',...a]);
    const reset=()=>{$('modalRoot').innerHTML='<div class="steam-profile"><div class="steam-profile-body"><p>Profil uživatele</p><div class="discord-link">Discord</div></div></div>'};
    const ycFriendQuery1029=async()=>{await new Promise(r=>setTimeout(r,delay));return {data:relation,error:fail?{message:'unavailable'}:null}};
    const sb={from:table=>{let op='select',value;const q=new Proxy({}, {get:(_,key)=>key==='then'?resolve=>Promise.resolve().then(()=>{if(op==='insert'){calls.push(['insert',table]);relation=value}return {data:blocked?{blocked_id:'peer'}:null,error:fail?{message:'unavailable'}:null}}).then(resolve):(...args)=>{if(key==='insert'){op=key;value=args[0]}return q}});return q}};
    const voiceMixFor=()=>mix,setVoiceUserMix=(uid,patch)=>{calls.push(['mix',uid]);mix={...mix,...patch}};
    const ycProfileRow1029=async uid=>({id:uid,username:'Peer'}),closeModal=()=>{$('modalRoot').innerHTML=''},startDm=async p=>calls.push(['dm',p.id]);
    const ycCancelFriendRequest=async()=>{calls.push(['cancel']);relation=null},rejectFriend=async()=>{calls.push(['reject']);relation=null},renderFriends=()=>{};
    const ycBlockUser=async()=>{calls.push(['block']);blocked=true;relation=null},ycUnblockUser=async()=>{calls.push(['unblock']);blocked=false},ycOpenProfileReport1029=async uid=>calls.push(['report',uid]);
    ${renderer}
    window.fixture={render:async state=>{Object.assign(window,state);relation=state.relation||null;blocked=!!state.blocked;fail=!!state.fail;reset();await ycInjectProfileActions1029(state.self?'me':'peer')},read:()=>({calls,mix}),clear:()=>{calls=[]},stale:async()=>{delay=50;reset();const pending=ycInjectProfileActions1029('peer');reset();await pending;delay=0},transport:async()=>{reset();ycFriendQuery1029=()=>Promise.reject(Error('offline'));await ycInjectProfileActions1029('peer')}};
   `});
   await page.evaluate(()=>fixture.render({}));
   assert.equal(await page.locator('[data-yc-profile-friend]').innerText(),'＋ Přidat do přátel');
   await page.evaluate(()=>{document.querySelector('[data-yc-profile-friend]').click();document.querySelector('[data-yc-profile-friend]').click()});
   await page.waitForFunction(()=>document.querySelector('[data-yc-profile-friend]')?.textContent.includes('Žádost odeslána'));
   assert.equal((await page.evaluate(()=>fixture.read())).calls.filter(c=>c[0]==='insert').length,1);
   await page.locator('[data-yc-profile-friend]').click();await page.waitForFunction(()=>document.querySelector('[data-yc-profile-friend]')?.textContent.includes('Přidat'));
   await page.locator('[data-yc-profile-mute]').click();assert.deepEqual((await page.evaluate(()=>fixture.read())).mix,{muted:true,volume:175});
   await page.locator('[data-yc-profile-mute]').click();assert.equal((await page.evaluate(()=>fixture.read())).mix.muted,false);
   await page.locator('[data-yc-profile-block]').click();await page.waitForFunction(()=>document.querySelector('[data-yc-profile-block]')?.textContent.includes('Odblokovat'));
   assert(await page.locator('[data-yc-profile-message]').isDisabled());
   await page.locator('[data-yc-profile-block]').click();await page.waitForFunction(()=>document.querySelector('[data-yc-profile-message]')?.disabled===false);
   await page.locator('[data-yc-profile-report]').click();assert((await page.evaluate(()=>fixture.read())).calls.some(c=>c[0]==='report'&&c[1]==='peer'));
   await page.locator('[data-yc-profile-message]').click();assert((await page.evaluate(()=>fixture.read())).calls.some(c=>c[0]==='dm'&&c[1]==='peer'));
   for(const state of [{relation:{status:'accepted'}},{relation:{status:'pending',requester_id:'peer',addressee_id:'me'}},{fail:true},{self:true}]){
    await page.evaluate(state=>fixture.render(state),state);
    if(state.self)assert.equal(await page.locator('section').count(),0);
    else if(state.fail){assert(await page.locator('[data-yc-profile-block]').isDisabled());assert(await page.locator('[data-yc-profile-mute]').isEnabled())}
    else if(state.relation.status==='accepted')assert.match(await page.locator('[data-yc-profile-friend]').innerText(),/Přítel/);
    else {assert.match(await page.locator('[data-yc-profile-friend]').innerText(),/Přijmout/);await page.locator('[data-yc-profile-reject]').click()}
   }
   await page.evaluate(()=>fixture.stale());assert.equal(await page.locator('section').count(),0);
   for(const width of [320,390,768,1440]){
    await page.setViewportSize({width,height:844});await page.evaluate(()=>fixture.render({}));
    const box=await page.locator('section').boundingBox();assert(box.x>=0&&box.x+box.width<=width);
    for(const button of await page.locator('section button').all()){const b=await button.boundingBox();assert(b.height>=44&&b.width>0&&b.x+b.width<=width)}
   }
   await page.close();console.log('PASS profile states, duplicate clicks, DM/block/report delegation, local mute, failed reads, stale modal and 4 widths:',target);
  }
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
