const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const files=[
  'desktop/updater.js',
  'desktop/package.json',
  'update-manifest.json',
  'web/integration.js',
  'web/downloads.js',
  'download/index.html',
  'scripts/platform-install-ui.mjs'
];
const forbidden=[
  /api\.github\.com\/repos\/yamboleeroy-ai\/yamachat\/releases/i,
  /github\.com\/yamboleeroy-ai\/yamachat\/releases/i,
  /yamachat\.eu\/download\/Yamachat-Android\.apk/i
];
for(const rel of files){
  const src=fs.readFileSync(path.join(root,rel),'utf8');
  for(const re of forbidden)assert(!re.test(src),rel+' still depends on GitHub release distribution');
}
const pkg=require('../desktop/package.json');
assert.equal(pkg.build.publish?.[0]?.provider,'generic');
assert.equal(pkg.build.publish?.[0]?.url,'https://updates.yamachat.eu/windows/');
const manifest=require('../update-manifest.json');
assert.match(String(manifest.windows?.installerUrl||''),/^https:\/\/updates\.yamachat\.eu\/windows\/Yamachat-Setup-\d+\.\d+\.\d+\.exe$/);
assert.equal(manifest.windows?.feedUrl,'https://updates.yamachat.eu/windows/');
assert.match(String(manifest.android?.apkUrl||''),/^https:\/\/updates\.yamachat\.eu\/android\/Yamachat-Android(?:-\d+)?\.apk(?:\?v=\d+)?$/);
console.log('PASS public Yamachat distribution is detached from GitHub Releases and Android APK is on Cloudflare R2.');
