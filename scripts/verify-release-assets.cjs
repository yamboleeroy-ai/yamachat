const fs=require('fs'),path=require('path'),assert=require('assert/strict'),crypto=require('crypto');
const dir=process.argv[2]||'release-assets',read=p=>fs.readFileSync(path.join(dir,p));
const report=JSON.parse(read('android-artifact.json')),a=report.artifact;
assert.equal(report.sameSigningCertificate,true,'APK must update the existing installation');
assert.equal(a.certificateSha256,require('../mobile/android-release.json').certificateSha256);
assert.equal(a.sha256,crypto.createHash('sha256').update(read('Yamachat-Android.apk')).digest('hex'));
assert(Number(a.versionCode)>require('../update-manifest.json').android.latestVersionCode,'Android version must increase');
assert.equal(require('../desktop/package.json').version,'1.0.106');
const latest=read('latest.yml').toString(),installer=read('Yamachat-Setup-1.0.106.exe');
assert.match(latest,/version:\s*1\.0\.106\b/);
const sha512=crypto.createHash('sha512').update(installer).digest('base64');
assert(latest.includes(sha512),'Installer must match updater sha512');
console.log('PASS signed Android artifact report and Windows updater hashes',a.versionName,a.versionCode);

