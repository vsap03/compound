// Compound service worker: app shell offline, network-first so updates land fast
const V='compound-dec001c2f1';
const SHELL=['./','index.html','app.js?v=dec001c2f1','app.css?v=dec001c2f1','config.js?v=dec001c2f1','htm-preact.js','lightweight-charts.js','supabase.js','manifest.webmanifest','icon-192.png','apple-touch-icon.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(V).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==V).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET'||u.origin!==location.origin)return;
 e.respondWith(fetch(e.request).then(r=>{if(r.ok){const c=r.clone();caches.open(V).then(x=>x.put(e.request,c))}return r}).catch(()=>caches.match(e.request,{ignoreSearch:false}).then(m=>m||caches.match('index.html'))))});
