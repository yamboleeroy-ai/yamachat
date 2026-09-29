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
  assert(userRealtimeBlock.includes("status==='SUBSCRIBED'"),file+' user realtime reconnect resync missing');
  assert(userRealtimeBlock.includes("['CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(status)"),file+' user realtime dead-channel recovery missing');

  assert(html.includes("let realtime=null,realtimeCommunityId=''"),file+' role/social community ownership missing');
  for(const table of ['community_members','community_member_roles','community_roles','desktop_server_role_layout']){
    assert(html.includes("table:'"+table+"',filter:'community_id=eq.'+cid"),file+' '+table+' active-community filter missing');
  }
  const roleStart=html.indexOf("let realtime=null,realtimeCommunityId=''");
  const roleBlock=html.slice(roleStart,roleStart+7000);
  assert(!roleBlock.includes("table:'friendships'}"),file+' role/social layer still duplicates global friendship realtime');
  assert(roleBlock.includes("ycOnLifecycle('beforeCommunity',stopRealtime)"),file+' old community realtime is not stopped before switch');
  assert(roleBlock.includes("ycOnLifecycle('beforeAuth',stopRealtime)"),file+' role/social realtime logout cleanup missing');
  assert(roleBlock.includes("status==='SUBSCRIBED'"),file+' role/social subscription recovery sync missing');
  assert(roleBlock.includes("['CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(status)"),file+' role/social dead-channel recovery missing');
  assert(roleBlock.includes("setInterval(()=>{if(user?.id){if(!userRealtimeSub)subscribeUserRealtime();ensureRealtime()}},20000)"),file+' realtime watchdog missing');
  const watchdog=roleBlock.slice(roleBlock.indexOf('setInterval(()=>{if(user?.id)'),roleBlock.indexOf('setTimeout(()=>',roleBlock.indexOf('setInterval(()=>{if(user?.id)')));
  assert(!watchdog.includes('refreshSocialTabCounts()'),file+' realtime watchdog still polls social counts');
  assert(!watchdog.includes('applyMessageRoleColors()'),file+' realtime watchdog still reloads role data');
  const hiddenBlock=html.slice(html.indexOf('const ycHiddenBaseSubscribeCommunityRealtime'),html.indexOf('// Password entry guards:'));
  assert(hiddenBlock.includes('function ycStartHiddenChannelRealtime(communityId)'),file+' hidden-channel realtime recovery helper missing');
  assert(hiddenBlock.includes("status==='SUBSCRIBED'"),file+' hidden-channel reconnect resync missing');
  assert(hiddenBlock.includes("['CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(status)"),file+' hidden-channel dead subscription recovery missing');
  assert(hiddenBlock.includes("if(currentCommunity&&!document.hidden&&!ycHiddenChannelSub)ycStartHiddenChannelRealtime(currentCommunity.id)"),file+' hidden-channel watchdog does not restore missing realtime');
  const hiddenWatchdog=hiddenBlock.slice(hiddenBlock.indexOf('ycHiddenChannelPoll=setInterval'),hiddenBlock.indexOf('return out;',hiddenBlock.indexOf('ycHiddenChannelPoll=setInterval')));
  assert(!hiddenWatchdog.includes('ycRefreshChannelsSecure()'),file+' hidden-channel watchdog still polls the database while realtime is healthy');
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
