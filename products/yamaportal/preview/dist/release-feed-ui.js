'use strict';
(()=>{
  const icons={yamaportal:'yamaportal.png',yamachat:'yamachat.png',yamasearch:'yamasearch.png',yamahelp:'yamahelp.png',yamaview:'yamaview.png',yamaconvert:'yamaconvert.png'};
  const names={yamahost:'YamaHost',yamaportal:'Yamaportal',yamachat:'Yamachat',yamasearch:'YamaSearch',yamahelp:'YamaHelp',yamaview:'YamaView',yamamaker:'YamaMaker',yamaconvert:'YamaConvert'};
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const valid=item=>item&&typeof item.id==='string'&&/^[a-zA-Z0-9._:-]{1,100}$/.test(item.id)&&Object.hasOwn(names,item.app)&&typeof item.version==='string'&&item.version.length<=40&&typeof item.title==='string'&&item.title.trim().length>0&&typeof item.summary==='string'&&item.summary.trim().length>0&&typeof item.details==='string'&&item.details.trim().length>0&&Number.isFinite(Date.parse(item.releasedAt))&&Array.isArray(item.platforms)&&item.platforms.length<=8;
  const platformLabel=value=>/Windows/i.test(value)?'Windows':/Android APK/i.test(value)?'Android APK':/iOS/i.test(value)?'iOS PWA':/Android PWA|\bWeb\b/i.test(value)?'Web/PWA':/Android/i.test(value)?'Android':null;
  function versionSummary(app,releases){
    const latest=new Map();
    for(const item of [...releases].filter(valid).sort((a,b)=>Date.parse(b.releasedAt)-Date.parse(a.releasedAt))){
      if(item.app!==app)continue;
      for(const platform of item.platforms){const label=platformLabel(platform);if(label&&!latest.has(label))latest.set(label,item.version);}
    }
    if(latest.has('Android')&&(latest.has('Android APK')||latest.has('Web/PWA')))latest.delete('Android');
    return [...latest].map(([platform,version])=>`${platform} ${version}`).join(' · ');
  }
  function updateCardVersions(releases){
    for(const app of Object.keys(names)){
      const summary=versionSummary(app,releases);if(!summary)continue;
      document.querySelectorAll(`.card.app-${app} .app-status`).forEach(status=>{status.textContent=summary;status.title=`Poslední ověřené verze podle platformy: ${summary}`;status.setAttribute('aria-label',`Vydané verze: ${summary}`);});
    }
  }
  const date=value=>new Intl.DateTimeFormat('cs-CZ',{dateStyle:'medium'}).format(new Date(value));
  const appIcon=app=>icons[app]?`<img src="assets/${icons[app]}" alt="" class="release-app-icon">`:`<span class="release-app-symbol" aria-hidden="true">${app==='yamamaker'?'✎':'✦'}</span>`;
  const modal=document.querySelector('#release-detail'),modalContent=document.querySelector('#release-detail-content');
  function open(item){modalContent.innerHTML=`<div class="release-modal-heading">${appIcon(item.app)}<div><p class="eyebrow">${escape(names[item.app])} · ${item.kind==='new-app'?'NOVÁ APLIKACE':'AKTUALIZACE'}</p><h2>${escape(item.title)}</h2><span class="pill">Verze ${escape(item.version)}</span></div></div><p class="release-modal-summary">${escape(item.summary)}</p><div class="release-modal-details">${escape(item.details).split(/\n+/).map(line=>line.trim()?`<p>${line}</p>`:'').join('')}</div><p class="caption">Zveřejněno ${escape(date(item.releasedAt))} · ${escape(item.platforms.join(' · '))}</p>`;modal.showModal();}
  document.addEventListener('click',event=>{const row=event.target.closest('[data-release-id]');if(row){const item=window.YamaReleaseFeed.items.find(entry=>entry.id===row.dataset.releaseId);if(item)open(item);}if(event.target.closest('.close-release-detail'))modal.close();});
  modal.querySelector('.close').addEventListener('click',()=>modal.close());
  async function render(){const host=document.querySelector('#release-feed');try{const response=await fetch('release-feed.json',{cache:'no-store'});if(!response.ok)throw new Error('feed-unavailable');const feed=await response.json();const allItems=(Array.isArray(feed.releases)?feed.releases:[]).filter(valid).sort((a,b)=>Date.parse(b.releasedAt)-Date.parse(a.releasedAt));const items=allItems.slice(0,4);window.YamaReleaseFeed.items=items;window.YamaReleaseFeed.allItems=allItems;updateCardVersions(allItems);if(!host)return;if(!items.length){host.innerHTML='<div class="activity-empty"><span aria-hidden="true">◷</span><p>Ověřená vydání a jejich popisy se objeví po zveřejnění aktualizace. Zde se zobrazují pouze vydané verze.</p></div>';return;}host.innerHTML=items.map(item=>`<button type="button" class="release-row" data-release-id="${escape(item.id)}"><span class="release-icon-wrap">${appIcon(item.app)}</span><span class="release-copy"><strong>${escape(names[item.app])} · ${escape(item.title)}</strong><span>Verze ${escape(item.version)} · ${escape(item.platforms.join(' · '))}</span></span><time datetime="${escape(item.releasedAt)}">${escape(date(item.releasedAt))}</time><span class="release-arrow" aria-hidden="true">›</span></button>`).join('');}catch{if(host)host.innerHTML='<div class="activity-empty"><span aria-hidden="true">◷</span><p>Informace o vydání teď nejsou dostupné. Zkus to později.</p></div>';}}
  window.YamaReleaseFeed={items:[],allItems:[],versionSummary,render};
})();
