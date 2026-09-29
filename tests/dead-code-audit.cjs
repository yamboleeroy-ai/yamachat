const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');

const forbidden=[
  'ycAfterLayoutStable',
  'ycScreenMbpsText',
  'ycPrimeExistingVoiceForStream',
  'ycRebuildVoicePeerForStream'
];

for(const file of ['desktop/desktop-client.html','index.html']){
  const html=fs.readFileSync(path.join(__dirname,'..',file),'utf8');
  for(const name of forbidden)assert(!html.includes(name),file+' dead helper returned: '+name);
}

console.log('PASS dead-code audit: verified obsolete desktop-only layout/screen/stream helpers are absent from desktop and generated web/mobile runtime.');
