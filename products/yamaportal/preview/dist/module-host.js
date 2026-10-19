(()=>{
  'use strict';let panel=null,frame=null;
  async function show(){
    if(!panel){panel=document.createElement('section');panel.className='module-panel panel';panel.innerHTML='<div class="module-toolbar"><strong>Yamachat · testovací integrace</strong><div class="module-actions"><button class="secondary" id="module-expand" aria-pressed="false">Na celou plochu</button><button class="secondary" id="module-fullscreen">Celá obrazovka</button><a href="#aplikace" class="secondary">Zpět do Portalu</a></div></div><p class="caption" id="module-status" role="status">Připravuji společné přihlášení…</p>';document.querySelector('.workspace').append(panel);panel.querySelector('#module-expand').onclick=()=>expand(!panel.classList.contains('module-expanded'));const fullscreen=panel.querySelector('#module-fullscreen');fullscreen.hidden=!document.fullscreenEnabled||typeof panel.requestFullscreen!=='function';fullscreen.onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else{expand(true);await panel.requestFullscreen();}}catch{expand(true);}};}
    panel.hidden=false;document.body.classList.add('module-active');
    if(frame)return;
    await YamaAccountUI.init();
    if(frame||location.hash!=='#yamachat')return;
    if(!YamaAccountUI.isSignedIn()){
      panel.querySelector('#module-status').textContent='Yamachat vyžaduje přihlášení a připojení k internetu. Přihlas se ke svému účtu Yamaportal; místní funkce ostatních aplikací tím nejsou omezené.';
      let login=panel.querySelector('#module-login');if(!login){login=document.createElement('a');login.id='module-login';login.className='secondary';login.href='#profil';login.textContent='Přihlásit se do Yamachatu';panel.append(login);}return;
    }
    panel.querySelector('#module-login')?.remove();
    try{YamaPortalIntegration.sharedClient(location.origin);}catch{panel.querySelector('#module-status').textContent='Online účet není dostupný. Vrať se do Portalu; místní aplikace můžeš spustit i bez přihlášení.';return;}
    frame=document.createElement('iframe');frame.title='Yamachat';frame.src='./modules/yamachat/index.html';frame.allow='microphone; camera; display-capture; fullscreen; autoplay';frame.setAttribute('allowfullscreen','');
    frame.addEventListener('load',()=>{const status=panel.querySelector('#module-status');status.textContent='Při návratu do Portalu zůstává Yamachat načtený. Hovory a streamování v této integraci ještě ověřujeme.';});
    panel.append(frame);
  }
  function expand(value){if(!panel)return;panel.classList.toggle('module-expanded',value);document.body.classList.toggle('module-expanded-page',value);const button=panel.querySelector('#module-expand');button.textContent=value?'Zmenšit do Portalu':'Na celou plochu';button.setAttribute('aria-pressed',String(value));}
  function hide(){expand(false);if(panel)panel.hidden=true;if(panel&&document.fullscreenElement===panel&&typeof document.exitFullscreen==='function')void document.exitFullscreen().catch(()=>{});document.body.classList.remove('module-active');}
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!document.fullscreenElement)expand(false);});
  async function prepareLogout(){if(frame?.contentWindow?.YamaChatPortalAdapter)await frame.contentWindow.YamaChatPortalAdapter.prepareLogout();}
  window.YamaModuleHost={show,hide,expand,prepareLogout};
})();
