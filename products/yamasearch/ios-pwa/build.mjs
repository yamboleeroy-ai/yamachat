import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(root, 'dist');
fs.rmSync(out, {recursive:true, force:true});
fs.mkdirSync(path.join(out, 'assets'), {recursive:true});
for (const name of ['index.html','app.css','app.js','sw.js','manifest.webmanifest']) {
  fs.copyFileSync(path.join(root,name), path.join(out,name));
}
for (const size of [256,512]) {
  const name = `YamaSearch-symbol-${size}.png`;
  const source = path.resolve(root,'../Assets',name);
  if (!fs.existsSync(source)) throw new Error('Original YamaSearch icon missing: '+source);
  fs.copyFileSync(source, path.join(out,'assets',name));
}
console.log('YamaSearch iOS PWA preview assembled at '+out+' (no publication).');
