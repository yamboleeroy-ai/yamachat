const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');

for(const file of ['desktop/desktop-client.html','index.html']){
 const html=fs.readFileSync(path.join(root,file),'utf8');
 for(const marker of [
  'html body .yc-ss-main{',
  'min-height:0!important;',
  'overflow:hidden!important;',
  'html body .yc-ss-body{',
  'flex:1 1 auto!important;',
  'overflow-y:auto!important;',
  'overscroll-behavior:contain'
 ]) assert(html.includes(marker),file+' missing server-settings scroll containment: '+marker);
}
console.log('PASS server settings scroll: members and other long settings panels scroll inside the dialog.');
