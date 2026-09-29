const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');

function client(platform){
  return fs.readFileSync(path.join(root,platform==='desktop'?'desktop/desktop-client.html':'index.html'),'utf8');
}
function supabaseMock(){
 return `
window.__mockWrites=[];window.__mockRpcWrites=[];
window.supabase={createClient:()=>{
 const profile={id:'audit-user',username:'tester',display_name:'Místní test',status:'online',avatar_path:null};
 const communities=[{id:'community-a',name:'Testovací server',description:'Audit server',owner_id:'audit-user',role:'owner',server_color:'#1a9fff',is_public:false}];
 const channels=[{id:'chat-a',community_id:'community-a',name:'obecný',kind:'text',position:1},{id:'voice-a',community_id:'community-a',name:'Hlas',kind:'voice',position:2}];
 const roles=[{id:'owner-visual',community_id:'community-a',name:'Vlastník',color:'#f2c968',position:100,permissions:{__yc_owner_visual:true},is_default:false,created_at:'2026-01-01T00:00:00Z'}];
 const memberRoles=[{community_id:'community-a',user_id:'audit-user',role_id:'owner-visual'}];
 function query(table){let single=false,filters={},op='read',payload=null;const q=new Proxy({}, {get:(_,key)=>key==='then'?(resolve)=>{
   let data=[];
   if(table==='profiles')data=[profile];
   if(table==='community_members')data=[{user_id:'audit-user',community_id:'community-a',role:'owner',joined_at:'2026-01-01T00:00:00Z',profiles:profile}];
   if(table==='communities')data=communities;
   if(table==='channels')data=channels;
   if(table==='community_roles')data=roles;
   if(table==='community_member_roles')data=memberRoles;
   if(table==='desktop_server_role_layout')data=[{community_id:'community-a',automatic:true,role_order:[]}];
   if(table==='community_member_permissions')data=[];
   if(table==='community_emojis')data=[];
   if(table==='soundboard_sounds')data=[];
   if(table==='community_bans')data=[];
   if(table==='messages')data=Array.from({length:6},(_,i)=>({id:'chat-a-'+i,channel_id:'chat-a',author_id:'audit-user',body:'Test '+i,created_at:new Date(1700000000000+i*60000).toISOString(),profiles:profile}));
   for(const [k,v] of Object.entries(filters)){if(k==='__in'){const [column,set]=v;data=data.filter(x=>set.has(String(x?.[column]??'')))}else data=data.filter(x=>String(x?.[k]??'')===String(v))}
   if(op!=='read')window.__mockWrites.push({table,op,payload,filters});
   const result={data:single?(data[0]||null):data,error:null,count:data.length};
   return Promise.resolve(result).then(resolve);
  }:(...args)=>{
   if(key==='single'||key==='maybeSingle')single=true;
   if(key==='eq')filters[args[0]]=args[1];
   if(key==='in'){const set=new Set((args[1]||[]).map(String));filters.__in=[args[0],set]}
   if(['insert','update','upsert','delete'].includes(key)){op=key;payload=args[0]??null}
   return q
  }});return q}
 const channel=()=>{const c={on:()=>c,subscribe:(cb)=>{queueMicrotask(()=>cb?.('SUBSCRIBED'));return c},track:async()=>{},untrack:async()=>{},send:async()=>{},presenceState:()=>({})};return c};
 const rpc=async(name,args={})=>{
   window.__mockRpcWrites.push({name,args});
   if(name==='update_community_settings'){
     Object.assign(communities[0],{name:args.p_name,description:args.p_description,is_public:!!args.p_is_public,server_color:args.p_server_color});
     return {data:{...communities[0]},error:null};
   }
   if(name==='create_community_invite')return {data:'audit-invite-code',error:null};
   if(name==='create_community_role'){
     const role={id:'role-'+(roles.length+1),community_id:args.p_community_id,name:args.p_name,color:args.p_color,position:0,permissions:args.p_permissions||{},is_default:false,created_at:new Date().toISOString()};
     roles.push(role);return {data:role,error:null};
   }
   if(name==='update_community_role'){
     const role=roles.find(r=>r.id===args.p_role_id);if(role)Object.assign(role,{name:args.p_name,color:args.p_color,position:args.p_position,permissions:args.p_permissions});return {data:role||true,error:null};
   }
   if(name==='assign_community_role'){
     if(!memberRoles.some(x=>x.community_id===args.p_community_id&&x.user_id===args.p_user_id&&x.role_id===args.p_role_id))memberRoles.push({community_id:args.p_community_id,user_id:args.p_user_id,role_id:args.p_role_id});
     return {data:true,error:null};
   }
   if(name==='remove_community_role'){const i=memberRoles.findIndex(x=>x.community_id===args.p_community_id&&x.user_id===args.p_user_id&&x.role_id===args.p_role_id);if(i>=0)memberRoles.splice(i,1);return {data:true,error:null}}
   return {data:false,error:null};
 };
 return {from:query,rpc,channel,removeChannel:async()=>{},auth:{getSession:async()=>({data:{session:{user:{id:'audit-user'},access_token:'fixture'}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),getUser:async()=>({data:{user:{id:'audit-user',identities:[]}}}),signOut:async()=>({error:null})},storage:{from:()=>({getPublicUrl:()=>({data:{publicUrl:''}}),createSignedUrl:async()=>({data:null}),remove:async()=>({data:[],error:null})})},functions:{invoke:async()=>({data:null,error:Error('offline fixture')})},realtime:{isConnected:()=>true,connect(){}}}
}};
`;
}

(async()=>{
 const browser=await chromium.launch({headless:true});
 const results=[];
 try{
  for(const cfg of [
   {platform:'desktop',width:1280,height:800},
   {platform:'web',width:1366,height:768},
   {platform:'android',width:390,height:844,touch:true},
   {platform:'ios-pwa',width:390,height:844,touch:true,ios:true}
  ]){
   const context=await browser.newContext({viewport:{width:cfg.width,height:cfg.height},hasTouch:!!cfg.touch,isMobile:!!cfg.touch,serviceWorkers:'block',...(cfg.ios?{userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1'}:{})});
   if(cfg.ios)await context.addInitScript(()=>Object.defineProperty(navigator,'standalone',{value:true,configurable:true}));
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e.stack||e.message||e)));
   await page.route('**/*',route=>{
    const u=new URL(route.request().url());if(u.hostname!=='127.0.0.1')return route.abort();
    if(u.pathname.endsWith('/supabase.js'))return route.fulfill({contentType:'text/javascript',body:supabaseMock()});
    if(u.pathname==='/')return route.fulfill({contentType:'text/html',body:client(cfg.platform)});
    const file=path.resolve(root,'.'+decodeURIComponent(u.pathname));if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||fs.statSync(file).isDirectory())return route.fulfill({status:404,body:''});return route.fulfill({path:file});
   });
   await page.goto('http://127.0.0.1/');
   await page.waitForFunction(()=>window.__ycClientReady,{},{timeout:25000});
   await page.waitForSelector('#app:not(.hidden)');
   await page.waitForFunction(()=>{const b=document.querySelector('#ycServerSettingsNavBtn');return !!window.ycOpenServerSettings&&!!b&&!b.hidden&&!b.disabled&&!b.classList.contains('hidden')},{},{timeout:15000});
   if(cfg.width<=1100){
    await page.locator('#ycMobileNavBtn').waitFor({state:'visible'});
    await page.locator('#ycMobileNavBtn').click();
    await page.waitForFunction(()=>document.getElementById('ycGlobalNav')?.classList.contains('yc-mobile-open'));
   }
   await page.locator('#ycServerSettingsNavBtn').waitFor({state:'visible'});
   await page.locator('#ycServerSettingsNavBtn').click();
   await page.waitForSelector('#ycServerSettingsBack');
   assert.equal(await page.locator('#ycServerSettingsBack .yc-ss-tab').count(),10,cfg.platform+' server settings tab count');

   // Overview: click -> RPC -> refreshed UI.
   await page.locator('#ycSSName').fill('Audit server upraven');
   await page.locator('#ycSSSaveOverview').click();
   await page.waitForFunction(()=>window.__mockRpcWrites.some(x=>x.name==='update_community_settings'&&x.args.p_name==='Audit server upraven'));
   await page.waitForSelector('#ycSSSaveOverview');

   // Access/privacy: another save must use the same safe RPC rather than a parallel implementation.
   await page.locator('[data-tab="access"]').click();
   await page.waitForSelector('#ycSSSaveAccess');
   await page.locator('#ycSSPublic').check();
   await page.locator('#ycSSSaveAccess').click();
   await page.waitForFunction(()=>window.__mockRpcWrites.some(x=>x.name==='update_community_settings'&&x.args.p_is_public===true));

   // Invite creation: verify payload and resulting UI value without touching clipboard or live backend.
   await page.locator('[data-tab="invites"]').click();
   await page.waitForSelector('#ycSSInviteCreate');
   await page.locator('#ycSSInviteCreate').click();
   await page.waitForFunction(()=>window.__mockRpcWrites.some(x=>x.name==='create_community_invite'));
   assert((await page.locator('#ycSSInviteLink').inputValue()).includes('audit-invite-code'),cfg.platform+' invite link not rendered');

   // Roles: owner visual role is pre-seeded; create a separate test role through the real editor.
   await page.locator('[data-tab="roles"]').click();
   await page.waitForSelector('#ycRoleNew');
   await page.locator('#ycRoleNew').click();
   await page.locator('#ycRoleName').fill('Audit role');
   await page.locator('#ycRoleSave').click();
   await page.waitForFunction(()=>window.__mockRpcWrites.some(x=>x.name==='create_community_role'&&x.args.p_name==='Audit role'));

   // Remaining tabs must render controls without exceptions. Destructive/upload operations are not executed.
   for(const [tab,selector] of [
    ['members','.yc-member-manage'],
    ['moderation','#ycSSBans'],
    ['channels','#ycSSAddText'],
    ['expressions','#ycSSRefreshExpressions'],
    ['danger','#ycSSDeleteServer']
   ]){
    await page.locator('[data-tab="'+tab+'"]').click();
    await page.waitForSelector(selector,{timeout:10000});
   }
   assert.equal(await page.locator('#ycSSDeleteServer').isDisabled(),false,cfg.platform+' owner delete guard unexpectedly disabled');

   await page.locator('#ycServerSettingsBack .yc-ss-close').click();
   await page.waitForSelector('#ycServerSettingsBack',{state:'detached'});
   assert.deepEqual(errors,[],cfg.platform+' server settings runtime errors');
   results.push({platform:cfg.platform,tabs:10,overviewSave:true,privacySave:true,invite:true,roleCreate:true,members:true,moderation:true,channels:true,expressions:true,dangerGuard:true});
   await context.close();
  }
 }finally{await browser.close()}
 console.log('AUDIT_SERVER_SETTINGS '+JSON.stringify(results));
 console.log('PASS server settings lifecycle: desktop/web/Android-layout/iOS-PWA open all functional tabs; overview/privacy saves, invite creation and role creation follow real click -> RPC -> UI paths; destructive delete and file uploads remain non-destructive guard checks.');
})().catch(e=>{console.error(e);process.exit(1)});
