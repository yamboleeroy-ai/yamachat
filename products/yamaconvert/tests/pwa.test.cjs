const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..','..','..');
const pwa=path.join(root,'products','yamaconvert','pwa');
const read=file=>fs.readFileSync(path.join(pwa,file),'utf8');

test('Android PWA manifest has an installable same-origin scope and sized icons',()=>{
  const manifest=JSON.parse(read('manifest.webmanifest'));
  assert.equal(manifest.name,'YamaConvert');
  assert.equal(manifest.start_url,'./');
  assert.equal(manifest.scope,'./');
  assert.equal(manifest.display,'standalone');
  for(const size of [192,512]){
    const icon=manifest.icons.find(item=>item.src===`icons/yamaconvert-${size}.png`);
    assert.ok(icon,`missing ${size}px Android icon`);
    const png=fs.readFileSync(path.join(pwa,icon.src));
    assert.equal(png.toString('hex',0,8),'89504e470d0a1a0a');
    assert.equal(png.readUInt32BE(16),size);
    assert.equal(png.readUInt32BE(20),size);
  }
});

test('offline shell references files present in the static release package',()=>{
  const serviceWorker=read('sw.js');
  const block=serviceWorker.match(/const SHELL = \[([\s\S]*?)\];/);
  assert.ok(block,'service worker shell list is missing');
  const entries=[...block[1].matchAll(/'([^']+)'/g)].map(match=>match[1]);
  assert.ok(entries.includes('./account.js'));
  assert.ok(entries.includes('./icons/yamaconvert-192.png'));
  for(const entry of entries)assert.ok(fs.existsSync(path.join(pwa,entry.replace(/^\.\//,''))),`missing offline asset ${entry}`);
  assert.match(serviceWorker,/request\.method !== 'GET'/);
  assert.match(serviceWorker,/url\.origin !== self\.location\.origin/);
});

test('PWA shares the Yamaportal auth session and excludes the Windows downloader',()=>{
  const account=read('account.js');
  const portalAuth=fs.readFileSync(path.join(root,'products','yamaportal','preview','dist','account-ui.js'),'utf8');
  assert.match(account,/storageKey:'yamaportal-auth-v1'/);
  assert.match(portalAuth,/storageKey:'yamaportal-auth-v1'/);
  assert.match(account,/getUser\(\)/);
  assert.match(account,/from\('profiles'\)/);
  assert.doesNotMatch(account,/access_token|refresh_token/);
  assert.ok(!fs.existsSync(path.join(pwa,'yt-dlp.exe')));
  assert.match(read('downloads.js'),/Android PWA/);
});

test('Yamaportal catalog and release feed point to the YamaConvert PWA',()=>{
  const catalog=fs.readFileSync(path.join(root,'products','yamaportal','preview','dist','app.js'),'utf8');
  const links=fs.readFileSync(path.join(root,'products','yamaportal','preview','dist','app-links.js'),'utf8');
  const feed=JSON.parse(fs.readFileSync(path.join(root,'release-feed.json'),'utf8'));
  assert.match(catalog,/id:'convert',name:'YamaConvert'/);
  assert.match(catalog,/https:\/\/yamachat\.eu\/yamaconvert\//);
  assert.match(links,/https:\/\/yamachat\.eu\/yamaconvert\//);
  assert.ok(feed.releases.some(release=>release.id==='yamaconvert:1.0.0'&&release.app==='yamaconvert'));
  assert.ok(fs.existsSync(path.join(root,'products','yamaportal','preview','dist','assets','yamaconvert.png')));
});
