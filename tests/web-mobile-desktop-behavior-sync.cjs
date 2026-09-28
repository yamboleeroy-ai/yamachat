const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const client=fs.readFileSync(path.join(root,'index.html'),'utf8');
const friends=fs.readFileSync(path.join(root,'scripts/friends-panel-refresh.mjs'),'utf8');
const interaction=fs.readFileSync(path.join(root,'scripts/interaction-notifications.mjs'),'utf8');

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
  "function ycMembersPresenceNeedsRefresh()",
  "baseState==='afk'&&ycPresencePreference()==='online'",
  "age<YC_PRESENCE_ACTIVE_LEASE_MS",
  "if(skipWrite){ycLastPresenceSig=sig",
  "async function ycPresenceOffline(){ycPresenceRemoteOnlineUntil=0;return Promise.resolve()}",
  "rightMode==='members'&&ycMembersPresenceNeedsRefresh()",
  "function ycHandlePresenceRealtime(payload)",
  "if(beforeSig===afterSig)return",
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

assert(/payload\s*=>\s*ycHandlePresenceRealtime\(payload\)/.test(client)||client.includes("ycHandlePresenceRealtime(payload)"),'Generated client must route user_presence realtime payloads through the stable presence handler');

assert(!client.includes("const signed={};await Promise.all((atts||[]).map"),
  'Initial chat paint must not wait for every attachment signed URL');

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
assert(presenceBody.includes("rightMode==='members'&&ycMembersPresenceNeedsRefresh()"),'Members refresh must be state-gated');
assert(!presenceBody.includes("else if(rightMode==='members')void renderRight()"),'Members must not rerender unconditionally');

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
 "community_id:ycVoiceCommunity"
]) assert(client.includes(marker),'Existing cross-platform behavior regressed: '+marker);
assert(!client.includes("if(pc?.connectionState==='connected'){voiceMissingSince.delete(id);continue}"),'Connected ghost-peer bypass must not return');

const communityStart=client.indexOf('async function selectCommunity(id){');
const communityEnd=client.indexOf('function renderChannels(chs)',communityStart);
assert(communityStart>=0&&communityEnd>communityStart,'selectCommunity boundary missing');
const communityBody=client.slice(communityStart,communityEnd);
for(const forbidden of ['leaveVoiceChannel(','ycRequestVoiceDisconnect(','cleanupVoiceRooms('])
 assert(!communityBody.includes(forbidden),'Browsing another server must not disconnect voice: '+forbidden);

console.log('PASS shared desktop-behavior sync: progressive media, presence stability, hover/context stability, targeted touch selection, fullscreen controls and voice continuity.');
