const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const runtime=read('scripts/runtime-stability-hardening.mjs');
const desktop=read('desktop/desktop-client.html');
const web=read('web/integration.js');
const native=read('web/native-integration.js');
const wns=read('scripts/windows-wns-client.mjs');
const backend=read('supabase/functions/yamachat-source/index.ts');

assert(runtime.includes("await window.ycDetachPushBeforeLogout?.()"),'explicit auth exit must detach push before signOut');
assert(desktop.indexOf("await window.ycDetachPushBeforeLogout?.()")<desktop.indexOf("await sb.auth.signOut()"),'desktop push detach must run before signOut');

for(const marker of [
 "ycWebPushSyncPromise",
 "ycWebPushRegisteredKey",
 "ycWebPushGeneration",
 "action:'unregister',endpoint:value",
 "window.ycDetachPushBeforeLogout=ycWebPushDetach",
 "ycOnLifecycle('beforeAuth',()=>{ycWebPushGeneration++"
])assert(web.includes(marker),'web push lifecycle marker missing: '+marker);

for(const marker of [
 "userId:''",
 "ycNativePushGeneration",
 "ycNativePushStatus.token===value&&ycNativePushStatus.userId===uid",
 "action:'unregister',token:value",
 "ycNativePreviousPushDetach=window.ycDetachPushBeforeLogout",
 "window.ycDetachPushBeforeLogout=async()"
])assert(native.includes(marker),'native push lifecycle marker missing: '+marker);

for(const source of [wns,desktop])for(const marker of [
 "ycWnsEndpoint=''",
 "ycWnsGeneration=0",
 "async function ycWnsUnregisterEndpoint",
 "action:'unregister',endpoint:value",
 "async function ycDetachWindowsWnsPush()",
 "generation!==ycWnsGeneration",
 "ycPreviousPushDetach=window.ycDetachPushBeforeLogout"
])assert(source.includes(marker),'WNS lifecycle marker missing: '+marker);

assert(backend.includes("if(action==='unregister')"),'push backend unregister route missing');
assert(backend.includes("admin.from('push_subscriptions').delete().eq('user_id',user.id)"),'push unregister must remain scoped to authenticated user');
assert(backend.includes("await admin.from('push_subscriptions').delete().eq('token',token)"),'native token registration must remain deduplicated');
assert(backend.includes("await admin.from('push_subscriptions').delete().eq('endpoint',endpoint)"),'web endpoint registration must remain deduplicated');

console.log('PASS push registration lifecycle: web/native/WNS registration is deduplicated, stale async registrations self-clean, and explicit logout detaches the backend subscription before auth sign-out.');
