;(()=>{
'use strict';
if(window.__ycActiveServerContextV1)return;
window.__ycActiveServerContextV1=true;

let ycActiveServerGlobalContext=false;
let ycActiveServerFrame=0;
let ycActiveServerObserver=null;

const ycActiveServerVisible=el=>!!el&&!el.classList.contains('hidden')&&el.getClientRects().length>0;
function ycActiveServerModalOpen(){
  return [...document.querySelectorAll('#modalRoot .modal-back,.yc-rankxp-overlay')].some(ycActiveServerVisible);
}
function ycActiveServerCard(){
  return document.querySelector('#rail [data-community].active,.yc-v3-ribbon [data-community].active');
}
function ycSyncActiveServerContext(){
  ycActiveServerFrame=0;
  const app=document.getElementById('app');
  const workspace=app?.querySelector('.yc-v3-workspace');
  const cards=[...document.querySelectorAll('#rail [data-community],.yc-v3-ribbon [data-community]')];
  const active=ycActiveServerCard();
  const friendsHome=ycActiveServerVisible(document.getElementById('ycFriendsHome'));
  const enabled=!!app&&!!workspace&&!!active&&!friendsHome&&!ycActiveServerGlobalContext&&!ycActiveServerModalOpen();

  for(const card of cards){
    const on=enabled&&card===active;
    card.classList.toggle('yc-active-server-context-card',on);
    if(on)card.setAttribute('aria-current','page');
    else if(card.getAttribute('aria-current')==='page')card.removeAttribute('aria-current');
  }

  app?.classList.toggle('yc-active-server-context',enabled);
  workspace?.classList.toggle('yc-active-server-context',enabled);
  if(app){
    if(enabled){
      const id=String(active?.dataset?.community||'');
      app.dataset.ycActiveServerContext=id;
      workspace.dataset.ycActiveServerContext=id;
    }else{
      delete app.dataset.ycActiveServerContext;
      if(workspace)delete workspace.dataset.ycActiveServerContext;
    }
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
    // Profile/settings are modal surfaces. The live server context returns
    // automatically when the modal closes, so do not permanently change mode.
  }else{
    ycActiveServerGlobalContext=true;
  }
  setTimeout(ycScheduleActiveServerContext,0);
  setTimeout(ycScheduleActiveServerContext,180);
},true);

document.addEventListener('keydown',event=>{
  if(event.key==='Escape')setTimeout(ycScheduleActiveServerContext,0);
},true);

if(typeof ycOnLifecycle==='function'){
  ycOnLifecycle('init',()=>{ycActiveServerGlobalContext=false;ycBindActiveServerContext()});
  ycOnLifecycle('community',()=>{ycActiveServerGlobalContext=false;ycScheduleActiveServerContext()});
  ycOnLifecycle('communities',ycScheduleActiveServerContext);
  ycOnLifecycle('beforeAuth',()=>{ycActiveServerGlobalContext=false;ycScheduleActiveServerContext()});
}

window.ycSyncActiveServerContext=ycSyncActiveServerContext;
window.ycSetActiveServerGlobalContext=ycSetActiveServerGlobalContext;
if(!ycBindActiveServerContext()){
  const bootObserver=new MutationObserver(()=>{if(ycBindActiveServerContext())bootObserver.disconnect()});
  bootObserver.observe(document.documentElement,{subtree:true,childList:true});
}
})();