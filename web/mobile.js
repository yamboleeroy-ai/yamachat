(()=>{
 const mobile=matchMedia('(max-width:1100px)');
 let activeDrawer=null,returnFocus=null;
 const panels=()=>[document.getElementById('ycGlobalNav'),document.getElementById('side'),document.querySelector('.yc-v3-content-grid>.right')].filter(Boolean);
 function close(){for(const p of panels()){p.classList.remove('yc-mobile-open','mobile-open');p.inert=mobile.matches}document.getElementById('app')?.classList.remove('yc-mobile-drawer-open');document.querySelectorAll('[aria-controls][aria-expanded]').forEach(b=>b.setAttribute('aria-expanded','false'));activeDrawer=null;returnFocus?.focus();returnFocus=null}
 function open(panel,button){const same=activeDrawer===panel;close();if(same)return;returnFocus=button;activeDrawer=panel;panel.inert=false;panel.classList.add(panel.id==='side'?'mobile-open':'yc-mobile-open');document.getElementById('app').classList.add('yc-mobile-drawer-open');button.setAttribute('aria-expanded','true');panel.querySelector('button,a,input,[tabindex="0"]')?.focus()}
 function mount(){
  const app=document.getElementById('app'),top=app?.querySelector('.yc-v3-workspace>.top');
  if(!top||!document.getElementById('ycGlobalNav'))return false;
  if(top.dataset.mobileReady)return true;top.dataset.mobileReady='1';
  const ps=panels();if(ps.length!==3)return false;const [nav,side,right]=ps;right.id ||= 'ycMobileMembers';
  for(const [id,label,text,panel] of [['ycMobileNavBtn','Hlavní menu','☰',nav],['mobileMenu','Kanály','#',side],['ycMobileMembersBtn','Členové a přátelé','👥',right]]){
   let b=document.getElementById(id);if(!b){b=document.createElement('button');b.id=id;top.appendChild(b)}
   b.type='button';b.classList.add('yc-mobile-head-btn');b.textContent=text;b.title=label;b.setAttribute('aria-label',label);b.setAttribute('aria-controls',panel.id);b.setAttribute('aria-expanded','false');
   b.addEventListener('click',e=>{if(!mobile.matches)return;e.preventDefault();e.stopImmediatePropagation();open(panel,b)},true);
  }
  const brand=document.createElement('div');brand.id='ycMobileBrand';brand.className='yc-mobile-header-brand';const img=document.createElement('img');img.src=document.querySelector('.yc-desktop-auth-logo')?.src||'./icons/icon-192.png';img.alt='Yamachat';brand.appendChild(img);document.getElementById('mobileMenu').after(brand);
  const scrim=document.createElement('div');scrim.id='ycMobileScrim';scrim.className='yc-mobile-scrim';scrim.addEventListener('click',close);app.appendChild(scrim);close();return true;
 }
 const observer=new MutationObserver(()=>{if(mount())observer.disconnect()});observer.observe(document.getElementById('app'),{childList:true,subtree:true});mount();
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&activeDrawer){close();e.preventDefault()}if(e.key==='Tab'&&activeDrawer){const items=[...activeDrawer.querySelectorAll('button,a,input,[tabindex="0"]')].filter(x=>!x.disabled&&x.getClientRects().length);const first=items[0],last=items.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}}});
 document.addEventListener('click',e=>{if(mobile.matches&&e.target.closest('[data-channel],[data-thread],#profileBtn,#appSettingsBtn,#logoutBtn'))close()});
 mobile.addEventListener('change',close);
 // Desktop double-click joins a voice channel. A deliberate touch tap invokes the same handler.
 document.addEventListener('click',e=>{const room=e.target.closest?.('.voice-channel[data-voice]');if(room&&e.pointerType==='touch'&&mobile.matches){room.dispatchEvent(new MouseEvent('dblclick',{bubbles:true}));close()}});
 window.ycCloseMobileSurface=()=>{if(activeDrawer){close();return true}const modal=document.querySelector('.modal-back:not(.hidden) .x,.yc-rankxp-overlay:not(.hidden) .yc-rankxp-close');if(modal){modal.click();return true}return false};
 let frame=0;function viewport(){cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{const v=window.visualViewport;const h=v?.height||innerHeight;document.documentElement.style.setProperty('--yc-viewport-height',h+'px');const typing=/^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName);document.documentElement.classList.toggle('yc-keyboard-open',document.documentElement.dataset.nativeKeyboard==='true'||(typing&&innerHeight-h>120));})}
 visualViewport?.addEventListener('resize',viewport);window.addEventListener('resize',viewport);document.addEventListener('focusin',viewport);document.addEventListener('focusout',viewport);viewport();
 const password=document.getElementById('password');if(password){password.autocomplete='current-password';password.setAttribute('autocapitalize','none');password.setAttribute('autocorrect','off');password.spellcheck=false;const b=document.createElement('button');b.type='button';b.className='ghost';b.textContent='Zobrazit heslo';b.onclick=()=>{const show=password.type==='password';password.type=show?'text':'password';b.textContent=show?'Skrýt heslo':'Zobrazit heslo';b.setAttribute('aria-pressed',String(show))};password.after(b)}
})();
