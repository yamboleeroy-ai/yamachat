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
  'update-manifest.json',
  'release-feed.json'
]) copy(file);

for(const dir of ['icons','audio','vendor','build','download']) copy(dir);

// Package the independent YamaSearch iPhone/iPad PWA at /yamasearch/.
// This only copies isolated static files; existing Yamachat root stays untouched.
const iosPwa=path.join(root,'products/yamasearch/ios-pwa');
for(const file of ['index.html','app.css','app.js','sw.js','manifest.webmanifest','assets/YamaSearch-symbol-256.png','assets/YamaSearch-symbol-512.png']){
  const from=file.startsWith('assets/')
    ? path.join(root,'products/yamasearch/Assets',path.basename(file))
    : path.join(iosPwa,file);
  if(!fs.existsSync(from))throw Error('Missing YamaSearch iOS PWA release asset: '+file);
  const to=path.join(dist,'yamasearch',file);
  fs.mkdirSync(path.dirname(to),{recursive:true});
  fs.copyFileSync(from,to);
}

// YamaConvert is shipped as an installable Android PWA. The Windows local
// downloader is deliberately not copied into this public static package.
copy('products/yamaconvert/pwa','yamaconvert');
const downloaderUrl=String(process.env.YAMACONVERT_DOWNLOADER_URL||'').trim().replace(/\/+$/,'');
if(downloaderUrl){
  const parsed=new URL(downloaderUrl);
  if(parsed.protocol!=='https:'||parsed.username||parsed.password||parsed.pathname!=='/'||parsed.search||parsed.hash)
    throw new Error('YAMACONVERT_DOWNLOADER_URL must be an HTTPS origin without a path, query, or credentials.');
}
fs.writeFileSync(path.join(dist,'yamaconvert','download-config.js'),
  `'use strict';\nwindow.YamaConvertDownloader=Object.freeze({apiBase:${JSON.stringify(downloaderUrl)}});\n`);


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
  '/yamasearch/index.html',
  '  Cache-Control: no-cache, must-revalidate',
  '/yamasearch/sw.js',
  '  Cache-Control: no-cache, must-revalidate',
  '/yamasearch/manifest.webmanifest',
  '  Cache-Control: no-cache, must-revalidate',
  '/yamaconvert/index.html',
  '  Cache-Control: no-cache, must-revalidate',
  '/yamaconvert/sw.js',
  '  Cache-Control: no-cache, must-revalidate',
  '/yamaconvert/manifest.webmanifest',
  '  Cache-Control: no-cache, must-revalidate',
  ''
].join('\n'));

// Preserve the independent chat at a root-level document so its relative assets
// retain their established paths. Portal owns only the shared web entry.
fs.copyFileSync(path.join(dist,'index.html'),path.join(dist,'yamachat.html'));
const portal=path.join(root,'products/yamaportal/preview/dist');
if(!fs.existsSync(path.join(portal,'index.html')))throw Error('Missing Yamaportal entry');
fs.cpSync(portal,dist,{recursive:true});
// The Portal bundle carries an empty preview feed. Keep the verified root
// release history for production instead of overwriting it with that preview.
fs.copyFileSync(path.join(root,'release-feed.json'),path.join(dist,'release-feed.json'));
// Pages already serves .html documents at their clean path. A 302 back to the
// .html URL would conflict with that canonical redirect and form a loop.
fs.writeFileSync(path.join(dist,'_redirects'),'');

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
