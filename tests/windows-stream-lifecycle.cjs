const assert=require('node:assert/strict'),fs=require('node:fs');
const main=fs.readFileSync('desktop/main.js','utf8'),shell=fs.readFileSync('desktop/desktop.html','utf8'),client=fs.readFileSync('desktop/desktop-client.html','utf8');
assert(!main.includes('mainWindow.setFullScreen('),'viewer must preserve native window state');
assert(shell.includes("document.body.classList.toggle('yc-stream-fullscreen', !!active)"));
for(const marker of ['const YC_STREAM_DESKTOP=true;','ycAttachExistingScreenAudioReceiver','ycPrepareDesktopProcessAudio','session.fullscreenReturnMode'])assert(client.includes(marker),marker);
assert(!client.includes('id="screenShareStage"'));
console.log('PASS Windows viewer lifecycle: viewport overlay, native window untouched, stable audio receiver');
