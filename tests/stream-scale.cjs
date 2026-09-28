const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
for(const file of ['desktop/desktop-client.html','index.html']){
  const html=fs.readFileSync(path.join(root,file),'utf8');
  assert(!html.includes(".on('postgres_changes',{event:'*',schema:'public',table:'community_stream_presence',filter:'community_id=eq.'+cid}"),file+' still fans stream heartbeat UPDATEs to the whole community');
  assert(html.includes("event:'INSERT',schema:'public',table:'community_stream_presence',filter:'community_id=eq.'+cid"),file+' stream INSERT discovery missing');
  assert(html.includes("event:'DELETE',schema:'public',table:'community_stream_presence'"),file+' stream DELETE discovery missing');
  assert(html.includes("ycCommunityStreamPollTimer=setInterval(()=>{if(String(currentCommunity?.id||'')===cid)void ycLoadCommunityStreams()},20000)"),file+' batched stream roster poll missing');
  assert(html.includes("if(ycCommunityStreamLoadBusy)return ycCommunityStreamLoadBusy"),file+' stream poll overlap guard missing');
  assert(html.includes("if(ycCommunityStreamPollTimer){clearInterval(ycCommunityStreamPollTimer);ycCommunityStreamPollTimer=null}"),file+' stream poll cleanup missing');
  const load=html.slice(html.indexOf('async function ycLoadCommunityStreams(){'),html.indexOf('async function ycStopCommunityStreamWatch(){'));
  assert(load.indexOf("if(error)throw error")<load.indexOf("ycCommunityStreams.clear();for(const [uid,row] of next)"),file+' stream roster must preserve last good state on query failure');
}
function oldUpdateDeliveriesPerSecond(users,streamers,heartbeat=12){return users*streamers/heartbeat}
for(const users of [100,200,500,1000]){
  const old=oldUpdateDeliveriesPerSecond(users,Math.max(1,Math.round(users*.05)));
  console.log(JSON.stringify({users,streamers:Math.max(1,Math.round(users*.05)),old_stream_heartbeat_realtime_deliveries_per_second:Number(old.toFixed(1)),new_stream_heartbeat_realtime_deliveries_per_second:0,stream_roster_rest_qps:Number((users/20).toFixed(1))}));
}
console.log('PASS stream scale: heartbeat/preview UPDATEs are not Realtime-fanned to the whole community; INSERT/DELETE remain instant and active streams refresh in a batched 20s roster poll.');
