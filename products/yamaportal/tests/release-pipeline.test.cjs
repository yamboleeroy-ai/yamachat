const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..','..','..');
const product=path.join(root,'products','yamaportal');
const pkg=JSON.parse(fs.readFileSync(path.join(product,'package.json'),'utf8'));
const lock=JSON.parse(fs.readFileSync(path.join(product,'package-lock.json'),'utf8'));
const release=JSON.parse(fs.readFileSync(path.join(product,'release-notes',`v${pkg.version}.json`),'utf8'));
const app=fs.readFileSync(path.join(product,'preview','dist','app.js'),'utf8');
const links=fs.readFileSync(path.join(product,'preview','dist','app-links.js'),'utf8');
const html=fs.readFileSync(path.join(product,'preview','dist','index.html'),'utf8');
const releaseWorkflow=fs.readFileSync(path.join(root,'.github','workflows','yamaportal-release.yml'),'utf8');
const pagesWorkflow=fs.readFileSync(path.join(root,'.github','workflows','yamaportal-pages-production.yml'),'utf8');
const pagesBuilder=fs.readFileSync(path.join(root,'scripts','prepare-cloudflare-pages.mjs'),'utf8');

test('Yamaportal release version has one package source and complete release notes',()=>{
  assert.match(pkg.version,/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/);
  assert.equal(lock.version,pkg.version);
  assert.equal(lock.packages[''].version,pkg.version);
  assert.equal(release.title,`Yamaportal ${pkg.version}`);
  for(const key of ['kind','summary','details'])assert.ok(release[key]);
  assert.ok(Array.isArray(release.platforms)&&release.platforms.length>0);
  assert.match(releaseWorkflow,/release-notes\/v\$\(\$package\.version\)\.json/);
});

test('Windows release names and latest manifest use the package version and publish notes',()=>{
  assert.match(releaseWorkflow,/outputs:[\s\S]*version: \$\{\{ steps\.portal-version\.outputs\.version \}\}/);
  assert.match(releaseWorkflow,/Yamaportal-\$kind-\$VERSION-x64\.exe/);
  assert.match(releaseWorkflow,/version,publishedAt:releasedAt/);
  assert.match(releaseWorkflow,/\.release\.id == \("yamaportal:v" \+ \$v\)/);
  assert.doesNotMatch(releaseWorkflow,/Yamaportal-Setup-0\.2\.0-x64\.exe/);
  assert.doesNotMatch(releaseWorkflow,/"version":"0\.2\.0"/);
});

test('Pages release verification follows the current package version',()=>{
  assert.match(pagesWorkflow,/portalVersion=JSON\.parse\(fs\.readFileSync\('products\/yamaportal\/package\.json'/);
  assert.match(pagesWorkflow,/yamaportal:v\$\{portalVersion\}/);
  assert.match(pagesWorkflow,/portal-version\.json/);
  assert.doesNotMatch(pagesWorkflow,/yamaportal:v0\.2\.0/);
  assert.match(pagesBuilder,/product:'Yamaportal',version:portalPackage\.version/);
});

test('production Pages deploy waits for a verified release-feed commit',()=>{
  const push=pagesWorkflow.match(/push:[\s\S]*?paths:([\s\S]*?)permissions:/)?.[1]||'';
  assert.match(push,/release-feed\.json/);
  assert.doesNotMatch(push,/preview\/dist|yamaconvert|prepare-cloudflare-pages/);
  assert.ok(releaseWorkflow.includes('git commit -m \"Record Yamaportal $VERSION release\"'));
  assert.ok(!releaseWorkflow.includes('[skip ci]'));
  assert.ok(releaseWorkflow.includes('actions: write'));
  assert.ok(releaseWorkflow.includes('/actions/workflows/yamaportal-pages-production.yml/dispatches'));
});

test('Yamaportal is listed with working web, PWA and current download routes',()=>{
  assert.match(app,/id:'yamaportal',name:'Yamaportal',icon:'yamaportal\.png'/);
  assert.match(app,/cards\(\['yamaportal','chat','search','help','view','convert'\]\)/);
  assert.match(app,/id==='yamaportal'\?'<button class="primary" data-detail="yamaportal"/);
  assert.match(links,/Otevřít web \/ PWA/);
  assert.match(links,/data-portal-route="stazeni"/);
  assert.match(html,/id="portal-version"/);
});
