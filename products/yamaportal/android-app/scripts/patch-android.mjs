import fs from 'node:fs';
import path from 'node:path';

const manifestPath = path.resolve('android/app/src/main/AndroidManifest.xml');
if (!fs.existsSync(manifestPath)) throw new Error('Nejdřív spusť Capacitor native:init.');
let xml = fs.readFileSync(manifestPath, 'utf8');
if (!xml.includes('android:name="eu.yamachat.yamasearch.mobile"')) {
  xml = xml.replace('</manifest>', `    <queries>\n        <package android:name="eu.yamachat.yamasearch.mobile" />\n        <package android:name="eu.yamachat.yamasearch.mobile.preview" />\n    </queries>\n</manifest>`);
}
if (!xml.includes('android:host="auth-callback"')) {
  const filter = `\n            <intent-filter>\n                <action android:name="android.intent.action.VIEW" />\n                <category android:name="android.intent.category.DEFAULT" />\n                <category android:name="android.intent.category.BROWSABLE" />\n                <data android:scheme="eu.yamaportal.app" android:host="auth-callback" />\n            </intent-filter>`;
  xml = xml.replace(/(<activity\b[\s\S]*?<\/activity>)/, block => block.replace('</activity>', `${filter}\n        </activity>`));
}
const mainActivityPath = path.resolve('android/app/src/main/java/eu/yamaportal/app/MainActivity.java');
fs.mkdirSync(path.dirname(mainActivityPath), { recursive: true });
fs.writeFileSync(mainActivityPath, `package eu.yamaportal.app;\n\nimport android.os.Bundle;\nimport com.getcapacitor.BridgeActivity;\n\npublic class MainActivity extends BridgeActivity {\n    @Override\n    public void onCreate(Bundle savedInstanceState) {\n        registerPlugin(YamaAppLauncherPlugin.class);\n        super.onCreate(savedInstanceState);\n    }\n}\n`);
const pluginSource = path.resolve('native-src/YamaAppLauncherPlugin.java');
const pluginTarget = path.resolve('android/app/src/main/java/eu/yamaportal/app/YamaAppLauncherPlugin.java');
if (!fs.existsSync(pluginSource)) throw new Error('Chybí Android launcher Yamaportal.');
fs.copyFileSync(pluginSource, pluginTarget);
const iconSource = path.resolve('assets/icon.png');
if (!fs.existsSync(iconSource)) throw new Error('Chybí schválená ikona Yamaportal.');
for (const density of ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi']) {
  const folder = path.resolve(`android/app/src/main/res/mipmap-${density}`);
  fs.mkdirSync(folder, { recursive: true });
  fs.copyFileSync(iconSource, path.join(folder, 'yamaportal.png'));
  fs.copyFileSync(iconSource, path.join(folder, 'yamaportal_round.png'));
}
const application = xml.match(/<application\b[^>]*>/)?.[0];
if (!application) throw new Error('V AndroidManifest.xml chybí aplikace.');
let updated = application.replace(/\sandroid:icon="[^"]*"/, '').replace(/\sandroid:roundIcon="[^"]*"/, '');
updated = updated.replace(/>$/, ' android:icon="@mipmap/yamaportal" android:roundIcon="@mipmap/yamaportal_round">');
if (updated !== application) xml = xml.replace(application, updated);
fs.writeFileSync(manifestPath, xml);
console.log('Yamaportal Android OAuth return, YamaSearch launcher and Portal return are configured.');
