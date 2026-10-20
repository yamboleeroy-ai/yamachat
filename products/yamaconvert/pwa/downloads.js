'use strict';
(()=>{
  const $=selector=>document.querySelector(selector),urlInput=$('#media-url'),openButton=$('#download-to-queue'),status=$('#download-status'),openLink=$('#open-media-link');
  function setStatus(message,error=false){status.textContent=message;status.style.color=error?'#ff9aa8':''}
  function validate(raw){let url;try{url=new URL(raw)}catch{throw new Error('Vlož platný odkaz na příspěvek.')}if(url.protocol!=='https:'||url.username||url.password)throw new Error('Podporované jsou jen HTTPS odkazy bez přihlašovacích údajů.');return url}
  function showLink(url){openLink.href=url.href;openLink.textContent='Otevřít příspěvek';openLink.classList.remove('hidden')}
  function openPost(){try{const url=validate(urlInput.value.trim());showLink(url);openLink.click();setStatus('Příspěvek je otevřený. Pokud platforma nabízí Uložit nebo Stáhnout, ulož video do telefonu a z nabídky Sdílet vyber YamaConvert.')}catch(error){setStatus(error.message,true)}}
  openButton.addEventListener('click',openPost);
  urlInput.addEventListener('input',()=>openLink.classList.add('hidden'));
  urlInput.addEventListener('keydown',event=>{if(event.key==='Enter')openPost()});
  window.addEventListener('yama-shared-link',event=>{try{const url=validate(event.detail.url);urlInput.value=url.href;showLink(url);setStatus('Odkaz je připraven. Samotný odkaz obsah nestáhne. Pokud platforma nabízí Uložit nebo Stáhnout, ulož soubor do telefonu a potom sdílej soubor do YamaConvert.')}catch{setStatus('Sdílený odkaz není platný HTTPS odkaz.',true)}});
})();
