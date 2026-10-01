// Run with: node --test
// Bayesian individualization (pk-bayes.js): the MAP estimate against its limits, the independent SciPy reference,
// the Laplace uncertainty, the two-level estimate beside it, doses to a target, and the v8 links that carry levels.
const test=require("node:test");
const assert=require("node:assert/strict");
const PK=require("../pk-engine.js");
const {scenario}=PK, B=PK.bayes;
const REF=require("../validation/reference-results.json");

const near=(actual, expected, tol, msg)=>
  assert.ok(Math.abs(actual-expected)<=tol, `${msg?msg+": ":""}expected ${expected} ± ${tol}, got ${actual}`);
const rel=(actual, expected, frac, msg)=> near(actual, expected, Math.abs(expected)*frac, msg);
const S=o=> PK.normalizeScenario(scenario(o));

// a vancomycin-like regimen in a clinical patient, and levels from a "true" patient with 0.7× the clearance and 1.2× the volume
const P=S({pm:"clinical", route:"inf", dosing:"repeated", D:1000, tinf:1, tau:12, nDoses:5, V:49, thalf:7, fe:0.9, scr:1.0, age:60});
const prior=B.priorOf(P), TRUE={CL:prior.CL*0.7, V:prior.V*1.2};
function levelsFrom(truth, spec, errs){
  const q=B.individual(P, truth.CL, truth.V), ev=PK.doseEvents(q);
  return spec.map(([n,dt],i)=>({n, dt, c:PK.conc(q, ev[n-1].t+dt, ev)*(1+(errs ? errs[i] : 0))}));
}
const SPEC=[[4,2],[4,11.5],[5,3]];

test("MAP: exact levels with a very wide prior recover the true clearance and volume (within 0.1%)", ()=>{
  const e=B.estimate(P, levelsFrom(TRUE, SPEC), {wCL:100, wV:100, mec:10});
  rel(e.CL, TRUE.CL, 1e-3, "CL"); rel(e.V, TRUE.V, 1e-3, "V"); rel(e.thalf, Math.LN2*TRUE.V/TRUE.CL, 1e-3, "t½");
  // the estimate's own scenario reproduces the levels
  e.obs.forEach(o=> rel(o.pred, o.y, 1e-4, `level at ${o.t} h`));
});

test("MAP: with no levels the estimate is the prior, and its uncertainty is the prior's", ()=>{
  const e=B.estimate(P, [], {mec:10});
  rel(e.CL, prior.CL, 1e-12); rel(e.V, prior.V, 1e-12);
  rel(e.sd.lnCL, B.omega(30), 1e-4); rel(e.sd.lnV, B.omega(20), 1e-4);
  near(e.shrink.CL, 1, 1e-4, "nothing learned"); near(e.shrink.V, 1, 1e-4);
  // ω = √ln(1 + CV²), as in population mode
  rel(B.omega(30), Math.sqrt(Math.log(1.09)), 1e-15);
});

test("MAP: noisy levels with a tight prior land between the prior and the levels' own (two-level) estimate", ()=>{
  const lv=levelsFrom(TRUE, [[4,2],[4,11.5]], [0.06,-0.05]), e=B.estimate(P, lv, {cvCL:10, cvV:10, mec:10}), tl=B.twoLevel(P, lv, {mec:10});
  assert.ok(tl, "two levels after the same infusion give a two-level estimate");
  const between=(x,a,b)=> x>Math.min(a,b) && x<Math.max(a,b);
  assert.ok(between(e.CL, prior.CL, tl.CL), `CL ${e.CL} between ${prior.CL} and ${tl.CL}`);
  assert.ok(between(e.V, prior.V, tl.V), `V ${e.V} between ${prior.V} and ${tl.V}`);
  // and the wider the prior, the closer to the levels
  const w=B.estimate(P, lv, {cvCL:60, cvV:40, mec:10});
  assert.ok(Math.abs(Math.log(w.CL/tl.CL))<Math.abs(Math.log(e.CL/tl.CL)));
});

test("MAP: a fine grid and the optimizer agree within 0.5%, and the optimizer's objective is never worse", ()=>{
  [[0.08,-0.06,0.05],[-0.1,0.1,0],[0,0,0]].forEach(err=>{
    const lv=levelsFrom(TRUE, SPEC, err), e=B.estimate(P, lv, {mec:10}), g=B.gridSearch(B.problem(P, lv, {mec:10}), 301, 3);
    rel(Math.exp(g.x[0]), e.CL, 5e-3, "CL"); rel(Math.exp(g.x[1]), e.V, 5e-3, "V");
    assert.ok(e.ofv<=g.f+1e-9, `optimizer ${e.ofv} vs grid ${g.f}`);
  });
});

test("Laplace: the posterior SD falls as levels are added, and the 95% interval brackets the estimate", ()=>{
  const all=levelsFrom(TRUE, [[2,2],[3,11],[4,2],[4,11.5],[5,3]], [0.03,-0.02,0.04,-0.03,0.02]);
  let last=Infinity;
  for(let k=0;k<=all.length;k++){
    const e=B.estimate(P, all.slice(0,k), {mec:10});
    assert.ok(e.sd.lnCL<=last+1e-12, `${k} levels: ${e.sd.lnCL} ≤ ${last}`);
    last=e.sd.lnCL;
    assert.ok(e.ci.CL[0]<e.CL && e.CL<e.ci.CL[1] && e.ci.V[0]<e.V && e.V<e.ci.V[1] && e.ci.thalf[0]<e.thalf && e.thalf<e.ci.thalf[1]);
    rel(e.ci.CL[1]/e.CL, Math.exp(1.959963984540054*e.sd.lnCL), 1e-12);
  }
  assert.ok(last<0.6*B.omega(30), "five levels shrink the clearance SD well below the prior's");
});

test("MAP agrees with an independent SciPy implementation on 20 scenarios (within 0.5%; in practice 1e-5)", ()=>{
  assert.equal(REF.map.scenarios.length, 20);
  const routes=new Set(REF.map.scenarios.map(s=>s.scenario.route));
  ["oral","iv","inf"].forEach(r=> assert.ok(routes.has(r), r));
  REF.map.scenarios.forEach(s=>{
    const p=S(s.scenario), e=B.estimate(p, p.lv, s.opts), r=s.reference, pr=B.priorOf(p, s.opts);
    rel(pr.CL, r.priorCL, 1e-9, `${s.id} prior CL`); rel(pr.V, r.priorV, 1e-9, `${s.id} prior V`);
    rel(e.CL, r.CL, REF.map.tolerance, `${s.id} CL`); rel(e.V, r.V, REF.map.tolerance, `${s.id} V`);
    rel(e.CL, r.CL, 1e-5, `${s.id} CL (regression guard)`); rel(e.V, r.V, 1e-5, `${s.id} V (regression guard)`);
  });
});

test("two-level estimate: exact from two exact levels after the same infusion; none from oral or single-level data", ()=>{
  const tl=B.twoLevel(P, levelsFrom(TRUE, [[4,2],[4,11.5]]), {mec:10});
  rel(tl.CL, TRUE.CL, 1e-9); rel(tl.V, TRUE.V, 1e-9); rel(tl.k, TRUE.CL/TRUE.V, 1e-9); assert.equal(tl.n, 4);
  assert.equal(B.twoLevel(P, levelsFrom(TRUE, [[4,2]]), {}), null);
  assert.equal(B.twoLevel(P, levelsFrom(TRUE, [[4,0.5],[4,11]]), {}), null, "a level during the infusion doesn't count");
  const oral=S({pm:"clinical", route:"oral", dosing:"repeated", tau:12, nDoses:4});
  const ev=PK.doseEvents(oral), lv=[[4,2],[4,10]].map(([n,dt])=>({n,dt,c:PK.conc(oral, ev[n-1].t+dt, ev)}));
  assert.equal(B.twoLevel(oral, lv, {}), null, "absorption breaks the log-linear slope");
});

test("levels sit on the schedule: a level after a missed dose is dropped, and a level after a bolus includes it", ()=>{
  const p=S({pm:"clinical", route:"iv", dosing:"repeated", tau:8, nDoses:4, missed:2});
  const ob=B.observations(p, [{n:1,dt:0,c:10},{n:2,dt:1,c:5},{n:4,dt:1,c:3}]);
  assert.deepEqual(ob.obs.map(o=>o.t), [0, 17], "dose 2 is the third dose given (at 16 h)");
  assert.deepEqual(ob.skipped, [2], "only three doses are given");
  // the error model: √((0.1·c)² + (MEC / 10)²)
  const o=B.observations(p, [{n:1,dt:1,c:12}], {mec:4}).obs[0];
  rel(o.sd, Math.sqrt(1.2*1.2+0.4*0.4), 1e-15);
  assert.equal(B.addOf({mec:0}), 0.01); assert.equal(B.addOf({}), PK.VIEW_DEFAULTS.mec/10);
});

test("doses to a target: exact for an AUC24 or a trough at steady state", ()=>{
  const e=B.estimate(P, levelsFrom(TRUE, SPEC, [0.04,-0.03,0.02]), {mec:10}), q=e.scenario;
  const D=B.doseFor(q, {kind:"auc", value:500}), r=Object.assign(PK.cloneScenario(q), {D});
  rel(B.steadyState(r).auc24, 500, 1e-9);
  rel(B.steadyState(r).auc24, 24*D/(q.tau*e.CL), 1e-9, "AUC24 = 24·D / (τ·CL)");
  const Dt=B.doseFor(q, {kind:"trough", value:15});
  rel(B.steadyState(Object.assign(PK.cloneScenario(q), {D:Dt})).trough, 15, 1e-9);
});

test("the method says where it doesn't apply: saturable elimination and two compartments", ()=>{
  assert.equal(B.estimate(S({pm:"clinical", kin:"mm"}), [{n:1,dt:2,c:5}]).ok, false);
  assert.equal(B.estimate(S({pm:"clinical", cmt:2}), [{n:1,dt:2,c:5}]).ok, false);
  assert.match(B.applicable(S({cmt:2})).why, /Two compartments/);
  assert.equal(PK.isRelevant("lv", S({pm:"clinical"})), true);
  ["simple","mm","cmt2"].forEach(k=> assert.equal(PK.isRelevant("lv", S(k==="simple" ? {} : k==="mm" ? {pm:"clinical", kin:"mm"} : {pm:"clinical", cmt:2})), false, k));
});

test("links: levels travel in a v8 link, are checked on the way in, and older links are unchanged", ()=>{
  const V=PK.VIEW_DEFAULTS, p=S({pm:"clinical", route:"inf", dosing:"repeated", lv:[{n:4,dt:11.5,c:9.8},{n:4,dt:2,c:28.3}]});
  assert.deepEqual(p.lv, [{n:4,dt:2,c:28.3},{n:4,dt:11.5,c:9.8}], "sorted by dose and time");
  const link=PK.encodeLink({mode:"sim", s:p, view:V});
  assert.ok(link.startsWith("v=8&") && link.includes("lv:4@2=28.3;4@11.5=9.8"), link);
  assert.deepEqual(PK.decodeLink(link).s.lv, p.lv);
  assert.deepEqual(PK.decodeLink("v=8&s=pm:clinical,lv:4@2=28.3;x@1=2;99@1=2;3@-1=4;2@500=1").s.lv, [{n:2,dt:336,c:1},{n:4,dt:2,c:28.3},{n:40,dt:1,c:2}].sort((a,b)=>a.n-b.n), "bad tokens dropped, numbers clamped");
  assert.equal(PK.decodeLink("v=8&s=lv:"+Array.from({length:12},(_,i)=>`1@${i}=1`).join(";")).s.lv.length, PK.LEVEL_LIMITS.max);
  assert.ok(PK.encodeLink({mode:"sim", s:S({hep:1}), view:V}).startsWith("v=7&"), "the liver model alone is still v7");
  assert.ok(PK.encodeLink({mode:"sim", s:S({}), view:V}).startsWith("v=1&"));
  assert.deepEqual(PK.decodeLink("v=7&s=pm:clinical").s.lv, []);
  // levels are concentrations: they convert with the unit, and scenarios never share a levels array
  const dig=S({unit:"mcg", lv:[{n:1,dt:6,c:1.2}]}), mg=PK.convertUnits(dig, "mg");
  rel(mg.lv[0].c, 0.0012, 1e-12);
  const a=PK.cloneScenario(p); a.lv[0].c=99; assert.equal(p.lv[0].c, 28.3);
  assert.equal(PK.sameSetting("lv", p, PK.cloneScenario(p)), true);
});

test("lesson: one level and a prior (every number the text states)", ()=>{
  const L=PK.LESSONS.find(x=>x.id==="bayes"), C=require("../cases.js"), b=C.bayesOf(C.caseById("vanc-bayes"));
  const base=S(L.base), cur=S(L.cur), pr=B.priorOf(base), e=B.estimate(cur, cur.lv, {mec:L.view.mec});
  assert.equal(L.group, "tdm");
  // the lesson's patient is the case's, as the model predicts him, on 750 mg every 12 h
  assert.equal(PK.encodeScenario(base), PK.encodeScenario(Object.assign(PK.cloneScenario(b.prior), {lv:[]})));
  assert.deepEqual([base.D, base.tau], [750, 12]);
  assert.equal(pr.CL.toFixed(2), "2.78"); assert.equal((1500/pr.CL).toFixed(0), "540");
  assert.equal(b.trueCL.toFixed(2), "1.94"); assert.equal((1500/b.trueCL).toFixed(0), "772");
  assert.equal(b.sz.auc24.toFixed(0), "583"); assert.equal((100*(b.sz.CL/b.trueCL-1)).toFixed(0), "32");
  // the trough: 5% above the true level just before the ninth dose, reported to 0.1 mg/L
  const ev=PK.doseEvents(b.truth); assert.equal((PK.conc(b.truth, ev[7].t+11.9, ev)*1.05).toFixed(1), "24.8");
  assert.deepEqual(cur.lv, [{n:8, dt:11.9, c:24.8}]);
  assert.equal(e.CL.toFixed(2), "1.91"); assert.deepEqual(e.ci.CL.map(x=>x.toFixed(2)), ["1.59","2.30"]);
  assert.equal(Math.abs(100*(e.CL/b.trueCL-1)).toFixed(0), "2"); assert.equal((1500/e.CL).toFixed(0), "785");
  const checked=["750","12","2.78","540","1.94","772","583","32","24.8","5","1.91","95","1.59","2.30","2","785"];
  (L.text.match(/(?<![A-Za-z\d.])\d+(\.\d+)?/g)||[]).forEach(n=> assert.ok(checked.includes(n), `the text states ${n}, which no assertion checks`));
  assert.ok(!/\d/.test(L.tryThis));
  // the prediction and the challenge
  assert.equal(L.predict.decide(PK.lessonCheck(L)), L.predict.answer);
  assert.equal(PK.challengeMet(L, PK.lessonScenario(L)), false);
  assert.equal(PK.challengeMet(L, PK.lessonScenario(L, L.challenge.solution)), true);
  assert.equal(PK.challengeMet(L, PK.lessonScenario(L, {lv:[{n:8,dt:10.9,c:26},{n:8,dt:11.9,c:24.8}]})), false, "a second level near the trough says little about volume");
  // what the glossary says: a trough tells the most about clearance, a level soon after a dose the most about volume
  const sh=lv=> B.estimate(cur, lv, {mec:10}).shrink, tr=[{n:8,dt:11.9,c:24.8}], early=[{n:8,dt:2.25,c:41.8},{n:8,dt:3.25,c:35.8}];
  assert.ok(sh(tr).CL<sh(early).CL, "one trough beats two levels an hour apart after the peak, for clearance");
  assert.ok(sh([{n:8,dt:2.25,c:41.8}].concat(tr)).V<sh([{n:8,dt:10.9,c:26}].concat(tr)).V-0.1, "an early level, for volume");
  ["Bayesian estimate (MAP)","Prior","Uncertainty left (shrinkage)"].forEach(t=> assert.ok(PK.GLOSSARY.some(g=>g.term===t && g.lesson==="bayes"), t));
});
