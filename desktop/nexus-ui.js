(()=>{'use strict';
if(window.__ycNexusUiLoaded)return;
window.__ycNexusUiLoaded=true;

const q=(s,r=document)=>r?.querySelector?.(s)||null;
const qa=(s,r=document)=>[...(r?.querySelectorAll?.(s)||[])];
const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const initials=v=>String(v||'Y').trim().split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]?.toUpperCase()||'').join('')||'Y';
const bridge=()=>window.__ycV3NavRegistryBridge||null;
let browserState={mode:'public',publicRows:[],privateRows:[],query:'',loading:false};
let mounted=false;

function waitFor(fn,{tries=160,delay=50}={}){
  return new Promise(resolve=>{
    let n=0;
    const tick=()=>{
      let v=null;try{v=fn()}catch{}
      if(v)return resolve(v);
      if(++n>=tries)return resolve(null);
      setTimeout(tick,delay);
    };
    tick();
  });
}

function navButton(id,icon,label){
  const b=document.createElement('button');
  b.type='button';b.className='yc-nexus-nav-btn';b.dataset.nx=id;
  b.innerHTML='<span class="ico">'+icon+'</span><span>'+esc(label)+'</span>';
  b.title=label;return b;
}

function setNavActive(id){
  qa('.yc-nexus-nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.nx===id));
}

function openAccountMenu(anchor){
  q('#ycNexusAccountMenu')?.remove();
  const menu=document.createElement('div');menu.id='ycNexusAccountMenu';
  menu.style.cssText='position:fixed;z-index:101000;min-width:190px;padding:7px;border:1px solid rgba(91,202,247,.28);border-radius:11px;background:linear-gradient(160deg,#0b1c29,#080f19);box-shadow:0 18px 48px rgba(0,0,0,.55)';
  const items=[
    ['Profil',()=>q('#profileBtn')?.click()],
    ['O aplikaci',()=>openAbout()],
    ['Kontakt / vývojář',()=>q('#ycDeveloperDock')?.click()],
    ['Odhlásit',()=>q('#logoutBtn')?.click()]
  ];
  if(bridge()?.isPlatformAdmin?.())items.splice(3,0,['Administrace',()=>bridge()?.openPlatformAdmin?.()]);
  for(const [label,action] of items){
    const b=document.createElement('button');b.type='button';b.textContent=label;
    b.style.cssText='display:block;width:100%;height:36px;padding:0 10px;text-align:left;border:1px solid transparent;border-radius:8px;background:transparent;color:#b9d4e5;font:800 11px Inter,Segoe UI,sans-serif;cursor:pointer';
    b.onmouseenter=()=>{b.style.background='#102334';b.style.borderColor='rgba(96,202,245,.18)'};
    b.onmouseleave=()=>{b.style.background='transparent';b.style.borderColor='transparent'};
    b.onclick=()=>{menu.remove();action()};
    menu.appendChild(b);
  }
  document.body.appendChild(menu);
  const r=anchor.getBoundingClientRect(),mr=menu.getBoundingClientRect();
  menu.style.left=Math.max(8,Math.min(innerWidth-mr.width-8,r.right-mr.width))+'px';
  menu.style.top=Math.min(innerHeight-mr.height-8,r.bottom+6)+'px';
  const close=e=>{if(!menu.contains(e.target)&&e.target!==anchor){menu.remove();document.removeEventListener('pointerdown',close,true)}};
  setTimeout(()=>document.addEventListener('pointerdown',close,true),0);
}

function buildTopNav(global){
  q('#ycNexusTopNav')?.remove();
  const nav=document.createElement('div');nav.id='ycNexusTopNav';nav.className='yc-nexus-topnav';
  const defs=[
    ['home','⌂','Domů'],
    ['servers','◉','Servery'],
    ['friends','♧','Přátelé'],
    ['notifications','◔','Oznámení'],
    ['rank','✦','Rank / XP'],
    ['settings','⚙','Nastavení']
  ];
  for(const [id,icon,label] of defs)nav.appendChild(navButton(id,icon,label));
  nav.querySelector('[data-nx="home"]').onclick=()=>{setNavActive('home');bridge()?.goHome?.()};
  nav.querySelector('[data-nx="servers"]').onclick=()=>{setNavActive('servers');void openServerBrowser('public')};
  nav.querySelector('[data-nx="friends"]').onclick=()=>{setNavActive('friends');bridge()?.showFriendsHome?.()};
  nav.querySelector('[data-nx="notifications"]').onclick=()=>{setNavActive('notifications');q('#ycNotifyBtn')?.click()};
  nav.querySelector('[data-nx="rank"]').onclick=()=>{setNavActive('rank');q('#ycRankXpBtn')?.click()};
  nav.querySelector('[data-nx="settings"]').onclick=()=>{setNavActive('settings');q('#appSettingsBtn')?.click();setTimeout(injectSettingsAbout,80)};

  const search=document.createElement('label');search.className='yc-nexus-top-search';
  search.innerHTML='<span>⌕</span><input id="ycNexusSearch" type="search" autocomplete="off" placeholder="Hledat…">';
  search.querySelector('input').oninput=e=>{
    const term=String(e.target.value||'').trim().toLowerCase();
    qa('#rail [data-community],#channelList [data-channel],#voiceChannelList [data-voice],#rightContent .steam-member-row,#rightContent .steam-friend-row,#rightContent .person').forEach(n=>{
      n.style.display=!term||String(n.textContent||'').toLowerCase().includes(term)?'':'none';
    });
  };

  const userZone=q('#ycGlobalNav>.yc-v3-user-zone');
  global.insertBefore(nav,userZone||null);
  global.insertBefore(search,userZone||null);
  if(userZone){
    const me=q('.me',userZone);if(me){me.style.cursor='pointer';me.title='Účet';me.onclick=()=>q('#profileBtn')?.click()}
    const more=document.createElement('button');more.type='button';more.id='ycNexusAccountMore';more.className='yc-nexus-nav-btn';more.innerHTML='<span class="ico">⋯</span>';more.title='Účet a další';
    more.style.width='36px';more.style.padding='0';more.onclick=()=>openAccountMenu(more);userZone.appendChild(more);
  }
  setNavActive('home');
}

function mountLayout(){
  if(mounted)return true;
  const app=q('#app'),global=q('#ycGlobalNav'),work=q('.yc-v3-workspace'),content=q('.yc-v3-content-grid'),rail=q('#rail'),side=q('#side');
  if(!app||!global||!work||!content||!rail||!side||!bridge())return false;
  mounted=true;document.documentElement.dataset.ycNexus='1';app.dataset.ycLayout='nexus-desktop-preview';
  if(rail.parentElement!==content)content.insertBefore(rail,content.firstChild);
  buildTopNav(global);
  syncServerHero();
  const ro=new MutationObserver(()=>{syncServerHero();syncNotificationBadge()});
  ro.observe(rail,{subtree:true,childList:true,attributes:true,attributeFilter:['class','src']});
  const appObserver=new MutationObserver(()=>{syncNotificationBadge();if(q('.yc-app-settings-modal'))injectSettingsAbout()});
  appObserver.observe(app,{subtree:true,childList:true});
  document.addEventListener('click',e=>{
    const community=e.target.closest?.('#rail [data-community]');
    if(community)setTimeout(()=>{syncServerHero();setNavActive('home')},20);
  },true);
  syncNotificationBadge();
  return true;
}

function syncServerHero(){
  const head=q('#side>.side-head');if(!head)return;
  let hero=q('.yc-nexus-server-hero',head);
  const active=q('#rail [data-community].active');
  const img=active?.querySelector?.('img');
  if(!img){hero?.remove();return}
  if(!hero){hero=document.createElement('div');hero.className='yc-nexus-server-hero';head.prepend(hero)}
  const src=img.currentSrc||img.src||'';
  if(hero.dataset.src===src)return;hero.dataset.src=src;hero.innerHTML='<img src="'+esc(src)+'" alt="">';
}

function syncNotificationBadge(){
  const nav=q('.yc-nexus-nav-btn[data-nx="notifications"]');if(!nav)return;
  q('.yc-nexus-badge',nav)?.remove();
  const src=q('#ycNotifyBtn .yc-notify-badge');
  if(!src||!String(src.textContent||'').trim())return;
  const b=document.createElement('span');b.className='yc-nexus-badge';b.textContent=String(src.textContent||'').trim();
  b.style.cssText='min-width:16px;height:16px;padding:0 4px;border-radius:999px;background:#e54863;color:white;display:inline-grid;place-items:center;font-size:9px;font-weight:900';
  nav.appendChild(b);
}

function injectSettingsAbout(){
  const modal=q('#modalRoot .yc-app-settings-modal');if(!modal||q('[data-yc-nexus-settings-about]',modal))return;
  const b=document.createElement('button');b.type='button';b.dataset.ycNexusSettingsAbout='1';b.className='ghost';
  b.textContent='ⓘ O aplikaci / administrace';
  b.style.cssText='width:100%;margin-top:10px;min-height:40px';
  b.onclick=openAbout;modal.appendChild(b);
}

function openAbout(){
  q('#ycNexusAccountMenu')?.remove();
  const root=q('#modalRoot');if(!root)return;
  const admin=!!bridge()?.isPlatformAdmin?.();
  root.innerHTML='<div class="modal-back"><div class="modal yc-nexus-about"><div class="modal-head"><h3>O aplikaci</h3><button class="x" data-nx-close>×</button></div><div class="yc-nexus-about-grid"><section class="yc-nexus-about-card"><h2>Yamachat</h2><p>Nexus desktop preview. Nová prezentační vrstva používá stávající chat, voice a stream logiku beze změny jejího lifecycle.</p><div class="notice">Testovací větev · bez releasu · produkční instalace se tímto preview nemění.</div><p>Voice a stream zůstávají napojené na původní WebRTC, MediaStream, audio routing a Electron IPC implementaci.</p></section><aside class="yc-nexus-admin-card"><strong>Režim aplikace</strong><p style="font-size:11px;color:#88a2b5">'+(admin?'Administrátorský přístup je pro tento účet aktivní.':'Běžný uživatelský režim.')+'</p>'+(admin?'<button type="button" data-nx-admin>Otevřít admin panel</button>':'')+'</aside></div></div></div>';
  q('[data-nx-close]',root).onclick=()=>{root.innerHTML=''};
  q('[data-nx-admin]',root)?.addEventListener('click',()=>bridge()?.openPlatformAdmin?.());
  q('.modal-back',root)?.addEventListener('pointerdown',e=>{if(e.target===e.currentTarget)root.innerHTML=''});
}

function joinedMap(){
  const state=bridge()?.nexusState?.()||{communities:[]};
  return new Map((state.communities||[]).map(c=>[String(c.id),c]));
}

async function openServerBrowser(mode='public'){
  browserState.mode=mode;browserState.query='';browserState.loading=true;
  renderBrowser();
  try{
    const state=bridge()?.nexusState?.()||{communities:[]};
    browserState.privateRows=(state.communities||[]).filter(c=>!c.is_public);
    browserState.publicRows=await bridge()?.nexusListPublicCommunities?.()||[];
  }catch(error){
    console.warn('Nexus server browser',error);
    browserState.publicRows=[];browserState.error=error?.message||String(error);
  }finally{browserState.loading=false;renderBrowser()}
}

function browserRows(){
  let rows=browserState.mode==='private'?browserState.privateRows:browserState.publicRows;
  const term=browserState.query.trim().toLowerCase();
  if(term)rows=rows.filter(r=>((r.name||'')+' '+(r.description||'')).toLowerCase().includes(term));
  return rows;
}

function renderBrowser(){
  let back=q('#ycNexusBrowserBack');
  if(!back){back=document.createElement('div');back.id='ycNexusBrowserBack';back.className='yc-nexus-browser-back';document.body.appendChild(back)}
  const rows=browserRows(),joined=joinedMap();
  const cards=browserState.loading?'<div class="yc-nexus-browser-loading">Načítám servery…</div>':
    rows.length?rows.map(row=>{
      const member=joined.get(String(row.id)),isJoined=!!member,count=Number(row.member_count||0);
      return '<article class="yc-nexus-browser-card" data-nx-server="'+esc(row.id)+'"><div class="yc-nexus-card-banner">'+esc(initials(row.name))+'</div><div class="yc-nexus-card-body"><h4>'+esc(row.name||'Server')+'</h4><p>'+esc(row.description||'Bez popisu')+'</p><div class="yc-nexus-card-meta">'+(browserState.mode==='public'?'Veřejný server':'Soukromý server')+(count?' · '+count.toLocaleString('cs-CZ')+' členů':'')+(isJoined?' · člen':'')+'</div></div><div class="yc-nexus-card-actions"><button type="button" data-nx-detail="'+esc(row.id)+'">Detail</button>'+(isJoined?'<button type="button" class="primary" data-nx-open="'+esc(row.id)+'">Otevřít</button>':browserState.mode==='public'?'<button type="button" class="primary" data-nx-join="'+esc(row.id)+'">Připojit se</button>':'')+'</div></article>';
    }).join(''):'<div class="yc-nexus-browser-empty">'+(browserState.error?'Načtení selhalo: '+esc(browserState.error):browserState.mode==='public'?'Žádný veřejný server neodpovídá hledání.':'Nemáš žádný dostupný soukromý server odpovídající hledání.')+'</div>';
  back.innerHTML='<section class="yc-nexus-browser" role="dialog" aria-modal="true"><aside class="yc-nexus-browser-side"><div class="yc-nexus-browser-title">Servery</div><button class="yc-nexus-browser-action" data-nx-create>⊕ Vytvořit server</button><button class="yc-nexus-browser-action" data-nx-code>▣ Připojit se kódem</button><button class="yc-nexus-browser-tab '+(browserState.mode==='public'?'active':'')+'" data-nx-mode="public">◉ Veřejné</button><button class="yc-nexus-browser-tab '+(browserState.mode==='private'?'active':'')+'" data-nx-mode="private">▣ Soukromé</button><div style="flex:1"></div><button class="yc-nexus-browser-action" data-nx-refresh>↻ Obnovit</button></aside><main class="yc-nexus-browser-main"><div class="yc-nexus-browser-head"><input class="yc-nexus-browser-search" value="'+esc(browserState.query)+'" placeholder="'+(browserState.mode==='public'?'Hledat veřejné servery…':'Hledat v mých soukromých serverech…')+'"><button class="yc-nexus-browser-close" type="button" aria-label="Zavřít">×</button></div><div class="yc-nexus-browser-grid">'+cards+'</div></main></section>';
  q('.yc-nexus-browser-close',back).onclick=()=>{back.remove();setNavActive('home')};
  back.onclick=e=>{if(e.target===back){back.remove();setNavActive('home')}};
  qa('[data-nx-mode]',back).forEach(b=>b.onclick=()=>{browserState.mode=b.dataset.nxMode;browserState.query='';renderBrowser()});
  q('.yc-nexus-browser-search',back).oninput=e=>{browserState.query=e.target.value;renderBrowser();const i=q('.yc-nexus-browser-search',back);i?.focus();i?.setSelectionRange?.(browserState.query.length,browserState.query.length)};
  q('[data-nx-refresh]',back).onclick=()=>void openServerBrowser(browserState.mode);
  q('[data-nx-create]',back).onclick=()=>{back.remove();bridge()?.nexusCreateCommunity?.()};
  q('[data-nx-code]',back).onclick=()=>{back.remove();bridge()?.nexusJoinPrompt?.()};
  qa('[data-nx-open]',back).forEach(b=>b.onclick=async()=>{back.remove();await bridge()?.nexusOpenCommunity?.(b.dataset.nxOpen);setNavActive('home')});
  qa('[data-nx-join]',back).forEach(b=>b.onclick=async()=>{
    b.disabled=true;b.textContent='Připojuji…';
    try{await bridge()?.nexusJoinPublicCommunity?.(b.dataset.nxJoin);back.remove();setNavActive('home')}
    catch(error){b.disabled=false;b.textContent='Připojit se';alert('Připojení selhalo: '+(error?.message||error))}
  });
  qa('[data-nx-detail]',back).forEach(b=>b.onclick=()=>showBrowserDetail(b.dataset.nxDetail));
}

function showBrowserDetail(id){
  const back=q('#ycNexusBrowserBack');if(!back)return;
  const joined=joinedMap(),row=[...browserState.publicRows,...browserState.privateRows].find(x=>String(x.id)===String(id))||joined.get(String(id));
  if(!row)return;
  const member=joined.get(String(id)),count=Number(row.member_count||0);
  const main=q('.yc-nexus-browser-main',back);if(!main)return;
  main.innerHTML='<div class="yc-nexus-browser-head"><button class="yc-nexus-browser-close" data-nx-back type="button">←</button><strong style="font-size:12px">Detail serveru</strong><span style="flex:1"></span><button class="yc-nexus-browser-close" data-nx-close type="button">×</button></div><div style="padding:16px;overflow:auto"><section class="yc-server-info-modal" style="width:100%!important;max-height:none!important"><div class="yc-server-info-head"><div class="yc-server-info-icon"><div class="yc-v3-community-mark">'+esc(initials(row.name))+'</div></div><div class="yc-server-info-title"><span>'+(row.is_public?'Veřejný server':'Soukromý server')+'</span><h2>'+esc(row.name||'Server')+'</h2><small>'+(member?'Jsi členem serveru':'Nejsi členem serveru')+'</small></div></div><div class="yc-server-info-body"><p class="yc-server-info-description">'+esc(row.description||'Server zatím nemá popis.')+'</p><div class="yc-server-info-grid"><div class="yc-server-info-stat"><small>Členové</small><strong>'+(count?count.toLocaleString('cs-CZ'):'—')+'</strong></div><div class="yc-server-info-stat"><small>Viditelnost</small><strong>'+(row.is_public?'Veřejný':'Soukromý')+'</strong></div><div class="yc-server-info-stat"><small>Moje role</small><strong>'+esc(member?.role||'—')+'</strong></div></div><div class="yc-server-info-actions">'+(member?'<button class="yc-server-info-action primary" data-nx-detail-open>Otevřít server</button><button class="yc-server-info-action" data-nx-native-info>Úplné info</button>':row.is_public?'<button class="yc-server-info-action primary" data-nx-detail-join>Připojit se</button>':'')+'</div></div></section></div>';
  q('[data-nx-back]',main).onclick=renderBrowser;q('[data-nx-close]',main).onclick=()=>{back.remove();setNavActive('home')};
  q('[data-nx-detail-open]',main)?.addEventListener('click',async()=>{back.remove();await bridge()?.nexusOpenCommunity?.(id);setNavActive('home')});
  q('[data-nx-native-info]',main)?.addEventListener('click',()=>{back.remove();bridge()?.nexusOpenServerInfo?.(id)});
  q('[data-nx-detail-join]',main)?.addEventListener('click',async e=>{e.currentTarget.disabled=true;try{await bridge()?.nexusJoinPublicCommunity?.(id);back.remove();setNavActive('home')}catch(error){alert('Připojení selhalo: '+(error?.message||error));renderBrowser()}});
}

async function start(){
  const ready=await waitFor(()=>q('#app')&&q('#ycGlobalNav')&&q('.yc-v3-content-grid')&&bridge());
  if(!ready)return;
  mountLayout();
  // The Nexus layer intentionally does not listen for, replace, or recreate
  // voice/stream MediaStreams. Existing nodes are only moved/styled.
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else void start();
})();