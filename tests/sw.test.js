// Run with: node --test
// Checks the offline service worker (sw.js) against a simulated browser: its cache, the network (on or off)
// and fetch events.
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");

const SCOPE="https://example.github.io/dose-curve/";
const SRC=fs.readFileSync(path.join(__dirname,"..","sw.js"),"utf8");
// The cache name carries a version that each release phase bumps; the tests follow whatever sw.js says.
const CACHE=SRC.match(/const CACHE="(dosecurve-v\d+)"/)[1];

function makeWorker(){
  const handlers={}, store=new Map(), log=[];
  let online=true, version=1;
  const keyOf=r=> typeof r==="string" ? new URL(r, SCOPE).href : r.url;
  const response=(url, mode)=>{
    const u=new URL(url), opaque=mode==="no-cors" && u.origin!==new URL(SCOPE).origin;
    const status=u.pathname.endsWith("/missing") ? 404 : 200;
    return {url, status, ok:!opaque && status===200, type:opaque ? "opaque" : u.origin===new URL(SCOPE).origin ? "basic" : "cors",
      body:`${u.pathname}${u.search} v${version}`, clone(){ return this; }};
  };
  const network=async(req)=>{
    const url=keyOf(req); log.push(url);
    if(!online) throw new TypeError("Failed to fetch");
    return response(url, typeof req==="string" ? "cors" : req.mode);
  };
  const cacheOf=name=>{
    if(!store.has(name)) store.set(name,new Map());
    const m=store.get(name);
    return {
      put:async(req,res)=>{ m.set(keyOf(req),res); },
      match:async req=> m.get(keyOf(req)),
      keys:async()=> [...m.keys()].map(url=>({url})),
      delete:async req=> m.delete(keyOf(req)),
      addAll:async urls=>{ for(const u of urls) m.set(keyOf(u), await network(u)); }
    };
  };
  const caches={open:async name=>cacheOf(name), keys:async()=>[...store.keys()], delete:async name=>store.delete(name)};
  const self={addEventListener:(type,fn)=>{ handlers[type]=fn; }, registration:{scope:SCOPE}, location:new URL(SCOPE+"sw.js"),
    skipWaiting:async()=>{}, clients:{claim:async()=>{}}};
  vm.runInNewContext(SRC, {self, caches, fetch:network, URL, Promise, console});
  const lifecycle=async type=>{ let p; handlers[type]({waitUntil:x=>{ p=x; }}); await p; };
  // a fetch event: {handled:false} when the worker lets the browser deal with it
  const request=async(url, {mode="no-cors", method="GET"}={})=>{
    let responded=null, later=null;
    handlers.fetch({request:{url:new URL(url,SCOPE).href, method, mode}, respondWith:p=>{ responded=p; }, waitUntil:p=>{ later=p; }});
    if(!responded) return {handled:false};
    const res=await responded;
    if(later) await later;
    return {handled:true, res};
  };
  return {lifecycle, request, store, log, cache:()=>store.get(CACHE),
    goOffline(){ online=false; }, goOnline(){ online=true; }, release(){ version++; }};
}

test("installing saves the app's icons and manifest; activating clears only older DoseCurve caches", async()=>{
  const w=makeWorker();
  w.store.set("dosecurve-v0", new Map()); w.store.set("dosecurve-v1", new Map()); w.store.set("someone-else", new Map());
  await w.lifecycle("install"); await w.lifecycle("activate");
  assert.deepEqual([...w.store.keys()].sort(), [CACHE,"someone-else"]);
  assert.notEqual(CACHE, "dosecurve-v1", "bumped since the first release");
  ["", "site.webmanifest", "favicon.svg", "icon-192.png"].forEach(f=> assert.ok(w.cache().has(SCOPE+f), f));
});

test("the page comes from the network when online, and from the last saved copy offline", async()=>{
  const w=makeWorker();
  await w.lifecycle("install");
  let r=await w.request(SCOPE+"?cb=1#v=4&s=D:500", {mode:"navigate"});
  assert.equal(r.res.body, "/dose-curve/?cb=1 v1");
  w.release();
  r=await w.request(SCOPE, {mode:"navigate"});
  assert.equal(r.res.body, "/dose-curve/ v2", "a new release shows up at once online");
  w.goOffline();
  r=await w.request(SCOPE+"#p=rac.12", {mode:"navigate"});
  assert.equal(r.res.body, "/dose-curve/ v2", "offline: the copy saved on the last visit");
  r=await w.request(SCOPE+"index.html", {mode:"navigate"});
  assert.equal(r.res.body, "/dose-curve/ v2");
});

test("only the app page is saved as the page: a 404 page or another address never replaces it", async()=>{
  const w=makeWorker();
  await w.lifecycle("install");
  await w.request(SCOPE, {mode:"navigate"});
  await w.request(SCOPE+"404.html", {mode:"navigate"});
  await w.request(SCOPE+"missing", {mode:"navigate"});
  w.goOffline();
  assert.equal((await w.request(SCOPE, {mode:"navigate"})).res.body, "/dose-curve/ v1");
});

test("the engine is served from the cache and refreshed; a new engine version replaces the old one", async()=>{
  const w=makeWorker();
  await w.lifecycle("install");
  let r=await w.request(SCOPE+"pk-engine.js?v=aaaa");
  assert.equal(r.res.body, "/dose-curve/pk-engine.js?v=aaaa v1");
  w.release();
  r=await w.request(SCOPE+"pk-engine.js?v=aaaa");
  assert.equal(r.res.body, "/dose-curve/pk-engine.js?v=aaaa v1", "served from the cache at once");
  assert.equal(w.cache().get(SCOPE+"pk-engine.js?v=aaaa").body, "/dose-curve/pk-engine.js?v=aaaa v2", "and refreshed behind it");
  await w.request(SCOPE+"pk-engine.js?v=bbbb");
  assert.ok(w.cache().has(SCOPE+"pk-engine.js?v=bbbb"));
  assert.ok(!w.cache().has(SCOPE+"pk-engine.js?v=aaaa"), "the older engine is dropped");
  w.goOffline();
  assert.equal((await w.request(SCOPE+"pk-engine.js?v=bbbb")).res.body, "/dose-curve/pk-engine.js?v=bbbb v2", "offline from the cache");
  await assert.rejects(w.request(SCOPE+"pk-engine.js?v=cccc"), "an engine never saved can't be made up offline");
});

test("fonts are kept for offline use, but a page-only (opaque) copy never answers a fetch that reads it", async()=>{
  const w=makeWorker();
  await w.lifecycle("install");
  const css="https://fonts.googleapis.com/css2?family=Inter";
  let r=await w.request(css, {mode:"no-cors"});
  assert.equal(r.res.type, "opaque");
  r=await w.request(css, {mode:"cors"});
  assert.equal(r.res.type, "cors", "the PNG export's fetch gets a readable response");
  w.goOffline();
  r=await w.request(css, {mode:"cors"});
  assert.equal(r.res.type, "cors", "and it's kept for offline use");
  r=await w.request("https://fonts.gstatic.com/s/inter/v1/a.woff2", {mode:"cors"}).catch(e=>e);
  assert.ok(r instanceof Error, "a font file never fetched isn't invented");
});

test("other sites, other paths and anything but GET pass straight through", async()=>{
  const w=makeWorker();
  await w.lifecycle("install");
  assert.equal((await w.request("https://cdnjs.cloudflare.com/ajax/libs/x.js")).handled, false);
  assert.equal((await w.request("https://example.github.io/another-site/app.js")).handled, false);
  assert.equal((await w.request("https://example.github.io/another-site/", {mode:"navigate"})).handled, false);
  assert.equal((await w.request(SCOPE+"pk-engine.js?v=a", {method:"POST"})).handled, false);
  assert.equal((await w.request("https://api.github.com/repos/x", {mode:"cors"})).handled, false);
});

test("the validation page and its results are kept for offline use, and never stand in for the app", async()=>{
  const w=makeWorker();
  await w.lifecycle("install");
  assert.ok(w.cache().has(SCOPE+"validation.html") && w.cache().has(SCOPE+"validation/reference-results.json"), "precached");
  await w.request(SCOPE, {mode:"navigate"});
  w.release();
  await w.request(SCOPE+"validation.html", {mode:"navigate"});
  w.goOffline();
  assert.equal((await w.request(SCOPE+"validation.html", {mode:"navigate"})).res.body, "/dose-curve/validation.html v2", "its own saved copy");
  assert.equal((await w.request(SCOPE, {mode:"navigate"})).res.body, "/dose-curve/ v1", "the app page is still the app page");
  assert.equal((await w.request(SCOPE+"validation/reference-results.json", {mode:"cors"})).res.body, "/dose-curve/validation/reference-results.json v1");
});
