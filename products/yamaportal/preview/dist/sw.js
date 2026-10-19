'use strict';
const CACHE='yamaportal-shell-v18';
const SHELL=['./','./index.html','./style.css','./account.css','./app.js','./downloads.js','./consent-core.js','./consent-ui.js','./app-links.js','./module-host.js','./native-ui.js','./account-core.js','./identity-core.js','./account-ui.js','./pwa.js','./vendor/supabase.js','./manifest.webmanifest','./assets/yamaportal.png','./assets/yamachat.png','./assets/yamasearch.png','./assets/yamahelp.png','./assets/providers/google.svg','./assets/providers/microsoft.svg','./assets/providers/apple.svg','./assets/providers/facebook.svg','./assets/providers/discord.svg','./assets/providers/github.svg'];
const allowed=new Set(SHELL.map(path=>new URL(path,self.registration.scope).href));
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('yamaportal-shell-')&&key!==CACHE).map(key=>caches.delete(key))))));
self.addEventListener('fetch',event=>{
  const request=event.request;const url=new URL(request.url);
  // Only the exact public app shell is cacheable. Never intercept Auth/API,
  // account-config, remote avatars, bearer requests or another application's SW.
  if(request.method!=='GET'||request.headers.has('authorization')||url.origin!==self.location.origin||!allowed.has(url.href))return;
  event.respondWith(fetch(request).catch(()=>caches.match(request).then(response=>response||new Response('Yamaportal není dostupný offline.',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}}))));
});
