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
  assert(html.includes("function socialCountKey(){return String(user?.id||'')+'|'+String(currentCommunity?.id||'')}"),file+' social-count context ownership missing');
  assert(html.includes("if(!force&&!countBusy&&key===countLastKey&&now-countLastAt<1000)return"),file+' duplicate social-count render reads are not coalesced');
  assert(html.includes("if(countBusy){if(force||key!==countBusyKey){countAgain=true;countForceAgain=countForceAgain||force}return}"),file+' in-flight social-count coalescing missing');
  assert(html.includes("if(socialCountKey()!==key)return"),file+' stale social-count response can paint after auth/community switch');
  assert(!html.includes("if(countBusy){countAgain=true;return}"),file+' old duplicate social-count rerun loop remains');
  assert(userRealtimeBlock.includes("window.__ycRefreshSocialTabCounts(true)"),file+' friendship realtime must force a fresh count snapshot');

  const communityStart=html.indexOf('// COMMUNITY REALTIME CONSOLIDATED 2026-09-29');
  assert(communityStart>=0,file+' consolidated core community realtime missing');
  const communityEnd=html.indexOf('function subscribeUserRealtime()',communityStart);
  const communityBlock=html.slice(communityStart,communityEnd);
  assert(communityBlock.includes("event:'INSERT',schema:'public',table:'community_members',filter:'community_id=eq.'+cid"),file+' core member INSERT scope missing');
  assert(communityBlock.includes("event:'UPDATE',schema:'public',table:'community_members',filter:'community_id=eq.'+cid"),file+' core member UPDATE scope missing');
  assert(communityBlock.includes("if(String(payload.new?.user_id||'')===uid&&!await reloadSelfContext(true))return"),file+' self membership changes must refresh auth/community/permission context');
  assert(communityBlock.includes("status==='SUBSCRIBED'"),file+' core community reconnect subscription status missing');
  assert(communityBlock.includes("if(subscribedOnce)void resync();else subscribedOnce=true"),file+' core community reconnect must resync only after the first subscription');
  assert(communityBlock.includes("['CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(status)"),file+' core community dead-channel cleanup missing');
  assert(communityBlock.includes("window.__ycInvalidateRoleVisuals?.()"),file+' core member event no longer invalidates role visuals');
  assert(communityBlock.includes("window.__ycRefreshSocialTabCounts?.(true)"),file+' core member event no longer refreshes social counts');

  assert(html.includes("let realtime=null,realtimeCommunityId=''"),file+' role/social community ownership missing');
  for(const table of ['community_member_roles','community_roles','desktop_server_role_layout']){
    assert(html.includes("table:'"+table+"',filter:'community_id=eq.'+cid"),file+' '+table+' active-community filter missing');
  }
  const roleStart=html.indexOf("let realtime=null,realtimeCommunityId=''");
  const roleBlock=html.slice(roleStart,roleStart+7000);
  assert(!roleBlock.includes("table:'friendships'}"),file+' role/social layer still duplicates global friendship realtime');
  assert(roleBlock.includes("ycOnLifecycle('beforeCommunity',stopRealtime)"),file+' old community realtime is not stopped before switch');
  assert(roleBlock.includes("ycOnLifecycle('beforeAuth',stopRealtime)"),file+' role/social realtime logout cleanup missing');
  assert(roleBlock.includes("status==='SUBSCRIBED'"),file+' role/social subscription recovery sync missing');
  assert(roleBlock.includes("syncRealtimeSnapshot(cid){if(String(currentCommunity?.id||'')!==String(cid))return;window.__ycInvalidateRoleVisuals();void refreshSocialTabCounts(true)"),file+' role/social reconnect snapshot must force fresh counts');
  assert(!roleBlock.includes("table:'community_members'"),file+' role/social layer still duplicates the core community_members subscription');
  assert(roleBlock.includes("['CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(status)"),file+' role/social dead-channel recovery missing');
  assert(roleBlock.includes("setInterval(()=>{if(user?.id){if(!userRealtimeSub)subscribeUserRealtime();if(currentCommunity?.id&&!communityRealtimeSub)subscribeCommunityRealtime(currentCommunity.id);ensureRealtime()}},20000)"),file+' realtime watchdog must restore user, core community and role subscriptions');
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
function duplicateMemberCallbacks(clientsInAffectedCommunity,changes){return clientsInAffectedCommunity*changes*2}
for(const clients of [100,500,1000]){
  const affected=Math.max(1,Math.round(clients*0.1)),changes=10;
  console.log(JSON.stringify({
    clients,
    changes,
    old_global_role_event_deliveries:oldGlobalDeliveries(clients,changes),
    scoped_role_event_deliveries:scopedDeliveries(affected,changes),
    pre_consolidation_duplicate_member_callbacks:duplicateMemberCallbacks(affected,changes),
    consolidated_member_callbacks:scopedDeliveries(affected,changes),
    model_assumption:'10% of connected clients currently viewing affected community'
  }));
  assert(scopedDeliveries(affected,changes)<oldGlobalDeliveries(clients,changes));
  assert.equal(scopedDeliveries(affected,changes)*2,duplicateMemberCallbacks(affected,changes));
}
console.log('PASS realtime scope model: friendship changes are user-targeted; community_members has one reconnect-safe active-community owner; role/layout realtime stays scoped.');
