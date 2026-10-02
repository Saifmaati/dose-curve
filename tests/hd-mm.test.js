"use strict";
// Hemodialysis with saturable (Michaelis–Menten) elimination (2.19): the engine's integrator run piecewise between
// session edges with the dialyzer's loss CLd·C added during sessions (pk-hd.js). Each figure is held to an identity of
// the model (mass balance, the closed form of a session with no dose, continuity at the edges) or to the engine's own
// curve without dialysis; the SciPy reference covers it too (tests/hd.test.js).
const test=require("node:test");
const assert=require("node:assert/strict");
const PK=require("../pk-engine.js");
const H=require("../pk-hd.js");
const Pop=require("../pop-worker.js");
const S=o=> PK.normalizeScenario(PK.scenario(o));
const rel=(a, b, f, msg)=> assert.ok(Math.abs(a-b)<=Math.abs(b)*f+1e-12, `${msg}: ${a} vs ${b}`);
const MM={kin:"mm", route:"oral", dosing:"repeated", D:300, S:0.92, F:1, ka:0.4, tau:24, nDoses:7, V:49, vmax:7, km:4, hd:1, hdcl:5, hdstart:20, hddur:4, hdevery:48};
const off=p=> S(Object.assign({}, p, {hd:0}));
// what has been given by time t: boluses and oral doses whole (the gut counts as in the body here), infusions so far
function given(p, t){
  return PK.doseEvents(p).reduce((s,e)=> e.t>t ? s : s+PK.saltOf(p)*e.mg*(e.route==="oral" ? p.F : e.route==="inf" ? Math.min(1, (t-e.t)/e.dur) : 1), 0);
}
const simpson=(f, a, b, n)=>{ const h=(b-a)/n; let s=f(a)+f(b); for(let i=1;i<n;i++) s+=(i%2 ? 4 : 2)*f(a+i*h); return s*h/3; };

test("saturable dialysis: the setting appears for saturable drugs, and links v15 keep older links as they were", ()=>{
  const p=S(MM);
  assert.equal(PK.hdOn(p), true);
  assert.equal(PK.isRelevant("hd", S({kin:"mm"})), true);
  assert.equal(PK.isRelevant("hdcl", p), true);
  assert.equal(PK.isRelevant("teq", S({kin:"mm"})), false, "an effect-site delay stays first-order only");
  assert.equal(PK.isRelevant("cmt", S({kin:"mm"})), false, "and two compartments too");
  const link=PK.encodeLink({mode:"sim", s:p, view:PK.VIEW_DEFAULTS});
  assert.ok(link.startsWith("v=15&"), link);
  const back=PK.decodeLink(link).s;
  ["hd","hdcl","hdstart","hddur","hdevery","kin","vmax","km"].forEach(k=> assert.equal(back[k], p[k], k));
  for(const v of [11,12,13,14]){
    assert.equal(PK.decodeLink(`v=${v}&s=kin:mm,hd:1,hdcl:8`).s.hd, 0, `a v${v} link with both opens without dialysis, as it did`);
  }
  assert.equal(PK.decodeLink("v=11&s=hd:1").s.hd, 1, "first-order dialysis is unchanged");
  const cmp=PK.encodeLink({mode:"cmp", a:off(MM), b:p, view:PK.VIEW_DEFAULTS});
  assert.ok(cmp.startsWith("v=15&"), "either side of a comparison");
  // an old link draws exactly the curve it drew before
  const old=PK.decodeLink("v=14&s=kin:mm,hd:1,hdcl:8,dosing:repeated,D:300,tau:24").s, plain=S({kin:"mm", dosing:"repeated", D:300, tau:24});
  [1,5,20,30,47,60,100].forEach(t=> assert.equal(PK.conc(old, t), PK.conc(plain, t)));
});

test("saturable dialysis: before the first session the curve is the engine's own; with a dialyzer of no clearance, all of it", ()=>{
  const p=S(MM), q=off(MM);
  [0.5, 3, 7.5, 12, 19.9].forEach(t=> rel(PK.conc(p, t), PK.conc(q, t), 1e-12, `t ${t}`));
  const z=S(MM); z.hdcl=0;   // (below the slider's range: only here, to compare the two integrations)
  const z0=Object.assign({}, z, {hd:0});
  for(let t=1;t<168;t+=6.7) rel(H.conc(z, t), PK.conc(z0, t), 1e-8, `no clearance, t ${t}`);
});

test("saturable dialysis: the amount is continuous across session edges, and only its slope jumps, by the dialyzer's CLd·C", ()=>{
  const p=S(MM), cr=H.course(p);
  H.conc(p, 160);
  const st=cr.steps, doses=new Set(PK.doseEvents(p).map(e=> e.t));
  let edges=0;
  for(let i=1;i<st.length;i++){
    if(st[i].kd===st[i-1].kd || doses.has(st[i].t0)) continue;   // (an edge that is also a dose jumps by the dose too)
    edges++;
    assert.equal(st[i].a0, st[i-1].a1, "continuous");
    const jump=st[i].f0-st[i-1].f1, expect=-(st[i].kd-st[i-1].kd)*st[i].a0;
    rel(jump, expect, 1e-9, `slope jump at ${st[i].t0}`);
  }
  assert.ok(edges>=3, `${edges} edges`);
});

test("saturable dialysis: each session removes CLd × the area under the level, and nothing is lost or made (mass balance)", ()=>{
  const p=S(MM);
  H.sessionTable(p, 168).forEach(r=>{
    const area=simpson(t=> PK.conc(p, t), r.start, r.end-1e-9, 2000);
    rel(r.removed, p.hdcl*area, 1e-7, `session ${r.n}: removed`);
  });
  const cases=[MM,
    {kin:"mm", route:"iv", dosing:"single", D:1500, V:40, vmax:7, km:4, hd:1, hdcl:10, hdstart:2, hddur:6, hdevery:24},
    {kin:"mm", route:"inf", dosing:"repeated", D:250, tinf:1, tau:12, nDoses:8, loadMult:2, missed:4, V:50, vmax:10, km:6, hd:1, hdcl:8, hdstart:23.5, hddur:4, hdevery:24},
    {kin:"mm", route:"oral", dosing:"custom", F:0.9, ka:0.6, V:45, vmax:8, km:5, S:0.92, hd:1, hdcl:6, hdstart:30, hddur:4, hdevery:48,
      events:[{t:0, mg:1000, route:"inf", dur:1}, {t:24, mg:300, route:"oral"}, {t:48, mg:300, route:"iv"}]}];
  for(const o of cases){
    const p=S(o);
    for(const t of [10, 35.5, 70, 119]){
      const s=H.stateAt(p, t), tot=s.g+s.a+s.body+s.removed, g=given(p, t);
      rel(tot, g, 1e-6, `${o.route} ${o.dosing} at ${t} h: in the body, eliminated and removed against given`);
    }
    // the body's share against an independent integral of Vmax·C/(Km + C)
    const V=PK.vOf(p), Vm=PK.vmaxOf(p), cuts=[0, 119], sAt=H.stateAt(p, 119);
    const body=simpson(t=>{ const C=PK.conc(p, t); return Vm*C/(p.km+C); }, 0, 119, 20000);
    rel(sAt.body, body, 2e-4, `${o.route} ${o.dosing}: the body's elimination`);
    void V; void cuts;
  }
});

test("saturable dialysis: a session with no dose matches its closed form, and its fall lies between the high- and low-level limits", ()=>{
  const p=S({kin:"mm", route:"iv", dosing:"single", D:1500, V:40, vmax:7, km:4, hd:1, hdcl:10, hdstart:2, hddur:6, hdevery:24});
  const r=H.sessionTable(p, 48)[0], f=H.sessionFraction(p, undefined, r.pre);
  rel(1-f.fall, r.post/r.pre, 1e-6, "the integrated session against the closed form");
  rel(f.byDialysis*r.pre*PK.vOf(p), r.removed, 1e-6, "the amount the dialyzer removes");
  assert.ok(f.limits.high<f.fall && f.fall<f.limits.low, `${f.limits.high} < ${f.fall} < ${f.limits.low}`);
  const at=c=> H.sessionFraction(p, 6, c).fall;
  assert.ok(at(0.1*p.km)>at(p.km) && at(p.km)>at(10*p.km), "from a higher level the session lowers it by a smaller share");
  // the clearance that gives a stated fall, from a stated level, gives that fall back
  const cl=H.clForFall(p, 0.6, 6, 8);
  rel(H.sessionFraction(Object.assign({}, p, {hdcl:cl}), 6, 8).fall, 0.6, 1e-6, "clForFall");
});

test("saturable dialysis: the supplement dose after a session restores the level the session found", ()=>{
  const o={kin:"mm", route:"iv", dosing:"single", D:1500, V:40, vmax:7, km:4, hd:1, hdcl:10, hdstart:2, hddur:6, hdevery:24};
  const p=S(o), r=H.sessionTable(p, 48)[0], V=PK.vOf(p), Sf=PK.saltOf(p);
  rel(r.post+Sf*r.supplement/V, r.pre, 1e-12, "the supplement is exactly what restores the level");
  // and given (a schedule keeps doses to 0.1 mg), it adds S·dose / V to the level at once, whatever comes after
  const q=S(Object.assign({}, o, {dosing:"custom", events:[{t:0, mg:1500, route:"iv"}, {t:r.end, mg:r.supplement, route:"iv"}]})), mg=q.events[1].mg;
  assert.ok(Math.abs(mg-r.supplement)<=0.05);
  rel(PK.conc(q, r.end), r.post+Sf*mg/V, 1e-9, "the level right after it");
});

test("saturable dialysis: no steady state is claimed, and every readout has a value", ()=>{
  for(const dosing of ["single","repeated","custom"]){
    const p=S(Object.assign({}, MM, {dosing, events:dosing==="custom" ? [{t:0, mg:300, route:"oral"}, {t:30, mg:300, route:"oral"}] : []}));
    assert.deepEqual(PK.readoutKeys(p), PK.READOUT_KEYS_HD[dosing], dosing);
    for(const k of PK.readoutKeys(p)){
      const m=PK.metricMath(p, k, {duration:168, mec:2, mtc:20});
      if(m) assert.ok(m.value==null || Number.isFinite(m.value), `${dosing} ${k}: ${m.value}`);
    }
  }
  const p=S(MM), d=PK.derived(p), sp=PK.ssProfile(p);
  assert.equal(sp.hd, true); assert.equal(sp.ssPeak, null); assert.equal(sp.mm, undefined);
  assert.equal(PK.ssConc(p, 1), null);
  ["css","t90","fSS","Rac","mm"].forEach(k=> assert.equal(d[k], null, k));
  assert.equal(d.cAt, d.cminSS, "the readouts' level is the final trough");
  assert.equal(PK.micStats(p, 2, 24).ss, false);
  rel(PK.metricMath(p, "hdCl", {duration:168, mec:2, mtc:20}).value, d.CL+p.hdcl, 1e-12, "CL + CLd");
  rel(PK.metricMath(p, "hdFall", {duration:168, mec:2, mtc:20}).value, 100*H.sessionFraction(p).fall, 1e-12, "fall");
});

test("saturable dialysis: AUC∞ follows the sessions to the end, and is smaller than without dialysis", ()=>{
  const o={kin:"mm", route:"iv", dosing:"single", D:1500, V:40, vmax:7, km:4, hd:1, hdcl:10, hdstart:2, hddur:6, hdevery:24};
  const p=S(o), auc=H.aucInf(p);
  assert.equal(PK.derived(p).auc, auc);
  // the same area by Simpson's rule, piece by piece between session edges, to a horizon where nothing is left
  const edges=[0]; for(let j=0;j<12;j++){ edges.push(2+24*j, 8+24*j); } edges.push(300);
  let area=0; for(let i=0;i<edges.length-1;i++) area+=simpson(t=> PK.conc(p, t), edges[i], edges[i+1]-1e-9, 400);
  rel(auc, area, 1e-5, "AUC∞");
  assert.ok(auc<PK.derived(off(o)).auc);
  const inf=H.course(p).inf;
  rel(inf.removed+inf.body, PK.saltOf(p)*1500, 1e-6, "everything given is in the end removed or eliminated");
});

test("saturable dialysis: a leftover two-compartment setting means nothing, and population mode follows the sessions", ()=>{
  const a=S(Object.assign({}, MM, {cmt:2})), b=S(MM);
  assert.equal(H.course(a).two, false);
  [10, 30, 100].forEach(t=> assert.equal(PK.conc(a, t), PK.conc(b, t)));
  assert.ok(H.sessionTable(a, 168).every(r=> r.rebound===null));
  const o={T:168, n:60, cvCL:30, cvV:20, seed:3}, on=Pop.population(PK, b, o), no=Pop.population(PK, off(MM), o);
  assert.equal(on.pta, undefined, "no attainment at a steady state that is never reached");
  const end=on.t.length-1; assert.ok(on.q50[end]<no.q50[end], "the median falls with the sessions");
  const lin=Pop.population(PK, S({dosing:"repeated", D:500, tau:12, nDoses:6, hd:1}), {T:72, n:50, cvCL:30, cvV:20, seed:2});
  assert.equal(lin.pta, undefined, "the same for first-order dialysis (it used to read 0%)");
});

test("saturable dialysis: stable at the extremes (a tiny child, a fast dialyzer), the step shortening where rates are fast", ()=>{
  const p=S({kin:"mm", route:"iv", dosing:"repeated", D:25, tau:12, nDoses:20, pm:"child", wt:0.5, ga:30, pnaw:2, V:5, vmax:20, km:0.5, hd:1, hdcl:20, hdstart:2, hddur:8, hdevery:12});
  for(let t=0;t<=240;t+=1.3){ const c=PK.conc(p, t); assert.ok(Number.isFinite(c) && c>=0, `t ${t}: ${c}`); }
  H.sessionTable(p, 240).forEach(r=> assert.ok([r.pre, r.post, r.removed, r.body].every(Number.isFinite)));
  assert.ok(H.course(p).steps.length<400000);
});

test("saturable dialysis: What changed speaks of the area, not a steady state, and the dialysis lesson stays first-order", ()=>{
  const b=S(MM), a=S(Object.assign({}, MM, {D:200})), U=()=> PK.unitsOf(b);
  const h={fmt:(v,dp)=> v==null ? "—" : v.toFixed(dp), trim:v=> String(+(+v).toFixed(4)), cap:s=> s, U, cdp:dp=> dp+U().cdp, inShown:p=> p, moved:(x,y)=> Math.abs(y-x)/Math.max(Math.abs(x),1e-12)>0.005,
    ROUTE_NAME:{oral:"oral", iv:"IV bolus", inf:"IV infusion", mixed:"mixed-route"}, IDR_NAME:["Direct (Emax model)","","","",""], WTM_NAME:{}, mode:"sim", state:{duration:168, mec:2, mtc:20, pd:0, etgt:50, mic:0}};
  const C=PK.compareRows(a, b, 168, 2, 20, null, 0), diffs=PK.PK_KEYS.filter(k=> PK.isRelevant(k,a) && PK.isRelevant(k,b) && !PK.sameSetting(k,a,b));
  const txt=PK.explain.explain(a, b, C.da, C.db, C.wa, C.wb, diffs, "the baseline", h).join(" ");
  assert.ok(!/predicted steady-state level/.test(txt), txt.slice(0,300));
  assert.ok(/total exposure here goes/.test(txt), "the area instead");
  const L=PK.LESSONS.find(x=> x.id==="hd");
  assert.equal(L.challenge.goal({now:{p:S(Object.assign({}, L.cur, {kin:"mm", hdcl:20}))}}), false, "a saturable drug never meets the first-order lesson's challenge");
});

test("saturable dialysis (review): AUC∞ counts drug still in the gut, and What changed names only a saturable side's level", ()=>{
  // a slow oral dose with a session running at the first check: the gut still holds drug that will push the level
  // back above Km, which the linear tail must not take
  const p=S({kin:"mm", route:"oral", dosing:"repeated", D:4000, ka:0.1, tau:24, nDoses:3, V:5, wt:40, vmax:1, km:0.5, hd:1, hdcl:20, hdstart:64, hddur:8, hdevery:168});
  const far=H.stateAt(p, 6000);
  assert.ok(far.a+far.g<1e-9*PK.saltOf(p)*12000, "everything gone by 6000 h");
  rel(H.aucInf(p), far.area/PK.vOf(p), 1e-6, "AUC∞ against the course followed to the end");
  // Compare: first-order against saturable, both on dialysis
  const a=S({dosing:"repeated", D:500, tau:12, nDoses:6, hd:1, hdcl:8}), b=S(MM), U=()=> PK.unitsOf(b);
  const h={fmt:(v,dp)=> v==null ? "—" : v.toFixed(dp), trim:v=> String(+(+v).toFixed(4)), cap:s=> s, U, cdp:dp=> dp+U().cdp, inShown:p=> p, moved:(x,y)=> Math.abs(y-x)/Math.max(Math.abs(x),1e-12)>0.005,
    ROUTE_NAME:{oral:"oral", iv:"IV bolus", inf:"IV infusion", mixed:"mixed-route"}, IDR_NAME:["Direct (Emax model)","","","",""], WTM_NAME:{}, mode:"cmp", state:{duration:168, mec:2, mtc:20, pd:0, etgt:50, mic:0}};
  for(const [x,y] of [[a,b],[b,a]]){
    const C=PK.compareRows(x, y, 168, 2, 20, null, 0), diffs=PK.PK_KEYS.filter(k=> PK.isRelevant(k,x) && PK.isRelevant(k,y) && !PK.sameSetting(k,x,y));
    const txt=PK.explain.explain(x, y, C.da, C.db, C.wa, C.wb, diffs, "A", h).join(" ");
    assert.ok(!/—|NaN|undefined/.test(txt), txt.slice(0,400));
    assert.ok(/saturable side's read from/.test(txt), "the saturable side's level named");
  }
});
