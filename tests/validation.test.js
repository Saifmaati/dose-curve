// Run with: node --test
// Validation: DoseCurve's engine against an independent solver (validation/reference.py, scipy solve_ivp) on a
// matrix of routes × regimens × drugs × patients, and against analytic identities of the model.
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const crypto=require("node:crypto");
const PK=require("../pk-engine.js");
const {scenario}=PK;

const REF=require("../validation/reference-results.json");
const near=(actual, expected, tol, msg)=>
  assert.ok(Math.abs(actual-expected)<=tol, `${msg?msg+": ":""}expected ${expected} ± ${tol}, got ${actual}`);
const rel=(actual, expected, frac, msg)=> near(actual, expected, Math.abs(expected)*frac, msg);

// the same comparison validation.html runs in the browser; scenarios with an effect-site delay are read at the effect site
function engineMetrics(s){
  const {T,mec,mtc}=REF.window, p=PK.normalizeScenario(scenario(s.scenario)), w=PK.windowStats(p,T,mec,mtc,s.site);
  const level=s.site==="effect" ? PK.ceConc : PK.conc;
  return {peak:w.cmax, trough:level(p,(p.dosing==="repeated" ? p.nDoses*p.tau : T)-1e-9), auc:w.auc, tin_pct:100*w.tIn/T};
}

test("the reference covers routes × regimens × drugs (linear, saturable, two-compartment) × patients (normal and reduced CrCl)", ()=>{
  const S=REF.scenarios, by=k=> new Set(S.map(s=>s[k]));
  assert.ok(S.length>=90, `${S.length} scenarios`);
  ["oral","iv","inf","mixed"].forEach(r=> assert.ok(by("route").has(r), r));
  ["single","repeated","loading","missed","custom"].forEach(r=> assert.ok(by("regimen").has(r), r));
  ["linear","salt","mm","twocmt"].forEach(d=> assert.ok(by("drug").has(d), d));
  ["normal","reduced"].forEach(p=> assert.ok(by("patient").has(p), p));
  assert.ok(S.some(s=>s.nonlinear) && S.some(s=>!s.nonlinear));
  assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(REF.generated));
  // the effect site: every route and the mixed schedule, one and two compartments, each with a delay the engine uses
  const E=S.filter(s=>s.site==="effect");
  assert.ok(E.length>=20, `${E.length} effect-site scenarios`);
  ["oral","iv","inf","mixed"].forEach(r=> assert.ok(E.some(s=>s.route===r), r));
  ["linear","twocmt"].forEach(d=> assert.ok(E.some(s=>s.drug===d), d));
  E.forEach(s=> assert.ok(PK.keqOf(PK.normalizeScenario(scenario(s.scenario)))>0, s.id));
});

test("every scenario agrees with the independent solver: peak, trough and AUC within 0.5% (linear) or 1% (saturable)", ()=>{
  let n=0;
  REF.scenarios.forEach(s=>{
    const m=engineMetrics(s), r=s.reference, tol=s.nonlinear ? REF.tolerance.nonlinear : REF.tolerance.linear;
    ["peak","trough","auc"].forEach(k=>{ rel(m[k], r[k], tol, `${s.id} ${k}`); n++; });
  });
  assert.equal(n, 3*REF.scenarios.length);
});

test("time in window agrees within 0.5 percentage points (linear) or 1 point (saturable)", ()=>{
  REF.scenarios.forEach(s=>{
    const m=engineMetrics(s), tol=s.nonlinear ? REF.tolerance.tin_pp_nonlinear : REF.tolerance.tin_pp_linear;
    near(m.tin_pct, s.reference.tin_pct, tol, `${s.id} time in window`);
  });
});

test("in practice the agreement is far closer: every difference under 0.001% and 0.001 points (a regression guard)", ()=>{
  // peaks are refined between grid points, areas use Simpson's rule, and window crossings are found by bisection
  REF.scenarios.forEach(s=>{
    const m=engineMetrics(s), r=s.reference;
    ["peak","trough","auc"].forEach(k=> rel(m[k], r[k], 1e-5, `${s.id} ${k}`));
    near(m.tin_pct, r.tin_pct, 0.001, `${s.id} time in window`);
  });
});

test("the validation page runs the engine it ships with and says what it checks", ()=>{
  const root=path.join(__dirname,".."), html=fs.readFileSync(path.join(root,"validation.html"),"utf8");
  const hash=crypto.createHash("sha256").update(fs.readFileSync(path.join(root,"pk-engine.js"))).digest("hex").slice(0,10);
  assert.ok(html.includes(`pk-engine.js?v=${hash}`), "validation.html loads the current engine by its hash");
  // the results are named by their content hash, so a new release's page never reads an older release's cached results
  const rh=crypto.createHash("sha256").update(fs.readFileSync(path.join(root,"validation/reference-results.json"))).digest("hex").slice(0,10);
  assert.ok(html.includes(`fetch("validation/reference-results.json?v=${rh}")`), `validation.html must fetch reference-results.json?v=${rh}`);
  assert.ok(/Educational model, not for clinical dosing/.test(html));
  assert.ok(html.includes("python3 validation/reference.py") && html.includes("node --test"));
  const page=fs.readFileSync(path.join(root,"index.html"),"utf8");
  assert.ok(/href="validation\.html"/.test(page), "linked from the app's footer");
  const sw=fs.readFileSync(path.join(root,"sw.js"),"utf8");
  assert.ok(sw.includes('"./validation.html"') && sw.includes(`"./validation/reference-results.json?v=${rh}"`), "precached for offline use, under the same hash");
});

/* ---------- analytic identities (tolerances stated in each assertion) ---------- */

test("accumulation ratio 1 / (1 − e^(−kₑτ)): peaks and troughs at steady state over the first dose (IV bolus, exact to 1e-9)", ()=>{
  [[4,6],[6,12],[12,8],[2,24]].forEach(([th,tau])=>{
    const p=scenario({route:"iv", dosing:"repeated", thalf:th, tau, nDoses:20}), k=Math.LN2/th, R=1/(1-Math.exp(-k*tau));
    rel(PK.ssProfile(p).Rac, R, 1e-12);
    rel(PK.ssConc(p,0)/PK.conc(scenario({route:"iv", thalf:th}),0), R, 1e-9, `peak ratio t½ ${th} h τ ${tau} h`);
    rel(PK.ssConc(p,tau-1e-9)/PK.conc(scenario({route:"iv", thalf:th}),tau-1e-9), R, 1e-6, "trough ratio");
  });
});

test("90% of steady state takes log₂10 = 3.32 half-lives, whatever the dose or interval (within 0.2%)", ()=>{
  [[4,4,500],[6,12,250],[3,8,1000]].forEach(([th,tau,D])=>{
    const p=scenario({route:"inf", dosing:"single", D:D*50, tinf:50*tau, thalf:th});   // a constant input
    const css=D/tau/(Math.LN2/th*35);
    let t=0; while(PK.conc(p,t)<0.9*css) t+=0.001;
    rel(t, 3.3219*th, 0.002, `t½ ${th} h`);
    rel(PK.ssProfile(scenario({dosing:"repeated", thalf:th, tau, D})).t90, 3.32*th, 1e-12);
  });
});

test("AUC = F·S·D / CL for every route, checked by integrating the curve (within 0.1%)", ()=>{
  [{route:"iv"},{route:"oral", F:0.7, ka:0.9},{route:"inf", tinf:3},{route:"oral", F:1, ka:3, S:0.8}].forEach(o=>{
    const p=scenario(Object.assign({D:500, thalf:5, V:30}, o)), d=PK.derived(p), F=o.route==="oral" ? o.F : 1, S=o.S||1;
    rel(d.auc, F*S*500/d.CL, 1e-12, `${o.route} closed form`);
    const w=PK.windowStats(p, 5*20, 0, Infinity);   // 20 half-lives: the tail left is 1e-6
    rel(w.auc, d.auc, 0.001, `${o.route} integrated`);
  });
});

test("an infusion plateaus at R₀ / CL (within 0.01% after 20 half-lives)", ()=>{
  [[2,100],[6,50],[10,25]].forEach(([th,R])=>{
    const p=scenario({route:"inf", D:R*20*th, tinf:20*th, thalf:th, V:40}), CL=Math.LN2/th*40;
    rel(PK.conc(p,20*th-1e-6), R/CL, 1e-4, `t½ ${th} h`);
  });
});

test("Michaelis–Menten identities: Css = Km·R / (Vmax − R), t90, low-level first-order limit", ()=>{
  const Vm=7*70/24;
  [0.4,0.7].forEach(f=>{
    const R=f*Vm, p=scenario({kin:"mm", vmax:7, km:4, V:49, route:"inf", dosing:"repeated", tau:24, tinf:24, nDoses:14, D:R*24});
    rel(PK.mmCss(p).css, 4*R/(Vm-R), 1e-12);
    rel(PK.mmSteady(p).avg, 4*R/(Vm-R), 0.001, "the simulated steady state (0.1%)");
    const t90=PK.mmT90(p); rel(PK.conc(p,t90), 0.9*4*R/(Vm-R), 0.005, "90% of Css at t90 (0.5%)");
  });
  const low=scenario({kin:"mm", vmax:7, km:500, V:49, route:"iv", D:5}), k=Vm/(500*49);
  rel(PK.conc(low,24), 5/49*Math.exp(-k*24), 0.001, "C ≪ Km: first-order at Vmax / (Km·V)");
});

test("Cockcroft–Gault and Devine hand values (from the plan): 72.9 and 62.0 mL/min; 73.0 and 57.0 kg", ()=>{
  assert.equal(PK.crclCG(65,70,1,"M").toFixed(1), "72.9"); assert.equal(PK.crclCG(65,70,1,"F").toFixed(1), "62.0");
  assert.equal(PK.ibwDevine("M",70).toFixed(1), "73.0"); assert.equal(PK.ibwDevine("F",65).toFixed(1), "57.0");
});

test("a bolus exactly at the window's end adds nothing inside it: the area is the closed form, and the peak is an earlier dose's", ()=>{
  const p=PK.normalizeScenario(scenario({route:"iv", dosing:"repeated", D:1060, thalf:9.5, V:51, tau:21, nDoses:9})), T=168, k=Math.LN2/9.5;
  let exact=0; PK.doseEvents(p).forEach(e=>{ if(e.t<T) exact+=e.mg/51*(1-Math.exp(-k*(T-e.t)))/k; });
  const w=PK.windowStats(p, T, 1, 1e9);
  rel(w.auc, exact, 1e-9, "∫ over [0, 168) of the doses given before 168 h");
  near(w.tmax, 147, 1e-9, "the last dose inside the window");
  rel(w.cmax, PK.conc(p, 147), 1e-12);
});

test("peaks read off a sampled interval are refined: the dose table and the steady state match a dense scan (1e-6)", ()=>{
  // a sharp oral peak with two compartments, where 60 samples an interval fell 3.7% short
  const p=PK.normalizeScenario(scenario({route:"oral", dosing:"repeated", D:638, F:0.77, ka:2.44, thalf:2.3, V:39, tau:22, nDoses:7, cmt:2, k12:1.6, k21:0.52}));
  const ss=PK.ssProfile(p), scan=(f,a,b)=>{ let m=0; for(let j=0;j<=40000;j++){ const c=f(a+(b-a)*j/40000); if(c>m) m=c; } return m; };
  const ssScan=scan(s=>PK.ssConc(p,s), 0, 22-1e-9);
  assert.ok(ss.ssPeak>=ssScan*(1-1e-6) && ss.ssPeak<=ssScan*(1+1e-6), `steady-state peak ${ss.ssPeak} vs ${ssScan}`);
  ss.rows.forEach((r,i)=>{ const m=scan(t=>PK.conc(p,t), i*22, (i+1)*22-1e-9); assert.ok(r.peak>=m*(1-1e-6) && r.peak<=m*(1+1e-6), `dose ${i+1}: ${r.peak} vs ${m}`); });
  // and for a saturable regimen's dose table
  const q=PK.normalizeScenario(scenario({kin:"mm", route:"oral", dosing:"repeated", D:300, tau:24, nDoses:5, vmax:7, km:4, V:49, ka:1.5, F:1}));
  PK.ssProfile(q).rows.forEach((r,i)=>{ const m=scan(t=>PK.conc(q,t), i*24, (i+1)*24-1e-9); assert.ok(Math.abs(r.peak/m-1)<1e-6, `saturable dose ${i+1}: ${r.peak} vs ${m}`); });
});

/* ---------- a standing cross-check: random scenarios against dense scans of the engine's own curve ---------- */
test("random scenarios: every peak, trough, steady state and window area the engine reports matches a dense scan of its curve", ()=>{
  const rnd=PK.seededRandom(20260930), pick=(a,b)=>a+(b-a)*rnd(), one=a=>a[Math.floor(rnd()*a.length)];
  // a dense scan, plus the moments a peak can sit at exactly (dose times and infusion ends inside the span)
  const scan=(f,a,b,n,kinks)=>{ let m=0; for(let j=0;j<=n;j++){ const c=f(a+(b-a)*j/n); if(c>m) m=c; }
    (kinks||[]).forEach(t=>{ if(t>=a && t<=b){ const c=f(t); if(c>m) m=c; } }); return m; };
  // Simpson's rule between breakpoints (doses and infusion ends), each segment open at its right end
  const area=(p,T)=>{ const ev=PK.doseEvents(p), bp=[...new Set([0,T].concat(ev.map(e=>e.t), ev.filter(e=>e.route==="inf").map(e=>e.t+e.dur)).filter(t=>t>=0&&t<=T))].sort((a,b)=>a-b);
    let s=0; for(let j=0;j<bp.length-1;j++){ const a=bp[j], b=bp[j+1], n=400, h=(b-a)/n; let q=0; for(let m=0;m<=n;m++) q+=(m===0||m===n?1:m%2?4:2)*PK.conc(p, m===n ? b-1e-12 : a+m*h, ev); s+=q*h/3; } return s; };
  for(let i=0;i<40;i++){
    const route=one(["oral","iv","inf"]), o={route, dosing:"repeated", D:Math.round(pick(50,1500)), F:+pick(0.3,1).toFixed(2), ka:+pick(0.2,3).toFixed(2),
      thalf:+pick(1,20).toFixed(1), V:Math.round(pick(8,110)), tinf:+pick(0.5,6).toFixed(2), tau:Math.round(pick(4,24)), nDoses:Math.round(pick(2,10)), loadMult:rnd()<0.2?2:1, missed:rnd()<0.2?2:1};
    if(rnd()<0.4) Object.assign(o,{cmt:2, k12:+pick(0.1,2).toFixed(2), k21:+pick(0.1,2).toFixed(2)});
    const p=PK.normalizeScenario(scenario(o)), d=PK.derived(p), where=JSON.stringify(o), t0=(p.nDoses-1)*p.tau, t1=p.nDoses*p.tau;
    const kinks=PK.doseEvents(p).flatMap(e=> e.route==="inf" ? [e.t, e.t+e.dur] : [e.t]);
    const last=scan(t=>PK.conc(p,t), t0, t1-1e-9, 6000, kinks);
    assert.ok(d.cmaxSS>=last*(1-1e-9) && d.cmaxSS<=last*(1+1e-3), `last-dose peak ${d.cmaxSS} vs ${last}: ${where}`);
    const ss=PK.ssProfile(p), ssScan=scan(s=>PK.ssConc(p,s), 0, p.tau-1e-9, 6000, route==="inf" ? [p.tinf%p.tau] : []);
    assert.ok(ss.ssPeak>=ssScan*(1-1e-9) && ss.ssPeak<=ssScan*(1+1e-3), `steady-state peak: ${where}`);
    ss.rows.forEach((r,k)=>{ const m=scan(t=>PK.conc(p,t), k*p.tau, (k+1)*p.tau-1e-9, 3000, kinks); assert.ok(r.peak>=m*(1-1e-9) && r.peak<=m*(1+1e-3), `dose ${k+1} peak: ${where}`); });
    const T=Math.min(168, t1+2*d.thalfEff); rel(PK.windowStats(p,T,1,1e9).auc, area(p,T), 1e-4, `window area: ${where}`);
  }
});

test("random custom schedules (mixed routes, missed doses, one or two compartments, saturable): window peak and area match dense scans", ()=>{
  const rnd=PK.seededRandom(930), pick=(a,b)=>a+(b-a)*rnd(), one=a=>a[Math.floor(rnd()*a.length)];
  for(let i=0;i<24;i++){
    const n=2+Math.floor(rnd()*5), events=[]; let t=0;
    for(let j=0;j<n;j++){ t+= j ? +pick(0.5,14).toFixed(2) : 0; events.push({t:+t.toFixed(2), mg:Math.round(pick(50,800)), route:one(["oral","iv","inf"]), dur:+pick(0.5,8).toFixed(2), status:rnd()<0.15 ? "missed" : "given"}); }
    const mm=rnd()<0.3, o={route:"oral", dosing:"custom", events, F:+pick(0.4,1).toFixed(2), ka:+pick(0.3,2.5).toFixed(2), thalf:+pick(2,16).toFixed(1), V:Math.round(pick(15,80))};
    if(mm) Object.assign(o,{kin:"mm", vmax:+pick(4,10).toFixed(1), km:+pick(2,8).toFixed(1)}); else if(rnd()<0.4) Object.assign(o,{cmt:2, k12:+pick(0.2,1.5).toFixed(2), k21:+pick(0.2,1.5).toFixed(2)});
    const p=PK.normalizeScenario(scenario(o)), ev=PK.doseEvents(p), T=Math.min(168, t+24), w=PK.windowStats(p,T,2,1e9), where=JSON.stringify(o).slice(0,240);
    const bp=[...new Set([0,T].concat(ev.map(e=>e.t), ev.filter(e=>e.route==="inf").map(e=>e.t+e.dur)).filter(x=>x>=0&&x<=T))].sort((a,b)=>a-b);
    let ref=0, top=0;
    for(let j=0;j<bp.length-1;j++){ const a=bp[j], b=bp[j+1], m=300, h=(b-a)/m; let s=0; for(let q=0;q<=m;q++){ const c=PK.conc(p, q===m ? b-1e-12 : a+q*h, ev); s+=(q===0||q===m?1:q%2?4:2)*c; if(c>top) top=c; } ref+=s*h/3; }
    rel(w.auc, ref, 1e-4, `area: ${where}`);
    assert.ok(w.cmax>=top*(1-1e-9) && w.cmax<=top*(1+2e-3), `peak ${w.cmax} vs ${top}: ${where}`);
  }
});

test("effect: time above a target and its onset are exact across bolus jumps (closed form)", ()=>{
  // 400 mg every 12 h, t½ 6 h, V 40 L; EC50 12 mg/L, so 50% effect needs 12 mg/L. Dose 1 peaks at 10 mg/L
  // (below), and each later bolus jumps above it: the onset is the second dose itself, and every dose above
  // the target stays there for ln(C₀ / 12) / k hours.
  const p=PK.normalizeScenario(scenario({route:"iv", dosing:"repeated", D:400, thalf:6, V:40, tau:12, nDoses:4, ec50:12, emax:100, hill:1, e0:0}));
  const k=Math.LN2/6, e=PK.effectStats(p, 48, 50);
  near(e.ct, 12, 1e-12);
  near(e.onset, 12, 1e-9, "reached at the second dose, not ramped up to before it");
  const exact=[12,24,36].reduce((s,t)=> s+Math.log(PK.conc(p,t)/12)/k, 0);
  near(e.tAbove, exact, 1e-6, "hours at or above 50% effect");
  // a smooth (oral) crossing is found by bisection
  const q=PK.normalizeScenario(scenario({route:"oral", D:500, F:1, ka:1, thalf:6, V:40, ec50:6, emax:100, hill:1, e0:0})), f=PK.effectStats(q, 24, 50);
  near(PK.conc(q, f.onset), 6, 1e-9, "the level at onset is the target concentration");
});

test("random scenarios: time in, above and below the window, and time above a target effect, match dense sampling", ()=>{
  const rnd=PK.seededRandom(1006), pick=(a,b)=>a+(b-a)*rnd(), one=a=>a[Math.floor(rnd()*a.length)];
  for(let i=0;i<14;i++){
    const o={route:one(["oral","iv","inf"]), dosing:one(["single","repeated"]), D:Math.round(pick(50,1500)), F:+pick(0.3,1).toFixed(2), ka:+pick(0.2,3).toFixed(2),
      thalf:+pick(1,20).toFixed(1), V:Math.round(pick(8,110)), tinf:+pick(0.5,6).toFixed(2), tau:Math.round(pick(4,24)), nDoses:Math.round(pick(2,10))};
    if(rnd()<0.25) Object.assign(o,{kin:"mm", vmax:+pick(4,10).toFixed(1), km:+pick(2,8).toFixed(1)}); else if(rnd()<0.3) Object.assign(o,{cmt:2, k12:+pick(0.2,1.5).toFixed(2), k21:+pick(0.2,1.5).toFixed(2)});
    const p=PK.normalizeScenario(scenario(o)), ev=PK.doseEvents(p), T=Math.round(pick(12,96)), M=40000, h=T/M, where=JSON.stringify(o);
    let top=0; for(let j=0;j<=400;j++){ const c=PK.conc(p,T*j/400,ev); if(c>top) top=c; }
    const mec=top*pick(0.1,0.5), mtc=top*pick(0.55,0.95), w=PK.windowStats(p,T,mec,mtc);
    const q=Object.assign({}, p, {ec50:top*pick(0.2,0.8), emax:100, hill:+pick(0.5,3).toFixed(2), e0:0}), e=PK.effectStats(q,T,50), ct=PK.concForEffect(q,50);
    let tin=0, tab=0, tbe=0, eff=0;
    for(let j=0;j<M;j++){ const c=PK.conc(p,(j+0.5)*h,ev); if(c>=mec && c<=mtc) tin+=h; else if(c>mtc) tab+=h; else tbe+=h; if(c>=ct) eff+=h; }
    const tol=3*h;   // the reference is good to about a step (1.5.0 was 28 steps off on the effect time)
    near(w.tIn, tin, tol, `in: ${where}`); near(w.tAbove, tab, tol, `above: ${where}`); near(w.tBelow, tbe, tol, `below: ${where}`);
    near(e.tAbove, eff, tol, `effect: ${where}`);
  }
});

test("random scenarios with an effect-site delay: peak effect, its time, onset and time above a target match dense sampling of the effect site", ()=>{
  const rnd=PK.seededRandom(1007), pick=(a,b)=>a+(b-a)*rnd(), one=a=>a[Math.floor(rnd()*a.length)];
  for(let i=0;i<16;i++){
    const o={route:one(["oral","iv","inf"]), dosing:one(["single","repeated"]), D:Math.round(pick(50,1500)), F:+pick(0.3,1).toFixed(2), ka:+pick(0.2,3).toFixed(2),
      thalf:+pick(1,20).toFixed(1), V:Math.round(pick(8,110)), tinf:+pick(0.5,6).toFixed(2), tau:Math.round(pick(4,24)), nDoses:Math.round(pick(2,10)), teq:+pick(0.1,8).toFixed(1)};
    if(rnd()<0.3) Object.assign(o,{cmt:2, k12:+pick(0.2,1.5).toFixed(2), k21:+pick(0.2,1.5).toFixed(2)});
    const p=PK.normalizeScenario(scenario(o)), ev=PK.doseEvents(p), T=Math.round(pick(12,96)), M=40000, h=T/M, where=JSON.stringify(o);
    let top=0; for(let j=0;j<=400;j++){ const c=PK.ceConc(p,T*j/400,ev); if(c>top) top=c; }
    const q=Object.assign({}, p, {ec50:top*pick(0.2,0.8), emax:100, hill:+pick(0.5,3).toFixed(2), e0:0}), e=PK.effectStats(q,T,50), ct=PK.concForEffect(q,50);
    let eff=0, first=null, peak=0, tPeak=0;
    for(let j=0;j<M;j++){ const t=(j+0.5)*h, c=PK.ceConc(p,t,ev); if(c>=ct){ eff+=h; if(first===null) first=t; } if(c>peak){ peak=c; tPeak=t; } }
    const tol=3*h;
    near(e.tAbove, eff, tol, `time above: ${where}`); near(e.onset, first, tol, `onset: ${where}`);
    assert.ok(PK.windowStats(p,T,0,Infinity,"effect").cmax>=peak*(1-1e-12), `effect-site peak: ${where}`);
    near(e.peak, PK.effectOf(q,peak), 1e-3, `peak effect: ${where}`); near(e.tPeak, tPeak, 0.05, `time of peak: ${where}`);
  }
});
