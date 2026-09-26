const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

const main=read('desktop/main.js');
const preload=read('desktop/preload.js');
const shell=read('desktop/desktop.html');
const client=read('desktop/desktop-client.html');
const pkg=JSON.parse(read('desktop/package.json'));
const transform=read('scripts/windows-wns-client.mjs');
const prepare=read('scripts/prepare-desktop-1.0.92.mjs');
const installer=read('build/installer.nsh');
const bridge=read('windows/wns/Yamachat.WnsBridge/Program.cs');
const project=read('windows/wns/Yamachat.WnsBridge/Yamachat.WnsBridge.csproj');
const manifest=read('windows/wns/AppxManifest.template.xml');
const build=read('scripts/build-windows-wns.ps1');

for(const marker of [
 'parseYamachatProtocolTarget',
 "url.hostname !== 'notification'",
 "handleClientIpc('yamachat:wns-get-channel'",
 'requestWindowsWnsChannel',
 "app.setAsDefaultProtocolClient('yamachat')",
 'pendingProtocolTarget'
]) assert(main.includes(marker),'desktop main missing WNS marker: '+marker);

assert(preload.includes('getWindowsPushChannel'),'preload WNS IPC bridge missing');
assert(shell.includes("data.action === 'get-wns-channel'"),'desktop shell WNS request bridge missing');
assert(shell.includes('attempts < 24'),'notification deep-link retry guard missing');
assert(pkg.build.files.includes('wns/**/*'),'WNS bridge is not packaged');
assert((pkg.build.protocols||[]).some(x=>(x.schemes||[]).includes('yamachat')),'yamachat:// protocol packaging missing');

for(const marker of [
 'ycRegisterWindowsWnsPush',
 "transport:'wns'",
 "platform:'desktop'",
 'window.__ycWnsActive=true',
 "if(window.__ycWnsActive===true)return"
]) assert(client.includes(marker),'generated desktop client missing WNS marker: '+marker);

assert(prepare.includes('withWindowsWnsClient'),'desktop generator does not apply WNS transform');
assert(transform.includes("action:'register'"),'WNS push registration payload missing');

for(const marker of [
 'PushNotificationManager.Default.CreateChannelAsync',
 'AppNotificationManager.Default.NotificationInvoked',
 '----WindowsAppRuntimePushServer:',
 '----AppNotificationActivated:',
 'yamachat://notification'
]) assert(bridge.includes(marker),'native WNS bridge missing marker: '+marker);

assert(project.includes('Microsoft.WindowsAppSDK')&&project.includes('2.5.1'),'Windows App SDK 2.5.1 dependency missing');
assert(project.includes('WindowsAppSDKBootstrapAutoInitializeOptions_OnPackageIdentity_NoOp'),'sparse identity bootstrap option missing');
assert(manifest.includes('uap10:AllowExternalContent')&&manifest.includes('windows.comServer'),'sparse WNS manifest incomplete');
assert(manifest.includes('{{WNS_APP_ID}}'),'WNS COM AppId placeholder missing');

for(const marker of [
 'WindowsAppRuntimeInstall-x64.exe',
 '--quiet',
 'Add-AppxPackage',
 '-ExternalLocation',
 'Yamachat.PushIdentity.msix',
 'wns-signing.cer',
 'Import-Certificate',
 "yamachat.eu-7E03B8AF",
 'Remove-AppxPackage'
]) assert(installer.includes(marker),'NSIS WNS/runtime integration missing: '+marker);

for(const marker of [
 'winapp pack',
 'winapp embed-identity',
 'winapp sign',
 '--export-cer',
 'dotnet publish',
 'windowsappsdk/2.5/2.5.1/windowsappruntimeinstall-x64.exe',
 'yamachat.eu-7E03B8AF',
 'OID.2.25.311729368913984317654407730594956997722=1',
 '9addf482-cc9c-4e61-8075-ebcb7adce1cf',
 'ac8013be-a388-485b-b68f-6f70fa7ec6f6'
]) assert(build.includes(marker),'WNS build pipeline missing: '+marker);

for(const existing of [
 'ycVoiceSelectedVoice',
 'YC_VOICE_JOIN_CUE_SRC',
 'YC_VOICE_LEAVE_CUE_SRC',
 'ycVoiceDiffAnnouncements',
 'ycVoiceThemePolishStyle',
 'html body .composer'
]) assert(client.includes(existing),'existing approved desktop feature regressed: '+existing);

for(const rejected of ['ycSurfaceThemeStyle','yc_surface_theme_v1','male-deep','female-bright'])
 assert(!client.includes(rejected),'rejected desktop experiment returned: '+rejected);

console.log('PASS Windows WNS desktop: sparse identity, native bridge, WNS subscription, deep-link activation and approved desktop features.');
