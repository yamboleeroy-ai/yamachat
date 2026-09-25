const runtime=String.raw`
// Server thumbnails use the existing community icon field and asset permissions.
function ycServerIconUrl(c){
 const p=String(c?.icon_path||'');
 if(!p.startsWith(String(c.id)+'/')||p.includes('..')||!/^[-a-zA-Z0-9_/.]+$/.test(p))return '';
 return sb.storage.from('community-assets').getPublicUrl(p).data?.publicUrl||'';
}
function ycServerThumbnailMarkup(c){
 const url=ycServerIconUrl(c),fallback='<span class="yc-server-icon-initials">'+esc(initials(c.name))+'</span>';
 return '<span class="yc-v3-community-mark">'+fallback+(url?'<img class="yc-server-thumbnail" src="'+esc(url)+'" alt="" decoding="async">':'')+'</span>';
}
document.addEventListener('error',event=>{if(event.target.matches?.('img.yc-server-thumbnail'))event.target.remove()},true);
function ycCanEditServerThumbnail(){return !!currentCommunity&&['owner','admin'].includes(currentRole)}
function ycMountServerThumbnailSettings(host){
 const section=document.createElement('section');section.className='yc-ss-card yc-thumbnail-settings';
 section.innerHTML='<h3>Miniatura serveru</h3><p>Obrázek místo zkratky v horní kartě. Uvidí ho všichni členové serveru.</p>'+(ycCanEditServerThumbnail()?'<button class="yc-ss-btn" type="button" data-yc-edit-thumbnail>Nahrát nebo změnit miniaturu</button>':'<p>Miniaturu může měnit vlastník nebo administrátor serveru.</p>');
 section.querySelector('button')?.addEventListener('click',ycOpenServerThumbnail);host.prepend(section);
}
async function ycCompressServerThumbnail(file){
 if(!file||!['image/png','image/jpeg','image/webp'].includes(file.type))throw Error('Vyber obrázek PNG, JPG nebo WebP.');
 if(file.size>5*1024*1024)throw Error('Obrázek může mít nejvýše 5 MB.');
 const url=URL.createObjectURL(file),img=new Image();
 try{
  await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(Error('Obrázek se nepodařilo načíst.'));img.src=url});
  const size=Math.min(img.naturalWidth,img.naturalHeight);if(!size)throw Error('Obrázek má neplatné rozměry.');
  const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
  canvas.getContext('2d').drawImage(img,(img.naturalWidth-size)/2,(img.naturalHeight-size)/2,size,size,0,0,256,256);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.88));if(!blob)throw Error('Obrázek se nepodařilo zpracovat.');return blob;
 }finally{URL.revokeObjectURL(url)}
}
function ycOpenServerThumbnail(){
 if(!ycCanEditServerThumbnail())return;
 const community={...currentCommunity};let pending=null,previewUrl='',busy=false,selection=0;
 $('modalRoot').innerHTML='<div class="modal-back"><section class="modal yc-thumbnail-modal" role="dialog" aria-modal="true" aria-label="Miniatura serveru"><div class="modal-head"><h3>Miniatura · '+esc(community.name)+'</h3><button id="closeModal" class="x" type="button" aria-label="Zavřít">×</button></div><div class="yc-thumbnail-preview">'+ycServerThumbnailMarkup(community)+'</div><p>Vyber PNG, JPG nebo WebP do 5 MB. Miniatura se ořízne na čtverec a zobrazí všem členům.</p><label class="yc-thumbnail-file">Vybrat obrázek<input id="ycThumbnailFile" type="file" accept="image/png,image/jpeg,image/webp"></label><p id="ycThumbnailStatus" role="status" aria-live="polite"></p><div class="yc-thumbnail-actions"><button id="ycThumbnailSave" class="primary" type="button" disabled>Uložit miniaturu</button><button id="ycThumbnailRemove" class="ghost" type="button" '+(community.icon_path?'':'disabled')+'>Vrátit písmena</button></div></section></div>';
 const root=$('modalRoot').querySelector('.yc-thumbnail-modal'),save=$('ycThumbnailSave'),remove=$('ycThumbnailRemove'),input=$('ycThumbnailFile'),status=$('ycThumbnailStatus');
 const cleanup=new MutationObserver(()=>{if(!root.isConnected){selection++;if(previewUrl)URL.revokeObjectURL(previewUrl);cleanup.disconnect()}});cleanup.observe($('modalRoot'),{childList:true});
 $('closeModal').onclick=()=>{if(!busy)closeModal()};
 input.onchange=async()=>{const ticket=++selection;pending=null;save.disabled=true;status.textContent='';try{
  const blob=await ycCompressServerThumbnail(input.files?.[0]);if(ticket!==selection||!root.isConnected)return;
  pending=blob;if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl=URL.createObjectURL(blob);
  const img=document.createElement('img');img.className='yc-server-thumbnail';img.alt='Náhled miniatury';img.src=previewUrl;root.querySelector('.yc-v3-community-mark').replaceChildren(img);save.disabled=false;
 }catch(error){if(ticket===selection)status.textContent=error.message}};
 async function persist(clear){
  if(busy||(!clear&&!pending))return;busy=true;save.disabled=remove.disabled=input.disabled=true;$('closeModal').disabled=true;status.textContent='Ukládám…';
  try{
   let iconPath=null;
   if(!clear){iconPath=community.id+'/icons/yc-thumb-'+crypto.randomUUID()+'.'+(pending.type==='image/webp'?'webp':'png');const uploaded=await sb.storage.from('community-assets').upload(iconPath,pending,{contentType:pending.type,cacheControl:'31536000',upsert:false});if(uploaded.error)throw uploaded.error;}
   const result=await sb.from('communities').update({icon_path:iconPath}).eq('id',community.id).select('id,icon_path').single();if(result.error)throw result.error;if(!result.data)throw Error('Miniaturu se nepodařilo uložit.');
   communities=communities.map(c=>c.id===community.id?{...c,icon_path:result.data.icon_path}:c);
   if(currentCommunity?.id===community.id)currentCommunity={...currentCommunity,icon_path:result.data.icon_path};
   renderRail();if(root.isConnected)closeModal();toast(clear?'Zkratka serveru obnovena.':'Miniatura serveru uložena.');
  }catch(error){if(root.isConnected)status.textContent='Uložení se nezdařilo: '+(error.message||'Zkus to znovu.');}
  finally{busy=false;if(root.isConnected){save.disabled=!pending;remove.disabled=!community.icon_path;input.disabled=false;$('closeModal').disabled=false;}}
 }
 save.onclick=()=>persist(false);remove.onclick=()=>persist(true);
}
`;

const style=String.raw`<style id="ycServerThumbnailStyle">
body .app .yc-v3-ribbon .server[data-community]{
 --yc-neon-a:#c15be2;--yc-neon-b:#3dbbdc;
 border:1px solid transparent!important;border-radius:12px!important;
 background:linear-gradient(112deg,#261532,#0b1929 57%,#10283a) padding-box,linear-gradient(105deg,var(--yc-neon-a),#765aaf 45%,var(--yc-neon-b)) border-box!important;
 box-shadow:0 0 6px #b94bd62b,0 0 9px #41bce51c,inset 0 0 12px #54c9e00c!important;
}
body .app .yc-v3-ribbon .server[data-community].yc-server-glow{--yc-neon-a:var(--yc-context-a);--yc-neon-b:var(--yc-context-c);box-shadow:0 0 8px color-mix(in srgb,var(--yc-neon-a) 28%,transparent),0 0 10px color-mix(in srgb,var(--yc-neon-b) 20%,transparent),inset 0 0 12px #ffffff09!important}
body .app .yc-v3-ribbon .server[data-community][data-yc-card-background="default"]::before{opacity:.07!important}
body .app .yc-v3-ribbon .server[data-community]::after{background:linear-gradient(110deg,color-mix(in srgb,var(--yc-neon-a) 8%,transparent),transparent 45%,color-mix(in srgb,var(--yc-neon-b) 6%,transparent))!important;pointer-events:none!important}
body .app .yc-v3-ribbon .server[data-community] .yc-v3-community-mark{background:linear-gradient(145deg,#632774,#231330)!important;border:1px solid #b95bd4!important;box-shadow:0 0 7px #ba49d529,inset 0 1px #ffffff12!important;color:#f5d8ff!important;border-radius:10px!important;overflow:hidden!important;position:relative!important}
.yc-v3-community-mark .yc-server-thumbnail{position:absolute!important;inset:0!important;width:100%!important;height:100%!important;object-fit:cover!important;border-radius:inherit!important;pointer-events:none!important}
.modal-back:has(>.yc-thumbnail-modal){z-index:100100!important}
.yc-thumbnail-modal{width:min(430px,calc(100vw - 24px))!important}
.yc-thumbnail-modal p{color:var(--muted,#91aab4);font-size:13px;line-height:1.5}
.yc-thumbnail-preview{display:flex;justify-content:center;margin:18px 0}
.yc-thumbnail-preview .yc-v3-community-mark{display:grid!important;place-items:center;width:96px!important;height:96px!important;flex-basis:96px!important;position:relative!important;border-radius:16px!important;background:#211c32;border:1px solid var(--yc-theme,#c15be2);overflow:hidden}
.yc-thumbnail-file{display:grid;gap:9px;font-weight:700;font-size:13px}.yc-thumbnail-file input{width:100%;max-width:100%}
.yc-thumbnail-actions{display:flex;gap:8px;flex-wrap:wrap}.yc-thumbnail-actions button{min-height:44px;flex:1}
</style>`;

export function withServerThumbnails(html){
 const marker='// Register every feature before restoring a cached session.';
 const icon="'<span class=\"yc-v3-community-mark\">'+esc(initials(c.name))+'</span><span class=\"yc-v3-community-copy\"><strong>'";
 if(!html.includes(marker)||!html.includes(icon)||!html.includes('window.parent.openDesktopServerCardBackgroundModal(body);'))throw Error('Server thumbnail insertion boundaries missing');
 return html.replace(icon,"ycServerThumbnailMarkup(c)+'<span class=\"yc-v3-community-copy\"><strong>'")
 .replace('window.parent.openDesktopServerCardBackgroundModal(body);','window.parent.openDesktopServerCardBackgroundModal(body);ycMountServerThumbnailSettings(body);')
 .replace("{id:'server-color',icon:","{id:'server-thumbnail',icon:'▧',label:'Miniatura serveru',visible:ycCanEditServerThumbnail,action:ycOpenServerThumbnail},\n  {id:'server-color',icon:")
 .replace("['invite','leave'].includes(x?.id)","['invite','leave','server-thumbnail'].includes(x?.id)")
 .replace(marker,runtime+'\n'+marker).replace('</head>',style+'\n</head>');
}

