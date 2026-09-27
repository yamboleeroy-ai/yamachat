import fs from 'node:fs';
fs.mkdirSync('preview-web',{recursive:true});
for(const asset of ['index.html','icons','audio','vendor','build','web','boot-guard.js','favicon.ico','manifest.webmanifest','sw.js','offline.html','reset-password.html'])fs.cpSync(asset,'preview-web/'+asset,{recursive:true});
console.log('Prepared current web/PWA preview without historical regeneration or publishing.');
