const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const client=fs.readFileSync(path.join(root,'desktop/desktop-client.html'),'utf8');

for(const marker of [
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
 "payload=>ycHandlePresenceRealtime(payload)",
 "void ycTouchPresence(true);playVoiceCue('self-join')",
 "typeof ycOwnPresenceState==='function'?ycOwnPresenceState()"
]) assert(client.includes(marker),'Presence stability marker missing: '+marker);

assert(!client.includes("async function ycPresenceOffline(){try{if(user)await sb.from('user_presence').upsert({user_id:user.id,state:'offline'"),
 'Closing/logging out one client must not overwrite another active client with offline');
assert(!client.includes(".on('postgres_changes',{event:'*',schema:'public',table:'user_presence'},()=>ycRefreshVisibleSocialSoon())"),
 'Raw presence heartbeats must not rerender the whole social panel');
const presenceTimerStart=client.indexOf('function ycStartPresence()'),presenceTimerEnd=client.indexOf('ycStartPresence()',presenceTimerStart+20);
assert(presenceTimerStart>=0&&presenceTimerEnd>presenceTimerStart,'Presence timer boundary missing');
const presenceTimerBody=client.slice(presenceTimerStart,presenceTimerEnd);
assert(presenceTimerBody.includes("rightMode==='members'&&ycMembersPresenceNeedsRefresh()"),'Members timer must be gated by a visible-state transition');
assert(!presenceTimerBody.includes("else if(rightMode==='members')void renderRight()"),'Periodic social timer must not rerender Members unconditionally');
console.log('PASS Windows presence stability: one effective self state, active-client lease, no offline clobber and heartbeat rerender suppression.');
