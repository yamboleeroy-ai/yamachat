const assert=require('node:assert/strict');
const fs=require('node:fs');

const read=p=>fs.readFileSync(p,'utf8');
const main=read('desktop/main.js');
const preload=read('desktop/preload.js');
const shell=read('desktop/desktop.html');
const client=read('desktop-client-dist/desktop-client.html');
const pkg=require('../yamachat/desktop/package.json');

assert.equal(pkg.version,'1.0.97','Windows preview must stay on released 1.0.97 lineage');

assert(main.includes("handleClientIpc('yamachat:stream-fullscreen'"),'native stream fullscreen IPC missing');
assert(main.includes('mainWindow.setFullScreen(wanted)'),'Electron setFullScreen bridge missing');
assert(main.includes("'enter-full-screen'"),'native fullscreen enter event guard missing');
assert(main.includes("'leave-full-screen'"),'native fullscreen leave event guard missing');

assert(preload.includes("setStreamFullscreen: (active) => ipcRenderer.invoke('yamachat:stream-fullscreen', !!active)"),'preload stream fullscreen bridge missing');

assert(shell.includes('body.yc-stream-fullscreen #ycDesktopTitlebar { display: none; }'),'desktop titlebar fullscreen hide missing');
assert(shell.includes('window.YamachatDesktopStreamFullscreen = Object.freeze({'),'desktop fullscreen parent bridge missing');
assert(shell.includes("type: 'yamachat:stream-native-fullscreen'"),'fullscreen state forwarding missing');
assert(shell.includes('setStreamFullscreen?.(ycStreamFullscreenRequested)'),'desktop shell does not call native fullscreen');

for(const marker of [
  'const YC_STREAM_DESKTOP=true;',
  'window.parent?.YamachatDesktopStreamFullscreen',
  'ycAttachExistingScreenAudioReceiver',
  'window.__ycScreenAudioTracks=window.__ycScreenAudioTracks||new Map()',
  "session.mode==='fullscreen'"
]) assert(client.includes(marker),'generated desktop stream client missing: '+marker);

for(const oldMarker of ['id="screenShareStage"','ycShareOverlay','__ycMultiStreamViewerInstalled','__ycStreamResizeInstalled'])
  assert(!client.includes(oldMarker),'old stream UI remains: '+oldMarker);

console.log('PASS Windows 1.0.97 stream lifecycle: native monitor fullscreen bridge, stable independent viewer and screen-audio reopen hooks are present.');
