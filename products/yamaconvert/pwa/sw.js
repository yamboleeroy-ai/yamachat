'use strict';
const CACHE = 'yamaconvert-pwa-v4';
const SHARE_DB = 'yamaconvert-share-inbox-v1';
const SHARE_STORE = 'shares';
const SHARE_MAX_BYTES = 100 * 1024 * 1024;
const SHARE_MAX_TOTAL_BYTES = 100 * 1024 * 1024;
const SHELL = [
  './', './index.html', './manifest.webmanifest', './icons/yamaconvert.svg',
  './icons/yamaconvert-192.png', './icons/yamaconvert-512.png',
  './design/logo-reference.png', './account.js', './image-formats.js', './vendor/lamejs/lame.min.js',
  './audio-formats.js', './document-formats.js', './video-formats.js',
  './history.js', './app.js', './navigation.js', './download-config.js', './downloads.js', './share-inbox.js', './pwa.js'
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => key.startsWith('yamaconvert-pwa-') && key !== CACHE).map(key => caches.delete(key))
  )).then(() => self.clients.claim()));
});
function openShareDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(SHARE_DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(SHARE_STORE, { keyPath: 'id', autoIncrement: true });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
function isMediaFile(file) {
  const extension = (file.name || '').toLowerCase().match(/\.([^.]+)$/)?.[1] || '';
  return file.type?.startsWith('audio/') || file.type?.startsWith('video/') ||
    ['mp3','wav','m4a','ogg','opus','oga','mp4','webm','mov','mkv','avi','wmv','flv','mpeg','mpg','m4v','3gp','ogv','vob','ts','mts','m2ts'].includes(extension);
}
async function receiveSharedContent(request, scope) {
  const target = new URL('./?share=error', scope);
  try {
    const form = await request.formData();
    const files = form.getAll('mediaFiles').filter(value => typeof value !== 'string' && value.size > 0 && isMediaFile(value));
    const rawUrl = String(form.get('url') || '').trim();
    const rawText = String(form.get('text') || '').trim();
    let sharedUrl = '';
    for (const candidate of [rawUrl, rawText]) {
      try {
        const parsed = new URL(candidate);
        if (parsed.protocol === 'https:' && !parsed.username && !parsed.password) { sharedUrl = parsed.href; break; }
      } catch {}
    }
    const totalBytes = files.reduce((total, file) => total + file.size, 0);
    if (files.length > 5 || files.some(file => file.size > SHARE_MAX_BYTES) || totalBytes > SHARE_MAX_TOTAL_BYTES) {
      target.searchParams.set('share', 'too-large');
    } else if (!files.length && !sharedUrl) {
      target.searchParams.set('share', 'unsupported');
    } else {
      const db = await openShareDb();
      await new Promise((resolve, reject) => {
        const transaction = db.transaction(SHARE_STORE, 'readwrite');
        const store = transaction.objectStore(SHARE_STORE);
        const all = store.getAll();
        all.onsuccess = () => {
          for (const item of all.result) if (Date.now() - item.receivedAt > 24 * 60 * 60 * 1000) store.delete(item.id);
          store.add({ receivedAt: Date.now(), files, url: sharedUrl, title: String(form.get('title') || '').slice(0, 300) });
        };
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
      db.close();
      target.searchParams.set('share', 'received');
    }
  } catch {
    target.searchParams.set('share', 'unavailable');
  }
  return Response.redirect(target.href, 303);
}
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const scope = new URL(self.registration.scope);
  if (!url.pathname.startsWith(scope.pathname)) return;
  const sharePath = new URL('./share/', scope).pathname;
  if (request.method === 'POST' && request.mode === 'navigate' && url.pathname === sharePath) {
    event.respondWith(receiveSharedContent(request, scope.href));
    return;
  }
  if (request.method !== 'GET') return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(async () => (await caches.match('./index.html')) || Response.error()));
    return;
  }
  event.respondWith(caches.match(request).then(hit => hit || fetch(request)));
});
