import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

const legalDocs=Object.freeze({
  license:{title:'Licence Yamachat',file:'LICENSE',text:read('LICENSE')},
  terms:{title:'Podmínky používání',file:'TERMS_OF_USE.md',text:read('TERMS_OF_USE.md')},
  privacy:{title:'Ochrana osobních údajů',file:'PRIVACY_POLICY.md',text:read('PRIVACY_POLICY.md')},
  thirdParty:{title:'Licence třetích stran',file:'THIRD_PARTY_NOTICES.md',text:read('THIRD_PARTY_NOTICES.md')},
  brand:{title:'Informace o značce Yamachat',file:'BRAND-NOTICE.md',text:read('BRAND-NOTICE.md')},
  provenance:{title:'Původ projektu a assetů',file:'PROVENANCE.md + ASSET-MANIFEST.md',text:read('PROVENANCE.md')+'\n\n------------------------------------------------------------\n\nASSET-MANIFEST.md\n\n'+read('ASSET-MANIFEST.md')},
  baseline:{title:'Právní baseline',file:'LEGAL-BASELINE.md',text:read('LEGAL-BASELINE.md')}
});

function legalRuntime(){
  const docsJson=JSON.stringify(legalDocs).replaceAll('<','\\u003c').replaceAll('>','\\u003e').replaceAll('&','\\u0026');
  return `
<style id="ycLegalUiV1Style">
#ycLegalAboutBtn{grid-column:1/-1}
#ycGlobalNav #ycLegalAboutBtn.yc-v3-nav-action{order:6!important}
.yc-v3-user-actions #ycLegalAboutBtn{width:100%!important;height:42px!important;min-height:42px!important;justify-content:flex-start!important;margin-top:1px}
.yc-v3-user-actions #ycLegalAboutBtn .ico{width:19px;flex:0 0 19px;text-align:center;color:var(--yc-theme,#70e4e8)}
.yc-v3-user-actions #ycLegalAboutBtn:hover,.yc-v3-user-actions #ycLegalAboutBtn:focus-visible{background:linear-gradient(90deg,rgba(112,228,232,.13),rgba(112,228,232,.035))!important;border-color:rgba(112,228,232,.18)!important;color:#efffff!important}

.yc-auth-legal-links{display:flex;align-items:center;justify-content:center;gap:7px;flex-wrap:wrap;margin-top:10px;color:#6f8798;font-size:11px}
.yc-auth-legal-links button{border:0;background:transparent;color:#88aabd;padding:4px 3px;text-decoration:underline;text-decoration-color:rgba(136,170,189,.35);text-underline-offset:3px;cursor:pointer}
.yc-auth-legal-links button:hover,.yc-auth-legal-links button:focus-visible{color:#d9f5ff;outline:2px solid var(--yc-theme,#70e4e8);outline-offset:2px;border-radius:5px}
.yc-legal-back{position:fixed;inset:0;width:100vw;max-width:100vw;box-sizing:border-box;overflow:hidden;z-index:11050;display:grid;place-items:center;padding:18px max(18px,env(safe-area-inset-right)) max(18px,env(safe-area-inset-bottom)) max(18px,env(safe-area-inset-left));background:rgba(2,7,12,.82);backdrop-filter:blur(8px)}
.yc-legal-shell{width:min(920px,100%);max-width:100%;min-width:0;box-sizing:border-box;height:min(760px,calc(100dvh - 36px));min-height:420px;display:grid;grid-template-columns:260px minmax(0,1fr);overflow:hidden;border:1px solid rgba(112,228,232,.24);border-radius:18px;background:linear-gradient(145deg,#091823,#071019 72%);box-shadow:0 28px 90px rgba(0,0,0,.62),inset 0 1px 0 rgba(255,255,255,.035);color:#e7f2f5}
.yc-legal-nav{display:flex;flex-direction:column;min-width:0;max-width:100%;min-height:0;padding:18px 12px;background:linear-gradient(180deg,rgba(13,31,43,.98),rgba(7,19,28,.99));border-right:1px solid rgba(112,228,232,.13)}
.yc-legal-brand{padding:4px 8px 15px}.yc-legal-brand strong{display:block;font-size:18px;color:#efffff}.yc-legal-brand small{display:block;margin-top:4px;color:#7693a0;font-size:10px;line-height:1.45}
.yc-legal-nav-list{display:grid;gap:6px;overflow:auto;padding:2px}
.yc-legal-nav-btn{width:100%;display:flex;align-items:center;gap:9px;text-align:left;border:1px solid transparent;border-radius:10px;background:transparent;color:#9eb7c2;padding:10px 9px;font-size:11px;font-weight:800}
.yc-legal-nav-btn:hover,.yc-legal-nav-btn.active{background:rgba(112,228,232,.08);border-color:rgba(112,228,232,.17);color:#efffff}
.yc-legal-nav-btn .yc-legal-status{margin-left:auto;font-size:8px;color:#6c8d9b;text-transform:uppercase;letter-spacing:.05em}.yc-legal-nav-btn.pending .yc-legal-status{color:#d0ab63}
.yc-legal-main{display:flex;flex-direction:column;min-width:0;max-width:100%;min-height:0;overflow:hidden}
.yc-legal-head{display:flex;align-items:center;gap:12px;padding:16px 18px;border-bottom:1px solid rgba(112,228,232,.13)}.yc-legal-head h2{margin:0;flex:1;font-size:19px}.yc-legal-close{width:36px;height:36px;display:grid;place-items:center;border:1px solid rgba(112,228,232,.18);border-radius:10px;background:#0c1d28;color:#a9c1cb;font-size:20px}
.yc-legal-body{flex:1;min-width:0;max-width:100%;min-height:0;overflow-x:hidden;overflow-y:auto;padding:18px;box-sizing:border-box}
.yc-legal-hero{display:grid;min-width:0;max-width:100%;box-sizing:border-box;gap:12px;padding:18px;border:1px solid rgba(112,228,232,.21);border-radius:15px;background:radial-gradient(circle at 10% 0,rgba(112,228,232,.11),transparent 42%),linear-gradient(135deg,#102735,#0a1721)}
.yc-legal-hero h3{margin:0;font-size:24px}.yc-legal-badge{display:inline-flex;width:max-content;max-width:100%;align-items:center;gap:7px;padding:7px 10px;border:1px solid rgba(112,228,232,.25);border-radius:999px;background:rgba(112,228,232,.07);color:#bff9fb;font-size:10px;font-weight:900}
.yc-legal-grid{display:grid;min-width:0;max-width:100%;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.yc-legal-info{padding:11px 12px;border:1px solid rgba(112,228,232,.14);border-radius:11px;background:#0b1b26}.yc-legal-info small{display:block;color:#6e8d9a;font-size:9px;text-transform:uppercase;letter-spacing:.07em}.yc-legal-info strong{display:block;margin-top:4px;color:#e5f3f6;font-size:12px;overflow-wrap:anywhere}
.yc-legal-signature{display:flex;align-items:flex-start;gap:10px;padding:12px 13px;border:1px solid rgba(112,228,232,.2);border-radius:11px;background:linear-gradient(135deg,rgba(112,228,232,.09),rgba(9,29,40,.72))}
.yc-legal-signature>span{display:grid;place-items:center;flex:0 0 27px;width:27px;height:27px;border-radius:50%;background:rgba(112,228,232,.13);color:#bff9fb;font-weight:950}.yc-legal-signature strong,.yc-legal-signature small{display:block}.yc-legal-signature strong{color:#e6fbfd;font-size:11px;line-height:1.4}.yc-legal-signature small{margin-top:3px;color:#7694a0;font-size:9px;line-height:1.45}
.yc-legal-note{padding:12px 13px;border-left:3px solid var(--yc-theme,#70e4e8);border-radius:9px;background:#0b1a24;color:#9fb8c2;font-size:11px;line-height:1.6}
.yc-legal-links-title{margin:2px 0 -2px;color:#7f9ba7;font-size:9px;font-weight:900;letter-spacing:.12em;text-transform:uppercase}
.yc-legal-links-grid{display:grid;min-width:0;max-width:100%;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
.yc-legal-link-card{display:flex;align-items:center;gap:10px;min-height:48px;width:100%;padding:10px 11px;text-align:left;border:1px solid rgba(112,228,232,.14);border-radius:11px;background:#0a1a25;color:#c9dde4;font-size:10px;font-weight:850}
.yc-legal-link-card:hover,.yc-legal-link-card:focus-visible{border-color:rgba(112,228,232,.32);background:rgba(112,228,232,.08);color:#efffff;outline:none}.yc-legal-link-card .ico{width:22px;flex:0 0 22px;text-align:center;color:#9feff2}.yc-legal-link-card .copy{min-width:0}.yc-legal-link-card .copy strong,.yc-legal-link-card .copy small{display:block}.yc-legal-link-card .copy strong{font-size:10px}.yc-legal-link-card .copy small{margin-top:2px;color:#708b97;font-size:8px;font-weight:700}
.yc-legal-open-license{justify-self:start;border:1px solid rgba(112,228,232,.25);border-radius:9px;background:#102735;color:#c8f8fb;padding:9px 11px;font-weight:850}
.yc-legal-pending{display:grid;place-items:center;min-height:260px;text-align:center;padding:28px;border:1px dashed rgba(208,171,99,.35);border-radius:14px;background:rgba(208,171,99,.045)}.yc-legal-pending strong{display:block;color:#e0bf78;font-size:18px}.yc-legal-pending p{max-width:520px;margin:8px auto 0;color:#879faa;line-height:1.55}
.yc-legal-doc-meta{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px;color:#7895a1;font-size:10px}.yc-legal-doc-meta code{padding:3px 6px;border-radius:6px;background:#08141d;color:#a9cbd7}
.yc-legal-doc{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;font:11px/1.58 Consolas,'Cascadia Mono',monospace;color:#cfe1e6;background:#06121a;border:1px solid rgba(112,228,232,.13);border-radius:12px;padding:15px;tab-size:2}
.yc-legal-footer{margin-top:14px;padding-top:12px;border-top:1px solid rgba(112,228,232,.11);color:#647f8b;font-size:9px;text-align:center}
.yc-dev-legal-card{margin-top:12px;padding:12px 13px;border:1px solid rgba(112,228,232,.22);border-radius:10px;background:linear-gradient(135deg,rgba(19,46,60,.95),rgba(9,24,34,.97))}
.yc-dev-legal-card strong,.yc-dev-legal-card small{display:block}.yc-dev-legal-card strong{color:#dff7fa;font-size:12px}.yc-dev-legal-card small{margin-top:4px;color:#7897a4;font-size:10px;line-height:1.45}.yc-dev-legal-card button{margin-top:9px;border:1px solid rgba(112,228,232,.27);border-radius:8px;background:#0d2230;color:#bff8fb;padding:8px 10px;font-size:10px;font-weight:850}
.yc-developer-modal .yc-dev-grid{grid-template-columns:repeat(3,minmax(0,1fr));align-items:stretch}
.yc-developer-modal .yc-dev-info{min-width:0;display:flex;flex-direction:column;justify-content:center}
.yc-developer-modal .yc-dev-info strong{overflow-wrap:anywhere;word-break:break-word}
.yc-developer-modal .yc-dev-form-foot{min-width:0;flex-wrap:wrap}
.yc-developer-modal .yc-dev-form-foot>div{min-width:0}
@media(max-width:620px){.yc-developer-modal .yc-dev-grid{grid-template-columns:1fr}.yc-developer-modal .yc-dev-form-foot{align-items:stretch}.yc-developer-modal .yc-dev-form-foot>div{display:flex;align-items:center;gap:6px;flex-wrap:wrap}.yc-developer-modal .yc-dev-send{width:100%}}
@media (max-width:720px), (max-width:1100px) and (max-height:560px){.yc-legal-back{padding:max(8px,env(safe-area-inset-top)) max(8px,env(safe-area-inset-right)) max(8px,env(safe-area-inset-bottom)) max(8px,env(safe-area-inset-left))}.yc-legal-shell{height:calc(100dvh - max(16px,env(safe-area-inset-top) + env(safe-area-inset-bottom)));min-height:0;grid-template-columns:1fr;grid-template-rows:auto minmax(0,1fr);border-radius:14px}.yc-legal-nav{padding:10px;border-right:0;border-bottom:1px solid rgba(112,228,232,.13)}.yc-legal-brand{padding:2px 4px 8px}.yc-legal-brand small{display:none}.yc-legal-nav-list{display:flex;overflow-x:auto;overflow-y:hidden;gap:6px;padding:1px;scrollbar-width:none}.yc-legal-nav-list::-webkit-scrollbar{display:none}.yc-legal-nav-btn{flex:0 0 auto;width:auto;white-space:nowrap;padding:9px}.yc-legal-nav-btn .yc-legal-status{display:none}.yc-v3-user-actions #ycLegalAboutBtn{height:46px!important;min-height:46px!important;font-size:14px!important}.yc-legal-head{padding:11px 12px}.yc-legal-head h2{font-size:16px}.yc-legal-body{padding:12px}.yc-legal-grid,.yc-legal-links-grid{grid-template-columns:1fr}.yc-legal-hero{padding:14px}.yc-legal-hero h3{font-size:21px}.yc-legal-doc{font-size:10px;padding:12px}.yc-auth-legal-links{padding-bottom:max(2px,env(safe-area-inset-bottom))}}
</style>
<script id="ycLegalUiV1">
(()=>{
const DOCS=${docsJson};
const SECTIONS=[
 {id:'about',label:'O aplikaci',icon:'ⓘ'},
 {id:'terms',label:'Podmínky používání',icon:'§',doc:'terms'},
 {id:'privacy',label:'Ochrana osobních údajů',icon:'◈',doc:'privacy'},
 {id:'thirdParty',label:'Licence třetích stran',icon:'≡',doc:'thirdParty'},
 {id:'brand',label:'Informace o značce Yamachat',icon:'Y',doc:'brand'},
 {id:'provenance',label:'Původ projektu a assetů',icon:'◇',doc:'provenance'},
 {id:'baseline',label:'Právní baseline',icon:'✓',doc:'baseline'}
];
let active='about';
function root(){
 let r=document.getElementById('ycLegalPortal');
 if(!r){r=document.createElement('div');r.id='ycLegalPortal';document.body.appendChild(r)}
 return r
}
function close(){const r=root();if(r&&r.querySelector('.yc-legal-back'))r.innerHTML=''}
function sectionById(id){return SECTIONS.find(x=>x.id===id)||SECTIONS[0]}
function navHtml(){return SECTIONS.map(s=>'<button type="button" class="yc-legal-nav-btn '+(s.id===active?'active ':'')+(s.pending?'pending':'')+'" data-yc-legal-section="'+s.id+'"><span>'+s.icon+'</span><span>'+s.label+'</span><span class="yc-legal-status">'+(s.pending?'Připravuje se':'')+'</span></button>').join('')}
function shell(){
 const r=root();if(!r)return null;
 r.innerHTML='<div class="yc-legal-back"><section id="ycLegalDialog" class="yc-legal-shell" role="dialog" aria-modal="true" aria-labelledby="ycLegalTitle"><aside class="yc-legal-nav"><div class="yc-legal-brand"><strong>Yamachat</strong><small>O aplikaci / Právní informace</small></div><div class="yc-legal-nav-list">'+navHtml()+'</div></aside><main class="yc-legal-main"><header class="yc-legal-head"><h2 id="ycLegalTitle">Právní informace</h2><button type="button" class="yc-legal-close" data-yc-legal-close aria-label="Zavřít">×</button></header><div id="ycLegalBody" class="yc-legal-body"></div></main></section></div>';
 const back=r.querySelector('.yc-legal-back');back?.addEventListener('mousedown',e=>{if(e.target===back)close()});
 render();queueMicrotask(()=>r.querySelector('.yc-legal-close')?.focus());return r
}
function render(){
 const r=root();if(!r)return;const body=r.querySelector('#ycLegalBody');if(!body)return;
 r.querySelectorAll('[data-yc-legal-section]').forEach(b=>b.classList.toggle('active',b.dataset.ycLegalSection===active));
 const s=sectionById(active);const title=r.querySelector('#ycLegalTitle');if(title)title.textContent=s.label;
 if(active==='about'){
   body.innerHTML='<div class="yc-legal-hero"><span class="yc-legal-badge">🛡 Yamachat — proprietární projekt</span><div><h3>Yamachat</h3><div style="color:#88a8b5;font-size:12px;margin-top:4px">Proprietární software</div></div><div class="yc-legal-grid"><div class="yc-legal-info"><small>Vlastník / provozovatel projektu</small><strong>Lukáš Hubáček</strong></div><div class="yc-legal-info"><small>Kontakt</small><strong>hubygo@gmail.com</strong></div><div class="yc-legal-info"><small>Copyright</small><strong>© 2026 Lukáš Hubáček</strong></div><div class="yc-legal-info"><small>Právní baseline</small><strong>v1.0</strong></div></div><div class="yc-legal-signature"><span>✓</span><div><strong>Digitálně podepsaná právní baseline – podpis ověřen</strong><small>Ověření se vztahuje k podepsanému tagu legal-baseline-2026-09-27.</small></div></div><div class="yc-legal-note">Podepsaný tag <code>legal-baseline-2026-09-27</code> slouží k ověření integrity označeného baseline snapshotu a identity signatáře. Nejde o právní certifikaci ani právní ověření obsahu.</div><div class="yc-legal-links-title">Právní dokumenty</div><div class="yc-legal-links-grid"><button type="button" class="yc-legal-link-card" data-yc-legal-doc="license"><span class="ico">§</span><span class="copy"><strong>Licence Yamachat</strong><small>Proprietární licence</small></span></button><button type="button" class="yc-legal-link-card" data-yc-legal-section="terms"><span class="ico">§</span><span class="copy"><strong>Podmínky používání</strong><small>TERMS_OF_USE.md</small></span></button><button type="button" class="yc-legal-link-card" data-yc-legal-section="privacy"><span class="ico">◈</span><span class="copy"><strong>Ochrana osobních údajů</strong><small>PRIVACY_POLICY.md</small></span></button><button type="button" class="yc-legal-link-card" data-yc-legal-section="thirdParty"><span class="ico">≡</span><span class="copy"><strong>Licence třetích stran</strong><small>THIRD_PARTY_NOTICES.md</small></span></button><button type="button" class="yc-legal-link-card" data-yc-legal-section="brand"><span class="ico">Y</span><span class="copy"><strong>Informace o značce</strong><small>BRAND-NOTICE.md</small></span></button><button type="button" class="yc-legal-link-card" data-yc-legal-section="provenance"><span class="ico">◇</span><span class="copy"><strong>Původ projektu a assetů</strong><small>PROVENANCE + ASSET-MANIFEST</small></span></button><button type="button" class="yc-legal-link-card" data-yc-legal-section="baseline"><span class="ico">✓</span><span class="copy"><strong>Právní baseline</strong><small>LEGAL-BASELINE.md</small></span></button></div></div><div class="yc-legal-footer">© 2026 Lukáš Hubáček. Všechna práva vyhrazena.</div>';return
 }
 if(s.pending){body.innerHTML='<div class="yc-legal-pending"><div><strong>Připravuje se</strong><p>'+s.label+' zatím není v repozitáři vedena jako finální dokument. Yamachat zde proto nezobrazuje vymyšlený obsah ani falešný odkaz.</p></div></div><div class="yc-legal-footer">© 2026 Lukáš Hubáček. Všechna práva vyhrazena.</div>';return}
 renderDoc(s.doc)
}
function renderDoc(key){
 const d=DOCS[key];const body=root()?.querySelector('#ycLegalBody');if(!body||!d)return;
 body.innerHTML='<div class="yc-legal-doc-meta"><strong>'+d.title+'</strong><span>Zdroj:</span><code>'+d.file+'</code></div><pre class="yc-legal-doc"></pre><div class="yc-legal-footer">© 2026 Lukáš Hubáček. Všechna práva vyhrazena.</div>';body.querySelector('.yc-legal-doc').textContent=d.text
}
function closeNavigationSurfaces(){
 try{document.activeElement?.blur?.()}catch{}
 document.getElementById('ycGlobalNav')?.classList.remove('yc-mobile-open');
 document.getElementById('side')?.classList.remove('mobile-open');
 document.querySelector('.yc-v3-content-grid>.right')?.classList.remove('yc-mobile-open');
 document.getElementById('app')?.classList.remove('yc-mobile-drawer-open');
 document.querySelectorAll('[aria-controls][aria-expanded]').forEach(b=>b.setAttribute('aria-expanded','false'));
 try{document.documentElement.scrollLeft=0;document.body.scrollLeft=0;window.scrollTo(0,window.scrollY||0)}catch{}
}
function open(section='about'){active=sectionById(section).id;closeNavigationSurfaces();shell()}
document.addEventListener('click',e=>{
 const section=e.target.closest?.('[data-yc-legal-section]');if(section){active=section.dataset.ycLegalSection;render();return}
 const doc=e.target.closest?.('[data-yc-legal-doc]');if(doc){renderDoc(doc.dataset.ycLegalDoc);return}
 if(e.target.closest?.('[data-yc-legal-close]')){close();return}
 if(e.target.closest?.('#ycLegalAboutBtn,#ycDevLegalOpen')){open('about');return}
 const auth=e.target.closest?.('[data-yc-auth-legal]');if(auth){open(auth.dataset.ycAuthLegal);return}
},true);
document.addEventListener('keydown',e=>{
 const dialog=root()?.querySelector('#ycLegalDialog');if(!dialog)return;if(e.key==='Escape'){e.preventDefault();close();return}if(e.key!=='Tab')return;
 const focus=[...dialog.querySelectorAll('button:not([disabled]),[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')].filter(x=>!x.hidden);if(!focus.length)return;const first=focus[0],last=focus[focus.length-1];
 if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}
},true);
window.YamachatLegalUI=Object.freeze({open,close});
})();
</script>`
}

export function withLegalUi(html){
 if(html.includes('id="ycLegalUiV1"'))return html;
 html=html.replace('<button id="logoutBtn" class="ghost">Odhlásit</button>','<button id="ycLegalAboutBtn" class="yc-v3-nav-btn yc-legal-nav-entry" type="button" aria-label="O aplikaci"><span class="ico">ⓘ</span><span>O aplikaci</span></button>\n    <button id="logoutBtn" class="ghost">Odhlásit</button>');
 html=html.replace("for(const id of ['profileBtn','appSettingsBtn','logoutBtn'])","for(const id of ['profileBtn','appSettingsBtn','ycLegalAboutBtn','logoutBtn'])");
 const navRegistryBefore="    ['appSettingsBtn','⚙','Nastavení'],\n    ['logoutBtn','↪','Odhlásit']";
 const navRegistryAfter="    ['appSettingsBtn','⚙','Nastavení'],\n    ['ycLegalAboutBtn','ⓘ','O aplikaci'],\n    ['logoutBtn','↪','Odhlásit']";
 if(!html.includes(navRegistryBefore))throw Error('Legal UI: final nav registry boundary not found');
 html=html.replace(navRegistryBefore,navRegistryAfter);
 html=html.replace('<button id="ycForgotPassword" type="button" style="display:block;width:100%;border:0;background:transparent;text-align:center;margin-top:14px;font-size:13px;color:inherit;cursor:pointer">Zapomenuté heslo?</button>','<button id="ycForgotPassword" type="button" style="display:block;width:100%;border:0;background:transparent;text-align:center;margin-top:14px;font-size:13px;color:inherit;cursor:pointer">Zapomenuté heslo?</button><div class="yc-auth-legal-links" aria-label="Právní odkazy"><button type="button" data-yc-auth-legal="terms" aria-label="Podmínky používání">Podmínky</button><span aria-hidden="true">•</span><button type="button" data-yc-auth-legal="privacy" aria-label="Ochrana osobních údajů">Soukromí</button></div>');
 html=html.replace(/<div class="yc-dev-info"><small>Věk<\/small><strong>33 let<\/strong><\/div>/g,'');
 html=html.replace('<div class="yc-dev-info"><small>Projekt</small><strong>Yamachat</strong></div></div><div class="yc-dev-section"><h4>Kontaktovat vývojáře</h4>','<div class="yc-dev-info"><small>Projekt</small><strong>Yamachat</strong></div></div><div class="yc-dev-legal-card"><strong>🛡 Yamachat — proprietární projekt</strong><small>© 2026 Lukáš Hubáček<br>✓ Digitálně podepsaná právní baseline – podpis ověřen</small><button id="ycDevLegalOpen" type="button">Zobrazit právní informace</button></div><div class="yc-dev-section"><h4>Kontaktovat vývojáře</h4>');
 if(!html.includes('id="ycLegalAboutBtn"'))throw Error('Legal UI: About button boundary not found');
 if(!html.includes('data-yc-auth-legal="terms"'))throw Error('Legal UI: auth legal boundary not found');
 if(html.includes('<small>Věk</small><strong>33 let</strong>'))throw Error('Legal UI: developer age must not remain');
 if(!html.includes('id="ycDevLegalOpen"'))throw Error('Legal UI: developer legal card boundary not found');
 if(!html.includes("['ycLegalAboutBtn','ⓘ','O aplikaci']"))throw Error('Legal UI: About missing from final nav registry');
 return html.replace('</body>',legalRuntime()+'\n</body>')
}
