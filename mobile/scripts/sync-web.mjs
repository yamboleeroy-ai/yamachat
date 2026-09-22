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

let html = fs.readFileSync(path.join(repoRoot, 'index.html'), 'utf8');

// The native shell should not link back to its own download page.
html = html.replace(/<a[^>]+class=["'][^"']*yc-mobile-download-link[^"']*["'][\s\S]*?<\/a>/gi, '');

// Browser service workers are unnecessary inside Capacitor and can keep stale HTML.
html = html.replace(
  /if\s*\(\s*['"]serviceWorker['"]\s+in\s+navigator\s*\)[\s\S]{0,1200}?register\([^;]+;?/gi,
  '/* service worker disabled in native Yamachat */'
);

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
html = html.replace('</head>', nativeCss + '\n</head>');

fs.writeFileSync(path.join(out, 'index.html'), html, 'utf8');
console.log('Yamachat web copied to mobile/www');
