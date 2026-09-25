const runtime=String.raw`
const YC_SERVER_CARD_MANAGE_PERMS=['manage_server','manage_channels','manage_members','manage_permissions','manage_invites','manage_emojis','manage_soundboard'];
const YC_SERVER_CARD_MANAGE_COLUMNS=['can_manage_server','can_manage_channels','can_manage_members','can_manage_permissions','can_manage_invites','can_manage_emojis','can_manage_soundboard'];
const ycServerCardPermissionCache=new Map();
let ycServerCardMenuSeq=0,ycServerCardPress=null,ycServerCardSuppressClickUntil=0;

function ycServerCardCommunity(id){
 return communities.find(c=>String(c.id)===String(id))||null;
}
function ycServerCardRoleLabel(role){
 return role==='owner'?'Vlastník':role==='admin'?'Administrátor':'Člen';
}
function ycServerCardDate(value){
 if(!value)return 'Neznámé';
 const d=new Date(value);if(Number.isNaN(d.getTime()))return 'Neznámé';
 try{return new Intl.DateTimeFormat('cs-CZ',{day:'numeric',month:'long',year:'numeric'}).format(d)}catch{return d.toLocaleDateString('cs-CZ')}
}
function ycServerCardMobileSurface(){
 return matchMedia('(max-width:900px), (pointer:coarse)').matches;
}
function ycServerCardLocalManage(c){
 if(!c)return false;
 if(['owner','admin'].includes(c.role))return true;
 if(String(currentCommunity?.id)!==String(c.id))return null;
 return YC_SERVER_CARD_MANAGE_PERMS.some(key=>canCommunityPermission(key))?true:null;
}
async function ycServerCardCanManage(c){
 const local=ycServerCardLocalManage(c);if(local!==null)return !!local;
 if(!c||!user?.id)return false;
 const cacheKey=String(c.id)+'|'+String(user.id),cached=ycServerCardPermissionCache.get(cacheKey),now=Date.now();
 if(cached&&now-cached.at<5000)return cached.allowed;
 const {data,error}=await sb.from('community_member_permissions').select('*').eq('community_id',c.id).eq('user_id',user.id).maybeSingle();
 if(error){console.warn('Server card permissions',error);return false}
 const allowed=YC_SERVER_CARD_MANAGE_COLUMNS.some(key=>!!data?.[key]);
 ycServerCardPermissionCache.set(cacheKey,{allowed,at:now});return allowed;
}
async function ycServerCardOpenSettings(id){
 const c=ycServerCardCommunity(id);if(!c)return;
 if(!await ycServerCardCanManage(c)){toast('Nemáš oprávnění spravovat tento server.',true);return}
 if(String(currentCommunity?.id)!==String(c.id))await selectCommunity(c.id);
 if(String(currentCommunity?.id)!==String(c.id))return;
 if(typeof window.ycOpenServerSettings==='function')window.ycOpenServerSettings();
}
async function ycServerCardLeave(id){
 const c=ycServerCardCommunity(id);if(!c)return;
 if(c.role==='owner'){toast('Vlastník nemůže komunitu opustit. Může ji zrušit nebo převést vlastnictví.',true);return}
 if(!confirm('Opustit komunitu '+c.name+'?'))return;
 await ycLeaveCommunity(c.id,false);
}
function ycServerCardInfoIcon(c){
 if(typeof ycServerThumbnailMarkup==='function')return ycServerThumbnailMarkup(c);
 return '<span class="yc-v3-community-mark"><span class="yc-server-icon-initials">'+esc(initials(c.name))+'</span></span>';
}
function ycServerCardInfoStat(label,value){
 return '<div class="yc-server-info-stat"><small>'+esc(label)+'</small><strong>'+esc(String(value))+'</strong></div>';
}
function ycRenderServerCardInfo(c,details){
 const root=$('modalRoot');if(!root)return;
 const loading=!!details.loading,memberCount=details.memberCount,channels=details.channels||[],textCount=channels.filter(x=>x.kind!=='voice').length,voiceCount=channels.filter(x=>x.kind==='voice').length;
 const privacy=typeof c.is_public==='boolean'?(c.is_public?'Veřejný server':'Soukromý server'):'Server';
 const owner=details.ownerName||'Nezjištěno';
 const actions=(details.canManage?'<button type="button" class="yc-server-info-action primary" data-yc-server-info-settings>⚙ Nastavení serveru</button>':'')+(c.role!=='owner'?'<button type="button" class="yc-server-info-action danger" data-yc-server-info-leave>↩ Opustit server</button>':'');
 root.innerHTML='<div class="modal-back yc-server-info-back" data-yc-server-info-back><section class="modal yc-server-info-modal" role="dialog" aria-modal="true" aria-labelledby="ycServerInfoTitle" data-community-id="'+esc(c.id)+'"><div class="yc-server-info-head"><div class="yc-server-info-icon">'+ycServerCardInfoIcon(c)+'</div><div class="yc-server-info-title"><span>'+esc(privacy)+'</span><h2 id="ycServerInfoTitle">'+esc(c.name)+'</h2><small>'+esc(ycServerCardRoleLabel(c.role))+'</small></div><button class="x yc-server-info-close" type="button" aria-label="Zavřít">×</button></div><div class="yc-server-info-body"><p class="yc-server-info-description">'+esc(c.description||'Server zatím nemá popis.')+'</p>'+(loading?'<div class="yc-server-info-loading">Načítám informace o serveru…</div>':'<div class="yc-server-info-grid">'+ycServerCardInfoStat('Založen',ycServerCardDate(c.created_at))+ycServerCardInfoStat('Členové',memberCount==null?'—':Number(memberCount).toLocaleString('cs-CZ'))+ycServerCardInfoStat('Textové kanály',textCount)+ycServerCardInfoStat('Hlasové kanály',voiceCount)+ycServerCardInfoStat('Vlastník',owner)+ycServerCardInfoStat('Moje role',ycServerCardRoleLabel(c.role))+'</div>')+(actions?'<div class="yc-server-info-actions">'+actions+'</div>':'')+'</div></section></div>';
 const back=root.querySelector('[data-yc-server-info-back]');
 back?.addEventListener('click',e=>{if(e.target===back)closeModal()});
 root.querySelector('.yc-server-info-close')?.addEventListener('click',closeModal);
 root.querySelector('[data-yc-server-info-settings]')?.addEventListener('click',async()=>{const id=c.id;closeModal();await ycServerCardOpenSettings(id)});
 root.querySelector('[data-yc-server-info-leave]')?.addEventListener('click',async()=>{const id=c.id;closeModal();await ycServerCardLeave(id)});
}
async function ycOpenServerCardInfo(id){
 const c0=ycServerCardCommunity(id);if(!c0)return;
 ycCloseUiMenu();const token=String(c0.id)+'|'+Date.now();$('modalRoot').dataset.ycServerInfoToken=token;
 ycRenderServerCardInfo(c0,{loading:true,canManage:false,memberCount:null,channels:[]});
 const managePromise=ycServerCardCanManage(c0);
 let fresh=c0,memberCount=Number.isFinite(Number(c0.member_count))?Number(c0.member_count):null,channels=[],ownerName='';
 try{
  const [communityRes,countRes,channelRes,ownerRes]=await Promise.all([
   sb.from('communities').select('*').eq('id',c0.id).maybeSingle(),
   sb.from('community_members').select('user_id',{count:'exact',head:true}).eq('community_id',c0.id),
   sb.from('channels').select('id,kind').eq('community_id',c0.id),
   sb.from('community_members').select('user_id').eq('community_id',c0.id).eq('role','owner').limit(1).maybeSingle()
  ]);
  if(communityRes?.data)fresh={...c0,...communityRes.data,role:c0.role};
  if(Number.isFinite(Number(countRes?.count)))memberCount=Number(countRes.count);
  channels=channelRes?.data||[];
  const ownerId=ownerRes?.data?.user_id;
  if(ownerId){const ownerRes2=await sb.from('profiles').select('username,display_name').eq('id',ownerId).maybeSingle();ownerName=ownerRes2?.data?.display_name||ownerRes2?.data?.username||''}
 }catch(error){console.warn('Server info',error)}
 const canManage=await managePromise;
 if($('modalRoot').dataset.ycServerInfoToken!==token||!$('modalRoot').querySelector('.yc-server-info-modal'))return;
 ycRenderServerCardInfo(fresh,{loading:false,canManage,memberCount,channels,ownerName});
}
window.ycOpenServerInfo=ycOpenServerCardInfo;

function ycServerCardSyncMenuSkin(){
 const root=$('ycUiMenuRoot');if(!root)return;
 if(ycUiMenuState?.kind==='server-card'&&!root.classList.contains('hidden'))root.dataset.ycServerCardMenu=ycServerCardMobileSurface()?'mobile':'desktop';
 else delete root.dataset.ycServerCardMenu;
}
async function ycOpenServerCardMenu(card,x,y){
 const c=ycServerCardCommunity(card?.dataset?.community);if(!c)return;
 const seq=++ycServerCardMenuSeq,canManage=await ycServerCardCanManage(c);if(seq!==ycServerCardMenuSeq)return;
 const rect=card.getBoundingClientRect(),px=Number.isFinite(x)&&x>0?x:rect.left+Math.min(rect.width-8,32),py=Number.isFinite(y)&&y>0?y:rect.top+Math.min(rect.height-8,32);
 const items=[
  {id:'server-info',icon:'ⓘ',label:'Info o serveru',action:()=>ycOpenServerCardInfo(c.id)},
  {id:'server-settings',icon:'⚙',label:'Nastavení serveru',visible:canManage,action:()=>ycServerCardOpenSettings(c.id)},
  {separator:true},
  {id:'server-leave',icon:'↩',label:'Opustit server',danger:true,visible:c.role!=='owner',action:()=>ycServerCardLeave(c.id)}
 ];
 ycOpenUiMenu({kind:'server-card',title:c.name,x:px,y:py,items,context:{communityId:c.id}});
 ycServerCardSyncMenuSkin();
}
function ycServerCardCancelPress(){
 if(ycServerCardPress?.timer)clearTimeout(ycServerCardPress.timer);ycServerCardPress=null;
}
document.addEventListener('contextmenu',event=>{
 const card=event.target.closest?.('#rail [data-community]');if(!card)return;
 event.preventDefault();event.stopPropagation();ycServerCardCancelPress();ycServerCardSuppressClickUntil=Date.now()+700;void ycOpenServerCardMenu(card,event.clientX,event.clientY);
},true);
document.addEventListener('pointerdown',event=>{
 if(event.pointerType==='mouse'||event.button!==0||event.isPrimary===false)return;
 const card=event.target.closest?.('#rail [data-community]');if(!card)return;
 ycServerCardCancelPress();
 const state={card,pointerId:event.pointerId,x:event.clientX,y:event.clientY,opened:false,timer:null};
 state.timer=setTimeout(()=>{if(ycServerCardPress!==state||!card.isConnected)return;state.opened=true;ycServerCardSuppressClickUntil=Date.now()+850;try{navigator.vibrate?.(10)}catch{};void ycOpenServerCardMenu(card,state.x,state.y)},520);
 ycServerCardPress=state;
},true);
document.addEventListener('pointermove',event=>{
 const p=ycServerCardPress;if(!p||event.pointerId!==p.pointerId||p.opened)return;
 if(Math.hypot(event.clientX-p.x,event.clientY-p.y)>12)ycServerCardCancelPress();
},true);
for(const type of ['pointerup','pointercancel'])document.addEventListener(type,event=>{if(ycServerCardPress&&event.pointerId===ycServerCardPress.pointerId)ycServerCardCancelPress()},true);
document.addEventListener('click',event=>{
 if(Date.now()>ycServerCardSuppressClickUntil||!event.target.closest?.('#rail [data-community]'))return;
 event.preventDefault();event.stopImmediatePropagation();ycServerCardSuppressClickUntil=0;
},true);
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&$('modalRoot')?.querySelector('.yc-server-info-modal')){event.preventDefault();closeModal()}});
function ycServerCardDecorate(){
 for(const card of document.querySelectorAll('#rail [data-community]')){card.setAttribute('aria-haspopup','menu');card.dataset.ycServerContext='1'}
}
ycOnLifecycle('init',()=>{
 ycServerCardDecorate();const rail=$('rail');if(rail)new MutationObserver(ycServerCardDecorate).observe(rail,{childList:true,subtree:true});
 const menu=ycEnsureUiMenu();new MutationObserver(ycServerCardSyncMenuSkin).observe(menu,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
});
ycOnLifecycle('communities',()=>{ycServerCardPermissionCache.clear();ycServerCardDecorate()});
ycOnLifecycle('community',ycServerCardDecorate);
ycOnLifecycle('beforeCommunity',()=>{ycServerCardCancelPress();ycCloseUiMenu()});
ycOnLifecycle('beforeAuth',()=>{ycServerCardCancelPress();ycServerCardPermissionCache.clear();ycCloseUiMenu()});
`;
const style=String.raw`
<style id="ycServerCardContextStyle">
#rail [data-community][data-yc-server-context="1"]{-webkit-touch-callout:none}
#ycUiMenuRoot[data-yc-server-card-menu="desktop"]{min-width:250px}
#ycUiMenuRoot[data-yc-server-card-menu] .yc-ui-menu-title{color:#a8ddea}
#ycUiMenuRoot[data-yc-server-card-menu] .yc-ui-menu-item{min-height:42px}
.modal-back.yc-server-info-back{z-index:100760!important;padding:18px!important}
.yc-server-info-modal{width:min(590px,calc(100vw - 28px))!important;max-height:min(760px,calc(100dvh - 28px));overflow:auto!important;padding:0!important;border:1px solid color-mix(in srgb,var(--yc-theme,#e056fd) 42%,#35596c)!important;background:linear-gradient(160deg,#0d2230,#09151f 60%,#120f22)!important}
.yc-server-info-head{display:flex;align-items:center;gap:14px;padding:18px;border-bottom:1px solid rgba(102,192,244,.14);background:radial-gradient(circle at 12% 0,color-mix(in srgb,var(--yc-theme,#e056fd) 20%,transparent),transparent 48%),linear-gradient(110deg,#122a39,#0a1722)}
.yc-server-info-icon{flex:0 0 auto}.yc-server-info-icon .yc-v3-community-mark{position:relative!important;width:72px!important;height:72px!important;display:grid!important;place-items:center!important;border-radius:16px!important;overflow:hidden!important;background:linear-gradient(145deg,#632774,#231330)!important;border:1px solid #b95bd4!important;color:#f5d8ff!important;font-size:20px;font-weight:950}.yc-server-info-icon .yc-server-thumbnail{position:absolute!important;inset:0!important;width:100%!important;height:100%!important;object-fit:cover!important}
.yc-server-info-title{min-width:0;flex:1}.yc-server-info-title>span{display:block;color:#74a5b9;font-size:9px;font-weight:900;letter-spacing:.12em;text-transform:uppercase}.yc-server-info-title h2{margin:3px 0 4px;color:#f0fbff;font-size:22px;line-height:1.18;overflow-wrap:anywhere}.yc-server-info-title small{color:#9eb7c3;font-size:11px}.yc-server-info-close{align-self:flex-start!important;flex:0 0 auto}
.yc-server-info-body{padding:18px}.yc-server-info-description{margin:0 0 16px;color:#a9bec9;line-height:1.55;white-space:pre-wrap;overflow-wrap:anywhere}.yc-server-info-loading{padding:24px 12px;text-align:center;color:#7897a8;border:1px dashed #315166;border-radius:12px;background:#091722}
.yc-server-info-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}.yc-server-info-stat{min-width:0;padding:11px;border:1px solid #29495d;border-radius:11px;background:linear-gradient(180deg,#0e202b,#0a1720)}.yc-server-info-stat small{display:block;color:#6f91a4;font-size:9px;font-weight:900;letter-spacing:.06em;text-transform:uppercase}.yc-server-info-stat strong{display:block;margin-top:5px;color:#e2f3fa;font-size:12px;line-height:1.35;overflow-wrap:anywhere}
.yc-server-info-actions{display:flex;gap:9px;flex-wrap:wrap;margin-top:17px;padding-top:14px;border-top:1px solid #223f50}.yc-server-info-action{min-height:44px;flex:1 1 190px;border:1px solid #345d73;border-radius:10px;background:#112735;color:#d9f3ff;font-weight:850;cursor:pointer}.yc-server-info-action.primary{border-color:color-mix(in srgb,var(--yc-theme,#e056fd) 46%,#3e6b7b);background:linear-gradient(110deg,color-mix(in srgb,var(--yc-theme,#e056fd) 20%,#153246),#123448);color:#fff}.yc-server-info-action.danger{border-color:#70424a;background:#29171c;color:#ffb6bd}
@media(max-width:900px),(pointer:coarse){
 #ycUiMenuRoot[data-yc-server-card-menu="mobile"]{left:10px!important;right:10px!important;top:auto!important;bottom:calc(10px + env(safe-area-inset-bottom))!important;width:auto!important;max-width:none!important;min-width:0!important;padding:10px!important;border-radius:18px!important;box-shadow:0 -18px 55px rgba(0,0,0,.68),0 0 24px color-mix(in srgb,var(--yc-theme,#e056fd) 12%,transparent)!important}
 #ycUiMenuRoot[data-yc-server-card-menu="mobile"] .yc-ui-menu-title{padding:8px 10px 7px;font-size:11px}
 #ycUiMenuRoot[data-yc-server-card-menu="mobile"] .yc-ui-menu-item{min-height:50px;border-radius:11px;font-size:14px;padding:11px 12px}
 #ycUiMenuRoot[data-yc-server-card-menu="mobile"] .yc-ui-menu-icon{width:26px;flex-basis:26px}
 .modal-back.yc-server-info-back{align-items:flex-end!important;padding:0!important}
 .yc-server-info-modal{width:100%!important;max-width:none!important;max-height:calc(var(--yc-viewport-height,100dvh) - 10px)!important;border-radius:20px 20px 0 0!important;border-bottom:0!important;padding-bottom:max(0px,env(safe-area-inset-bottom))!important}
 .yc-server-info-head{padding:16px}.yc-server-info-icon .yc-v3-community-mark{width:62px!important;height:62px!important}.yc-server-info-title h2{font-size:19px}
 .yc-server-info-body{padding:15px}.yc-server-info-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.yc-server-info-actions{position:sticky;bottom:0;background:linear-gradient(180deg,rgba(9,21,31,.7),#09151f 32%);padding-bottom:4px}
}
@media(max-width:360px){.yc-server-info-grid{grid-template-columns:1fr}.yc-server-info-modal{max-height:var(--yc-viewport-height,100dvh)!important}}
</style>
`;
export function withServerCardContext(html){
 const marker='// Register every feature before restoring a cached session.';
 for(const part of [marker,'function ycOpenUiMenu(','async function ycLeaveCommunity(','window.ycOpenServerSettings=','function ycV3DecorateCommunityCards()'])if(!html.includes(part))throw Error('Server card context insertion boundary missing: '+part);
 if(html.includes('ycServerCardContextStyle'))return html;
 return html.replace(marker,runtime+'\n'+marker).replace('</head>',style+'\n</head>');
}
