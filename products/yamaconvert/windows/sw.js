'use strict';
const CACHE = 'yamaconvert-pwa-v1';
const SHELL = [
  './', './index.html', './manifest.webmanifest', './icons/yamaconvert.svg',
  './design/logo-reference.png', './image-formats.js', './vendor/lamejs/lame.min.js',
  './audio-formats.js', './document-formats.js', './video-formats.js',
  './history.js', './app.js', './navigation.js', './downloads.js', './batch-download.js', './pwa.js'
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => key.startsWith('yamaconvert-pwa-') && key !== CACHE).map(key => caches.delete(key))
  )).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  const scope = new URL(self.registration.scope);
  if (!url.pathname.startsWith(scope.pathname)) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(async () => (await caches.match('./index.html')) || Response.error()));
    return;
  }
  event.respondWith(caches.match(request).then(hit => hit || fetch(request)));
});
