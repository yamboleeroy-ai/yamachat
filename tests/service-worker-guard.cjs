const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const integration=fs.readFileSync(path.join(root,'web/integration.js'),'utf8');
const generated=fs.readFileSync(path.join(root,'index.html'),'utf8');

for(const src of [integration,generated]){
  assert(src.includes('function ycWebServiceWorker()'),'Service-worker capability helper missing');
  assert(src.includes("typeof sw.register==='function'&&typeof sw.addEventListener==='function'"),'Service-worker method guard missing');
  assert(src.includes('const ycWebSw=ycWebServiceWorker()'),'Service-worker registration must use guarded container');
  assert(!src.includes("navigator.serviceWorker.register('./sw.js')"),'Direct unguarded service-worker register returned');
  assert(!src.includes("navigator.serviceWorker.addEventListener('message'"),'Direct unguarded service-worker listener returned');
  assert(!src.includes('await navigator.serviceWorker.ready'),'Push path still dereferences navigator.serviceWorker directly');
}
assert(integration.includes("('Notification' in window)&&Notification.permission==='granted'"),'Notification capability guard missing');
console.log('PASS service-worker guard: unavailable/blocked service-worker containers cannot crash web/PWA bootstrap or push setup.');
