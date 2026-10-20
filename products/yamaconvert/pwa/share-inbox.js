'use strict';
(()=>{
  const params=new URL(location.href).searchParams;
  const result=params.get('share');
  if(!result)return;
  history.replaceState(null,'',location.pathname+location.hash);
  const DB='yamaconvert-share-inbox-v1',STORE='shares';
  function openDb(){return new Promise((resolve,reject)=>{const request=indexedDB.open(DB,1);request.onupgradeneeded=()=>request.result.createObjectStore(STORE,{keyPath:'id',autoIncrement:true});request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)})}
  async function takeShares(){const db=await openDb();return new Promise((resolve,reject)=>{const transaction=db.transaction(STORE,'readwrite'),store=transaction.objectStore(STORE),request=store.getAll();let shares=[];request.onsuccess=()=>{shares=request.result;store.clear()};transaction.oncomplete=()=>{db.close();resolve(shares)};transaction.onerror=()=>{db.close();reject(transaction.error)};transaction.onabort=()=>{db.close();reject(transaction.error)}})}
  async function receive(){
    if(result!=='received'){
      const messages={
        'too-large':'Sdílené soubory překročily limit 100 MB na soubor, 100 MB celkem nebo 5 souborů.',
        'unsupported':'Sdílej audio/video soubor, který platforma dovoluje uložit. Samotný odkaz se nestahuje.',
        'unavailable':'Soubor se nepodařilo bezpečně přijmout. Zkus ho uložit do zařízení a pak sdílet z Galerie nebo Soubory.'
      };
      window.YamaApp?.notify(messages[result]||'Sdílený obsah se nepodařilo přijmout.');
      return;
    }
    try{
      const shares=await takeShares();
      if(!shares.length){window.YamaApp.notify('Sdílený obsah se nenašel. Zkus ho poslat znovu.');return}
      shares.sort((a,b)=>b.receivedAt-a.receivedAt);
      const files=shares.flatMap(share=>share.files||[]).filter(file=>file?.size>0&&file.size<=100*1024*1024).map(file=>file instanceof File?file:new File([file],file.name||'sdilene-video',{type:file.type||'application/octet-stream'}));
      if(files.length){
        window.YamaApp.addFiles(files);
        window.YamaApp.notify(`${files.length} sdílených souborů je ve frontě. Zvol MP3, MP4 nebo jiný výstup a spusť převod.`);
        return;
      }
      const sharedLink=shares.find(share=>share.url);
      if(sharedLink?.url){
        const downloadsButton=document.querySelector('[data-view="downloads"]');
        downloadsButton?.click();
        window.dispatchEvent(new CustomEvent('yama-shared-link',{detail:{url:sharedLink.url,title:sharedLink.title||''}}));
      }
    }catch{window.YamaApp?.notify('Přijatý soubor se nepodařilo otevřít. Zkus ho sdílet z Galerie nebo Soubory znovu.')}
  }
  void receive();
})();
