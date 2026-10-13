import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(root,'dist');
const read = name => fs.readFileSync(path.join(dist,name),'utf8');

for (const file of ['index.html','app.css','app.js','sw.js','manifest.webmanifest',
  'assets/YamaSearch-symbol-256.png','assets/YamaSearch-symbol-512.png'])
  assert(fs.statSync(path.join(dist,file)).size>0, 'Missing built file: '+file);

const manifest = JSON.parse(read('manifest.webmanifest'));
assert.equal(manifest.name,'YamaSearch');
assert.equal(manifest.display,'standalone');
assert.equal(manifest.start_url,'./');
assert.equal(manifest.scope,'./');
assert.equal(manifest.lang,'cs');
for(const size of [256,512]) {
  const filename = `assets/YamaSearch-symbol-${size}.png`;
  const icon = manifest.icons.find(x => x.src === './'+filename);
  assert(icon, 'Missing '+size+' icon in manifest');
  assert.equal(icon.sizes, `${size}x${size}`);
  const bytes = fs.readFileSync(path.join(dist,filename));
  assert.equal(bytes.subarray(0,8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(bytes.readUInt32BE(16),size,'PNG width');
  assert.equal(bytes.readUInt32BE(20),size,'PNG height');
}
const html = read('index.html');
assert.match(html, /name="apple-mobile-web-app-capable" content="yes"/);
assert.match(html, /rel="apple-touch-icon"/);
assert.match(html, /rel="manifest"/);
assert.match(html, /Safari/);
assert.match(html, /Přidat na plochu/);
assert.doesNotMatch(html, /<iframe\b/i, 'Do not fake rendering external websites in an iframe');
const app = read('app.js');
assert.match(app, /noopener noreferrer/);
assert.match(app, /localStorage/);
assert.match(app, /read\(STORE\.saveHistory, false\)/, 'History must be opt-in');
assert.match(app, /navigator\.serviceWorker\.register/);
assert.match(app, /safeWebUrl/);
const worker = read('sw.js');
assert.match(worker, /url\.origin !== self\.location\.origin/, 'Do not intercept other origins');
assert.doesNotMatch(worker, /fetch\(['"]https?:/i, 'No bundled third-party tracking request');
console.log('PASS YamaSearch iOS PWA contract: install metadata, genuine icon size, offline shell, link safety, local storage.');
