const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
for(const file of ['desktop/desktop-client.html','index.html']){
  const src=fs.readFileSync(path.join(root,file),'utf8');
  for(const marker of [
    "let currentModeratorPerms={},ycModeratorPermCacheKey='',ycModeratorPermLoad=null,ycModeratorPermLoadKey=''",
    'function ycModeratorPermKey()',
    'if(!force&&key===ycModeratorPermCacheKey)return',
    'if(ycModeratorPermLoad&&ycModeratorPermLoadKey===key){await ycModeratorPermLoad;if(!force)return}',
    'if(ycModeratorPermKey()!==key)return',
    'ycModeratorPermLoad=request;ycModeratorPermLoadKey=key',
    'loadCurrentModeratorPermissions(true);if(!owns())return'
  ])assert(src.includes(marker),file+' moderator permission lifecycle marker missing: '+marker);
  const selectStart=src.indexOf('async function selectCommunity(id){'),selectEnd=src.indexOf('function renderChannels(chs)',selectStart);
  assert(selectStart>=0&&selectEnd>selectStart,file+' selectCommunity boundary missing');
  assert(src.slice(selectStart,selectEnd).includes('await loadCurrentModeratorPermissions()'),file+' server switch must prime moderator permissions');
  const rightStart=src.indexOf('async function renderRight('),rightEnd=src.indexOf('async function ycMemberProfile(',rightStart);
  assert(rightStart>=0&&rightEnd>rightStart,file+' renderRight boundary missing');
  assert(src.slice(rightStart,rightEnd).includes('await loadCurrentModeratorPermissions()'),file+' member render must share the same permission snapshot');
}
console.log('PASS moderator permission lifecycle: server switch/member render share one context-owned snapshot; realtime permission changes force a fresh read.');
