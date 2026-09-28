const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');

for(const file of ['desktop/desktop-client.html','index.html']){
  const html=fs.readFileSync(path.join(root,file),'utf8');
  assert(html.includes("filter:'requester_id=eq.'+user.id"),file+' friendship requester scope missing');
  assert(html.includes("filter:'addressee_id=eq.'+user.id"),file+' friendship addressee scope missing');
  assert(html.includes("const onFriendChange=()=>void ycRefreshNotificationCenter()"),file+' notification-center friendship handler missing');
  const notifyStart=html.indexOf("async function ycStartFriendNotificationSub()");
  const notifyEnd=html.indexOf("async function ycStopFriendNotificationSub()",notifyStart);
  const notifyBlock=html.slice(notifyStart,notifyEnd);
  assert(notifyBlock.includes("filter:'requester_id=eq.'+user.id"),file+' friend notification requester scope missing');
  assert(notifyBlock.includes("filter:'addressee_id=eq.'+user.id"),file+' friend notification addressee scope missing');

  assert(html.includes("let realtime=null,realtimeCommunityId=''"),file+' role/social community ownership missing');
  for(const table of ['community_members','community_member_roles','community_roles','desktop_server_role_layout']){
    assert(html.includes("table:'"+table+"',filter:'community_id=eq.'+cid"),file+' '+table+' active-community filter missing');
  }
  const roleStart=html.indexOf("let realtime=null,realtimeCommunityId=''");
  const roleBlock=html.slice(roleStart,roleStart+7000);
  assert(!roleBlock.includes("table:'friendships'}"),file+' role/social layer still duplicates global friendship realtime');
  assert(roleBlock.includes("ycOnLifecycle('beforeCommunity',stopRealtime)"),file+' old community realtime is not stopped before switch');
  assert(roleBlock.includes("ycOnLifecycle('beforeAuth',stopRealtime)"),file+' role/social realtime logout cleanup missing');
}

function oldGlobalDeliveries(clients,changes){return clients*changes}
function scopedDeliveries(clientsInAffectedCommunity,changes){return clientsInAffectedCommunity*changes}
for(const clients of [100,500,1000]){
  const affected=Math.max(1,Math.round(clients*0.1)),changes=10;
  console.log(JSON.stringify({
    clients,
    changes,
    old_global_role_event_deliveries:oldGlobalDeliveries(clients,changes),
    scoped_role_event_deliveries:scopedDeliveries(affected,changes),
    model_assumption:'10% of connected clients currently viewing affected community'
  }));
  assert(scopedDeliveries(affected,changes)<oldGlobalDeliveries(clients,changes));
}
console.log('PASS realtime scope model: friendship changes are user-targeted and role/member realtime is limited to the active community.');
