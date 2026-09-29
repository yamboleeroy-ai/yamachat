const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),fixture=fs.readFileSync(path.join(__dirname,'supabase-fixture.js'),'utf8');
function html(platform){
 const file=platform==='desktop'?'desktop/desktop-client.html':'index.html',doc=fs.readFileSync(path.join(root,file),'utf8'),marker='window.__ycClientReady=true;';
 assert(doc.includes(marker),platform+' ready marker missing');
 const bridge=`
window.__ycStreamPresenceRace={
 async run(){
  const previousCapture=ycCaptureStreamPreviewData;
  let release;const gate=new Promise(r=>release=r);
  ycCaptureStreamPreviewData=async()=>{await gate;return 'data:image/webp;base64,preview'};
  voiceChannel={id:'voice-race',community_id:'community-a',name:'Race'};
  screenShareStream={getVideoTracks:()=>[]};screenShareActive=true;
  // Mirror a real active stream: starting a stream clears the login-time
  // idempotent cleanup marker before any publish can race with stop.
  ycStreamPresenceClearedUserId='';
  const publish=ycPublishStreamPresence(false,true);
  await new Promise(r=>setTimeout(r,40));
  const stop=ycStopGlobalStreamPresence('audit-user');
  release();
  await Promise.allSettled([publish,stop]);
  ycCaptureStreamPreviewData=previousCapture;
  const writes=[...window.__mockWrites];
  screenShareActive=false;screenShareStream=null;voiceChannel=null;
  return {writes,epoch:ycStreamPublishEpoch};
 }
};
`;
 return doc.replace(marker,bridge+marker);
}
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  for(const platform of ['desktop','web']){
   const page=await browser.newPage({serviceWorkers:'block'}),errors=[];page.on('pageerror',e=>errors.push(String(e.message||e)));
   await page.route('**/*',route=>{
    const u=new URL(route.request().url());if(u.hostname!=='127.0.0.1')return route.abort();
    if(u.pathname.endsWith('/supabase.js'))return route.fulfill({contentType:'text/javascript',body:fixture});
    if(u.pathname==='/')return route.fulfill({contentType:'text/html',body:html(platform)});
    const file=path.resolve(root,'.'+decodeURIComponent(u.pathname));if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||fs.statSync(file).isDirectory())return route.fulfill({status:404,body:''});return route.fulfill({path:file});
   });
   await page.goto('http://127.0.0.1/');await page.waitForFunction(()=>window.__ycClientReady,{},{timeout:20000});
   await page.waitForSelector('#app:not(.hidden)',{timeout:20000});
   await page.evaluate(()=>window.__mockWrites.splice(0));
   const result=await page.evaluate(()=>window.__ycStreamPresenceRace.run());
   const streamWrites=result.writes.filter(x=>x.startsWith('community_stream_presence:'));
   assert.equal(streamWrites.filter(x=>x==='community_stream_presence:upsert').length,0,platform+' stale preview publish escaped stop barrier: '+JSON.stringify(streamWrites));
   assert.equal(streamWrites.filter(x=>x==='community_stream_presence:delete').length,1,platform+' active stream cleanup must delete presence exactly once: '+JSON.stringify(streamWrites));
   assert.deepEqual(errors,[],platform+' runtime errors');
   await page.close();
  }
 }finally{await browser.close()}
 console.log('PASS stream presence race: delayed preview publish cannot recreate presence after stream stop on desktop or shared web/mobile client.');
})().catch(e=>{console.error(e);process.exit(1)});
