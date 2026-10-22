'use strict';
(()=>{
  const $=selector=>document.querySelector(selector),input=$('#media-batch-urls'),start=$('#start-media-batch'),queue=$('#media-batch-queue'),urlInput=$('#media-url'),singleStart=$('#download-to-queue'),rights=$('#media-rights-consent')||$('#media-rights'),status=$('#download-status');
  if(!input||!start||!queue||!singleStart||!rights||!status)return;
  let running=false,items=[];
  function render(){queue.replaceChildren(...items.map((item,index)=>{const row=document.createElement('div');row.className='batch-item';const label=document.createElement('span');label.textContent=`${index+1}. ${item.url} · ${item.state}`;row.append(label);if(item.state==='Čeká'){const skip=document.createElement('button');skip.type='button';skip.className='button';skip.textContent='Přeskočit';skip.addEventListener('click',()=>{item.state='Přeskočeno';render()});row.append(skip)}return row}))}
  function waitForDownload(){return new Promise(resolve=>{const began=singleStart.disabled; if(!began){resolve(false);return}const timeout=setTimeout(()=>{clearInterval(timer);resolve(false)},11*60*1000),timer=setInterval(()=>{if(!singleStart.disabled){clearInterval(timer);clearTimeout(timeout);resolve(status.textContent.startsWith('Hotovo:'))}},150)})}
  start.addEventListener('click',async()=>{
    if(running)return;
    const urls=input.value.split(/[\r\n]+/).map(value=>value.trim()).filter(Boolean);
    if(!urls.length){status.textContent='Vlož alespoň jeden odkaz do hromadného stahování.';return}
    if(urls.length>20){status.textContent='Hromadně můžeš přidat nejvýše 20 odkazů.';return}
    const checked=[];
    try{for(const raw of urls){const parsed=new URL(raw);if(parsed.protocol!=='https:'||parsed.username||parsed.password)throw new Error();checked.push(parsed.href)}}catch{status.textContent='Zkontroluj odkazy. Podporované jsou veřejné odkazy HTTPS.';return}
    if(!rights.checked){status.textContent='Nejdřív potvrď, že máš právo stáhnout všechny uvedené odkazy.';rights.focus();return}
    if(singleStart.disabled){status.textContent='Stahovací služba zatím není připravená.';return}
    items=checked.map(url=>({url,state:'Čeká'}));render();running=true;start.disabled=true;
    const originalShow=window.YamaApp?.showConverter;
    if(window.YamaApp&&originalShow)window.YamaApp=Object.freeze({...window.YamaApp,showConverter:()=>{}});
    let completed=false;
    try{
      for(const item of items){
        if(item.state!=='Čeká')continue;
        item.state='Stahuje se';render();urlInput.value=item.url;rights.checked=true;
        singleStart.click();
        const success=await waitForDownload();item.state=success?'Hotovo':'Chyba';completed||=success;render();
      }
    }finally{
      if(window.YamaApp&&originalShow)window.YamaApp=Object.freeze({...window.YamaApp,showConverter:originalShow});
      running=false;start.disabled=false;rights.checked=false;
      if(completed)originalShow?.();
    }
  });
})();
