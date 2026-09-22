const CACHE='yamachat-web-1.0.81-pwa-install';
const SHELL=['./','./index.html','./manifest.webmanifest','./offline.html','./icons/icon-192.png','./icons/icon-512.png','./audio/mic-gate.worklet.js','./audio/rnnoise.worklet.js','./audio/rnnoise.mjs','./audio/rnnoise.wasm'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('yamachat-web-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('message',event=>{if(event.data?.type==='SKIP_WAITING')self.skipWaiting()});
self.addEventListener('fetch',event=>{
 const req=event.request,url=new URL(req.url);if(req.method!=='GET'||url.origin!==self.location.origin)return;
 if(req.mode==='navigate'){event.respondWith(fetch(req).then(r=>{if(r.ok){const safe=new URL('./index.html',self.registration.scope).href;caches.open(CACHE).then(c=>c.put(safe,r.clone()))}return r}).catch(async()=>await caches.match(new URL('./index.html',self.registration.scope).href)||await caches.match('./offline.html')));return}
 if(!/\.(?:js|mjs|wasm|png|ico|webmanifest)$/.test(url.pathname))return;
 event.respondWith(caches.match(req).then(cached=>cached||fetch(req).then(r=>{if(r.ok)caches.open(CACHE).then(c=>c.put(req,r.clone()));return r})));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();const target=event.notification.data?.target||{};const safe={messageId:String(target.messageId||''),channelId:String(target.channelId||''),threadId:String(target.threadId||''),communityId:String(target.communityId||'')};const url=new URL('./',self.registration.scope);if(safe.messageId)url.searchParams.set('message',safe.messageId);if(safe.channelId)url.searchParams.set('channel',safe.channelId);if(safe.threadId)url.searchParams.set('dm',safe.threadId);if(safe.communityId)url.searchParams.set('community',safe.communityId);
 event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(async clients=>{const client=clients.find(c=>c.url.startsWith(self.registration.scope));if(client){await client.focus();client.postMessage({type:'yamachat:web-notification',target:safe})}else await self.clients.openWindow(url.href)}));
});
