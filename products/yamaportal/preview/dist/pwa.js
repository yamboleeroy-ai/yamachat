(function(){
  'use strict';
  let prompt=null,offlineStatus='Offline rozcestník se připravuje při prvním otevření s internetem.';
  function reportOffline(text){offlineStatus=text;const status=document.querySelector('#offline-status');if(status)status.textContent=text;}
  const installed=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
  const explanation=()=>installed()?'Yamaportal je otevřený v samostatném webovém okně.':/iPhone|iPad|iPod/.test(navigator.userAgent)?'V Safari otevři Sdílet → Přidat na plochu.':'V nabídce prohlížeče zvol Nainstalovat aplikaci nebo Přidat na plochu.';
  window.YamaPortalPWA={markup:()=>`<div class="row"><h3>Yamaportal v mobilu a na ploše</h3><p>${explanation()}</p><button class="secondary" id="portal-install">${installed()?'Zobrazit informace o instalaci':'Nainstalovat webové rozhraní'}</button><p class="caption" id="install-status" role="status">Webové rozhraní neinstaluje Windows aplikace do telefonu.</p><p class="caption" id="offline-status" role="status">${offlineStatus}</p></div>`};
  window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();prompt=event;});
  document.addEventListener('click',async event=>{if(!event.target.closest('#portal-install'))return;const status=document.querySelector('#install-status');if(prompt){try{const current=prompt;prompt=null;await current.prompt();const result=await current.userChoice;status.textContent=result.outcome==='accepted'?'Instalaci dokončí tvůj prohlížeč.':explanation();}catch{status.textContent=explanation();}}else status.textContent=explanation();});
  if('serviceWorker' in navigator)window.addEventListener('load',async()=>{
    try{
      const registration=await navigator.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'});
      const worker=registration.installing||registration.waiting||registration.active;
      if(!worker)throw new Error();
      const update=()=>{if(worker.state==='activated')reportOffline('Offline rozcestník je připravený. Přihlášení a chat dál vyžadují internet.');else if(worker.state==='redundant')reportOffline('Offline příprava selhala. Otevři Portal znovu s internetem.');};
      worker.addEventListener('statechange',update);update();
    }catch{reportOffline('Offline režim se nepodařilo připravit. Online rozhraní můžeš používat dál.');}
  });
})();
