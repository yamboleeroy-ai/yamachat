import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'update-manifest.json'),'utf8'));

const windowsVersion=String(manifest?.windows?.latestVersion||'').trim();
const windowsUrl=String(manifest?.windows?.installerUrl||'').trim();
const androidUrl=String(manifest?.android?.apkUrl||'').trim();
if(!/^\d+\.\d+\.\d+$/.test(windowsVersion))throw Error('Platform UI: invalid Windows version in update-manifest.json');
if(!/^https:\/\/updates\.yamachat\.eu\/windows\//i.test(windowsUrl))throw Error('Platform UI: invalid Windows installer URL in update-manifest.json');
if(!/^https:\/\/updates\.yamachat\.eu\/android\/Yamachat-Android(?:-\d+)?\.apk(?:\?v=\d+)?$/i.test(androidUrl))throw Error('Platform UI: invalid Android Cloudflare APK URL in update-manifest.json');

const platforms=Object.freeze({
  windows:{
    id:'windows',icon:'⊞',label:'Windows',eyebrow:'Windows aplikace',
    title:'Yamachat pro Windows',
    text:'Samostatná desktopová aplikace Yamachat pro Windows. Instalační balíček je distribuovaný přes oficiální Yamachat Cloudflare úložiště.',
    steps:['Stáhni aktuální instalační balíček pouze z tohoto oficiálního odkazu.','Spusť instalátor Yamachat a dokonči instalaci.','Přihlas se stejným Yamachat účtem.'],
    action:'Stáhnout Windows aplikaci',
    url:windowsUrl,
    note:`Aktuální Windows release: ${windowsVersion}. Windows build zatím nemá code-signing podpis. Prohlížeč nebo Microsoft Defender SmartScreen proto může při stažení nebo prvním spuštění zobrazit varování o neznámé či málo používané aplikaci. Samotné takové varování neznamená, že soubor je virus; před pokračováním vždy ověř, že soubor pochází z domény updates.yamachat.eu.`
  },
  android:{
    id:'android',icon:'◉',label:'Android',eyebrow:'Android APK',
    title:'Yamachat pro Android',
    text:'Yamachat je pro Android distribuovaný jako APK. Není vydaný přes Google Play.',
    steps:['Stáhni oficiální Yamachat APK.','Android může požádat o povolení instalace z tohoto zdroje.','Po instalaci aplikaci otevři a přihlas se.'],
    action:'Stáhnout Android APK',
    url:androidUrl,
    note:manifest?.android?.latestVersion?`Aktuální Android verze: ${manifest.android.latestVersion}`:'Oficiální Android APK'
  },
  web:{
    id:'web',icon:'◎',label:'Web',eyebrow:'Web v prohlížeči',
    title:'Yamachat ve webu',
    text:'Yamachat můžeš používat přímo na yamachat.eu bez instalace dalšího programu.',
    steps:['Otevři yamachat.eu v běžném moderním prohlížeči.','Přihlas se stejným Yamachat účtem jako v ostatních klientech.','Web můžeš používat přímo v kartě prohlížeče.'],
    action:'Otevřít Yamachat Web',
    url:'https://yamachat.eu/',
    note:'Přímé použití v prohlížeči bez instalace'
  },
  pwa:{
    id:'pwa',icon:'▤',label:'Web app',eyebrow:'Instalovatelná webová aplikace',
    title:'Yamachat jako webová aplikace',
    text:'Na počítači můžeš yamachat.eu nainstalovat jako samostatnou webovou aplikaci (PWA), která se potom otevírá ve vlastním okně.',
    steps:['Otevři yamachat.eu v podporovaném prohlížeči, například Microsoft Edge nebo Google Chrome.','V nabídce / nastavení prohlížeče otevři Aplikace a zvol „Nainstalovat Yamachat“, „Nainstalovat tento web jako aplikaci“ nebo obdobnou volbu; přesný název se může podle prohlížeče lišit.','Potvrď instalaci. Yamachat se potom objeví mezi aplikacemi a používá stejný účet jako web, Windows i mobilní verze.'],
    action:'Otevřít yamachat.eu',
    url:'https://yamachat.eu/',
    note:'Nabídka prohlížeče → Aplikace → nainstalovat tento web jako aplikaci'
  },
  ios:{
    id:'ios',icon:'▣',label:'iOS / PWA',eyebrow:'iPhone / iPad',
    title:'Yamachat na iPhonu a iPadu',
    text:'Na iOS se Yamachat používá jako webová aplikace / PWA. Veřejná aplikace v App Store není součástí současné distribuce.',
    steps:['Otevři https://yamachat.eu v Safari.','Klepni na Sdílet.','Zvol „Přidat na plochu“ a potvrď.'],
    action:'Otevřít yamachat.eu',
    url:'https://yamachat.eu/',
    note:'Safari → Sdílet → Přidat na plochu'
  }
});

function runtime(){
  const data=JSON.stringify(platforms).replaceAll('<','\\u003c').replaceAll('>','\\u003e').replaceAll('&','\\u0026');
  return `
<style id="ycPlatformInstallStyle">
.yc-platform-login{margin:10px 0 2px;padding:10px;border:1px solid rgba(112,228,232,.13);border-radius:12px;background:linear-gradient(145deg,rgba(12,31,43,.72),rgba(7,20,29,.5))}
.yc-platform-login-title{margin:0 0 7px;text-align:center;color:#718d99;font-size:9px;font-weight:900;letter-spacing:.10em;text-transform:uppercase}
.yc-platform-login-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:6px}
.yc-platform-login-btn{min-width:0;min-height:45px;border:1px solid rgba(112,228,232,.12);border-radius:9px;background:#0b1d29;color:#9fb8c3;display:flex;align-items:center;justify-content:center;gap:6px;padding:7px 5px;font:inherit;cursor:pointer;touch-action:manipulation}
.yc-platform-login-btn:hover,.yc-platform-login-btn:focus-visible{border-color:rgba(112,228,232,.35);background:rgba(112,228,232,.09);color:#efffff;outline:2px solid rgba(112,228,232,.48);outline-offset:1px}
.yc-platform-login-icon{display:grid;place-items:center;width:20px;height:20px;flex:0 0 20px;border:1px solid rgba(112,228,232,.18);border-radius:6px;color:#a7eff2;background:rgba(112,228,232,.06);font-size:13px;font-weight:900}
.yc-platform-login-label{min-width:0;font-size:9px;font-weight:850;line-height:1.15;white-space:normal}
.yc-platform-back{position:fixed;inset:0;width:100vw;max-width:100vw;box-sizing:border-box;overflow:hidden;z-index:11150;display:grid;place-items:center;padding:max(14px,env(safe-area-inset-top)) max(14px,env(safe-area-inset-right)) max(14px,env(safe-area-inset-bottom)) max(14px,env(safe-area-inset-left));background:rgba(2,7,12,.82);backdrop-filter:blur(8px)}
.yc-platform-dialog{width:min(520px,100%);max-width:100%;max-height:calc(100dvh - 28px);overflow:hidden;display:flex;flex-direction:column;border:1px solid rgba(112,228,232,.25);border-radius:16px;background:linear-gradient(145deg,#0c202c,#07121b 74%);box-shadow:0 26px 80px rgba(0,0,0,.62),inset 0 1px 0 rgba(255,255,255,.035);color:#e8f5f7}
.yc-platform-head{display:flex;align-items:center;gap:10px;padding:14px 15px;border-bottom:1px solid rgba(112,228,232,.13)}
.yc-platform-mark{display:grid;place-items:center;width:38px;height:38px;flex:0 0 38px;border:1px solid rgba(112,228,232,.25);border-radius:11px;background:rgba(112,228,232,.08);color:#b8f7fa;font-size:20px;font-weight:950}
.yc-platform-heading{min-width:0;flex:1}.yc-platform-heading small,.yc-platform-heading strong{display:block}.yc-platform-heading small{color:#718f9d;font-size:9px;font-weight:900;letter-spacing:.09em;text-transform:uppercase}.yc-platform-heading strong{margin-top:2px;color:#f0fdff;font-size:16px}
.yc-platform-close{width:35px;height:35px;flex:0 0 35px;border:1px solid rgba(112,228,232,.17);border-radius:10px;background:#0a1b26;color:#a8c0ca;font-size:19px}
.yc-platform-body{min-width:0;overflow-x:hidden;overflow-y:auto;padding:16px}.yc-platform-body p{margin:0;color:#a7bcc5;font-size:12px;line-height:1.58}
.yc-platform-steps{display:grid;gap:8px;margin:14px 0}.yc-platform-step{display:grid;grid-template-columns:25px minmax(0,1fr);gap:9px;align-items:start;padding:10px;border:1px solid rgba(112,228,232,.11);border-radius:10px;background:#091923;color:#c9dce2;font-size:11px;line-height:1.45}
.yc-platform-step b{display:grid;place-items:center;width:25px;height:25px;border-radius:8px;background:rgba(112,228,232,.10);color:#9ceff2}
.yc-platform-note{margin-top:10px;padding:9px 10px;border-left:3px solid rgba(112,228,232,.55);border-radius:8px;background:rgba(112,228,232,.05);color:#7897a4;font-size:10px;line-height:1.45}
.yc-platform-action{display:flex;align-items:center;justify-content:center;min-height:44px;margin-top:14px;border:1px solid rgba(112,228,232,.34);border-radius:10px;background:linear-gradient(180deg,rgba(25,64,79,.98),rgba(10,35,48,.98));color:#e7fcff;text-decoration:none;font-size:11px;font-weight:900;touch-action:manipulation}
.yc-platform-action:hover,.yc-platform-action:focus-visible{border-color:#83edf2;box-shadow:0 0 18px rgba(112,228,232,.11);outline:2px solid rgba(112,228,232,.32);outline-offset:2px}
.yc-platform-distribution{margin-top:9px;color:#637f8b;font-size:9px;text-align:center;line-height:1.45}
@media(max-width:460px){.yc-platform-login-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.yc-platform-login-btn{min-height:42px}}@media(max-width:340px){.yc-platform-login-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.yc-platform-dialog{border-radius:13px}.yc-platform-body{padding:13px}}
@media(max-height:560px){.yc-platform-back{place-items:stretch center;padding:7px max(8px,env(safe-area-inset-right)) 7px max(8px,env(safe-area-inset-left))}.yc-platform-dialog{max-height:calc(100dvh - 14px)}.yc-platform-head{padding:10px 12px}.yc-platform-body{padding:11px}.yc-platform-steps{margin:10px 0;gap:6px}.yc-platform-step{padding:8px}}
</style>
<script id="ycPlatformInstallRuntime">
(()=>{
const PLATFORMS=${data};
function portal(){
 let root=document.getElementById('ycPlatformPortal');
 if(!root){root=document.createElement('div');root.id='ycPlatformPortal';document.body.appendChild(root)}
 return root;
}
function close(){const root=document.getElementById('ycPlatformPortal');if(root)root.innerHTML=''}
function open(id){
 const p=PLATFORMS[id];if(!p)return;
 try{document.activeElement?.blur?.()}catch{}
 const root=portal();
 const steps=p.steps.map((x,i)=>'<div class="yc-platform-step"><b>'+(i+1)+'</b><span>'+x+'</span></div>').join('');
 root.innerHTML='<div class="yc-platform-back"><section class="yc-platform-dialog" role="dialog" aria-modal="true" aria-labelledby="ycPlatformTitle"><header class="yc-platform-head"><span class="yc-platform-mark">'+p.icon+'</span><div class="yc-platform-heading"><small>'+p.eyebrow+'</small><strong id="ycPlatformTitle">'+p.title+'</strong></div><button type="button" class="yc-platform-close" data-yc-platform-close aria-label="Zavřít">×</button></header><div class="yc-platform-body"><p>'+p.text+'</p><div class="yc-platform-steps">'+steps+'</div><div class="yc-platform-note">'+p.note+'</div><a class="yc-platform-action" href="'+p.url+'" target="_blank" rel="noopener noreferrer">'+p.action+'</a><div class="yc-platform-distribution">Pouze oficiální instalační cesta Yamachatu. Zobrazují se jen aktuálně ověřené distribuční možnosti této platformy.</div></div></section></div>';
 const back=root.querySelector('.yc-platform-back');back?.addEventListener('pointerdown',e=>{if(e.target===back)close()});
 queueMicrotask(()=>root.querySelector('.yc-platform-close')?.focus());
}
document.addEventListener('click',e=>{
 const b=e.target.closest?.('[data-yc-platform]');if(b){e.preventDefault();open(b.dataset.ycPlatform);return}
 if(e.target.closest?.('[data-yc-platform-close]')){e.preventDefault();close()}
},true);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&document.querySelector('#ycPlatformPortal .yc-platform-dialog')){e.preventDefault();close()}},true);
window.YamachatPlatformInstall=Object.freeze({open,close,platforms:PLATFORMS});
})();
</script>`;
}

export function withPlatformInstallUi(html){
 if(html.includes('id="ycPlatformInstallRuntime"'))return html;
 const legal='<div class="yc-auth-legal-links" aria-label="Právní odkazy">';
 if(!html.includes(legal))throw Error('Platform UI: legal links boundary missing');
 const row='<div class="yc-platform-login" aria-label="Yamachat platformy"><div class="yc-platform-login-title">Dostupné platformy</div><div class="yc-platform-login-grid">'+
   Object.values(platforms).map(p=>'<button type="button" class="yc-platform-login-btn" data-yc-platform="'+p.id+'" aria-label="'+p.label+'"><span class="yc-platform-login-icon">'+p.icon+'</span><span class="yc-platform-login-label">'+p.label+'</span></button>').join('')+
   '</div></div>';
 html=html.replace(legal,row+legal);
 return html.replace('</body>',runtime()+'\n</body>');
}
