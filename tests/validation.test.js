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

// the same comparison validation.html runs in the browser
function engineMetrics(s){
  const {T,mec,mtc}=REF.window, p=PK.normalizeScenario(scenario(s.scenario)), w=PK.windowStats(p,T,mec,mtc);
  return {peak:w.cmax, trough:PK.conc(p,(p.dosing==="repeated" ? p.nDoses*p.tau : T)-1e-9), auc:w.auc, tin_pct:100*w.tIn/T};
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
  assert.ok(html.includes("validation/reference-results.json"));
  assert.ok(/Educational model, not for clinical dosing/.test(html));
  assert.ok(html.includes("python3 validation/reference.py") && html.includes("node --test"));
  const page=fs.readFileSync(path.join(root,"index.html"),"utf8");
  assert.ok(/href="validation\.html"/.test(page), "linked from the app's footer");
  const sw=fs.readFileSync(path.join(root,"sw.js"),"utf8");
  assert.ok(sw.includes('"./validation.html"') && sw.includes('"./validation/reference-results.json"'), "precached for offline use");
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
