const runtime=String.raw`
let ycServerNavigationReady='';
function ycCanOpenServerNavigation(){
 return !!currentCommunity&&ycServerNavigationReady===currentCommunity.id&&
  ['manage_server','manage_channels','manage_members','manage_permissions','manage_invites','manage_emojis','manage_soundboard'].some(p=>canCommunityPermission(p));
}
function ycSyncServerNavigation(){
 const settings=$('appSettingsBtn');
 if(!settings)return;
 let btn=$('ycServerSettingsNavBtn');
 if(!btn){
  btn=document.createElement('button');btn.id='ycServerSettingsNavBtn';btn.type='button';
  btn.className='ghost yc-v3-nav-action';
  btn.innerHTML='<span class="yc-v3-nav-action-ico" aria-hidden="true">⚙</span><span class="yc-v3-nav-action-label">Nastavení serveru</span>';
  btn.onclick=()=>{if(ycCanOpenServerNavigation())window.ycOpenServerSettings()};
 }
 if(settings.nextElementSibling!==btn)settings.after(btn);
 const allowed=ycCanOpenServerNavigation();
 btn.classList.toggle('hidden',!allowed);btn.hidden=!allowed;btn.disabled=!allowed;
 btn.title=allowed?'Nastavení serveru · '+currentCommunity.name:'Nastavení serveru';
 const menu=$('ycServerMenuBtn'),head=document.querySelector('.yc-v3-content-grid>.chat>.chat-head');
 if(menu&&head&&menu.parentElement!==head)head.appendChild(menu);
}
ycOnLifecycle('init',ycSyncServerNavigation);
ycOnLifecycle('communities',ycSyncServerNavigation);
ycOnLifecycle('community',ycSyncServerNavigation);
ycOnLifecycle('beforeCommunity',()=>{ycServerNavigationReady='';ycSyncServerNavigation()});
ycOnLifecycle('beforeAuth',()=>{ycServerNavigationReady='';ycSyncServerNavigation()});
`;
const style=String.raw`<style id="ycServerNavigationStyle">
body .app #side>.side-head{display:none!important}
body .app #ycServerSettingsNavBtn{order:6!important;height:auto!important;min-height:40px;white-space:normal!important}
body .app #ycGlobalNav #ycServerSettingsNavBtn.hidden,body .app #ycGlobalNav #ycServerSettingsNavBtn[hidden]{display:none!important}
body .app #ycServerSettingsNavBtn .yc-v3-nav-action-label{white-space:normal!important;line-height:1.25}
body .app #logoutBtn{order:7!important}
body .app .chat-head>#ycServerMenuBtn{position:relative!important;inset:auto!important;margin-left:auto!important;flex:0 0 32px}
</style>`;
export function withServerNavigation(html){
 const marker='// Register every feature before restoring a cached session.';
 const permission='function applyCommunityPermissionUI(){';
 const open="window.ycOpenServerSettings=()=>{if(!currentCommunity)return toast('Nejdřív vyber server.',true);";
 const menu="{id:'settings',icon:'⚙️',label:'Nastavení serveru',visible:()=>!!currentCommunity,action:()=>window.ycOpenServerSettings()}";
 for(const part of [marker,permission,open,menu])if(!html.includes(part))throw Error('Server navigation insertion boundary missing: '+part);
 return html.replace(permission,permission+"\n  ycServerNavigationReady=currentCommunity?.id||'';ycSyncServerNavigation();")
  .replace(open,open+"if(!ycCanOpenServerNavigation())return toast('Nemáš oprávnění spravovat tento server.',true);")
  .replace(menu,"{id:'settings',visible:()=>false}")
  .replace(marker,runtime+'\n'+marker).replace('</head>',style+'\n</head>');
}
