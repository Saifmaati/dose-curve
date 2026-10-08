// DoseCurve service worker: after one visit the app opens without a connection.
// - Pages come from the network first, so a new release shows up at once; the copy saved on the last visit is
//   used only when the network can't be reached.
// - The engine and the cases (pk-engine.js?v=<content hash>, cases.js?v=<hash>), the validation results (by hash too),
//   icons, manifest and the font files (served from this site since 2.0; older pages' Google Fonts too) come from the cache and are refreshed in the background. A page and its scripts always match:
//   each page names them by hash, and older copies are dropped when a new one is saved.
// - Nothing else is touched: other sites' requests and anything but GET pass straight through. No user data is
//   stored or sent; scenarios and the library stay in the page's own storage, as before.
const CACHE="dosecurve-v50";   // bumped at the end of every v1.0 phase, so a new release starts from a clean cache
// cases.js is named by its content hash, as index.html loads it; a test keeps the two in step
const CORE=["./","./site.webmanifest","./favicon.svg","./favicon-32.png","./apple-touch-icon.png","./icon-192.png","./icon-512.png",
  "./cases.js?v=9e724cac1f",
  "./pk-sens.js?v=0e00719e81","./validation-worker.js?v=c52ca6c802","./ui-chart3d.js?v=0fded86bf0","./ui-move.js?v=3510093108","./ui-panels.js?v=ed15fc8dd6","./ui-worksheet.js?v=8aafad02da","./ui-effect.js?v=d46dbe334e","./ui-chartfx.js?v=fbac72551a","./pk-explain.js?v=12388a8782","./pk-tdm.js?v=faef16b95a","./pk-hd.js?v=d13fd8fd48","./pk-sources.js?v=6b5fbf7ff9","./pk-idr.js?v=b281c5fd28","./pk-bayes.js?v=21a1045af5","./pk-lessons.js?v=039863e0a1","./pk-practice.js?v=71d1ec1677","./pk-math.js?v=610e1f3037","./pk-glossary.js?v=6842dd548f","./pop-worker.js?v=20f78a468b","./validation.html","./educators.html","./stage.js?v=3c76a180ff","./fonts/inter-latin.woff2","./fonts/newsreader-latin.woff2","./validation/reference-results.json?v=47bb86493a"];
const PAGE="./";   // the app page's saved copy lives under this key
const OLD_HOST="saifmaati.github.io";   // the address until 2.19, which redirects to maatirx.com once the domain is set
const PAGES=["validation.html","methods.html"];   // other pages kept for offline use, each under its own address
const FONT_HOSTS=["fonts.googleapis.com","fonts.gstatic.com"];

// A new release's files come from the network, not the browser's HTTP cache, which can still hold the previous
// release's copy of an unversioned file (the app page, the validation page) for up to 10 minutes.
self.addEventListener("install",e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE.map(u=>new Request(u,{cache:"reload"})))).then(()=>self.skipWaiting()));
});
self.addEventListener("activate",e=>{
  e.waitUntil(caches.keys()
    .then(keys=>Promise.all(keys.filter(k=>(k.startsWith("dosecurve-") || k.startsWith("maatirx-")) && k!==CACHE).map(k=>caches.delete(k))))   // (named maatirx- in 2.20)
    .then(()=>self.clients.claim()));
});

const scopeUrl=path=> new URL(path, self.registration.scope).href;
// The app page itself (not 404.html or anything else that happens to load in scope).
const isAppPage=url=>{ const scope=new URL(self.registration.scope).pathname; return url.pathname===scope || url.pathname===scope+"index.html"; };
const extraPage=url=>{ const scope=new URL(self.registration.scope).pathname; return PAGES.find(f=>url.pathname===scope+f) || null; };

async function fromNetworkFirst(req){
  const cache=await caches.open(CACHE);
  try{
    const res=await fetch(req), url=new URL(req.url), extra=extraPage(url);
    // (2.20) at the old address, once it redirects: the saved app page, which offers to bring the work saved at this
    // address along (ui-move.js); with nothing saved, the redirect
    if(res.type==="opaqueredirect" && self.location.hostname===OLD_HOST){ const saved=await cache.match(scopeUrl(PAGE)); if(saved) return saved; }
    if(res.ok && isAppPage(url)) await cache.put(scopeUrl(PAGE), res.clone());
    else if(res.ok && extra) await cache.put(scopeUrl(extra), res.clone());
    return res;
  }catch(err){
    const extra=extraPage(new URL(req.url));
    const saved=await cache.match(scopeUrl(extra ? extra : PAGE));   // the validation page offline, else the app
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
    if((res.ok || res.type==="opaque") && req.cache!=="no-store"){   // a no-store check (ui-move.js's) isn't kept
      const url=new URL(req.url);
      if(url.searchParams.has("v")){   // a file named by version (the engine, the cases): keep only this one
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
