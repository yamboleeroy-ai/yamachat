import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const mobileDir = path.resolve(here, '..');
const repoRoot = path.resolve(mobileDir, '..');
const out = path.join(mobileDir, 'www');

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

function copy(src, dst) {
  const from = path.join(repoRoot, src);
  const to = path.join(out, dst || src);
  if (!fs.existsSync(from)) return;
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.cpSync(from, to, { recursive: true });
}

copy('icons');
copy('audio');
copy('manifest.webmanifest');
copy('favicon.ico');
copy('download');
copy('sw.js');

let html = fs.readFileSync(path.join(repoRoot, 'index.html'), 'utf8');

// Capacitor loads the bundled app from https://localhost. Absolute root URLs in the
// web build would therefore point at the native localhost origin. Keep app assets
// relative so the same HTML works inside the APK.
html = html.replace(/(["'(=])\/(icons|audio)\//g, '$1./$2/');

// Android WebView login hardening. Keep the website unchanged: first try the
// password exactly as entered; only after invalid_credentials retry without
// accidental leading/trailing whitespace that can be introduced by mobile paste/autofill.
html = html.replace(
  "const {error}=await sb.auth.signInWithPassword({email,password});if(error)throw error",
  "let {error}=await sb.auth.signInWithPassword({email,password});if(error?.code==='invalid_credentials'){const clean=password.replace(/^[\\s\\u00a0\\u200b]+|[\\s\\u00a0\\u200b]+$/g,'');if(clean!==password)({error}=await sb.auth.signInWithPassword({email,password:clean}))}if(error)throw error"
);


// The native shell should not link back to its own download page.
html = html.replace(/<a[^>]+class=["'][^"']*yc-mobile-download-link[^"']*["'][\s\S]*?<\/a>/gi, '');

// Keep the web service-worker block intact. The previous native regex removed only
// part of that JavaScript statement and could leave the bundled index.html with
// invalid syntax, which stopped boot before the login screen. Unsupported service
// workers already fail safely through the web app's existing feature check/catch.

const bridgeTag = '<script src="./native-bridge.js"></script>';
if (!html.includes(bridgeTag)) html = html.replace('</body>', bridgeTag + '\n</body>');

const nativeCss = `
<style id="ycNativeMobileStyle">
html.yc-native-app,html.yc-native-app body{height:100dvh!important;overscroll-behavior:none!important}
html.yc-native-app body{padding-top:env(safe-area-inset-top);background:#071019!important}
html.yc-native-app .yc-v3-workspace{height:calc(100dvh - env(safe-area-inset-top))!important}
html.yc-native-app .yc-mobile-download-link{display:none!important}
html.yc-native-keyboard-open .yc-v3-ribbon{display:none!important}
html.yc-native-keyboard-open .yc-v3-workspace{grid-template-rows:54px minmax(0,1fr) 0!important}
html.yc-native-keyboard-open .yc-v3-voice-host{display:none!important}
</style>`;
const nativeDiagnostics = `
<script id="ycNativeBootDiagnostics">
window.addEventListener('error',function(e){
  var s=document.querySelector('#ycBootSplash small');
  if(s) s.textContent='Chyba při spuštění: '+(e.message||'neznámá chyba');
});
window.addEventListener('unhandledrejection',function(e){
  var s=document.querySelector('#ycBootSplash small');
  var m=e.reason&&e.reason.message?e.reason.message:String(e.reason||'neznámá chyba');
  if(s) s.textContent='Chyba při spuštění: '+m;
});
</script>`;

const nativeLoginHelpers = `
<style>
#ycNativePasswordToggle{margin-top:7px;border:1px solid rgba(112,228,232,.24);border-radius:8px;background:#0b1b27;color:#bfeff2;padding:7px 10px;font-weight:800}
</style>
<script>
document.addEventListener('DOMContentLoaded',function(){
  var p=document.getElementById('password');
  if(!p||document.getElementById('ycNativePasswordToggle'))return;
  p.setAttribute('autocapitalize','none');
  p.setAttribute('autocorrect','off');
  p.setAttribute('spellcheck','false');
  var b=document.createElement('button');
  b.type='button';b.id='ycNativePasswordToggle';b.textContent='Zobrazit heslo';
  b.addEventListener('click',function(){var show=p.type==='password';p.type=show?'text':'password';b.textContent=show?'Skrýt heslo':'Zobrazit heslo';});
  p.parentElement.appendChild(b);
});
</script>`;
html = html.replace('</head>', nativeCss + '\n' + nativeDiagnostics + '\n' + nativeLoginHelpers + '\n</head>');

fs.writeFileSync(path.join(out, 'index.html'), html, 'utf8');
console.log('Yamachat web copied to mobile/www');
