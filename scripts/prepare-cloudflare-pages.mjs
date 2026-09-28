import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dist=path.join(root,'web-dist');

const copy=(source,destination)=>{
  const from=path.join(root,source);
  if(!fs.existsSync(from))throw new Error('Missing web deployment source: '+source);
  fs.cpSync(from,path.join(dist,destination??source),{recursive:true});
};

fs.rmSync(dist,{recursive:true,force:true});
fs.mkdirSync(path.join(dist,'legal'),{recursive:true});

for(const file of [
  'index.html',
  'reset-password.html',
  'sw.js',
  'boot-guard.js',
  'favicon.ico',
  'manifest.webmanifest',
  'offline.html',
  'update-manifest.json'
]) copy(file);

for(const dir of ['icons','audio','vendor','build','download']) copy(dir);

for(const file of [
  'LICENSE',
  'TERMS_OF_USE.md',
  'PRIVACY_POLICY.md',
  'BRAND-NOTICE.md',
  'PROVENANCE.md',
  'THIRD_PARTY_NOTICES.md',
  'LEGAL-BASELINE.md',
  'ASSET-MANIFEST.md'
]) copy(file,path.join('legal',file));

fs.writeFileSync(path.join(dist,'_headers'),[
  '/index.html',
  '  Cache-Control: no-cache, must-revalidate',
  '/sw.js',
  '  Cache-Control: no-cache, must-revalidate',
  '/reset-password.html',
  '  Cache-Control: no-cache, must-revalidate',
  '/update-manifest.json',
  '  Cache-Control: no-cache, must-revalidate',
  ''
].join('\n'));

let count=0;
let bytes=0;
let largest={path:'',size:0};
const walk=dir=>{
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    const full=path.join(dir,entry.name);
    if(entry.isDirectory()){walk(full);continue}
    const stat=fs.statSync(full);
    count++;
    bytes+=stat.size;
    if(stat.size>largest.size)largest={path:path.relative(dist,full).replaceAll('\\','/'),size:stat.size};
    if(stat.size>25*1024*1024)throw new Error('Cloudflare Pages 25 MiB file limit exceeded: '+path.relative(dist,full)+' ('+stat.size+' bytes)');
  }
};
walk(dist);

if(count>20000)throw new Error('Cloudflare Pages file count limit exceeded: '+count);
console.log('Cloudflare Pages web-dist prepared:',count+' files,',bytes+' bytes; largest:',largest.path,largest.size+' bytes');
