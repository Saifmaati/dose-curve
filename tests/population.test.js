// Run with: node --test
// Population mode: log-normal between-patient variability around the scenario (clearance, or Vmax when
// saturable), a reproducible seed, the probability of target attainment, and speed.
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const crypto=require("node:crypto");
const PK=require("../pk-engine.js");
const P=require("../pop-worker.js");
const {scenario}=PK;

const near=(actual, expected, tol, msg)=>
  assert.ok(Math.abs(actual-expected)<=tol, `${msg?msg+": ":""}expected ${expected} ± ${tol}, got ${actual}`);
const rep=over=> PK.normalizeScenario(scenario(Object.assign({dosing:"repeated", D:500, tau:8, nDoses:9}, over||{})));
const OPTS={n:200, cvCL:30, cvV:20, seed:1, T:72, mec:2, mtc:12};

test("CV = 0 collapses the band onto the deterministic curve", ()=>{
  const p=rep(), r=P.population(PK, p, Object.assign({}, OPTS, {cvCL:0, cvV:0}));
  r.t.forEach((t,i)=>{ const c=PK.conc(p,t); near(r.q05[i], c, 1e-12); near(r.q50[i], c, 1e-12); near(r.q95[i], c, 1e-12); });
  const s=PK.ssPeakTrough(p); assert.equal(r.pta, s.trough>=2 && s.peak<=12 ? 1 : 0);
});

test("a fixed seed reproduces the population exactly, and another seed doesn't", ()=>{
  const p=rep(), a=P.population(PK, p, OPTS), b=P.population(PK, p, OPTS), c=P.population(PK, p, Object.assign({}, OPTS, {seed:2}));
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.q95, c.q95);
});

test("the variability is log-normal around the scenario's values: medians and CVs come out as set", ()=>{
  const p=rep(), list=P.patients(PK, p, {n:1000, cvCL:30, cvV:20, seed:3});
  const CL=list.map(q=>PK.derived(q).CL).sort((a,b)=>a-b), V=list.map(q=>PK.vOf(q)).sort((a,b)=>a-b);
  near(P.quantile(CL,0.5)/PK.derived(p).CL, 1, 0.04, "median clearance");
  near(P.quantile(V,0.5)/PK.vOf(p), 1, 0.03, "median volume");
  const cv=a=>{ const l=a.map(Math.log), m=l.reduce((s,x)=>s+x,0)/l.length, sd=Math.sqrt(l.reduce((s,x)=>s+(x-m)**2,0)/(l.length-1)); return Math.sqrt(Math.exp(sd*sd)-1); };
  near(cv(CL), 0.30, 0.03, "CV of clearance"); near(cv(V), 0.20, 0.02, "CV of volume");
  near(P.omega(30), Math.sqrt(Math.log(1.09)), 1e-12);
  list.forEach(q=> near(PK.derived(q).CL, PK.derived(p).CL*Math.exp(q.eCL), 1e-9));
});

test("PTA rises with the dose when only the trough limits it (the same patients at every dose)", ()=>{
  let prev=-1;
  [100,200,300,400,500,600,800].forEach(D=>{
    const r=P.population(PK, rep({D}), Object.assign({}, OPTS, {n:500, seed:7, mec:3, mtc:1e9}));
    assert.ok(r.pta>=prev, `PTA ${r.pta} at ${D} mg after ${prev}`); prev=r.pta;
  });
  assert.ok(prev>0.8);
});

test("PTA counts troughs and peaks against the window, and AUC24 against its range", ()=>{
  const p=rep(), r=P.population(PK, p, Object.assign({}, OPTS, {auc:[150,250]}));
  const list=P.patients(PK, p, OPTS);
  const hit=list.filter(q=>{ const s=PK.ssPeakTrough(q); return s.trough>=2 && s.peak<=12; }).length;
  near(r.pta, hit/list.length, 1e-12);
  const auc=list.filter(q=>{ const a=p.F*p.D/PK.derived(q).CL*24/p.tau; return a>=150 && a<=250; }).length;
  near(r.ptaAuc, auc/list.length, 1e-12);
  assert.ok(r.trough[0]<=r.trough[1] && r.trough[1]<=r.trough[2] && r.peak[0]<=r.peak[2]);
  assert.equal(P.population(PK, rep({dosing:"single"}), OPTS).pta, undefined, "no steady state, no PTA");
  assert.equal(r.noSS, 0, "first-order regimens always settle");
});

/* ---------- saturable (Michaelis–Menten) scenarios ---------- */
const mmRep=over=> rep(Object.assign({kin:"mm", vmax:7, km:4, V:49, route:"oral", F:1, ka:0.4, S:0.92, D:300, tau:24, nDoses:14}, over||{}));
const MM_OPTS={n:120, cvCL:30, cvV:20, seed:4, T:336, mec:10, mtc:20};

test("saturable: CV = 0 collapses the band onto the integrated curve", ()=>{
  const p=mmRep(), r=P.population(PK, p, Object.assign({}, MM_OPTS, {n:50, cvCL:0, cvV:0}));
  r.t.forEach((t,i)=>{ const c=PK.conc(p,t); near(r.q05[i], c, 1e-9*Math.max(1,c)); near(r.q95[i], c, 1e-9*Math.max(1,c)); });
  const m=PK.mmSteady(p); assert.equal(r.pta, m.trough>=10 && m.peak<=20 ? 1 : 0);
  near(r.trough[1], m.trough, 1e-9); near(r.peak[1], m.peak, 1e-9);
});

test("saturable: the variability is on Vmax (Km fixed), log-normal around the scenario's value", ()=>{
  const p=mmRep(), list=P.patients(PK, p, {n:1000, cvCL:30, cvV:20, seed:3});
  const vm=list.map(q=>q.vmax).sort((a,b)=>a-b);
  near(P.quantile(vm,0.5)/p.vmax, 1, 0.04, "median Vmax");
  list.forEach(q=>{ near(q.vmax, p.vmax*Math.exp(q.eCL), 1e-12); assert.equal(q.km, p.km); assert.equal(q.thalf, p.thalf); });
});

test("saturable: PTA and the share with no steady state count each patient's exact periodic steady state", ()=>{
  const p=mmRep({D:400}), r=P.population(PK, p, Object.assign({}, MM_OPTS, {auc:[240,480]})), list=P.patients(PK, p, MM_OPTS);
  const ms=list.map(q=>PK.mmSteady(q)), none=ms.filter(m=>m.none).length;
  near(r.noSS, none/list.length, 1e-12);
  near(r.pta, ms.filter(m=>!m.none && m.trough>=10 && m.peak<=20).length/list.length, 1e-12);
  near(r.ptaAuc, ms.filter(m=>!m.none && m.avg*24>=240 && m.avg*24<=480).length/list.length, 1e-12);
  assert.ok(none>0, "at 400 mg/day some virtual patients' Vmax is below the input");
  // a bigger dose leaves more patients without a steady state: the saturable signature
  let prev=-1;
  [200,300,400,500].forEach(D=>{ const x=P.population(PK, mmRep({D}), MM_OPTS).noSS; assert.ok(x>=prev, `${D} mg: ${x} after ${prev}`); prev=x; });
});

test("saturable: 1000 virtual patients take under 5 s (it was 9 s before each patient was integrated once)", ()=>{
  const t0=process.hrtime.bigint();
  const r=P.population(PK, mmRep(), Object.assign({}, MM_OPTS, {n:1000}));
  const ms=Number(process.hrtime.bigint()-t0)/1e6;
  assert.equal(r.n, 1000); assert.ok(ms<5000, `${ms.toFixed(0)} ms`);
});

test("1000 virtual patients take under 2 s", ()=>{
  const t0=process.hrtime.bigint();
  const r=P.population(PK, rep({route:"inf", tinf:1}), Object.assign({}, OPTS, {n:1000}));
  const ms=Number(process.hrtime.bigint()-t0)/1e6;
  assert.equal(r.n, 1000); assert.ok(ms<2000, `${ms.toFixed(0)} ms`);
});

test("links carry the population settings; the page and service worker load the same worker file", ()=>{
  const V=Object.assign({}, PK.VIEW_DEFAULTS, {pop:true, popn:500, pcl:40, pv:10, pseed:12345, plo:400, phi:600});
  const link=PK.encodeLink({mode:"sim", s:scenario(), view:V});
  assert.ok(link.startsWith("v=5&"), link);
  const back=PK.decodeLink(link).view;
  ["pop","popn","pcl","pv","pseed","plo","phi"].forEach(k=> assert.equal(back[k], V[k], k));
  assert.equal(PK.decodeLink("v=5&s=&w=pop:1,popn:5000,pcl:-3,pseed:1.7").view.popn, 1000, "clamped");
  assert.equal(PK.decodeLink("v=5&s=&w=pop:1,popn:5000,pcl:-3,pseed:1.7").view.pcl, 0);
  assert.ok(PK.encodeLink({mode:"sim", s:scenario(), view:PK.VIEW_DEFAULTS}).startsWith("v=1&"), "off: nothing added");
  const root=path.join(__dirname,".."), hash=crypto.createHash("sha256").update(fs.readFileSync(path.join(root,"pop-worker.js"))).digest("hex").slice(0,10);
  assert.ok(fs.readFileSync(path.join(root,"index.html"),"utf8").includes(`pop-worker.js?v=${hash}`));
  assert.ok(fs.readFileSync(path.join(root,"sw.js"),"utf8").includes(`./pop-worker.js?v=${hash}`));
  // the worker only loads this site's own stamped engine
  assert.match(fs.readFileSync(path.join(root,"pop-worker.js"),"utf8"), /\^pk-engine\\\.js\\\?v=\[0-9a-f\]\{10\}\$/);
});
