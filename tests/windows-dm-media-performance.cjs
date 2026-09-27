const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const client=fs.readFileSync(path.join(root,'desktop/desktop-client.html'),'utf8');

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
  "if(ycFriendsHomeMode)void ycMaybePeriodicDmRefresh()"
]) assert(client.includes(marker),'DM media performance marker missing: '+marker);

assert(!client.includes("const signed={};await Promise.all((atts||[]).map"),
  'Initial chat paint must not wait for every attachment signed URL');

const selectStart=client.indexOf('async function selectThread(id)');
const selectEnd=client.indexOf("$('newDmBtn').onclick",selectStart);
assert(selectStart>=0&&selectEnd>selectStart,'selectThread boundary missing');
const selectThread=client.slice(selectStart,selectEnd);
assert(!selectThread.includes('getChannels()'),'Opening a DM must not refetch server channels');
assert(selectThread.includes('finally{ycReleaseChatSwitch(switchToken)}'),'DM chat lock must release as soon as message paint completes');

const presenceStart=client.indexOf('function ycStartPresence()');
const presenceEnd=client.indexOf('ycStartPresence()',presenceStart+20);
assert(presenceStart>=0&&presenceEnd>presenceStart,'presence timer boundary missing');
const presenceBody=client.slice(presenceStart,presenceEnd);
assert(!presenceBody.includes('if(ycFriendsHomeMode)void loadDmThreads()'),'15-second presence timer must not directly reload the DM list');

console.log('PASS Windows DM media performance: progressive lazy media, signed-URL timeout, stale-load cancellation, immediate chat unlock and throttled DM refresh.');
