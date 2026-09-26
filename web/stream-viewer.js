// One app-owned layer and stable video element per viewing session. Navigation
// never mounts/unmounts this layer and never owns its MediaStream or RTC peer.
const YC_STREAM_DESKTOP=false;
const ycStreamViewer=(()=>{
  const sessions=new Map();
  let layer=null,safe=null,layoutFrame=0,recovering=false,localDismissed=null;
  const mobile=()=>!YC_STREAM_DESKTOP&&matchMedia('(pointer: coarse)').matches;
  const iosPwa=()=>!YC_STREAM_DESKTOP&&(/iP(?:hone|ad|od)/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1))&&(navigator.standalone===true||matchMedia('(display-mode: standalone)').matches);
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  function ensureLayer(){
    if(layer)return;
    layer=document.createElement('div');layer.id='ycStreamLayer';
    safe=document.createElement('div');safe.className='yc-sv-safe-area';layer.append(safe);
    document.body.append(layer);
  }
  function viewport(){
    const v=window.visualViewport,style=getComputedStyle(safe);
    const left=(v?.offsetLeft||0)+(parseFloat(style.paddingLeft)||0)+8;
    const top=(v?.offsetTop||0)+(parseFloat(style.paddingTop)||0)+8;
    const right=(v?.offsetLeft||0)+(v?.width||innerWidth)-(parseFloat(style.paddingRight)||0)-8;
    const bottom=(v?.offsetTop||0)+(v?.height||innerHeight)-(parseFloat(style.paddingBottom)||0)-8;
    return {left,top,right,bottom,width:Math.max(1,right-left),height:Math.max(1,bottom-top)};
  }
  function obstacles(session){
    const list=[];
    for(const node of document.querySelectorAll('.composer-wrap,.voice-controls,#ycMobileVoiceDock,#ycGlobalNav,#rail,#ycMobileHeader,#mobileMenu,#ycMobileNavBtn')){
      const r=node.getBoundingClientRect();
      if(r.width&&r.height&&getComputedStyle(node).visibility!=='hidden')list.push(r);
    }
    for(const other of sessions.values())if(other!==session&&other.mode==='mini')list.push(other.panel.getBoundingClientRect());
    return list;
  }
  function miniRect(session,area){
    const avoid=obstacles(session),target=session.miniPosition||{x:area.right,y:area.top+64};
    let best=null;
    for(const width of [Math.min(280,area.width*.65),Math.min(220,area.width*.6),Math.min(160,area.width)]){
      const height=Math.min(40+width*9/16,area.height);
      const xs=[area.left,area.right-width,clamp(target.x,area.left,area.right-width)];
      const ys=[area.top,area.bottom-height,clamp(target.y,area.top,area.bottom-height)];
      for(const r of avoid){xs.push(r.right+8,r.left-width-8);ys.push(r.bottom+8,r.top-height-8)}
      for(const x0 of xs)for(const y0 of ys){
        const x=clamp(x0,area.left,area.right-width),y=clamp(y0,area.top,area.bottom-height);
        const overlap=avoid.reduce((sum,r)=>sum+Math.max(0,Math.min(x+width,r.right+6)-Math.max(x,r.left-6))*Math.max(0,Math.min(y+height,r.bottom+6)-Math.max(y,r.top-6)),0);
        const score=overlap*1e6+Math.hypot(x-target.x,y-target.y)+(280-width)*3;
        if(!best||score<best.score)best={x,y,width,height,score};
      }
      if(best?.score<1e6)break;
    }
    return best;
  }
  function layout(session){
    if(document.fullscreenElement===session.panel)return;
    const a=viewport(),isMobile=mobile();
    session.panel.dataset.mobile=String(isMobile);session.panel.dataset.mode=session.mode;
    let r;
    if(session.mode==='mini')r=miniRect(session,a);
    else if(session.mode==='maximized'||isMobile)r={x:a.left,y:a.top,width:a.width,height:a.height};
    else{
      const original=session.rect||{x:a.right-Math.min(760,a.width),y:a.top+48,width:Math.min(760,a.width),height:Math.min(510,a.height)};
      const width=clamp(original.width,Math.min(300,a.width),a.width),height=clamp(original.height,Math.min(210,a.height),a.height);
      r={x:clamp(original.x,a.left,a.right-width),y:clamp(original.y,a.top,a.bottom-height),width,height};
    }
    Object.assign(session.panel.style,{left:r.x+'px',top:r.y+'px',width:r.width+'px',height:r.height+'px'});
    session.minimize.textContent=session.mode==='mini'?'↗':'−';
    session.minimize.title=session.mode==='mini'?'Obnovit stream':'Minimalizovat stream';
    session.minimize.setAttribute('aria-label',session.minimize.title);
    session.maximize.title=session.mode==='maximized'?'Obnovit velikost':'Maximalizovat stream';
    session.maximize.setAttribute('aria-label',session.maximize.title);
  }
  function scheduleLayout(){
    if(layoutFrame||!sessions.size)return;
    layoutFrame=requestAnimationFrame(()=>{layoutFrame=0;for(const session of sessions.values())layout(session)});
  }
  function resumeIosPwaPlaybackAfterLayout(session,video,stream){
    if(!iosPwa()||!stream)return;
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      if(sessions.get(session.id)!==session||session.video!==video||video.srcObject!==stream)return;
      video.setAttribute('playsinline','');video.setAttribute('webkit-playsinline','');
      void video.play().then(()=>{
        if(sessions.get(session.id)!==session||session.video!==video||video.srcObject!==stream)return;
        session.blocked=false;update(session);
      }).catch(error=>{
        if(error?.name!=='AbortError'&&sessions.get(session.id)===session&&session.video===video&&video.srcObject===stream){session.blocked=true;update(session)}
      });
    }));
  }
  function setMode(session,mode){
    const previous=session.mode,video=session.video,stream=video.srcObject;
    if(document.fullscreenElement===session.panel)void document.exitFullscreen().catch(()=>{});
    session.mode=mode;layout(session);
    if((mode==='mini'||previous==='mini')&&iosPwa())resumeIosPwaPlaybackAfterLayout(session,video,stream);
  }
  function bindMove(session,handle,resize=false){
    let drag=null;
    handle.addEventListener('pointerdown',event=>{
      if(event.button!==0||(!resize&&event.target.closest('button,input')))return;
      if(session.mode==='maximized'||(mobile()&&session.mode!=='mini'))return;
      const r=session.panel.getBoundingClientRect();
      drag={x:event.clientX,y:event.clientY,left:r.left,top:r.top,width:r.width,height:r.height};
      handle.setPointerCapture(event.pointerId);event.preventDefault();
    });
    handle.addEventListener('pointermove',event=>{
      if(!drag)return;
      const dx=event.clientX-drag.x,dy=event.clientY-drag.y;
      if(session.mode==='mini')session.miniPosition={x:drag.left+dx,y:drag.top+dy};
      else session.rect={x:drag.left+(resize?0:dx),y:drag.top+(resize?0:dy),width:drag.width+(resize?dx:0),height:drag.height+(resize?dy:0)};
      layout(session);
    });
    for(const name of ['pointerup','pointercancel','lostpointercapture'])handle.addEventListener(name,()=>{drag=null});
    handle.addEventListener('keydown',event=>{
      if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;
      if(session.mode!=='floating'||mobile())return;
      event.preventDefault();const r=session.panel.getBoundingClientRect(),dx=event.key==='ArrowLeft'?-20:event.key==='ArrowRight'?20:0,dy=event.key==='ArrowUp'?-20:event.key==='ArrowDown'?20:0;
      session.rect={x:r.x+(resize?0:dx),y:r.y+(resize?0:dy),width:r.width+(resize?dx:0),height:r.height+(resize?dy:0)};layout(session);
    });
  }
  async function fullscreen(session){
    if(document.fullscreenElement){await document.exitFullscreen().catch(()=>{});return}
    try{
      if(session.panel.requestFullscreen){await session.panel.requestFullscreen();return}
      if(session.video.webkitEnterFullscreen){session.video.webkitEnterFullscreen();return}
    }catch{}
    setMode(session,'maximized');
    toast('Systémový fullscreen není dostupný. Stream je zvětšený v aplikaci.');
  }
  function remove(session){
    session.abort.abort();session.trackAbort?.abort();session.video.pause();session.video.srcObject=null;session.panel.remove();sessions.delete(session.id);
    // Receiver tracks belong to RTC, so closing a viewer must never stop them.
    if(!sessions.size){layer?.remove();layer=null;safe=null}
  }
  function close(session){
    if(session.local){localDismissed=screenShareStream;remove(session);return}
    remove(session);void ycStopWatchingScreenShare(session.id);
  }
  function create(id,local){
    ensureLayer();
    const panel=document.createElement('section');panel.className='yc-stream-viewer';panel.dataset.peer=id;panel.setAttribute('role','region');
    panel.innerHTML='<header class="yc-sv-header" tabindex="0" aria-label="Přesunout stream šipkami nebo tažením"><span class="yc-sv-avatar" aria-hidden="true"></span><strong class="yc-sv-title"></strong><button type="button" data-action="maximize" aria-label="Maximalizovat stream" title="Maximalizovat stream">□</button><button type="button" data-action="fullscreen" aria-label="Celá obrazovka" title="Celá obrazovka">⛶</button><button type="button" data-action="minimize" aria-label="Minimalizovat stream" title="Minimalizovat stream">−</button><button type="button" data-action="close" aria-label="Zavřít sledování" title="Zavřít sledování">×</button></header><div class="yc-sv-media"><video autoplay playsinline muted></video><div class="yc-sv-status" role="status"><span></span><button type="button" hidden>Přehrát</button></div></div><footer class="yc-sv-footer"><label>Zvuk <input type="range" min="0" max="100" step="1" aria-label="Hlasitost streamu"></label><span class="yc-sv-quality"></span></footer><button type="button" class="yc-sv-resize" aria-label="Změnit velikost streamu šipkami nebo tažením" title="Změnit velikost">◢</button>';
    const session={id,local,panel,mode:'floating',rect:null,stream:null,abort:new AbortController(),name:local?'Tvůj stream':screenShareName(id),blocked:false};
    session.video=panel.querySelector('video');session.video.muted=true;
    session.status=panel.querySelector('.yc-sv-status');session.statusText=session.status.querySelector('span');
    session.playButton=session.status.querySelector('button');
    session.minimize=panel.querySelector('[data-action="minimize"]');session.maximize=panel.querySelector('[data-action="maximize"]');
    panel.querySelector('.yc-sv-title').textContent=session.name;panel.setAttribute('aria-label','Stream: '+session.name);
    panel.querySelector('.yc-sv-avatar').textContent=session.name.slice(0,1).toUpperCase();
    session.minimize.onclick=()=>setMode(session,session.mode==='mini'?'floating':'mini');
    session.maximize.onclick=()=>setMode(session,session.mode==='maximized'?'floating':'maximized');
    panel.querySelector('[data-action="fullscreen"]').onclick=()=>void fullscreen(session);
    panel.querySelector('[data-action="close"]').onclick=()=>close(session);
    panel.querySelector('.yc-sv-media').onclick=event=>{if(session.mode==='mini'&&!event.target.closest('button'))setMode(session,'floating')};
    session.playButton.onclick=()=>{
      session.blocked=false;void play(session);
      const audio=window.__ycScreenAudioEls?.get(id);if(audio)void audio.play().catch(()=>{session.blocked=true;update(session)});
    };
    const volume=panel.querySelector('input');volume.value=String(Math.round(ycScreenAudioStoredVolume(id)*100));volume.closest('label').hidden=local;
    volume.oninput=()=>{
      const v=Number(volume.value)/100;
      try{const map=JSON.parse(localStorage.getItem('yc_stream_volume_by_user_safe_v1')||'{}');map[id]=v;localStorage.setItem('yc_stream_volume_by_user_safe_v1',JSON.stringify(map))}catch{}
      const audio=window.__ycScreenAudioEls?.get(id);if(audio){audio.volume=v;audio.muted=v===0;if(v)void audio.play().catch(()=>{session.blocked=true;update(session)})}
    };
    bindMove(session,panel.querySelector('header'));bindMove(session,panel.querySelector('.yc-sv-resize'),true);
    for(const event of ['loadedmetadata','playing','waiting','stalled'])session.video.addEventListener(event,()=>update(session),{signal:session.abort.signal});
    sessions.set(id,session);layer.append(panel);layout(session);return session;
  }
  async function play(session){
    try{await session.video.play();session.blocked=false}catch(error){if(error.name!=='AbortError')session.blocked=true}
    if(sessions.get(session.id)===session)update(session);
  }
  function update(session){
    const track=session.stream?.getVideoTracks?.()[0];
    const audio=window.__ycScreenAudioEls?.get(session.id);
    const now=performance.now(),time=session.video.currentTime;
    if(time!==session.lastTime||document.hidden){session.lastTime=time;session.lastProgress=now;session.stallRetry=false}
    session.lastProgress??=now;
    const stalled=!!track&&now-session.lastProgress>8000;
    if(stalled&&!session.local&&screenWatchingByUser.has(session.id)&&!recovering&&navigator.onLine){
      if(!session.stallRetry){session.stallRetry=true;void ycSendScreenWatchOrdered(session.id,true,{retry:true}).catch(()=>{})}
      if(now-session.lastProgress>18000){void ycStopWatchingScreenShare(session.id);return}
    }
    const pending=recovering||!navigator.onLine||!track||track.readyState!=='live'||track.muted||stalled||(!session.local&&screenWatchPendingByUser.has(session.id));
    const blocked=session.blocked||!!(audio?.paused&&!audio?.muted);
    const state=pending?'connecting':blocked?'blocked':'playing';session.panel.dataset.state=state;
    session.status.hidden=state==='playing';session.statusText.textContent=!navigator.onLine?'Připojení přerušeno…':blocked?'Klepnutím pokračuj v přehrávání.':'Připojuji stream…';
    session.playButton.hidden=!blocked||pending;
    const settings=track?.getSettings?.()||{};
    session.panel.querySelector('.yc-sv-quality').textContent=settings.height?settings.height+'p'+(settings.frameRate?' · '+Math.round(settings.frameRate)+' fps':''):'Živý stream';
  }
  function bindStream(session,stream){
    if(!stream||session.stream===stream)return;
    const before=session.stream?.getVideoTracks?.()||[],after=stream.getVideoTracks();
    if(before.length&&before.length===after.length&&before.every((track,i)=>track===after[i]))return;
    session.trackAbort?.abort();session.trackAbort=new AbortController();
    session.stream=stream;session.lastProgress=performance.now();session.video.srcObject=stream;
    for(const track of stream.getVideoTracks())for(const event of ['mute','unmute','ended'])track.addEventListener(event,()=>update(session),{signal:session.trackAbort.signal});
    void play(session);
  }
  function sync(){
    const wanted=new Set(screenWatchingByUser);
    if(screenShareActive&&screenShareStream&&localDismissed!==screenShareStream)wanted.add('local');
    for(const [id,session] of sessions){
      if(!wanted.has(id)&&!recovering){remove(session);if(!session.local)toast('Sledování streamu bylo ukončeno.');}
    }
    for(const id of wanted){
      const session=sessions.get(id)||create(id,id==='local');
      bindStream(session,id==='local'?screenShareStream:remoteScreenStreams.get(id));update(session);
    }
  }
  async function resume(){
    if(document.hidden)return;
    for(const session of sessions.values()){
      if(!session.local&&screenWatchingByUser.has(session.id)){
        ycAttachExistingScreenReceiver(session.id);
        if(!ycRemoteScreenReady(session.id)&&!screenWatchTimers.has(session.id)){screenWatchPendingByUser.add(session.id);ycArmScreenWatch(session.id)}
      }
      if(session.video.srcObject)void play(session);
    }
    scheduleLayout();sync();
  }
  // iOS's existing voice recovery leaves and rejoins the same room. Keep only
  // those viewing intents in memory during that bounded operation; never revive
  // a session the user closed, or a session after logout / a different voice room.
  function beginRecovery(){recovering=true;return [...sessions.values()].filter(s=>!s.local).map(s=>s.id)}
  async function endRecovery(ids,ok){
    recovering=false;
    for(const id of ids){if(!sessions.has(id))continue;if(ok){voiceScreenActiveByUser.add(id);await ycWatchScreenShare(id)}else remove(sessions.get(id))}
    sync();
  }
  for(const event of ['resize','orientationchange','pageshow'])window.addEventListener(event,scheduleLayout);
  window.visualViewport?.addEventListener('resize',scheduleLayout);window.visualViewport?.addEventListener('scroll',scheduleLayout);
  window.addEventListener('online',()=>void resume());window.addEventListener('offline',()=>{for(const s of sessions.values())update(s)});
  document.addEventListener('visibilitychange',()=>void resume());
  document.addEventListener('fullscreenchange',scheduleLayout);
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!document.fullscreenElement)for(const s of sessions.values())if(s.mode==='maximized')setMode(s,'floating')});
  // Only layout is sampled; no DOM reconstruction and no RTC mutations.
  setInterval(()=>{if(!sessions.size||document.hidden)return;scheduleLayout();for(const s of sessions.values())update(s)},500);
  ycOnLifecycle('beforeAuth',()=>{recovering=false;for(const s of [...sessions.values()]){if(!s.local)void ycStopWatchingScreenShare(s.id);remove(s)}});
  return {sync,beginRecovery,endRecovery};
})();
