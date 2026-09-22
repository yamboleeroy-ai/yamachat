import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const target = process.argv[2] || 'all';

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

  // Use the Yamachat artwork for the generated Android launcher icon.
  const icon = path.join(root, 'www/icons/icon-512.png');
  const res = path.join(root, 'android/app/src/main/res');
  if (fs.existsSync(icon) && fs.existsSync(res)) {
    for (const dir of fs.readdirSync(res).filter(x => x.startsWith('mipmap-'))) {
      const dst = path.join(res, dir);
      for (const name of ['ic_launcher.png', 'ic_launcher_round.png', 'ic_launcher_foreground.png']) {
        try { fs.copyFileSync(icon, path.join(dst, name)); } catch {}
      }
    }
  }
  console.log('Android permissions and Yamachat launcher artwork patched.');
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
