const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const read=p=>fs.readFileSync(p,'utf8').replaceAll('\r\n','\n');
function section(s,start,end){const a=s.indexOf(start),b=s.indexOf(end,a);assert(a>=0&&b>a,start);return s.slice(a,b)}
(async()=>{
 // Execute the actual updater with a fake clock/network/updater, including concurrency.
 let now=1_000_000,online=true,calls=0,visible=true,release;
 const context={module:{exports:{}},require:p=>p==='electron'?{net:{isOnline:()=>online}}:require(p),process,console,Date:class extends Date{static now(){return now}},setTimeout,clearTimeout,setInterval,clearInterval,__dirname:require('path').resolve('desktop')};
 vm.runInNewContext(read('desktop/updater.js'),context);
 const updater=new context.module.exports.YamachatUpdater({app:{getPath:()=>'.',getVersion:()=> '1.0.99'},getWindow:()=>({isDestroyed:()=>false,isVisible:()=>visible,isMinimized:()=>false})});
 updater.ready=true;updater.autoUpdater={checkForUpdates:()=>{calls++;return new Promise(r=>release=r)}};
 const first=updater.check(false);await Promise.resolve();await updater.check(false);assert.equal(calls,1);release();await first;
 await updater.check(false);assert.equal(calls,1);
 now+=20*60*1000;online=false;await updater.check(false);assert.equal(calls,1);
 online=true;visible=false;await updater.check(false);assert.equal(calls,1);
 visible=true;const resumed=updater.check(false);await Promise.resolve();assert.equal(calls,2);release();await resumed;
 updater.state.status='downloading';now+=20*60*1000;await updater.check(false);assert.equal(calls,2);
 console.log('PASS updater: 20-minute throttle, offline/hidden skip, resume, concurrency/download guard');

 // Real selection objects must differ, with Czech and unavailable-gender fallbacks.
 const client=read('desktop/desktop-client.html'),prefs=new Map();
 const tts={localStorage:{getItem:k=>prefs.get(k)},YC_VOICE_ANNOUNCE_VOICE_KEY:'legacy',YC_VOICE_GENDER_KEY:'gender'};
 vm.createContext(tts);vm.runInContext(section(client,'function ycVoiceGenderHint','function ycVoiceOptionLabel'),tts);
 const female={name:'Microsoft Vlasta',lang:'cs-CZ',voiceURI:'f'},male={name:'Microsoft Jakub',lang:'cs-CZ',voiceURI:'m'},foreign={name:'David',lang:'en-US'};
 prefs.set('gender','female');assert.equal(tts.ycVoiceSelectedVoice([male,female]),female);
 prefs.set('gender','male');assert.equal(tts.ycVoiceSelectedVoice([female,male]),male);
 assert.equal(tts.ycVoiceSelectedVoice([female,foreign]),foreign);
 assert.equal(tts.ycVoiceSelectedVoice([female]),female);assert.equal(tts.ycVoiceSelectedVoice([]),null);
 prefs.set('gender','auto');prefs.set('legacy','m');assert.equal(tts.ycVoiceSelectedVoice([female,male]),male);
 console.log('PASS TTS: different actual voice objects, Czech preference, missing voice, empty list, legacy Auto');

 // Pipe reads can split any byte, including a stereo frame. Run the production decoder.
 const shell=read('desktop/desktop.html'),pcmOut=[];
 const pcm={Uint8Array,Int16Array,Number,Math,ycProcessAudioGeneration:5,ycProcessAudioRemainder:new Uint8Array(),ycProcessAudioNextTime:0,ycProcessAudioSources:new Set(),ycProcessAudioDestination:{},ycProcessAudioBytes:v=>v,ycProcessAudioContext:{currentTime:0,createBuffer:(_c,n)=>{const data=[new Float32Array(n),new Float32Array(n)];pcmOut.push(data);return{getChannelData:c=>data[c]}},createBufferSource:()=>({connect(){},start(){}})}};
 vm.createContext(pcm);vm.runInContext(section(shell,'    function ycScheduleProcessAudioChunk','    window.yamachatDesktop?.onProcessAudioChunk'),pcm);
 const input=new Uint8Array(new Int16Array([8192,-8192,16384,-16384]).buffer);
 for(const bytes of [input.slice(0,1),input.slice(1,5),input.slice(5)])pcm.ycScheduleProcessAudioChunk({generation:5,pcm:bytes});
 assert.deepEqual(pcmOut.map(x=>Array.from(x[0])),[[.25],[.5]]);assert.equal(pcm.ycProcessAudioRemainder.length,0);
 console.log('PASS process PCM: arbitrary pipe fragmentation retains every stereo sample');

 const browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
 try{
  const page=await browser.newPage({viewport:{width:1100,height:720}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>r.fulfill({contentType:'text/html',body:'<html><head></head><body></body></html>'}));
  await page.goto('http://127.0.0.1');
  await page.addStyleTag({content:read('web/stream-viewer.css')});
  await page.evaluate(()=>{
   window.screenWatchingByUser=new Set(['viewer']);window.remoteScreenStreams=new Map();window.screenWatchPendingByUser=new Set();window.screenWatchTimers=new Map();window.screenShareActive=false;window.screenShareStream=null;
   window.screenShareName=()=> 'Testovací stream';window.ycScreenAudioStoredVolume=()=>.7;window.ycOnLifecycle=()=>{};window.toast=()=>{};
   window.__ycScreenAudioEls=new Map([['viewer',{volume:.7,paused:false,muted:false,play:()=>Promise.resolve()}]]);
   window.ycStopWatchingScreenShare=()=>{};
   window.YamachatDesktopStreamFullscreen={set:async active=>({fullscreen:active})};
  });
  await page.addScriptTag({content:read('web/stream-viewer.js').replace('const YC_STREAM_DESKTOP=false;','const YC_STREAM_DESKTOP=true;')+'\nycStreamViewer.sync();'});
  const before=await page.locator('.yc-stream-viewer').boundingBox();
  await page.locator('[data-action="fullscreen"]').click();
  assert.equal(await page.locator('.yc-stream-viewer').getAttribute('data-mode'),'fullscreen');
  assert(await page.locator('.yc-sv-footer input').isVisible());
  await page.locator('.yc-sv-footer input').fill('32');
  assert.equal(await page.evaluate(()=>window.__ycScreenAudioEls.get('viewer').volume),.32);
  await page.keyboard.press('Escape');assert.deepEqual(await page.locator('.yc-stream-viewer').boundingBox(),before);
  assert(read('desktop/main.js').includes('mainWindow.setFullScreen(target)'));
  assert(read('desktop/preload.js').includes('setStreamFullscreen: (active)'));
  assert(!read('desktop/main.js').includes("audio: 'loopback'"));
  await page.screenshot({path:'tests/stream-preview.png'});
  assert.deepEqual(errors,[]);
  console.log('PASS viewer: first click requests true desktop fullscreen, volume changes receiver, Escape restores layout, no system-loopback fallback');
  await page.goto('http://127.0.0.1');
  await page.setViewportSize({width:390,height:844});
  await page.addStyleTag({content:read('web/stream-viewer.css')});
  await page.evaluate(()=>{
   Object.defineProperty(navigator,'userAgent',{value:'iPhone'});Object.defineProperty(navigator,'standalone',{value:true});
   Element.prototype.requestFullscreen=()=>Promise.reject(new Error('WebKit fullscreen unavailable'));
   window.screenWatchingByUser=new Set(['viewer']);window.remoteScreenStreams=new Map();window.screenWatchPendingByUser=new Set();window.screenWatchTimers=new Map();window.screenShareActive=false;window.screenShareStream=null;
   window.screenShareName=()=> 'Stream';window.ycScreenAudioStoredVolume=()=>.7;window.ycOnLifecycle=()=>{};window.toast=()=>{};window.ycStopWatchingScreenShare=()=>{};
   window.__ycScreenAudioEls=new Map([['viewer',{volume:.7,paused:false,muted:false,play:()=>Promise.resolve()}]]);
  });
  await page.addScriptTag({content:read('web/stream-viewer.js')+'\nycStreamViewer.sync();'});
  await page.evaluate(()=>window.originalVideo=document.querySelector('.yc-stream-viewer video'));
  await page.locator('[data-action="fullscreen"]').click();
  assert.equal(await page.locator('.yc-stream-viewer').getAttribute('data-mode'),'fullscreen');
  assert(await page.locator('.yc-sv-footer input').isVisible());
  assert.equal(Math.round((await page.locator('.yc-stream-viewer').boundingBox()).width),390);
  await page.locator('[data-action="fullscreen"]').click();
  assert.equal(await page.locator('.yc-stream-viewer').getAttribute('data-mode'),'floating');
  assert(await page.evaluate(()=>window.originalVideo===document.querySelector('.yc-stream-viewer video')));
  console.log('PASS simulated iOS PWA: denied element fullscreen falls back to full viewport with volume, return and same video element');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
