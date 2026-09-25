const runtime=String.raw`
document.documentElement.dataset.ycFriendsRefresh='1';
let ycFriendsRefreshTabsObserver=null;
function ycFriendsRefreshSyncTabs(){
 const members=$('membersTab'),friends=$('friendsTab');if(!members||!friends)return false;
 const isFriends=rightMode==='friends';
 members.classList.toggle('active',!isFriends);friends.classList.toggle('active',isFriends);
 members.setAttribute('aria-selected',String(!isFriends));friends.setAttribute('aria-selected',String(isFriends));
 members.setAttribute('role','tab');friends.setAttribute('role','tab');
 const tabs=members.parentElement;if(tabs){tabs.setAttribute('role','tablist');tabs.dataset.ycStableSocialTabs='1'}
 return true;
}
function ycFriendsRefreshDecorate(){
 const home=$('ycFriendsHome');
 if(home){
  home.dataset.ycModernFriends='1';
  const head=home.querySelector('.yc-friends-home-head');
  if(head&&head.dataset.ycModernHead!=='1'){
   head.dataset.ycModernHead='1';
   head.innerHTML='<div class="yc-friends-modern-title"><span class="yc-friends-modern-mark">◇</span><span><strong>Přátelé</strong><small>Kontakty a soukromé zprávy</small></span></div>';
  }
  const status=$('ycFriendsStatusBtn');if(status){status.dataset.ycModernStatus='1';status.setAttribute('aria-label','Změnit můj stav')}
  const open=$('ycOpenFriendsList');if(open){open.dataset.ycModernOpen='1';open.innerHTML='<span class="yc-friends-open-icon">♧</span><span>Zobrazit všechny přátele</span><span class="yc-friends-open-arrow">›</span>'}
  const dmTitle=$('newDmBtn')?.closest('.section-title');if(dmTitle)dmTitle.dataset.ycModernDmTitle='1';
 }
 const right=document.querySelector('.yc-v3-content-grid>.right')||document.querySelector('.right');
 if(right)right.dataset.ycSocialRefresh='1';
 ycFriendsRefreshSyncTabs();
 if(!ycFriendsRefreshTabsObserver){
  const tabs=document.querySelector('.right-tabs');
  if(tabs){
   let queued=false;
   ycFriendsRefreshTabsObserver=new MutationObserver(()=>{
    if(queued)return;queued=true;queueMicrotask(()=>{queued=false;ycFriendsRefreshSyncTabs()});
   });
   ycFriendsRefreshTabsObserver.observe(tabs,{subtree:true,attributes:true,attributeFilter:['class']});
   tabs.addEventListener('click',()=>queueMicrotask(ycFriendsRefreshSyncTabs),true);
  }
 }
 return true;
}
ycOnLifecycle('init',ycFriendsRefreshDecorate);
ycOnLifecycle('communities',ycFriendsRefreshDecorate);
ycOnLifecycle('community',ycFriendsRefreshDecorate);
setTimeout(ycFriendsRefreshDecorate,0);
setTimeout(ycFriendsRefreshDecorate,350);
`;
const style=String.raw`
<style id="ycFriendsPanelRefreshStyle">
/* Friends panel refresh + stable social tabs + short-window nav safety. */

/* Remove the decorative vertical copy completely. It must never overlap controls. */
#ycGlobalNav .yc-v3-nav-fill:after{content:none!important;display:none!important}
#ycGlobalNav .yc-v3-nav-fill{pointer-events:none!important;min-height:0!important;flex:1 1 8px!important;margin:7px 0!important;background:linear-gradient(180deg,transparent,rgba(112,228,232,.018))!important}
#ycGlobalNav.yc-v3-global-nav{overflow-y:auto!important;overflow-x:hidden!important;overscroll-behavior:contain!important;min-height:0!important;scrollbar-width:thin}
#ycGlobalNav>.brand,#ycGlobalNav>.yc-v3-nav,#ycGlobalNav .yc-v3-nav-actions,#ycGlobalNav>.yc-v3-user-zone{flex-shrink:0!important}
#ycGlobalNav .yc-v3-nav-action,#ycGlobalNav .yc-v3-nav-btn,#ycGlobalNav .yc-v3-admin-dock,#ycGlobalNav #ycDeveloperDock{position:relative!important;z-index:4!important;pointer-events:auto!important}
#ycGlobalNav .yc-v3-user-zone{position:relative!important;z-index:4!important;background:linear-gradient(180deg,rgba(7,16,24,.10),rgba(7,16,24,.92) 26%)!important}

/* Dedicated Friends / DM surface: modern Yamachat card language. */
.side.yc-home-mode{background:radial-gradient(circle at 20% 0,color-mix(in srgb,var(--yc-theme,#70e4e8) 10%,transparent),transparent 34%),linear-gradient(180deg,#091924,#07131d 72%,#061019)!important}
.yc-friends-home[data-yc-modern-friends="1"]{background:transparent!important;padding:10px!important;gap:8px!important}
.yc-friends-home[data-yc-modern-friends="1"] .yc-friends-home-head{
 flex:0 0 auto!important;margin:0!important;padding:13px 14px!important;border:1px solid rgba(112,228,232,.18)!important;border-radius:14px!important;
 background:radial-gradient(circle at 0 0,color-mix(in srgb,var(--yc-theme,#70e4e8) 15%,transparent),transparent 62%),linear-gradient(145deg,#102635,#091822)!important;
 box-shadow:inset 0 1px 0 rgba(255,255,255,.035),0 10px 24px rgba(0,0,0,.16)!important
}
.yc-friends-modern-title{display:flex;align-items:center;gap:11px;min-width:0}.yc-friends-modern-mark{width:38px;height:38px;flex:0 0 38px;border-radius:11px;display:grid;place-items:center;border:1px solid color-mix(in srgb,var(--yc-theme,#70e4e8) 48%,#325063);background:linear-gradient(145deg,color-mix(in srgb,var(--yc-theme,#70e4e8) 24%,#102534),#0a1a25);color:#dffcff;font-size:18px;font-weight:950;box-shadow:0 0 16px var(--yc-theme-soft,rgba(112,228,232,.12))}
.yc-friends-modern-title>span:last-child{min-width:0}.yc-friends-modern-title strong{display:block!important;color:#f1fbff!important;font-size:16px!important;line-height:1.1!important;letter-spacing:.01em}.yc-friends-modern-title small{display:block!important;margin-top:4px!important;color:#7895a3!important;font-size:9px!important;letter-spacing:.035em}
.yc-friends-home[data-yc-modern-friends="1"] .yc-friends-home-body{padding:0!important;overflow:auto!important;min-height:0!important;overscroll-behavior:contain}
#ycFriendsStatusBtn[data-yc-modern-status="1"]{width:100%!important;min-height:68px!important;margin:0 0 8px!important;padding:11px 12px!important;border:1px solid rgba(112,228,232,.18)!important;border-radius:13px!important;background:linear-gradient(110deg,color-mix(in srgb,var(--yc-theme,#70e4e8) 8%,#102432),#0a1a24 68%)!important;color:#dff4fa!important;display:grid!important;grid-template-columns:13px minmax(0,1fr) 24px!important;align-items:center!important;gap:10px!important;text-align:left!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.025)!important;transition:border-color .12s ease,background .12s ease!important}
#ycFriendsStatusBtn[data-yc-modern-status="1"]:hover{border-color:color-mix(in srgb,var(--yc-theme,#70e4e8) 55%,#36596b)!important;background:linear-gradient(110deg,color-mix(in srgb,var(--yc-theme,#70e4e8) 13%,#143044),#0b1e2a 70%)!important}
#ycFriendsStatusBtn[data-yc-modern-status="1"]>span:nth-child(2){min-width:0}#ycFriendsStatusBtn[data-yc-modern-status="1"] strong{display:block;color:#eafaff;font-size:12px!important}#ycFriendsStatusBtn[data-yc-modern-status="1"] small{display:block;margin-top:3px;color:#7893a1;font-size:9px!important;line-height:1.3;white-space:normal}.yc-status-chevron{color:var(--yc-theme,#70e4e8)!important;font-size:18px!important;text-align:right}
#ycOpenFriendsList[data-yc-modern-open="1"]{width:100%!important;min-height:46px!important;margin:0 0 10px!important;padding:0 12px!important;border:1px solid rgba(189,92,255,.23)!important;border-radius:12px!important;background:linear-gradient(100deg,rgba(189,92,255,.075),rgba(112,228,232,.055))!important;color:#dceef4!important;display:grid!important;grid-template-columns:24px minmax(0,1fr) 20px!important;align-items:center!important;gap:7px!important;text-align:left!important;font-weight:800!important}
#ycOpenFriendsList[data-yc-modern-open="1"]:hover{border-color:color-mix(in srgb,var(--yc-theme,#70e4e8) 45%,#9b5dd4)!important;background:linear-gradient(100deg,rgba(189,92,255,.12),rgba(112,228,232,.09))!important}.yc-friends-open-icon{color:#d998ff;font-size:16px}.yc-friends-open-arrow{justify-self:end;color:#76dbe7;font-size:18px}
.yc-friends-home [data-yc-modern-dm-title="1"]{margin:8px 2px 6px!important;padding:7px 3px!important;color:#7eaab8!important;font-size:9px!important;letter-spacing:.13em!important;border-top:1px solid rgba(112,228,232,.08)!important}.yc-friends-home [data-yc-modern-dm-title="1"] .mini{width:30px!important;height:30px!important;min-height:30px!important;border-radius:9px!important;background:#0d2431!important;border-color:rgba(112,228,232,.18)!important;color:#9df5f6!important}
.yc-friends-home #dmList{display:grid!important;gap:6px!important;padding-bottom:8px!important}
.yc-friends-home .yc-dm-social-row{min-height:61px!important;margin:0!important;padding:8px 9px!important;border:1px solid rgba(112,228,232,.095)!important;border-radius:12px!important;background:linear-gradient(105deg,rgba(18,38,50,.94),rgba(8,24,34,.96))!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.018)!important;transition:background .12s ease,border-color .12s ease,transform .12s ease!important}
.yc-friends-home .yc-dm-social-row:hover{transform:translateX(1px);border-color:rgba(112,228,232,.27)!important;background:linear-gradient(105deg,rgba(27,57,72,.96),rgba(11,32,44,.98))!important}.yc-friends-home .yc-dm-social-row.active{border-color:color-mix(in srgb,var(--yc-theme,#70e4e8) 54%,#34586b)!important;background:linear-gradient(105deg,color-mix(in srgb,var(--yc-theme,#70e4e8) 10%,#173546),#0b2130)!important;box-shadow:inset 3px 0 0 var(--yc-theme,#70e4e8),0 0 16px var(--yc-theme-soft,rgba(112,228,232,.10))!important}
.yc-friends-home .yc-dm-social-copy{min-width:0!important}.yc-friends-home .yc-dm-social-copy strong{font-size:11px!important}.yc-friends-home .yc-dm-social-copy small,.yc-friends-home .yc-lastseen{font-size:8px!important}.yc-friends-home .yc-dm-open{color:#537786!important;font-size:17px!important}

/* Right Members/Friends tabs: stable geometry and no repaint animation. */
.yc-v3-member-shell>.right-tabs[data-yc-stable-social-tabs="1"]{flex:0 0 52px!important;min-height:52px!important;height:52px!important;contain:layout paint!important;isolation:isolate!important;transform:translateZ(0)!important;backface-visibility:hidden!important;padding:6px!important;gap:6px!important;background:#071722!important}
.yc-v3-member-shell>.right-tabs[data-yc-stable-social-tabs="1"] button{height:40px!important;min-height:40px!important;border:1px solid transparent!important;border-radius:11px!important;transition:none!important;transform:none!important;box-shadow:none!important;background:transparent!important}
.yc-v3-member-shell>.right-tabs[data-yc-stable-social-tabs="1"] button:hover{background:rgba(112,228,232,.045)!important}
.yc-v3-member-shell>.right-tabs[data-yc-stable-social-tabs="1"] button.active{border-color:rgba(112,228,232,.28)!important;background:linear-gradient(110deg,rgba(112,228,232,.09),rgba(189,92,255,.08))!important;box-shadow:inset 0 0 18px rgba(112,228,232,.025)!important}
.yc-v3-member-shell>.right-tabs[data-yc-stable-social-tabs="1"] button.active:after{left:8px!important;right:8px!important;bottom:-1px!important;border-radius:999px!important}
.yc-v3-member-shell>.right-content{overflow-anchor:none!important;contain:layout style!important}
.right[data-yc-social-refresh="1"] .steam-section{margin:10px 0 6px!important;padding:6px 8px!important;border:1px solid rgba(112,228,232,.08)!important;border-radius:9px!important;background:rgba(6,19,27,.58)!important}
.right[data-yc-social-refresh="1"] .steam-friend-row{min-height:62px!important;margin:5px 0!important;padding:8px 9px!important;border:1px solid rgba(112,228,232,.09)!important;border-left:1px solid rgba(112,228,232,.09)!important;border-radius:12px!important;background:linear-gradient(100deg,rgba(18,38,50,.94),rgba(8,23,33,.96))!important;transition:background .12s ease,border-color .12s ease!important;transform:none!important}
.right[data-yc-social-refresh="1"] .steam-friend-row:hover{border-color:rgba(112,228,232,.25)!important;border-left-color:var(--yc-theme,#70e4e8)!important;background:linear-gradient(100deg,rgba(28,57,72,.96),rgba(11,31,43,.98))!important;transform:none!important}
.right[data-yc-social-refresh="1"] .steam-friend-row.is-offline{opacity:.68!important;filter:saturate(.62)!important}.right[data-yc-social-refresh="1"] .steam-actions{gap:5px!important}.right[data-yc-social-refresh="1"] .steam-actions .smallbtn{min-width:34px!important;min-height:32px!important;padding:0 7px!important;border-radius:9px!important;background:#0d2230!important;border-color:rgba(112,228,232,.14)!important}
.right[data-yc-social-refresh="1"] .yc-friend-request-row{border-color:rgba(189,92,255,.16)!important;background:linear-gradient(100deg,rgba(50,28,62,.42),rgba(11,28,39,.96))!important}

/* Short desktop windows: nav becomes a real scroll surface; no invisible layer can steal clicks. */
@media(max-height:680px){
 #ycGlobalNav.yc-v3-global-nav{padding-top:10px!important;padding-bottom:10px!important}
 #ycGlobalNav .brand{margin-bottom:10px!important}
 #ycGlobalNav .yc-v3-nav-fill{flex:0 0 4px!important;height:4px!important;margin:2px 0!important}
 #ycGlobalNav .yc-v3-nav,#ycGlobalNav .yc-v3-nav-actions{gap:4px!important}
 #ycGlobalNav .yc-v3-nav-btn,#ycGlobalNav .yc-v3-nav-action{height:38px!important;min-height:38px!important}
 #ycGlobalNav .yc-v3-user-zone{padding-top:5px!important}
}
</style>
`;
export function withFriendsPanelRefresh(html){
 const marker='// Register every feature before restoring a cached session.';
 for(const part of [marker,'function ycSetupFriendsHome()','function renderFriends()','function ycV3MountLayout()','.yc-v3-nav-fill:after'])
  if(!html.includes(part))throw Error('Friends panel refresh insertion boundary missing: '+part);
 if(html.includes('ycFriendsPanelRefreshStyle'))return html;
 return html.replace(marker,runtime+'\n'+marker).replace('</head>',style+'\n</head>');
}
