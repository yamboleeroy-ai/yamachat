const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const client=fs.readFileSync(path.join(root,'index.html'),'utf8');
const friends=fs.readFileSync(path.join(root,'scripts/friends-panel-refresh.mjs'),'utf8');
const interaction=fs.readFileSync(path.join(root,'scripts/interaction-notifications.mjs'),'utf8');
assert(client.includes('ycDmNotifyGeneration=0')&&client.includes('ycDmMembershipGeneration=0')&&client.includes('ycDmUnreadGeneration=0'),
  'DM notification lifecycle generation guards missing');
assert(client.includes("const uid=String(user?.id||'');if(!uid)return;const generation=++ycDmUnreadGeneration"),
  'DM unread loads must bind to one account/generation');
assert(client.includes("notifyGeneration!==ycDmNotifyGeneration||String(user?.id||'')!==uid"),
  'DM targeted subscription must reject stale-account starts');
assert(client.includes("ycDmNotifySub===sub&&String(user?.id||'')===uid"),
  'DM message callbacks must belong to the current subscription/account');
assert(client.includes("membershipGeneration!==ycDmMembershipGeneration||ycDmMembershipSub!==sub"),
  'DM membership callbacks must reject stale subscriptions');
assert(client.includes("++ycDmNotifyGeneration;++ycDmMembershipGeneration;++ycDmUnreadGeneration"),
  'DM stop must invalidate all in-flight notification work before async channel removal');
assert(client.includes("setTimeout(()=>ycArmDmAudio(),900)"),
  'DM startup timeout must only arm audio and must not duplicate subscription initialization');
assert(!client.includes("setTimeout(()=>{ycArmDmAudio();if(user){void ycLoadDmUnread();void ycStartDmNotifications()}},900)"),
  'Legacy duplicate DM startup initialization must not return');
assert(client.includes("src.onended=()=>{try{src.disconnect()}catch{}try{gain.disconnect()}catch{}}"),
  'DM notification Web Audio nodes must disconnect after playback');
assert(client.includes('let ycWebUiPulseTimer=null'),'Web UI pulse lifecycle state missing');
assert(client.includes("ycOnLifecycle('init',ycWebStartUiPulse)"),'Web UI pulse must start only after authentication');
assert(client.includes("ycWebStopUiPulse();document.title='Yamachat'"),'Web UI pulse must stop/reset on logout');
assert(!client.includes("setInterval(()=>{void ycWebSyncWakeLock();const count="),'Always-on pre-auth web UI interval must not return');

// These are behavior-only deltas verified in preview/social-hover-context-7.
// The generated Web/PWA/Android client must contain them without inheriting desktop layout.
for(const marker of [
  "const YC_CHAT_SIGN_TIMEOUT_MS=2200,YC_CHAT_MEDIA_WORKERS=3",
  "let ycChatMediaAbortController=null",
  "function ycAbortChatMediaLoad()",
  "function ycAbortableQuery(q,signal)",
  "new AbortController();ycChatMediaAbortController=ycMediaAbort",
  "q=ycAbortableQuery(q,ycMediaAbort.signal)",
  "function ycChatCachedSignedUrl(a)",
  "function ycHydrateChatAttachments(atts,{loadSeq,chatKey,signal})",
  "void ycHydrateChatAttachments(atts||[],{loadSeq,chatKey,signal:ycMediaAbort.signal})",
  'loading="lazy" decoding="async" fetchpriority="low"',
  "const switchToken=ycHoldChatSwitch()",
  "try{await loadMessages()}finally{ycReleaseChatSwitch(switchToken)}",
  "async function ycMaybePeriodicDmRefresh()",
  "now-ycDmPeriodicRefreshAt<60000",
  "if(ycFriendsHomeMode)void ycMaybePeriodicDmRefresh()",
  "const YC_PRESENCE_STALE_MS=65000,YC_PRESENCE_ACTIVE_LEASE_MS=45000",
  "function ycOwnPresenceState()",
  "return Date.now()<ycPresenceRemoteOnlineUntil?'online':local",
  "function ycPresenceDisplayRow(uid,row)",
  "data-yc-presence-state",
  "function ycPatchVisibleMemberPresence(uid,row)",
  "async function ycRefreshVisibleMemberPresence()",
  "select('user_id,state,activity_text,last_seen_at')",
  "baseState==='afk'&&ycPresencePreference()==='online'",
  "age<YC_PRESENCE_ACTIVE_LEASE_MS",
  "if(skipWrite){ycLastPresenceSig=sig",
  "async function ycPresenceOffline(){ycPresenceRemoteOnlineUntil=0;return Promise.resolve()}",
  "else if(rightMode==='members')void ycRefreshVisibleMemberPresence()",
  "async function ycRefreshVisibleFriendPresence()",
  "if(rightMode==='friends')void ycRefreshVisibleFriendPresence()",
  "void ycTouchPresence(true);playVoiceCue('self-join')",
  "typeof ycOwnPresenceState==='function'?ycOwnPresenceState()",
  "Math.max(card.offsetHeight||0,280)",
  "document.documentElement.dataset.ycUiMenuOpen==='1'",
  "document.documentElement.dataset.ycContextPending==='1'",
  "window.addEventListener('wheel',ycCloseUiMenu,{capture:true,passive:true})",
  "window.addEventListener('touchmove',ycCloseUiMenu,{capture:true,passive:true})",
  "delete document.documentElement.dataset.ycUiMenuOpen",
  "document.documentElement.dataset.ycUiMenuOpen='1'"
]) assert(client.includes(marker),'Shared behavior marker missing: '+marker);

assert(!client.includes("table:'user_presence'},payload=>ycHandlePresenceRealtime(payload)"),'Generated client must not globally fan out presence heartbeats');
assert(!client.includes('function ycMembersPresenceNeedsRefresh()'),'Generated client must not retain obsolete member-presence comparison helper');
assert(!client.includes('function ycHandlePresenceRealtime(payload)'),'Generated client must not retain obsolete global presence handler');
assert(client.includes("table:'profiles',filter:'id=eq.'+user.id"),'Generated client must retain targeted own-profile realtime');

assert(!client.includes("const signed={};await Promise.all((atts||[]).map"),
  'Initial chat paint must not wait for every attachment signed URL');
assert(client.includes("while(ycChatRolePackCache.size>12)ycChatRolePackCache.delete(ycChatRolePackCache.keys().next().value)"),
  'Chat role pack cache must not retain every visited community until logout');
assert(client.includes("ycOnLifecycle('beforeCommunity',()=>{\n ycPresenceRowsByUser.clear();ycPresenceRenderedStateByUser.clear();ycVisibleMemberIds.clear();"),
  'Member presence caches must be released when switching communities');
assert(client.includes("ycChatRolePackCache.delete(key);ycChatRolePackCache.set(key,cached)"),
  'Chat role pack cache hits must refresh LRU order');
assert(client.includes("while(ycChatSignedUrlCache.size>600)ycChatSignedUrlCache.delete(ycChatSignedUrlCache.keys().next().value)"),
  'Attachment signed URL cache must enforce its size limit even when all entries are still valid');

const selectStart=client.indexOf('async function selectThread(id)');
const selectEnd=client.indexOf("$('newDmBtn').onclick",selectStart);
assert(selectStart>=0&&selectEnd>selectStart,'selectThread boundary missing');
const selectThread=client.slice(selectStart,selectEnd);
assert(!selectThread.includes('getChannels()'),'Opening a DM must not refetch server channels');
assert(selectThread.includes('finally{ycReleaseChatSwitch(switchToken)}'),'DM chat lock must release after message paint');

const presenceStart=client.indexOf('function ycStartPresence()');
const presenceEnd=client.indexOf('ycStartPresence()',presenceStart+20);
assert(presenceStart>=0&&presenceEnd>presenceStart,'presence timer boundary missing');
const presenceBody=client.slice(presenceStart,presenceEnd);
assert(!presenceBody.includes('if(ycFriendsHomeMode)void loadDmThreads()'),'15-second timer must not directly reload DM list');
assert(presenceBody.includes("else if(rightMode==='members')void ycRefreshVisibleMemberPresence()"),'Members timer must use the lightweight presence refresh');
assert(!presenceBody.includes("else if(rightMode==='members')void renderRight()"),'Members must not rerender unconditionally');
assert(!presenceBody.includes("if(rightMode==='friends')void renderFriends()"),'Friends timer must not fully reload the social panel');
const friendRefreshStart=client.indexOf('async function ycRefreshVisibleFriendPresence()'),friendRefreshEnd=client.indexOf('async function rejectFriend(',friendRefreshStart);
assert(friendRefreshStart>=0&&friendRefreshEnd>friendRefreshStart,'Generated lightweight friend presence refresh boundary missing');
const friendRefreshBody=client.slice(friendRefreshStart,friendRefreshEnd);
assert(friendRefreshBody.includes("from('user_presence')"),'Generated friend refresh must read presence rows');
for(const table of ['friendships','profiles','profile_stats'])assert(!friendRefreshBody.includes("from('"+table+"')"),'Generated friend presence refresh unexpectedly reloads '+table);
const memberRefreshStart=client.indexOf('async function ycRefreshVisibleMemberPresence()'),memberRefreshEnd=client.indexOf('function ycLastSeen(',memberRefreshStart);
assert(memberRefreshStart>=0&&memberRefreshEnd>memberRefreshStart,'Generated member presence refresh boundary missing');
const memberRefreshBody=client.slice(memberRefreshStart,memberRefreshEnd);
assert(memberRefreshBody.includes("from('user_presence')"),'Generated member refresh must read presence rows');
for(const table of ['community_members','community_roles','community_member_roles','desktop_server_role_layout','profiles','profile_stats'])assert(!memberRefreshBody.includes("from('"+table+"')"),'Generated member presence refresh unexpectedly reloads '+table);

assert(!client.includes("async function ycPresenceOffline(){try{if(user)await sb.from('user_presence').upsert({user_id:user.id,state:'offline'"),
 'One closing client must not overwrite another active client with offline');
assert(!client.includes(".on('postgres_changes',{event:'*',schema:'public',table:'user_presence'},()=>ycRefreshVisibleSocialSoon())"),
 'Raw presence heartbeats must not rerender the whole social panel');
assert(!client.includes("window.addEventListener('scroll',ycCloseUiMenu,true)"),
  'Programmatic list scroll must not close the context menu');
assert(!client.includes("ycHoverRender(data);ycHoverPosition(anchor)"),
  'Loaded hover content must not reposition and jump');

assert(friends.includes(".yc-friends-home #dmList{display:grid!important;gap:6px!important;padding-bottom:8px!important;overflow-x:hidden!important}"),
 'Friends DM list must suppress horizontal overflow');
assert(!friends.includes('transform:translateX(1px)'),'Friends hover must not shift the row sideways');

for(const marker of [
 '.yc-ui-menu,.yc-ui-menu *',
 '.message,.message *',
 '-webkit-user-select:text;user-select:text',
 'document.documentElement.dataset.ycContextPending'
]) assert(interaction.includes(marker),'Targeted touch-selection marker missing: '+marker);
assert(!/body\s*\{[^}]*user-select\s*:\s*none/i.test(interaction),'Text selection must not be disabled globally on body');

// Existing shared fixes must remain present: stream fullscreen controls and voice continuity.
for(const marker of [
 '[data-controls="hidden"] .yc-sv-footer',
 "for(const type of ['pointermove','pointerdown','touchstart'])panel.addEventListener",
 "if(voiceChannel?.id&&!defs.some(c=>String(c.id)===String(voiceChannel.id)))defs.push(voiceChannel)",
 "const voiceBelongsHere=!!hadVoice&&!!voiceCommunityId&&voiceCommunityId===cid",
 "const since=voiceMissingSince.get(id)||now;voiceMissingSince.set(id,since);if(now-since>60000)closeVoicePeer(id)",
 "const ycVoiceCid=ycVoiceCommunityId()",
 "voiceChannel?.community_id||voiceChannel?.communityId||currentCommunity?.id",
 "community_id:communityId"
]) assert(client.includes(marker),'Existing cross-platform behavior regressed: '+marker);
assert(!client.includes("if(pc?.connectionState==='connected'){voiceMissingSince.delete(id);continue}"),'Connected ghost-peer bypass must not return');

const communityStart=client.indexOf('async function selectCommunity(id){');
const communityEnd=client.indexOf('function renderChannels(chs)',communityStart);
assert(communityStart>=0&&communityEnd>communityStart,'selectCommunity boundary missing');
const communityBody=client.slice(communityStart,communityEnd);
for(const forbidden of ['leaveVoiceChannel(','ycRequestVoiceDisconnect(','cleanupVoiceRooms('])
 assert(!communityBody.includes(forbidden),'Browsing another server must not disconnect voice: '+forbidden);

console.log('PASS shared desktop-behavior sync: progressive media, presence stability, hover/context stability, targeted touch selection, fullscreen controls and voice continuity.');
