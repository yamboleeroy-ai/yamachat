;(()=>{
'use strict';
if(window.__ycActiveServerContextV2)return;
window.__ycActiveServerContextV2=true;

let ycActiveServerGlobalContext=false;
let ycActiveServerFrame=0;
let ycActiveServerObserver=null;
let ycActiveServerResizeObserver=null;

const NS='http://www.w3.org/2000/svg';
const ycActiveServerVisible=el=>!!el&&!el.classList.contains('hidden')&&el.getClientRects().length>0;
const ycClamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const ycRound=value=>Math.round(value*2)/2;

function ycActiveServerModalOpen(){
  return [...document.querySelectorAll('#modalRoot .modal-back,.yc-rankxp-overlay')].some(ycActiveServerVisible);
}
function ycActiveServerCard(){
  return document.querySelector('#rail [data-community].active,.yc-v3-ribbon [data-community].active');
}
function ycActiveServerContent(){
  return document.querySelector('#app .yc-v3-content-grid');
}
function ycEnsureConnectedFrame(){
  let svg=document.getElementById('ycActiveServerConnectedFrame');
  if(svg)return svg;

  svg=document.createElementNS(NS,'svg');
  svg.id='ycActiveServerConnectedFrame';
  svg.setAttribute('aria-hidden','true');
  svg.innerHTML=
    '<defs>'+
      '<linearGradient id="ycActiveServerFrameGradient" gradientUnits="userSpaceOnUse">'+
        '<stop offset="0%" stop-color="var(--yc-active-server-cyan,#35e7ff)"/>'+
        '<stop offset="42%" stop-color="var(--yc-active-server-violet,#b34dff)"/>'+
        '<stop offset="72%" stop-color="var(--yc-active-server-pink,#ee5bd7)"/>'+
        '<stop offset="100%" stop-color="var(--yc-active-server-cyan,#35e7ff)"/>'+
      '</linearGradient>'+
    '</defs>'+
    '<path class="yc-active-server-frame-glow"/>'+
    '<path class="yc-active-server-frame-core"/>';
  document.body.appendChild(svg);
  return svg;
}
function ycConnectedFramePath(cardRect,contentRect){
  const pad=3;
  const radius=14;

  const left=ycRound(contentRect.left-pad);
  const top=ycRound(contentRect.top-pad);
  const right=ycRound(contentRect.right+pad);
  const bottom=ycRound(contentRect.bottom+pad);

  // Clamp the visual tab into the content frame. In the normal Yamachat ribbon
  // the whole card overlaps the horizontal range of the content area.
  let cardLeft=ycRound(ycClamp(cardRect.left-2,left+8,right-96));
  let cardRight=ycRound(ycClamp(cardRect.right+2,cardLeft+88,right-8));
  const cardTop=ycRound(cardRect.top-2);
  const cardBottom=ycRound(Math.min(cardRect.bottom+2,top-5));

  const cardRadius=13;

  // Clean tab connection: go straight up from the content frame to the exact
  // lower corners of the active server card. No horizontal hooks/tails.
  return [
    'M',ycRound(left+radius),top,
    'L',cardLeft,top,
    'L',cardLeft,cardBottom,
    'L',cardLeft,ycRound(cardTop+cardRadius),
    'Q',cardLeft,cardTop,ycRound(cardLeft+cardRadius),cardTop,
    'L',ycRound(cardRight-cardRadius),cardTop,
    'Q',cardRight,cardTop,cardRight,ycRound(cardTop+cardRadius),
    'L',cardRight,cardBottom,
    'L',cardRight,top,
    'L',ycRound(right-radius),top,
    'Q',right,top,right,ycRound(top+radius),
    'L',right,ycRound(bottom-radius),
    'Q',right,bottom,ycRound(right-radius),bottom,
    'L',ycRound(left+radius),bottom,
    'Q',left,bottom,left,ycRound(bottom-radius),
    'L',left,ycRound(top+radius),
    'Q',left,top,ycRound(left+radius),top,
    'Z'
  ].join(' ');
}
function ycHideConnectedFrame(){
  const svg=document.getElementById('ycActiveServerConnectedFrame');
  svg?.classList.remove('show');
  if(svg){
    svg.querySelector('.yc-active-server-frame-glow')?.removeAttribute('d');
    svg.querySelector('.yc-active-server-frame-core')?.removeAttribute('d');
  }
}
function ycDrawConnectedFrame(active,content){
  const cardRect=active.getBoundingClientRect();
  const contentRect=content.getBoundingClientRect();
  if(cardRect.width<40||cardRect.height<30||contentRect.width<120||contentRect.height<120){
    ycHideConnectedFrame();return;
  }

  const svg=ycEnsureConnectedFrame();
  svg.setAttribute('viewBox','0 0 '+window.innerWidth+' '+window.innerHeight);
  const gradient=svg.querySelector('#ycActiveServerFrameGradient');
  gradient?.setAttribute('x1',String(contentRect.left));
  gradient?.setAttribute('x2',String(contentRect.right));
  gradient?.setAttribute('y1',String(cardRect.top));
  gradient?.setAttribute('y2',String(contentRect.bottom));

  const d=ycConnectedFramePath(cardRect,contentRect);
  svg.querySelector('.yc-active-server-frame-glow')?.setAttribute('d',d);
  svg.querySelector('.yc-active-server-frame-core')?.setAttribute('d',d);
  svg.dataset.community=String(active.dataset.community||'');
  svg.dataset.frameMode='connected-tab';
  svg.classList.add('show');
}
function ycSyncActiveServerContext(){
  ycActiveServerFrame=0;
  const app=document.getElementById('app');
  const content=ycActiveServerContent();
  const cards=[...document.querySelectorAll('#rail [data-community],.yc-v3-ribbon [data-community]')];
  const active=ycActiveServerCard();
  const friendsHome=ycActiveServerVisible(document.getElementById('ycFriendsHome'));
  const drawerOpen=!!app?.classList.contains('yc-mobile-drawer-open')||
    [...document.querySelectorAll('.yc-mobile-open,.mobile-open')].some(ycActiveServerVisible);
  const enabled=!!app&&!!content&&!!active&&!friendsHome&&!drawerOpen&&!ycActiveServerGlobalContext&&!ycActiveServerModalOpen();

  for(const card of cards){
    const on=enabled&&card===active;
    card.classList.toggle('yc-active-server-context-card',on);
    if(on)card.setAttribute('aria-current','page');
    else if(card.getAttribute('aria-current')==='page')card.removeAttribute('aria-current');
  }

  app?.classList.toggle('yc-active-server-context',enabled);
  content?.classList.toggle('yc-active-server-context',enabled);
  if(app){
    if(enabled){
      const id=String(active?.dataset?.community||'');
      app.dataset.ycActiveServerContext=id;
      content.dataset.ycActiveServerContext=id;
      ycDrawConnectedFrame(active,content);
    }else{
      delete app.dataset.ycActiveServerContext;
      if(content)delete content.dataset.ycActiveServerContext;
      ycHideConnectedFrame();
    }
  }else ycHideConnectedFrame();

  if(ycActiveServerResizeObserver){
    ycActiveServerResizeObserver.disconnect();
    if(enabled){ycActiveServerResizeObserver.observe(active);ycActiveServerResizeObserver.observe(content)}
  }
  return enabled;
}
function ycScheduleActiveServerContext(){
  if(ycActiveServerFrame)return;
  ycActiveServerFrame=requestAnimationFrame(ycSyncActiveServerContext);
}
function ycSetActiveServerGlobalContext(value){
  ycActiveServerGlobalContext=!!value;
  ycScheduleActiveServerContext();
}
function ycBindActiveServerContext(){
  const app=document.getElementById('app');
  if(!app)return false;
  if(!ycActiveServerObserver){
    ycActiveServerObserver=new MutationObserver(ycScheduleActiveServerContext);
    ycActiveServerObserver.observe(app,{subtree:true,childList:true,attributes:true,attributeFilter:['class','data-community']});
  }
  if(!ycActiveServerResizeObserver&&window.ResizeObserver){
    ycActiveServerResizeObserver=new ResizeObserver(ycScheduleActiveServerContext);
  }
  ycScheduleActiveServerContext();
  return true;
}

document.addEventListener('click',event=>{
  const target=event.target?.closest?.(
    '#rail [data-community],.yc-v3-ribbon [data-community],[data-channel],.voice-channel[data-voice],'+
    '#ycV3Home,#ycV3Friends,#ycV3Search,#ycV3Servers,#ycFriendsRailBtn,[data-thread],#profileBtn,#appSettingsBtn'
  );
  if(!target)return;

  if(target.matches('#rail [data-community],.yc-v3-ribbon [data-community],[data-channel],.voice-channel[data-voice]')){
    ycActiveServerGlobalContext=false;
  }else if(target.matches('#profileBtn,#appSettingsBtn')){
    // These are modal surfaces; the connected frame returns when they close.
  }else{
    ycActiveServerGlobalContext=true;
  }
  setTimeout(ycScheduleActiveServerContext,0);
  setTimeout(ycScheduleActiveServerContext,180);
},true);

document.addEventListener('keydown',event=>{
  if(event.key==='Escape')setTimeout(ycScheduleActiveServerContext,0);
},true);
document.addEventListener('scroll',ycScheduleActiveServerContext,true);
window.addEventListener('resize',ycScheduleActiveServerContext,{passive:true});
window.visualViewport?.addEventListener('resize',ycScheduleActiveServerContext,{passive:true});
window.visualViewport?.addEventListener('scroll',ycScheduleActiveServerContext,{passive:true});

if(typeof ycOnLifecycle==='function'){
  ycOnLifecycle('init',()=>{ycActiveServerGlobalContext=false;ycBindActiveServerContext()});
  ycOnLifecycle('community',ycScheduleActiveServerContext);
  ycOnLifecycle('communities',ycScheduleActiveServerContext);
  ycOnLifecycle('beforeAuth',()=>{ycActiveServerGlobalContext=false;ycHideConnectedFrame();ycScheduleActiveServerContext()});
}

window.ycSyncActiveServerContext=ycSyncActiveServerContext;
window.ycSetActiveServerGlobalContext=ycSetActiveServerGlobalContext;
if(!ycBindActiveServerContext()){
  const bootObserver=new MutationObserver(()=>{if(ycBindActiveServerContext())bootObserver.disconnect()});
  bootObserver.observe(document.documentElement,{subtree:true,childList:true});
}
})();