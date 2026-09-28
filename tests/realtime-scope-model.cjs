const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');

for(const file of ['desktop/desktop-client.html','index.html']){
  const html=fs.readFileSync(path.join(root,file),'utf8');
  const userRealtimeStart=html.indexOf('function subscribeUserRealtime()');
  assert(userRealtimeStart>=0,file+' user realtime lifecycle missing');
  const userRealtimeBlock=html.slice(userRealtimeStart,userRealtimeStart+4200);
  assert(userRealtimeBlock.includes("filter:'requester_id=eq.'+uid"),file+' friendship requester scope missing');
  assert(userRealtimeBlock.includes("filter:'addressee_id=eq.'+uid"),file+' friendship addressee scope missing');
  assert(/const uid=(?:String\()?user\?\.id/.test(userRealtimeBlock),file+' friendship realtime is not bound to an auth-owner snapshot');
  assert(userRealtimeBlock.includes("typeof ycRefreshNotificationCenter==='function'"),file+' friendship realtime no longer refreshes notification center');
  assert(!html.includes('yc-notify-friends-'),file+' duplicate notification-center friendship realtime channel remains');
  assert(!html.includes('ycStartFriendNotificationSub'),file+' duplicate friendship subscription lifecycle remains');

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
