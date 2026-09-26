import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {withProfileActions} from './profile-actions.mjs';
import {withPasswordRecovery,buildPasswordRecovery} from './password-recovery.mjs';
import {withAccountMessages} from './account-messages.mjs';
import {withServerNavigation} from './server-navigation.mjs';
import {withServerThumbnails} from './server-thumbnails.mjs';
import {withActiveServerGlow} from './active-server-glow.mjs';
import {withServerCardContext} from './server-card-context.mjs';
import {withFriendsPanelRefresh} from './friends-panel-refresh.mjs';
import {withVoiceThemePolish} from './voice-theme-polish.mjs';
import {withVoiceExperience} from './voice-experience.mjs';
import {withMessageNotificationSound} from './message-notification-sound.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const ref='reference/desktop-1.0.78/';

for(const [file,hash] of Object.entries(JSON.parse(read(ref+'SHA256.json')))){
  const actual=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,ref,file))).digest('hex');
  if(actual!==hash)throw Error('Desktop reference changed: '+file);
}

const shell=read(ref+'desktop.html');
const between=(a,b)=>{
  const start=shell.indexOf(a),end=shell.indexOf(b,start);
  if(start<0||end<0)throw Error('Missing desktop boundary');
  return shell.slice(start,end);
};

let appearance=
  between('    const YC_DESKTOP_DEFAULT_THEME','    function updateMaximizeButton')+
  between('    function installDesktopFullThemeStyle','    async function sendAppSettingsState');

appearance=appearance
  .replaceAll('Vzhled desktopu uložen jen pro desktop.','Vzhled uložen na tomto zařízení.')
  .replaceAll('Vzhled desktopu','Vzhled aplikace')
  .replaceAll(
    'Osobní barva celého Yamachatu v desktopové aplikaci. Ukládá se lokálně a nezasahuje do webu.',
    'Osobní barva Yamachatu uložená na tomto zařízení.'
  )
  .replaceAll(
    'Tato barva je pouze pro desktop na tomto počítači. Web ani barva serveru se tím nemění.',
    'Tato barva platí pro tento prohlížeč nebo telefon. Barva serveru se tím nemění.'
  );

appearance=`(()=>{
const iframe={contentWindow:window,contentDocument:document};
${read('web/settings-storage.js')}
${appearance}
const ycWebAppearanceDeadline=(task,fallback=null,ms=2000)=>{
  let timer;
  return Promise.race([
    Promise.resolve(task).catch(error=>{console.warn('Web appearance',error);return fallback}),
    new Promise(resolve=>{timer=setTimeout(()=>resolve(fallback),ms)})
  ]).finally(()=>clearTimeout(timer));
};
window.openDesktopServerCardBackgroundModal=openDesktopServerCardBackgroundModal;
window.decorateDesktopServerCards=decorateDesktopServerCards;
window.YamachatDesktopAppearance=Object.freeze({
  loadTheme:async userId=>{
    await ycWebAppearanceDeadline(desktopAppearanceLoaded);
    await ycWebAppearanceDeadline(loadDesktopThemeColor({userId}));
    return desktopThemeColor;
  },
  saveTheme:saveDesktopThemeColor,
  prepare:async()=>{
    await ycWebAppearanceDeadline(desktopAppearanceLoaded);
    installYamachatBranding();
  }
});
})();`;

buildPasswordRecovery(read(ref+'desktop-client.html'),root);
let html=withFriendsPanelRefresh(withServerCardContext(withServerNavigation(withServerThumbnails(withActiveServerGlow(withAccountMessages(withPasswordRecovery(withProfileActions(read(ref+'desktop-client.html')))))))));

// Desktop remains the source of truth. Only generated web/mobile output receives
// browser/native adapters; the files under reference/desktop-1.0.78 are never patched here.
html=html.replace(
  /\/\/ Integrated extension: ycMobileV3022Script[\s\S]*?(?=\/\/ Integrated extension: ycBrandCleanupV3025Script)/,
  '// Mobile controls supplied by web/mobile.js.\n'
);

html=html.replace(
  './node_modules/@supabase/supabase-js/dist/umd/supabase.js',
  './vendor/supabase.js'
);

// The boot watchdog is a web/mobile safety layer. Keep the desktop boot behaviour intact
// and only add watchdog notifications around it in generated output.
if(!html.includes('<script src="./boot-guard.js"></script>')){
  html=html.replace(
    '<script src="./vendor/supabase.js"></script>',
    '<script src="./boot-guard.js"></script>\n<script src="./vendor/supabase.js"></script>'
  );
}
if(!html.includes("function ycRevealApp(){window.YamachatBootGuard?.ready();")){
  html=html.replace(
    "function ycRevealApp(){$('auth').classList.add('hidden');",
    "function ycRevealApp(){window.YamachatBootGuard?.ready();$('auth').classList.add('hidden');"
  );
}
if(!html.includes("function showAuth(){window.YamachatBootGuard?.ready();")){
  html=html.replace(
    'function showAuth(){++ycAuthGeneration;',
    'function showAuth(){window.YamachatBootGuard?.ready();++ycAuthGeneration;'
  );
}
if(!html.includes("async function initApp(s){\n  window.YamachatBootGuard?.begin();")){
  html=html.replace(
    'async function initApp(s){\n  const generation=',
    'async function initApp(s){\n  window.YamachatBootGuard?.begin();\n  const generation='
  );
}

html=html.replace(
  '<script type="module">',
  '<script>'+appearance+'</script>\n<script type="module">'
);

const bootstrap="await window.parent?.YamachatDesktopAppearance?.prepare('');";
if(!html.includes(bootstrap))throw Error('Missing bootstrap boundary');

html=html.replace(
  bootstrap,
  read('web/integration.js')+'\n'+
  read('web/downloads.js')+'\n'+
  read('web/native-integration.js')+'\n'+
  bootstrap
);

html=html.replace(
  '</head>',
  '<meta name="apple-mobile-web-app-capable" content="yes">\n'+
  '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">\n'+
  '<meta name="mobile-web-app-capable" content="yes">\n'+
  '<link rel="manifest" href="./manifest.webmanifest">\n'+
  '<link rel="icon" href="./favicon.ico">\n</head>'
);

html=html.replace(
  '</body>',
  '<style id="ycResponsiveAdaptation">'+
  read('web/responsive.css')+'\n'+
  read('web/mobile.css')+
  '</style>\n<script>'+read('web/mobile.js')+'</script>\n</body>'
);

// Final visual override must run after responsive/mobile CSS so old fixed cyan
// scrollbar and voice-dock rules cannot win the cascade.
html=withVoiceThemePolish(withMessageNotificationSound(withVoiceExperience(html)));

fs.writeFileSync(path.join(root,'index.html'),html);
console.log('Web generated from verified desktop 1.0.78 reference; desktop files were not modified.');

