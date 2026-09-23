import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const target = process.argv[2] || 'all';

function walk(dir, visitor) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, visitor);
    else visitor(full);
  }
}

function patchAndroidBranding(res) {
  const preferredLogo = path.join(root, 'www/build/yamachat-logo-symbol.png');
  const fallbackLogo = path.join(root, 'www/icons/icon-512.png');
  const brandLogo = fs.existsSync(preferredLogo) ? preferredLogo : fallbackLogo;
  if (!fs.existsSync(brandLogo) || !fs.existsSync(res)) return;

  // Launcher: prefer the clean, transparent Yamachat symbol generated from the
  // desktop-derived web assets instead of Capacitor's default icon.
  for (const dir of fs.readdirSync(res).filter(x => /^mipmap-(mdpi|hdpi|xhdpi|xxhdpi|xxxhdpi)$/.test(x))) {
    const dst = path.join(res, dir);
    for (const name of ['ic_launcher.png', 'ic_launcher_round.png', 'ic_launcher_foreground.png']) {
      const out = path.join(dst, name);
      if (fs.existsSync(out)) fs.copyFileSync(brandLogo, out);
    }
  }

  // Native launch screen: remove Capacitor's generated white splash bitmaps and
  // replace the shared @drawable/splash resource with Yamachat branding.
  walk(res, file => {
    if (path.basename(file) === 'splash.png') fs.rmSync(file, { force: true });
  });

  const nodpi = path.join(res, 'drawable-nodpi');
  fs.mkdirSync(nodpi, { recursive: true });
  fs.copyFileSync(brandLogo, path.join(nodpi, 'yamachat_splash_logo.png'));

  const drawable = path.join(res, 'drawable');
  fs.mkdirSync(drawable, { recursive: true });
  fs.writeFileSync(path.join(drawable, 'splash.xml'), `<?xml version="1.0" encoding="utf-8"?>
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
    <item>
        <shape android:shape="rectangle">
            <solid android:color="#071019" />
        </shape>
    </item>
    <item android:gravity="center" android:width="176dp" android:height="176dp">
        <bitmap android:src="@drawable/yamachat_splash_logo" android:gravity="fill" />
    </item>
</layer-list>
`, 'utf8');

  // Android 12+ may render a system splash before Capacitor gets control.
  // Keep that system stage in the same Yamachat colors/logo when those theme
  // items exist in the generated project.
  walk(res, file => {
    if (!file.endsWith('.xml') || !file.includes(`${path.sep}values`)) return;
    let xml = fs.readFileSync(file, 'utf8');
    const before = xml;
    xml = xml.replace(
      /(<item\s+name="(?:android:)?windowSplashScreenBackground">)[\s\S]*?(<\/item>)/g,
      '$1#071019$2'
    );
    xml = xml.replace(
      /(<item\s+name="(?:android:)?windowSplashScreenAnimatedIcon">)[\s\S]*?(<\/item>)/g,
      '$1@drawable/yamachat_splash_logo$2'
    );
    if (xml !== before) fs.writeFileSync(file, xml, 'utf8');
  });

  console.log('Android Yamachat launcher and native splash branding patched.');
}

function patchAndroid() {
  const p = path.join(root, 'android/app/src/main/AndroidManifest.xml');
  if (!fs.existsSync(p)) {
    console.log('Android project not generated yet; skipping manifest patch.');
    return;
  }
  let xml = fs.readFileSync(p, 'utf8');
  const permissions = [
    '<uses-permission android:name="android.permission.INTERNET" />',
    '<uses-permission android:name="android.permission.RECORD_AUDIO" />',
    '<uses-permission android:name="android.permission.CAMERA" />',
    '<uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />',
    '<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />',
    '<uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />'
  ];
  for (const line of permissions) {
    const name = line.match(/android:name="([^"]+)"/)?.[1];
    if (name && !xml.includes(name)) xml = xml.replace(/<manifest([^>]*)>/, '<manifest$1>\n    ' + line);
  }
  fs.writeFileSync(p, xml, 'utf8');

  // Patch the Android bundle only, after cap sync. Web/iOS assets stay identical.
  const publicDir = path.join(root, 'android/app/src/main/assets/public');
  const htmlPath = path.join(publicDir, 'index.html');
  let html = fs.readFileSync(htmlPath, 'utf8');
  const androidStyle = '<link rel="stylesheet" href="./android-portrait.css">';
  if (!html.includes(androidStyle)) html = html.replace('</head>', androidStyle + '\n</head>');
  fs.writeFileSync(htmlPath, html);
  fs.copyFileSync(path.join(root, 'android-portrait.css'), path.join(publicDir, 'android-portrait.css'));

  // Apply only to the generated Android project; iOS configuration is unchanged.
  const gradlePath = path.join(root, 'android/app/build.gradle');
  let gradle = fs.readFileSync(gradlePath, 'utf8');
  const release = JSON.parse(fs.readFileSync(path.join(root, 'android-release.json'), 'utf8'));
  const config = JSON.parse(fs.readFileSync(path.join(root, 'capacitor.config.json'), 'utf8'));
  if (config.appId !== release.applicationId || !gradle.includes('applicationId "' + release.applicationId + '"')) {
    throw new Error('Android package changed; refusing an incompatible build');
  }
  const apply = "apply from: '../../android-signing.gradle'";
  if (!gradle.includes(apply)) fs.writeFileSync(gradlePath, gradle + '\n' + apply + '\n');
  patchAndroidBranding(path.join(root, 'android/app/src/main/res'));
  console.log('Android permissions and Yamachat native branding patched.');
}

function plistEntry(key, value) {
  return `\n\t<key>${key}</key>\n\t<string>${value}</string>`;
}

function patchIos() {
  const p = path.join(root, 'ios/App/App/Info.plist');
  if (!fs.existsSync(p)) {
    console.log('iOS project not generated yet; skipping Info.plist patch.');
    return;
  }
  let xml = fs.readFileSync(p, 'utf8');
  const entries = [
    ['NSMicrophoneUsageDescription', 'Yamachat potřebuje mikrofon pro hlasové kanály a hovory.'],
    ['NSCameraUsageDescription', 'Yamachat potřebuje kameru pro video a sdílení médií.'],
    ['NSPhotoLibraryUsageDescription', 'Yamachat potřebuje přístup k fotkám pro odesílání obrázků a souborů.']
  ];
  for (const [key, value] of entries) {
    if (!xml.includes('<key>' + key + '</key>')) xml = xml.replace('</dict>', plistEntry(key, value) + '\n</dict>');
  }
  if (!xml.includes('<key>UIBackgroundModes</key>')) {
    xml = xml.replace('</dict>', '\n\t<key>UIBackgroundModes</key>\n\t<array>\n\t\t<string>audio</string>\n\t</array>\n</dict>');
  }
  fs.writeFileSync(p, xml, 'utf8');
  console.log('iOS privacy/background audio keys patched.');
}

if (target === 'all' || target === 'android') patchAndroid();
if (target === 'all' || target === 'ios') patchIos();
