const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');

function escapeRegExp(value){return value.replace(/[.*+?^$()|[\]{}\\]/g,'\\$&')}

for(const file of ['desktop/desktop-client.html','index.html']){
  const html=fs.readFileSync(path.join(root,file),'utf8');
  const scripts=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).join('\n');
  const ids=[...new Set([...html.matchAll(/<button\b[^>]*\bid=["']([^"']+)["']/gi)].map(m=>m[1]))].sort();
  const orphan=[];

  for(const id of ids){
    const e=escapeRegExp(id);
    const markup=[...html.matchAll(new RegExp('<button\\b[^>]*\\bid=["\\\']'+e+'["\\\'][^>]*>','gi'))].map(m=>m[0]).join(' ');
    const patterns=[
      "$('"+id+"')",
      "getElementById('"+id+"')",
      'getElementById("'+id+'")',
      "bindAction('"+id+"'",
      'bindAction("'+id+'"',
      "querySelector('#"+id+"')",
      'querySelector("#'+id+'")',
      "matches('#"+id+"')",
      'matches("#'+id+'")',
      "closest('#"+id+"')",
      'closest("#'+id+'")',
      '#'+id,
      "id==='"+id+"'",
      'id==="'+id+'"',
      "t.id==='"+id+"'",
      't.id==="'+id+'"'
    ];
    const inline=/\bonclick\s*=/.test(markup)||/\btype=["']submit["']/.test(markup);
    if(!inline&&!patterns.some(p=>scripts.includes(p)))orphan.push(id);
  }

  assert.deepEqual(orphan,[],file+' contains button controls without any runtime binding evidence: '+orphan.join(', '));
  console.log('PASS control binding audit '+file+': '+ids.length+' explicit button IDs have submit/direct/shared/delegated runtime binding evidence.');
}
