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

test('Android PWA accepts saved audio/video files from the system share sheet',()=>{
  const manifest=JSON.parse(read('manifest.webmanifest'));
  assert.deepEqual(manifest.share_target.params.files[0].accept.slice(0,2),['audio/*','video/*']);
  assert.equal(manifest.share_target.method,'POST');
  assert.equal(manifest.share_target.enctype,'multipart/form-data');
  assert.equal(manifest.share_target.action,'./share/');
  const serviceWorker=read('sw.js');
  assert.match(serviceWorker,/receiveSharedContent\(request, scope\.href\)/);
  assert.match(serviceWorker,/SHARE_MAX_BYTES/);
  assert.match(read('share-inbox.js'),/window\.YamaApp\.addFiles\(files\)/);
  assert.match(read('downloads.js'),/social-download/);
  assert.match(read('index.html'),/id="media-rights-consent" type="checkbox"/);
  assert.match(read('downloads.js'),/if\(!rights\.checked\)/);
  assert.match(read('downloads.js'),/rights\.checked=false/);
  assert.match(read('downloads.js'),/window\.YamaConvertAuth\.accessToken\(\)/);
  assert.match(read('downloads.js'),/window\.YamaApp\.convertDownloadedFile/);
  assert.match(read('downloads.js'),/window\.YamaConvertAndroid\?\.downloadMedia/);
  assert.match(read('downloads.js'),/releaseDownload/);
  assert.match(read('index.html'),/id="media-format"/);
  assert.match(read('index.html'),/cancel-media-download/);
  assert.match(read('sw.js'),/download-config\.js/);
  assert.doesNotMatch(read('share-inbox.js'),/fetch\s*\(/);
});

test('offline shell references files present in the static release package',()=>{
  const serviceWorker=read('sw.js');
  const block=serviceWorker.match(/const SHELL = \[([\s\S]*?)\];/);
  assert.ok(block,'service worker shell list is missing');
  const entries=[...block[1].matchAll(/'([^']+)'/g)].map(match=>match[1]);
  assert.ok(entries.includes('./account.js'));
  assert.ok(entries.includes('./download-config.js'));
  assert.ok(entries.includes('./share-inbox.js'));
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
  assert.match(account,/getSession\(\)/);
  assert.match(account,/window\.YamaConvertAuth/);
  assert.doesNotMatch(account,/refresh_token/);
  assert.ok(!fs.existsSync(path.join(pwa,'yt-dlp.exe')));
  assert.match(read('downloads.js'),/Stahovací služba/);
  assert.match(read('downloads.js'),/\/api\/social-download/);
});

test('Yamaportal offers the native YamaConvert APK and web PWA with shared updates',()=>{
  const catalog=fs.readFileSync(path.join(root,'products','yamaportal','preview','dist','app.js'),'utf8');
  const links=fs.readFileSync(path.join(root,'products','yamaportal','preview','dist','app-links.js'),'utf8');
  const feed=JSON.parse(fs.readFileSync(path.join(root,'release-feed.json'),'utf8'));
  assert.match(catalog,/id:'convert',name:'YamaConvert'/);
  assert.match(catalog,/Android APK · Android PWA · Windows PWA · Web/);
  assert.match(catalog,/místním enginem v telefonu/);
  assert.match(catalog,/https:\/\/yamachat\.eu\/yamaconvert\//);
  assert.match(links,/https:\/\/yamachat\.eu\/yamaconvert\//);
  assert.match(links,/releases\/latest\/download\/YamaConvert-Android\.apk/);
  assert.match(links,/Otevřít Android PWA/);
  assert.match(links,/Instalovat YamaConvert ve Windows/);
  assert.ok(feed.releases.some(release=>release.id==='yamaconvert:1.0.0'&&release.app==='yamaconvert'));
  assert.ok(feed.releases.some(release=>release.id==='yamaconvert:1.0.1'&&release.app==='yamaconvert'));
  assert.ok(feed.releases.some(release=>release.id==='yamaconvert:1.0.2'&&release.app==='yamaconvert'));
  assert.ok(fs.existsSync(path.join(root,'products','yamaportal','preview','dist','assets','yamaconvert.png')));
});

test('native Android project downloads on-device without source-site credentials',()=>{
  const android=path.join(root,'products','yamaconvert','android');
  const gradle=fs.readFileSync(path.join(android,'app','build.gradle'),'utf8');
  const manifest=fs.readFileSync(path.join(android,'app','src','main','AndroidManifest.xml'),'utf8');
  const activity=fs.readFileSync(path.join(android,'app','src','main','java','eu','yamachat','yamaconvert','YamaConvertActivity.java'),'utf8');
  assert.match(gradle,/dev\.ffmpegkit-maintained:yt-dlp-android:2\.0\.2/);
  assert.match(gradle,/applicationId 'eu\.yamachat\.yamaconvert'/);
  assert.match(manifest,/android:name="android\.permission\.INTERNET"/);
  assert.match(manifest,/android:usesCleartextTraffic="false"/);
  assert.match(manifest,/android:extractNativeLibs="true"/);
  assert.match(manifest,/android\.intent\.action\.SEND/);
  assert.match(activity,/YtDlp\.execute\(request/);
  assert.match(activity,/--max-filesize/);
  assert.match(activity,/supportedMediaHosts/);
  assert.match(activity,/YtDlpRequest/);
  assert.match(activity,/--remote-components/);
  assert.match(activity,/ejs:github/);
  assert.match(activity,/--js-runtimes/);
  assert.match(activity,/quickjs:/);
  assert.match(activity,/nativeLibraryDir, "libqjs\.so"/);
  assert.doesNotMatch(activity,/--cookies|--proxy|curl.cffi|impersonat/i);
  assert.match(activity,/Platforma omezuje automatické stahování/);
  assert.match(activity,/RELEASE_API/);
  assert.match(activity,/ACTION_MANAGE_UNKNOWN_APP_SOURCES/);
  assert.match(manifest,/REQUEST_INSTALL_PACKAGES/);
  assert.match(manifest,/androidx\.core\.content\.FileProvider/);
});

test('Android and web downloader share the same expanded yt-dlp domain allow-list',()=>{
  const sites=fs.readFileSync(path.join(root,'products','yamaconvert','downloader','supported-sites.txt'),'utf8')
    .split(/\r?\n/).map(line=>line.trim()).filter(line=>line&&!line.startsWith('#'));
  const android=fs.readFileSync(path.join(root,'products','yamaconvert','android','app','src','main','java','eu','yamachat','yamaconvert','YamaConvertActivity.java'),'utf8');
  const gradle=fs.readFileSync(path.join(root,'products','yamaconvert','android','app','build.gradle'),'utf8');
  const server=fs.readFileSync(path.join(root,'products','yamaconvert','downloader','server.cjs'),'utf8');
  const docker=fs.readFileSync(path.join(root,'products','yamaconvert','downloader','Dockerfile'),'utf8');
  assert.ok(sites.length>=100);
  for(const domain of ['youtube.com','facebook.com','instagram.com','tiktok.com','soundcloud.com','bilibili.com','reddit.com']) assert.ok(sites.includes(domain),`missing ${domain}`);
  assert.match(android,/supported-sites\.txt/);
  assert.match(gradle,/prepareYamaConvertSupportedSites/);
  assert.match(server,/supported-sites\.txt/);
  assert.match(docker,/COPY server\.cjs supported-sites\.txt/);
  assert.match(read('index.html'),/supportedsites\.md/);
});

test('Android build packages a pinned QuickJS runtime for yt-dlp on both supported ABIs',()=>{
  const android=path.join(root,'products','yamaconvert','android');
  const build=fs.readFileSync(path.join(android,'app','build.gradle'),'utf8');
  const script=fs.readFileSync(path.join(android,'scripts','build-quickjs.sh'),'utf8');
  const preview=fs.readFileSync(path.join(root,'.github','workflows','yamaconvert-android-preview.yml'),'utf8');
  const release=fs.readFileSync(path.join(root,'.github','workflows','yamaconvert-android-release.yml'),'utf8');
  assert.match(build,/generated\/yamaconvert-jniLibs/);
  assert.match(script,/--branch v0\.16\.1/);
  assert.match(script,/arm64-v8a x86_64/);
  assert.match(script,/install -m 0755/);
  assert.match(preview,/bash scripts\/build-quickjs\.sh/);
  assert.match(release,/bash scripts\/build-quickjs\.sh/);
});

