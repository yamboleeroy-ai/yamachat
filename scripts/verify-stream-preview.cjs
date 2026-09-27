const fs=require('fs'),cp=require('child_process'),path=require('path'),os=require('os'),assert=require('assert/strict');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'yc-preview-syntax-'));
let i=0;
for(const p of ['index.html','desktop/desktop-client.html','desktop/desktop.html'])for(const m of fs.readFileSync(p,'utf8').matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)){
 if(!m[2].trim())continue;
 const file=path.join(dir,String(i++)+(m[1].includes('module')?'.mjs':'.js'));fs.writeFileSync(file,m[2]);cp.execFileSync(process.execPath,['--check',file],{stdio:'inherit'});
}
for(const p of ['desktop/main.js','desktop/updater.js','desktop/preload.js','web/stream-viewer.js'])cp.execFileSync(process.execPath,['--check',p],{stdio:'inherit'});
for(const p of ['stream-transport.mjs','windows-process-audio.cjs','windows-stream-lifecycle.cjs','windows-interaction-notifications.cjs','windows-presence-stability.cjs','windows-dm-media-performance.cjs','windows-wns-desktop.cjs'])cp.execFileSync(process.execPath,['tests/'+p],{stdio:'inherit'});
assert.equal(require('../desktop/package.json').version,'1.0.101');
console.log('PASS current-source syntax and release regression checks');
