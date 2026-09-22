import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const ref='reference/desktop-1.0.78/';
for(const [file,hash] of Object.entries(JSON.parse(read(ref+'SHA256.json')))){
  if(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,ref,file))).digest('hex')!==hash)throw Error('Desktop reference changed: '+file);
}
const shell=read(ref+'desktop.html');
const between=(a,b)=>{const start=shell.indexOf(a),end=shell.indexOf(b,start);if(start<0||end<0)throw Error('Missing desktop boundary');return shell.slice(start,end)};
let appearance=between('    const YC_DESKTOP_DEFAULT_THEME','    function updateMaximizeButton')+between('    function installDesktopFullThemeStyle','    async function sendAppSettingsState');
appearance=appearance.replaceAll('Vzhled desktopu uložen jen pro desktop.','Vzhled uložen na tomto zařízení.').replaceAll('Vzhled desktopu','Vzhled aplikace').replaceAll('Osobní barva celého Yamachatu v desktopové aplikaci. Ukládá se lokálně a nezasahuje do webu.','Osobní barva Yamachatu uložená na tomto zařízení.').replaceAll('Tato barva je pouze pro desktop na tomto počítači. Web ani barva serveru se tím nemění.','Tato barva platí pro tento prohlížeč nebo telefon. Barva serveru se tím nemění.');
appearance=`(()=>{\nconst iframe={contentWindow:window,contentDocument:document};\n${read('web/settings-storage.js')}\n${appearance}\nwindow.openDesktopServerCardBackgroundModal=openDesktopServerCardBackgroundModal;\nwindow.decorateDesktopServerCards=decorateDesktopServerCards;\nwindow.YamachatDesktopAppearance=Object.freeze({loadTheme:async userId=>{await desktopAppearanceLoaded;await loadDesktopThemeColor({userId});return desktopThemeColor},saveTheme:saveDesktopThemeColor,prepare:async()=>{await desktopAppearanceLoaded;installYamachatBranding()}});\n})();`;
let html=read(ref+'desktop-client.html');
// Replace the desktop's legacy mobile drawer implementation only in generated web output.
html=html.replace(/\/\/ Integrated extension: ycMobileV3022Script[\s\S]*?(?=\/\/ Integrated extension: ycBrandCleanupV3025Script)/,'// Mobile controls supplied by web/mobile.js.\n');
html=html.replace('./node_modules/@supabase/supabase-js/dist/umd/supabase.js','./vendor/supabase.js');
html=html.replace('<script type="module">','<script>'+appearance+'</script>\n<script type="module">');
const bootstrap="await window.parent?.YamachatDesktopAppearance?.prepare('');";
if(!html.includes(bootstrap))throw Error('Missing bootstrap boundary');
html=html.replace(bootstrap,read('web/integration.js')+'\n'+read('web/downloads.js')+'\n'+read('web/native-integration.js')+'\n'+bootstrap);
html=html.replace('</head>','<link rel="manifest" href="./manifest.webmanifest">\n<link rel="icon" href="./favicon.ico">\n</head>');
html=html.replace('</body>','<style id="ycResponsiveAdaptation">'+read('web/responsive.css')+'\n'+read('web/mobile.css')+'</style>\n<script>'+read('web/mobile.js')+'</script>\n</body>');
fs.writeFileSync(path.join(root,'index.html'),html);
console.log('Web generated from verified, unchanged desktop 1.0.78.');
