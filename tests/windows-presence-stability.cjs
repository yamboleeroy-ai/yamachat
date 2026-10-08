const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const client=fs.readFileSync(path.join(root,'desktop/desktop-client.html'),'utf8');

for(const marker of [
 "const YC_PRESENCE_STALE_MS=150000,YC_PRESENCE_ACTIVE_LEASE_MS=120000",
 "if(ms<YC_PRESENCE_STALE_MS)return'Právě online'",
 "function ycOwnPresenceState()",
 "return Date.now()<ycPresenceRemoteOnlineUntil?'online':local",
 "function ycPresenceDisplayRow(uid,row)",
 "data-yc-presence-state",
 "function ycPatchVisibleMemberPresence(uid,row)",
 "baseState==='afk'&&ycPresencePreference()==='online'",
 "age<YC_PRESENCE_ACTIVE_LEASE_MS",
 "if(skipWrite){ycLastPresenceSig=sig",
 "async function ycPresenceOffline(){ycPresenceRemoteOnlineUntil=0;return Promise.resolve()}",
 "async function ycRefreshVisibleMemberPresence()",
 "select('user_id,state,activity_text,last_seen_at')",
 "else if(rightMode==='members')void ycRefreshVisibleMemberPresence()",
 "async function ycRefreshVisibleFriendPresence()",
 "if(rightMode==='friends')void ycRefreshVisibleFriendPresence()",
 "void ycTouchPresence(true);playVoiceCue('self-join')",
 "const YC_VOICE_HEARTBEAT_HARDENED_MS=45000",
 "YC_VOICE_TTL_MS=120000",
 "void ycTouchPresence(true).catch(error=>console.warn('voice social keepalive',error))",
 "typeof ycOwnPresenceState==='function'?ycOwnPresenceState()"
]) assert(client.includes(marker),'Presence stability marker missing: '+marker);

assert(!client.includes("async function ycPresenceOffline(){try{if(user)await sb.from('user_presence').upsert({user_id:user.id,state:'offline'"),
 'Closing/logging out one client must not overwrite another active client with offline');
assert(!client.includes(".on('postgres_changes',{event:'*',schema:'public',table:'user_presence'},()=>ycRefreshVisibleSocialSoon())"),
 'Raw presence heartbeats must not rerender the whole social panel');
assert(!client.includes("table:'user_presence'},payload=>ycHandlePresenceRealtime(payload)"),
 'Presence heartbeat rows must not be globally fanned out through Realtime');
assert(!client.includes('function ycMembersPresenceNeedsRefresh()'),
 'Obsolete member-presence comparison helper must not remain');
assert(!client.includes('function ycHandlePresenceRealtime(payload)'),
 'Obsolete global presence realtime handler must not remain');
assert(client.includes("table:'profiles',filter:'id=eq.'+user.id"),
 'Realtime profile sync must be scoped to the signed-in user');

const presenceTimerStart=client.indexOf('function ycStartPresence()'),presenceTimerEnd=client.indexOf('ycStartPresence()',presenceTimerStart+20);
assert(presenceTimerStart>=0&&presenceTimerEnd>presenceTimerStart,'Presence timer boundary missing');
const presenceTimerBody=client.slice(presenceTimerStart,presenceTimerEnd);
assert(presenceTimerBody.includes("else if(rightMode==='members')void ycRefreshVisibleMemberPresence()"),'Members timer must use the lightweight presence refresh');
assert(!presenceTimerBody.includes("else if(rightMode==='members')void renderRight()"),'Periodic social timer must not rerender Members unconditionally');
assert(!presenceTimerBody.includes("if(rightMode==='friends')void renderFriends()"),'Periodic social timer must not fully reload Friends');
const friendRefreshStart=client.indexOf('async function ycRefreshVisibleFriendPresence()'),friendRefreshEnd=client.indexOf('async function rejectFriend(',friendRefreshStart);
assert(friendRefreshStart>=0&&friendRefreshEnd>friendRefreshStart,'Lightweight friend presence refresh boundary missing');
const friendRefreshBody=client.slice(friendRefreshStart,friendRefreshEnd);
assert(friendRefreshBody.includes("from('user_presence')"),'Lightweight friend refresh must read presence rows');
for(const table of ['friendships','profiles','profile_stats'])assert(!friendRefreshBody.includes("from('"+table+"')"),'Lightweight friend presence refresh unexpectedly reloads '+table);
const memberRefreshStart=client.indexOf('async function ycRefreshVisibleMemberPresence()'),memberRefreshEnd=client.indexOf('function ycLastSeen(',memberRefreshStart);
assert(memberRefreshStart>=0&&memberRefreshEnd>memberRefreshStart,'Lightweight member presence refresh boundary missing');
const memberRefreshBody=client.slice(memberRefreshStart,memberRefreshEnd);
assert(memberRefreshBody.includes("from('user_presence')"),'Lightweight member refresh must read presence rows');
for(const table of ['community_members','community_roles','community_member_roles','desktop_server_role_layout','profiles','profile_stats'])assert(!memberRefreshBody.includes("from('"+table+"')"),'Lightweight member presence refresh unexpectedly reloads '+table);
console.log('PASS Windows presence stability: one effective self state, active-client lease, no global heartbeat fanout, no offline clobber and lightweight batched member presence refresh.');
