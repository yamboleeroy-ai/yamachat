const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const clientsCfg=[
 {id:'d1',name:'Desktop User',platform:'desktop',width:1280,height:800},
 {id:'w1',name:'Web User',platform:'web',width:1280,height:800},
 {id:'a1',name:'Android User',platform:'android',width:390,height:844,touch:true},
 {id:'i1',name:'iOS User',platform:'ios-pwa',width:390,height:844,touch:true,ios:true}
];
const profiles=clientsCfg.map(x=>({id:x.id,username:x.id,display_name:x.name,status:'online',ui_theme_color:'#70e4e8'}));
function source(platform){
 const doc=fs.readFileSync(path.join(root,platform==='desktop'?'desktop/desktop-client.html':'index.html'),'utf8'),marker='window.__ycClientReady=true;';
 assert(doc.includes(marker),platform+' client-ready marker missing');
 const bridge="\nwindow.__ycChatAudit={state:()=>({user:user?.id||'',channel:currentChannel?.id||'',thread:currentThread?.id||'',notify:(typeof ycNotifyItems!=='undefined'?ycNotifyItems:[]).map(x=>({type:x.type,key:x.key,title:x.title,unread:x.unread}))}),selectChannelById:async id=>{const all=await getChannels();return selectChannel(id,all)},selectThreadById:id=>selectThread(id),visible:()=>[...document.querySelectorAll('#messages [data-message-id]')].map(x=>({id:x.dataset.messageId,body:x.querySelector('.m-body')?.textContent||'',mentioned:x.classList.contains('yc-mentioned-me')})),subscriptions:()=>window.__mockChannels.filter(x=>x.active).map(x=>({name:x.name,listeners:x.listeners.length}))};\n";
 return doc.replace(marker,bridge+marker);
}
function fixture(cfg){
 const ps=JSON.stringify(profiles),current=JSON.stringify(profiles.find(x=>x.id===cfg.id));
 return String.raw\`
window.supabase={createClient:()=>{
 const profile=\${current},profiles=\${ps};
 const communities=[{id:'community-a',name:'Chat Audit',owner_id:'d1',server_color:'#1a9fff'}];
 const channels=[{id:'chat-a',community_id:'community-a',name:'obecny',kind:'text',position:1},{id:'chat-b',community_id:'community-a',name:'druhy',kind:'text',position:2}];
 const members=profiles.map(p=>({user_id:p.id,community_id:'community-a',role:p.id==='d1'?'owner':'member',profiles:p}));
 const dmMembers=[{thread_id:'dm-d1-w1',user_id:'d1'},{thread_id:'dm-d1-w1',user_id:'w1'}];
 window.__mockMessages=[];window.__mockMentions=[];window.__mockChannels=[];window.__mockWrites=[];
 const match=(row,filters)=>Object.entries(filters).every(([k,v])=>v===null?row?.[k]==null:row?.[k]===v);
 const applyFilters=(rows,filters,inFilters)=>rows.filter(r=>match(r,filters)&&Object.entries(inFilters).every(([k,vals])=>vals.includes(r?.[k])));
 function query(table){
  let one=false,filters={},inFilters={},op='read',mutation=null,limitN=Infinity,ascending=true;
  const q=new Proxy({}, {get:(_,key)=>{
   if(key==='then')return resolve=>{
    const run=async()=>{
     if(op==='insert'){
      const rows=(Array.isArray(mutation)?mutation:[mutation]).filter(Boolean).map(r=>({...r,id:r.id||crypto.randomUUID(),created_at:r.created_at||new Date().toISOString()}));
      if(table==='messages')for(const row of rows){if(!window.__mockMessages.some(x=>x.id===row.id))window.__mockMessages.push(row);await window.__ycChatBusSend?.(row)}
      if(table==='message_mentions')for(const row of rows){if(!window.__mockMentions.some(x=>x.id===row.id))window.__mockMentions.push(row)}
      window.__mockWrites.push(table+':insert');return {data:one?(rows[0]||null):rows,error:null,count:rows.length};
     }
     if(op==='update'||op==='upsert'||op==='delete'){window.__mockWrites.push(table+':'+op);return {data:one?null:[],error:null,count:0}}
     let data=[];
     if(table==='profiles')data=profiles;
     else if(table==='community_members')data=members;
     else if(table==='communities')data=communities;
     else if(table==='channels')data=channels;
     else if(table==='messages')data=window.__mockMessages;
     else if(table==='message_mentions')data=window.__mockMentions;
     else if(table==='direct_thread_members')data=dmMembers;
     else if(table==='profile_stats')data=profiles.map(p=>({user_id:p.id,xp:0,message_count:0}));
     else if(table==='user_presence')data=profiles.map(p=>({user_id:p.id,state:'online',activity_text:'V Yamachatu',last_seen_at:new Date().toISOString()}));
     data=applyFilters(data,filters,inFilters);
     if(table==='messages'||table==='message_mentions')data=[...data].sort((a,b)=>ascending?new Date(a.created_at)-new Date(b.created_at):new Date(b.created_at)-new Date(a.created_at));
     if(Number.isFinite(limitN))data=data.slice(0,limitN);
     return {data:one?(data[0]||null):data,error:null,count:data.length};
    };return run().then(resolve);
   };
   return (...args)=>{
    if(key==='single'||key==='maybeSingle')one=true;else if(key==='eq')filters[args[0]]=args[1];else if(key==='in')inFilters[args[0]]=args[1]||[];else if(key==='is')filters[args[0]]=args[1];else if(key==='limit')limitN=Number(args[0]);else if(key==='order')ascending=args[1]?.ascending!==false;else if(['insert','update','upsert','delete'].includes(key)){op=key;mutation=args[0]||null}
    return q;
   }
  }});return q;
 }
 const filterMatches=(filter,row)=>{if(!filter)return true;const m=String(filter).match(/^([^=]+)=eq\\.(.+)$/);return !m||String(row?.[m[1]]??'')===m[2]};
 const channel=name=>{const c={name:String(name),active:false,listeners:[],on(kind,opts,cb){c.listeners.push({kind,opts:opts||{},cb});return c},subscribe(cb){c.active=true;window.__mockChannels.push(c);queueMicrotask(()=>cb?.('SUBSCRIBED'));return c},track:async()=>{},untrack:async()=>{},send:async()=>{},presenceState:()=>({})};return c};
 window.__mockEmit=(table,event,row)=>{for(const c of window.__mockChannels.filter(x=>x.active))for(const l of c.listeners){if(l.kind!=='postgres_changes'||l.opts?.table!==table)continue;if(l.opts?.event&&l.opts.event!=='*'&&l.opts.event!==event)continue;if(!filterMatches(l.opts?.filter,row))continue;try{l.cb({new:row,old:{}})}catch(e){console.error(e)}}};
 window.__mockReceiveMessage=row=>{if(!window.__mockMessages.some(x=>x.id===row.id))window.__mockMessages.push(row);window.__mockEmit('messages','INSERT',row)};
 window.__mockReceiveMention=row=>{if(!window.__mockMentions.some(x=>x.id===row.id))window.__mockMentions.push(row);window.__mockEmit('message_mentions','INSERT',row)};
 return {from:query,rpc:async()=>({data:false,error:null}),channel,removeChannel:async c=>{if(c)c.active=false},auth:{getSession:async()=>({data:{session:{user:{id:profile.id}}},error:null}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),getUser:async()=>({data:{user:{id:profile.id,identities:[]}}}),getUserIdentities:async()=>({data:{identities:[]}}),signOut:async()=>({error:null})},storage:{from:()=>({getPublicUrl:()=>({data:{publicUrl:''}}),createSignedUrl:async()=>({data:null}),upload:async()=>({error:null}),remove:async()=>({error:null})})},functions:{invoke:async()=>({data:null,error:new Error('fixture')})},realtime:{isConnected:()=>true,connect(){}}}
}};\`;
}
(async()=>{
 const browser=await chromium.launch({headless:true});
 const clients=new Map(),bus=[];
 try{
  for(const cfg of clientsCfg){const context=await browser.newContext({viewport:{width:cfg.width,height:cfg.height},hasTouch:!!cfg.touch,isMobile:!!cfg.touch,serviceWorkers:'block',...(cfg.ios?{userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1'}:{})});if(cfg.ios)await context.addInitScript(()=>Object.defineProperty(navigator,'standalone',{value:true,configurable:true}));const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));clients.set(cfg.id,{cfg,context,page,errors})}
  for(const [id,c] of clients){
   await c.page.exposeBinding('__ycChatBusSend',async(_src,row)=>{bus.push({from:id,id:row.id,channel:row.channel_id||'',thread:row.direct_thread_id||'',body:row.body||''});for(const target of clients.values())await target.page.evaluate(r=>window.__mockReceiveMessage(r),row).catch(()=>{});if(/(?:^|\\s)@w1(?=$|\\s|[.,!?;:()\\[\\]{}])/i.test(String(row.body||''))&&row.channel_id){const m={id:'mention-'+row.id,message_id:row.id,author_id:row.author_id,mentioned_user_id:'w1',channel_id:row.channel_id,community_id:'community-a',created_at:row.created_at,read_at:null};await clients.get('w1').page.evaluate(x=>window.__mockReceiveMention(x),m)}return true});
   await c.page.route('**/*',route=>{const u=new URL(route.request().url());if(u.hostname!=='127.0.0.1')return route.abort();if(u.pathname.endsWith('/supabase.js'))return route.fulfill({contentType:'text/javascript',body:fixture(c.cfg)});if(u.pathname==='/')return route.fulfill({contentType:'text/html',body:source(c.cfg.platform)});const file=path.resolve(root,'.'+decodeURIComponent(u.pathname));if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||fs.statSync(file).isDirectory())return route.fulfill({status:404,body:''});return route.fulfill({path:file})});
   await c.page.goto('http://127.0.0.1/');await c.page.waitForFunction(()=>window.__ycClientReady,{},{timeout:20000});await c.page.waitForSelector('#app:not(.hidden)');assert.equal(await c.page.evaluate(()=>window.__ycChatAudit.state().user),id,id+' auth');
  }
  await Promise.all([...clients.values()].map(async c=>{for(let n=0;n<5;n++){await c.page.locator('#messageInput').fill('burst '+c.cfg.id+' '+n);await c.page.locator('#sendBtn').click();await c.page.waitForFunction(()=>document.querySelector('#messageInput')?.value==='')}}));
  for(const [id,c] of clients){await c.page.waitForFunction(()=>window.__ycChatAudit.visible().filter(x=>x.body.startsWith('burst ')).length===20,{},{timeout:15000});const rows=await c.page.evaluate(()=>window.__ycChatAudit.visible().filter(x=>x.body.startsWith('burst ')));assert.equal(new Set(rows.map(x=>x.id)).size,20,id+' duplicate realtime messages')}
  const android=clients.get('a1');await android.page.evaluate(()=>window.__ycChatAudit.selectChannelById('chat-b'));await android.page.waitForFunction(()=>window.__ycChatAudit.state().channel==='chat-b');
  const desktop=clients.get('d1'),race='race-'+Date.now();await desktop.page.locator('#messageInput').fill(race);await desktop.page.locator('#sendBtn').click();await desktop.page.waitForFunction(()=>document.querySelector('#messageInput')?.value==='');await android.page.waitForTimeout(150);assert.equal(await android.page.evaluate(body=>window.__ycChatAudit.visible().some(x=>x.body===body),race),false,'cross-channel realtime leak');await android.page.evaluate(()=>window.__ycChatAudit.selectChannelById('chat-a'));await android.page.waitForFunction(body=>window.__ycChatAudit.visible().some(x=>x.body===body),race);
  const web=clients.get('w1');await desktop.page.evaluate(()=>window.__ycChatAudit.selectThreadById('dm-d1-w1'));await web.page.evaluate(()=>window.__ycChatAudit.selectThreadById('dm-d1-w1'));await Promise.all([desktop.page.waitForFunction(()=>window.__ycChatAudit.state().thread==='dm-d1-w1'),web.page.waitForFunction(()=>window.__ycChatAudit.state().thread==='dm-d1-w1')]);const dm='private-'+Date.now();await desktop.page.locator('#messageInput').fill(dm);await desktop.page.locator('#sendBtn').click();await web.page.waitForFunction(body=>window.__ycChatAudit.visible().some(x=>x.body===body),dm,{timeout:10000});assert.equal(await clients.get('i1').page.evaluate(body=>window.__ycChatAudit.visible().some(x=>x.body===body),dm),false,'DM leaked into unrelated channel');
  await desktop.page.evaluate(()=>window.__ycChatAudit.selectChannelById('chat-a'));await web.page.evaluate(()=>window.__ycChatAudit.selectChannelById('chat-a'));await Promise.all([desktop.page.waitForFunction(()=>window.__ycChatAudit.state().channel==='chat-a'),web.page.waitForFunction(()=>window.__ycChatAudit.state().channel==='chat-a')]);const mention='hello @w1 '+Date.now();await desktop.page.locator('#messageInput').fill(mention);await desktop.page.locator('#sendBtn').click();await web.page.waitForFunction(()=>window.__ycChatAudit.state().notify.filter(x=>x.type==='mention').length===1,{},{timeout:10000});await web.page.waitForFunction(body=>window.__ycChatAudit.visible().some(x=>x.body===body&&x.mentioned),mention,{timeout:10000});
  for(const [id,c] of clients){const before=await c.page.evaluate(()=>window.__ycChatAudit.subscriptions().filter(x=>/^yc-(msg|att)-/.test(x.name)).length);for(let n=0;n<12;n++)await c.page.evaluate(ch=>window.__ycChatAudit.selectChannelById(ch),n%2?'chat-a':'chat-b');await c.page.evaluate(()=>window.__ycChatAudit.selectChannelById('chat-a'));await c.page.waitForFunction(()=>window.__ycChatAudit.state().channel==='chat-a');const after=await c.page.evaluate(()=>window.__ycChatAudit.subscriptions().filter(x=>/^yc-(msg|att)-/.test(x.name)).length);assert(after<=Math.max(2,before),id+' message subscription leak '+before+' -> '+after);assert.deepEqual(c.errors,[],id+' runtime errors')}
  console.log('AUDIT_CHAT_BUS '+JSON.stringify({messages:bus.length,channelMessages:bus.filter(x=>x.channel).length,dmMessages:bus.filter(x=>x.thread).length}));
  console.log('PASS cross-platform realtime chat: desktop/web/Android/iOS-PWA receive burst messages without duplicates, channel isolation/history, DM isolation, mention notification/highlight and subscription replacement.');
 }finally{for(const c of clients.values())await c.context.close().catch(()=>{});await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
