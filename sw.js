// DoseCurve service worker: after one visit the app opens without a connection.
// - Pages come from the network first, so a new release shows up at once; the copy saved on the last visit is
//   used only when the network can't be reached.
// - The engine (pk-engine.js?v=<content hash>), icons, manifest and the Google Fonts files come from the cache
//   and are refreshed in the background. A page and its engine always match: each page names its engine by
//   hash, and older engine copies are dropped when a new one is saved.
// - Nothing else is touched: other sites' requests and anything but GET pass straight through. No user data is
//   stored or sent; scenarios and the library stay in the page's own storage, as before.
const CACHE="dosecurve-v2";   // bumped at the end of every v1.0 phase, so a new release starts from a clean cache
const CORE=["./","./site.webmanifest","./favicon.svg","./favicon-32.png","./apple-touch-icon.png","./icon-192.png","./icon-512.png"];
const PAGE="./";   // every page in scope is the one app page; its saved copy lives under this key
const FONT_HOSTS=["fonts.googleapis.com","fonts.gstatic.com"];

self.addEventListener("install",e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting()));
});
self.addEventListener("activate",e=>{
  e.waitUntil(caches.keys()
    .then(keys=>Promise.all(keys.filter(k=>k.startsWith("dosecurve-") && k!==CACHE).map(k=>caches.delete(k))))
    .then(()=>self.clients.claim()));
});

const scopeUrl=path=> new URL(path, self.registration.scope).href;
// The app page itself (not 404.html or anything else that happens to load in scope).
const isAppPage=url=>{ const scope=new URL(self.registration.scope).pathname; return url.pathname===scope || url.pathname===scope+"index.html"; };

async function fromNetworkFirst(req){
  const cache=await caches.open(CACHE);
  try{
    const res=await fetch(req);
    if(res.ok && isAppPage(new URL(req.url))) await cache.put(scopeUrl(PAGE), res.clone());
    return res;
  }catch(err){
    const saved=await cache.match(scopeUrl(PAGE));
    if(saved) return saved;
    throw err;
  }
}

async function fromCacheThenRefresh(req, event){
  const cache=await caches.open(CACHE);
  let saved=await cache.match(req);
  // an opaque copy (saved from a <link>) can't answer a request that needs to read the response (a CORS fetch)
  if(saved && saved.type==="opaque" && req.mode!=="no-cors") saved=null;
  const refresh=fetch(req).then(async res=>{
    if(res.ok || res.type==="opaque"){
      const url=new URL(req.url);
      if(url.pathname.endsWith("/pk-engine.js")){   // keep only the engine this response is
        for(const k of await cache.keys()){
          const u=new URL(k.url);
          if(u.pathname===url.pathname && u.search!==url.search) await cache.delete(k);
        }
      }
      await cache.put(req, res.clone());
    }
    return res;
  });
  if(saved){
    if(event) event.waitUntil(refresh.catch(()=>{}));
    return saved;
  }
  return refresh;
}

self.addEventListener("fetch",e=>{
  const req=e.request;
  if(req.method!=="GET") return;
  const url=new URL(req.url), sameOrigin=url.origin===self.location.origin;
  if(req.mode==="navigate"){
    if(sameOrigin && url.href.startsWith(self.registration.scope)) e.respondWith(fromNetworkFirst(req));
    return;
  }
  if((sameOrigin && url.href.startsWith(self.registration.scope)) || FONT_HOSTS.includes(url.hostname))
    e.respondWith(fromCacheThenRefresh(req, e));
});
