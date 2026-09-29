const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const client=fs.readFileSync(path.join(root,'desktop/desktop-client.html'),'utf8');

for(const marker of [
  "const YC_SHARED_HEADERS_REFRESH_MS=5*60*1000",
  "let ycHeadersLoading=false,ycHeadersLastRefresh=0",
  "if(!user?.id||ycHeadersLoading||(!force&&document.hidden))return",
  "now-ycHeadersLastRefresh<YC_SHARED_HEADERS_REFRESH_MS",
  "ycHeadersLastRefresh=Date.now()",
  "setInterval(()=>{if(!document.hidden)void ycRefreshSharedHeaders()},YC_SHARED_HEADERS_REFRESH_MS)",
  "document.addEventListener('visibilitychange',()=>{if(!document.hidden&&user)void ycRefreshSharedHeaders()})"
]) assert(client.includes(marker),'Shared-header scale marker missing: '+marker);

const start=client.indexOf('async function ycRefreshSharedHeaders('),end=client.indexOf('async function ycOpenStreamFromUser',start);
assert(start>=0&&end>start,'Shared-header polling block missing');
const block=client.slice(start,end);
assert(!block.includes('},30000)'),'Legacy 30-second shared-header timer remains');
assert(!block.includes("ycOnLifecycle('community',ycRefreshSharedHeaders)"),'Community switches must not bypass refresh throttling');
assert(block.includes("from('desktop_server_headers').select('community_id,background_data')"),'Shared-header query changed unexpectedly');
console.log('PASS Windows shared-header scale: cached five-minute polling, hidden skip and foreground refresh.');
