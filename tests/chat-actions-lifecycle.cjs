const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),base=fs.readFileSync(path.join(__dirname,'supabase-fixture.js'),'utf8');

function html(platform){return fs.readFileSync(path.join(root,platform==='desktop'?'desktop/desktop-client.html':'index.html'),'utf8')}
function mock(){
 let s=base
  .replace("function query(table){let single=false,filters={},op='read';","function query(table){let single=false,filters={},op='read',payload=null;")
  .replace("if(op!=='read')window.__mockWrites.push(table+':'+op);","if(op!=='read'){window.__mockWrites.push(table+':'+op);window.__mockWriteDetails.push({table,op,payload,filters:{...filters}})}")
  .replace("if(['insert','update','upsert','delete'].includes(key))op=key;","if(['insert','update','upsert','delete'].includes(key)){op=key;payload=args[0]??null;}")
  .replace("const channel=()=>{const c={on:()=>c,subscribe:()=>c,track:async()=>{},untrack:async()=>{},send:async()=>{},presenceState:()=>({})};return c};","const channel=()=>{const c={on:()=>c,subscribe:(cb)=>{queueMicrotask(()=>cb?.('SUBSCRIBED'));return c},track:async()=>{},untrack:async()=>{},send:async()=>{},presenceState:()=>({})};return c};")
  .replace("return {from:query,rpc:async()=>({data:false,error:null}),channel,removeChannel:async()=>{},auth:","return {from:query,rpc:async(name,args)=>{window.__mockRpcWrites.push({name,args});return {data:false,error:null}},channel,removeChannel:async()=>{},auth:")
  .replace("storage:{from:()=>({getPublicUrl:()=>({data:{publicUrl:''}}),createSignedUrl:async()=>({data:null})})}","storage:{from:(bucket)=>({getPublicUrl:()=>({data:{publicUrl:''}}),createSignedUrl:async()=>({data:null}),upload:async(p,file,opts)=>{window.__mockStorageWrites.push({op:'upload',bucket,path:p,name:file?.name||'',size:file?.size||0,type:opts?.contentType||''});return {data:{path:p},error:null}},remove:async(paths)=>{window.__mockStorageWrites.push({op:'remove',bucket,paths});return {data:[],error:null}}})}")
  .replace("}};window.__mockWrites=[];","}};window.__mockWrites=[];window.__mockWriteDetails=[];window.__mockRpcWrites=[];window.__mockStorageWrites=[];");
 return s;
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
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e.stack||e.message||e)));page.on('dialog',d=>d.accept());
   const doc=html(cfg.platform),supabase=mock();
   await page.route('**/*',route=>{
    const u=new URL(route.request().url());if(u.hostname!=='127.0.0.1')return route.abort();
    if(u.pathname.endsWith('/supabase.js'))return route.fulfill({contentType:'text/javascript',body:supabase});
    if(u.pathname==='/')return route.fulfill({contentType:'text/html',body:doc});
    const file=path.resolve(root,'.'+decodeURIComponent(u.pathname));if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||fs.statSync(file).isDirectory())return route.fulfill({status:404,body:''});return route.fulfill({path:file});
   });
   await page.goto('http://127.0.0.1/');await page.waitForFunction(()=>window.__ycClientReady,{},{timeout:25000});await page.waitForSelector('#app:not(.hidden)');
   await page.waitForSelector('.message[data-message-id="chat-a-0"]',{timeout:15000});

   // Attachment selection + message insert + storage upload + attachment row.
   await page.setInputFiles('#fileInput',{name:'audit.png',mimeType:'image/png',buffer:Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0])});
   await page.waitForSelector('#pendingFile:not(.hidden)');
   assert.match(await page.locator('#pendingFile').innerText(),/audit\.png/);
   await page.locator('#messageInput').fill('Zpráva s audit přílohou');
   await page.locator('#sendBtn').click();
   await page.waitForFunction(()=>window.__mockWrites.includes('attachments:insert')&&window.__mockStorageWrites.some(x=>x.op==='upload'&&x.bucket==='chat-media'));
   assert.equal(await page.locator('#pendingFile').isHidden(),true,cfg.platform+' pending attachment not cleared');

   // Reaction through the actual platform UI path: hover actions on desktop/web,
   // context-menu actions on touch layouts.
   const sourceMessage=page.locator('.message[data-message-id="chat-a-0"]');
   if(cfg.touch){
    await sourceMessage.dispatchEvent('contextmenu',{clientX:120,clientY:180});
    await page.waitForSelector('[data-yc-menu-react="chat-a-0"]',{timeout:10000});
    await page.locator('[data-yc-menu-react="chat-a-0"]').first().click();
   }else{
    await sourceMessage.hover();
    await page.waitForSelector('[data-yc-react="chat-a-0"]',{timeout:10000});
    await page.locator('[data-yc-react="chat-a-0"]').first().click();
   }
   await page.waitForFunction(()=>window.__mockRpcWrites.some(x=>x.name==='toggle_message_reaction'&&x.args.p_message_id==='chat-a-0'));

   // Reply through the matching platform UI path, then verify reply_to on send.
   if(cfg.touch){
    await sourceMessage.dispatchEvent('contextmenu',{clientX:120,clientY:180});
    await page.waitForSelector('[data-yc-menu-reply="chat-a-0"]',{timeout:10000});
    await page.locator('[data-yc-menu-reply="chat-a-0"]').click();
   }else{
    await sourceMessage.hover();
    await page.waitForSelector('[data-yc-reply="chat-a-0"]',{timeout:10000});
    await page.locator('[data-yc-reply="chat-a-0"]').click();
   }
   await page.waitForSelector('#ycReplyCompose:not(.hidden)');
   await page.locator('#messageInput').fill('Audit odpověď');
   await page.locator('#sendBtn').click();
   await page.waitForFunction(()=>window.__mockWriteDetails.some(x=>x.table==='messages'&&x.op==='insert'&&x.payload?.reply_to==='chat-a-0'));
   assert.equal(await page.locator('#ycReplyCompose').isHidden(),true,cfg.platform+' reply target not cleared after send');

   // Delete through context menu; only mocked row deletion is allowed.
   if(cfg.touch)await sourceMessage.dispatchEvent('contextmenu',{clientX:120,clientY:180});
   else await sourceMessage.click({button:'right'});
   await page.waitForSelector('[data-yc-delete-message="chat-a-0"]');
   await page.locator('[data-yc-delete-message="chat-a-0"]').click({force:true});
   await page.waitForFunction(()=>window.__mockWriteDetails.some(x=>x.table==='messages'&&x.op==='delete'&&x.filters.id==='chat-a-0'));

   assert.deepEqual(errors,[],cfg.platform+' chat action runtime errors');
   results.push({platform:cfg.platform,attachment:true,reaction:true,reply:true,delete:true});
   await context.close();
  }
 }finally{await browser.close()}
 console.log('AUDIT_CHAT_ACTIONS '+JSON.stringify(results));
 console.log('PASS chat action lifecycle: desktop/web/Android-layout/iOS-PWA file selection/upload bookkeeping, reaction RPC, reply_to send and delete path execute through the real UI handlers against a non-destructive mock backend.');
})().catch(e=>{console.error(e);process.exit(1)});
