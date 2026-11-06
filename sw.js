const CACHE='rook-and-learn-da6d4597';
const CORE=['./','./index.html','./manifest.webmanifest','./icon-192.png','./icon-512.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{
  const req=e.request;if(req.method!=='GET')return;
  const save=res=>{if(res&&(res.ok||res.type==='opaque')){const copy=res.clone();caches.open(CACHE).then(c=>c.put(req,copy));}return res;};
  // The app page: try the network first so updates show right away, fall back to the saved copy offline.
  if(req.mode==='navigate'){e.respondWith(fetch(req).then(save).catch(()=>caches.match(req).then(r=>r||caches.match('./index.html'))));return;}
  // Everything else (fonts, icons): saved copy first, refreshed in the background.
  e.respondWith(caches.match(req).then(hit=>{const net=fetch(req).then(save).catch(()=>hit);return hit||net;}));
});
