const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const client=fs.readFileSync(path.join(root,'desktop/desktop-client.html'),'utf8');

for(const marker of [
  "const YC_TURN_USAGE_REFRESH_MS=15*60*1000",
  "let ycTurnUsageLastRefresh=0,ycTurnUsageRefreshBusy=false",
  "if(!user||ycTurnUsageRefreshBusy||(!force&&document.hidden))return",
  "now-ycTurnUsageLastRefresh<YC_TURN_USAGE_REFRESH_MS",
  "ycTurnUsageRefreshBusy=true",
  "ycTurnUsageLastRefresh=Date.now()",
  "ycTurnUsageRefreshBusy=false",
  "setInterval(()=>void ycRefreshTurnUsage(),YC_TURN_USAGE_REFRESH_MS)",
  "if(ycTurnUsageOpen)void ycRefreshTurnUsage()",
  "document.addEventListener('visibilitychange',()=>{if(!document.hidden&&user)void ycRefreshTurnUsage()})"
]) assert(client.includes(marker),'TURN usage scale marker missing: '+marker);

const start=client.indexOf('async function ycRefreshTurnUsage('),end=client.indexOf('// selectable screen-share resolution',start);
assert(start>=0&&end>start,'TURN usage block missing');
const block=client.slice(start,end);
assert(!block.includes('setInterval(()=>void ycRefreshTurnUsage(),60000)'),'TURN analytics still polls every minute');
assert(!block.includes("ycTurnUsageTimer=setInterval(()=>void ycRefreshTurnUsage(),60000)"),'Legacy one-minute TURN timer remains');
assert(block.includes("sb.functions.invoke('yamachat-turn-usage',{method:'GET'})"),'TURN usage source changed unexpectedly');
console.log('PASS Windows TURN usage scale: one in-flight request, hidden skip, 15-minute cadence and on-demand foreground refresh.');
