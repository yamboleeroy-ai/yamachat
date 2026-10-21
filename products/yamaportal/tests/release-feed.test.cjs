const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const cp=require('node:child_process');
const root=path.join(__dirname,'..','..','..');
const ui=fs.readFileSync(path.join(__dirname,'..','preview','dist','release-feed-ui.js'),'utf8');
const app=fs.readFileSync(path.join(__dirname,'..','preview','dist','app.js'),'utf8');
const index=fs.readFileSync(path.join(__dirname,'..','preview','dist','index.html'),'utf8');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'release-feed.json'),'utf8'));

test('release history contains only complete, timestamped release records',()=>{
  assert.equal(manifest.schemaVersion,1);
  assert.ok(Array.isArray(manifest.releases));
  for(const release of manifest.releases){
    assert.ok(release.id&&release.app&&release.kind&&release.version&&release.title);
    assert.ok(release.summary&&release.details);
    assert.ok(Number.isFinite(Date.parse(release.releasedAt)));
    assert.ok(Array.isArray(release.platforms)&&release.platforms.length>0);
  }
  assert.match(ui,/po zveřejnění aktualizace/i);
  assert.match(ui,/Ověřená vydání/);
});

test('release entries are validated, ordered, icon-branded and open details safely',()=>{
  for(const appId of ['yamaportal','yamachat','yamasearch','yamahelp','yamaview','yamamaker','yamaconvert'])assert.match(ui,new RegExp(`${appId}:`));
  assert.match(ui,/sort\(\(a,b\)=>Date\.parse\(b\.releasedAt\)-Date\.parse\(a\.releasedAt\)\)/);
  assert.match(ui,/escape\(item\.details\)/);
  assert.match(ui,/data-release-id/);
  assert.match(ui,/modal\.showModal\(\)/);
  assert.match(app,/YamaReleaseFeed\?\.render\(\)/);
  assert.match(index,/release-feed-ui\.js/);
});

test('release recorder accepts only complete, timestamped release records and deduplicates tags',()=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'yamaportal-release-feed-'));
  try{
    fs.mkdirSync(path.join(temp,'scripts'));
    fs.copyFileSync(path.join(root,'scripts','record-portal-release.cjs'),path.join(temp,'scripts','record-portal-release.cjs'));
    fs.writeFileSync(path.join(temp,'release-feed.json'),JSON.stringify({schemaVersion:1,releases:[]}));
    const entryPath=path.join(temp,'entry.json');
    const entry={id:'yamaconvert:1.0.3',app:'yamaconvert',kind:'update',version:'1.0.3',title:'YamaConvert 1.0.3',summary:'Mobilní rozhraní a spolehlivé aktualizace.',details:'Android APK se aktualizuje přes Yamaportal.',releasedAt:'2026-10-21T12:00:00Z',platforms:['Android APK']};
    fs.writeFileSync(entryPath,JSON.stringify(entry));
    const run=()=>cp.spawnSync(process.execPath,[path.join(temp,'scripts','record-portal-release.cjs'),entryPath],{encoding:'utf8'});
    assert.equal(run().status,0);
    assert.equal(run().status,0);
    assert.equal(JSON.parse(fs.readFileSync(path.join(temp,'release-feed.json'))).releases.length,1);
    entry.details='';fs.writeFileSync(entryPath,JSON.stringify(entry));
    assert.notEqual(run().status,0);
  }finally{fs.rmSync(temp,{recursive:true,force:true});}
});
