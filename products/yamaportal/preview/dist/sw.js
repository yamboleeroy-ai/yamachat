'use strict';
const CACHE='yamaportal-shell-v35';
const SHELL=['./','./index.html','./style.css','./account.css','./app.js','./yamahost-ui.js','./yamahost.css','./downloads.js','./consent-core.js','./consent-ui.js','./app-links.js','./module-host.js','./native-ui.js','./account-core.js','./identity-core.js','./auth-session-storage.js','./account-ui.js','./community-ui.js','./release-feed-ui.js','./pwa.js','./portal-version.json','./vendor/supabase.js','./manifest.webmanifest','./assets/yamaportal.png','./assets/yamahost.png','./assets/yamaportal-180.png','./assets/yamaportal-192.png','./assets/yamaportal-512.png','./assets/yamachat.png','./assets/yamasearch.png','./assets/yamahelp.png','./assets/providers/google.svg','./assets/providers/microsoft.svg','./assets/providers/apple.svg','./assets/providers/facebook.svg','./assets/providers/discord.svg','./assets/providers/github.svg'];
const allowed=new Set(SHELL.map(path=>new URL(path,self.registration.scope).href));
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('yamaportal-shell-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  const request=event.request;const url=new URL(request.url);
  // Only the exact public app shell is cacheable. Never intercept Auth/API,
  // account-config, remote avatars, bearer requests or another application's SW.
  if(request.method!=='GET'||request.headers.has('authorization')||url.origin!==self.location.origin)return;
  const scope=new URL(self.registration.scope);
  const publicEntry=request.mode==='navigate'&&(url.pathname===scope.pathname||url.pathname===scope.pathname+'index.html')
    &&Array.from(url.searchParams.keys()).every(key=>key==='v');
  if(!allowed.has(url.href)&&!publicEntry)return;
  const cachedRequest=publicEntry?new URL('./index.html',scope).href:request;
  event.respondWith(fetch(request).catch(()=>caches.match(cachedRequest).then(response=>response||new Response('Yamaportal není dostupný offline. Nejdřív ho otevři s připojením a vyčkej na přípravu offline režimu.',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}}))));
});

