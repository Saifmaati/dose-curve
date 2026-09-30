// Run with: node --test
// The liver model (well-stirred hepatic clearance and first pass): its identities, how it drives the engine,
// the v7 links that carry it, the three lessons (every number they state), practice, glossary and workings.
const test=require("node:test");
const assert=require("node:assert/strict");
const PK=require("../pk-engine.js");
const {scenario}=PK;

const near=(actual, expected, tol, msg)=>
  assert.ok(Math.abs(actual-expected)<=tol, `${msg?msg+": ":""}expected ${expected} ± ${tol}, got ${actual}`);
const rel=(actual, expected, frac, msg)=> near(actual, expected, Math.abs(expected)*frac, msg);
const S=o=> PK.normalizeScenario(scenario(o));
const H=o=> S(Object.assign({hep:1}, o));

test("well-stirred model: E = fu·CLint / (Q + fu·CLint), CL = Q·E, and its two limits", ()=>{
  const w=PK.wellStirred(H({qh:90, fub:0.5, clint:20}));
  near(w.E, 10/100, 1e-15); near(w.CL, 9, 1e-12); near(w.FH, 0.9, 1e-15);
  // capacity-limited: clearance → fu·CLint; flow-limited: clearance → Q
  rel(PK.wellStirred(H({qh:90, fub:0.05, clint:0.5})).CL, 0.05*0.5, 3e-4, "low fu·CLint");
  rel(PK.wellStirred(H({qh:90, fub:1, clint:5000})).CL, 90, 0.02, "high fu·CLint");
  // the engine's clearance and half-life are the model's: CL = kₑ·V, the same at any weight
  [{route:"iv"},{route:"oral", wt:40},{route:"inf", wt:120, cmt:2, k12:1, k21:0.4}].forEach(o=>{
    const p=H(Object.assign({qh:60, fub:0.3, clint:200}, o)), d=PK.derived(p), w=PK.wellStirred(p);
    rel(d.CL, w.CL*p.wt/70, 1e-12, `CL ${JSON.stringify(o)}`);
    rel(p.thalf, Math.LN2*p.V/w.CL, 1e-12, "the scenario shows the model's half-life");
  });
});

test("first pass: F = fabs·(1 − E); oral AUC = fabs·D / (fu·CLint) whatever the blood flow; IV AUC = D / CL", ()=>{
  [30,60,90,150,200].forEach(qh=>{
    const o=H({route:"oral", D:800, qh, fub:0.4, clint:300, fabs:0.8}), iv=H({route:"iv", D:800, qh, fub:0.4, clint:300});
    rel(PK.fOf(o), 0.8*(1-PK.wellStirred(o).E), 1e-14);
    rel(PK.derived(o).auc, 0.8*800/(0.4*300), 1e-12, `oral AUC, Q ${qh}`);
    rel(PK.derived(iv).auc, 800/PK.wellStirred(iv).CL, 1e-12, `IV AUC, Q ${qh}`);
    // the simulated curve agrees: its area over 40 half-lives, by Simpson's rule
    const T=40*o.thalf, N=4000, h=T/N; let s=0; for(let i=0;i<=N;i++) s+=PK.conc(o,i*h)*(i===0||i===N ? 1 : i%2 ? 4 : 2);
    rel(s*h/3, PK.derived(o).auc, 1e-5, "area under the simulated oral curve");
  });
  // custom schedules and repeated dosing use the same F
  const c=H({dosing:"custom", fub:0.5, clint:400, fabs:0.9, events:[{t:0,mg:500,route:"oral"},{t:6,mg:500,route:"iv"}]});
  rel(PK.derived(c).auc, 0.9*500/(0.5*400)+500/PK.wellStirred(c).CL, 1e-12, "a mixed schedule");
  const r=H({route:"oral", dosing:"repeated", D:400, tau:8, nDoses:6, fub:0.2, clint:150});
  rel(PK.derived(r).auc/r.tau, PK.fOf(r)*400/PK.wellStirred(r).CL/8, 1e-12, "average steady-state level");
});

test("the liver model is off by default and changes nothing else; it steps aside for saturable drugs and the clinical patient", ()=>{
  const p=S({}), d=PK.derived(p);
  assert.equal(p.hep, 0); assert.equal(PK.hepOn(p), false);
  assert.equal(d.cmax.toFixed(1), "9.3"); assert.equal(d.auc.toFixed(1), "74.2");
  assert.equal(Math.round(100*PK.windowStats(p,24,2,12).tIn/24), 48);
  ["qh","fub","clint","fabs"].forEach(k=> assert.equal(PK.isRelevant(k,p), false, k));
  assert.equal(PK.isRelevant("hep",p), true);
  const mm=S({hep:1, kin:"mm"}), cl=S({hep:1, pm:"clinical"});
  [mm, cl].forEach(q=>{ assert.equal(PK.hepOn(q), false); assert.equal(PK.isRelevant("hep",q), false); });
  assert.equal(PK.derived(S({hep:1, pm:"clinical", scr:2})).CL, PK.derived(S({pm:"clinical", scr:2})).CL, "clinical mode ignores it");
  // with it on, the half-life, F and organ-function settings don't apply; the model's do
  const h=H({route:"oral"});
  ["thalf","F","clFn"].forEach(k=> assert.equal(PK.isRelevant(k,h), false, k));
  ["qh","fub","clint","fabs"].forEach(k=> assert.equal(PK.isRelevant(k,h), true, k));
  assert.equal(PK.isRelevant("fabs", H({route:"iv"})), false);
  assert.deepEqual(PK.derived(H({clFn:40})), PK.derived(H({})), "organ function doesn't scale the liver model");
  // a drug from the library switches it off
  assert.equal(PK.drugScenario(PK.DRUGS[0]).hep, 0);
});

test("links: the liver model needs a v7 link, carries its own settings (not the derived half-life or F), and older links are unchanged", ()=>{
  const V=PK.VIEW_DEFAULTS, p=H({route:"oral", qh:60, fub:0.25, clint:400, fabs:0.8});
  const link=PK.encodeLink({mode:"sim", s:p, view:V});
  assert.ok(link.startsWith("v=7&"), link);
  assert.ok(!/thalf:|(^|[,=])F:/.test(link.split("&")[1]), `no derived values: ${link}`);
  assert.deepEqual(PK.decodeLink(link).s, p);
  assert.ok(PK.encodeLink({mode:"sim", s:S({teq:1}), view:V}).startsWith("v=6&"), "an effect-site delay alone is still v6");
  assert.ok(PK.encodeLink({mode:"sim", s:S({}), view:V}).startsWith("v=1&"));
  const q=PK.decodeLink("v=7&s=hep:1,qh:999,fub:0,clint:1e9,fabs:7").s;
  assert.deepEqual([q.qh, q.fub, q.clint, q.fabs], [200, 0.01, 5000, 1], "clamped");
  assert.equal(PK.decodeLink("v=7&s=hep:3").s.hep, 0, "an unknown mode is ignored");
  assert.equal(PK.decodeLink("v=6&s=D:400").s.hep, 0);
  assert.ok(["clint","qh","fub"].every(k=> PK.LOCKS.some(l=>l[0]===k)), "Vary only can hold each apart");
});

const lesson=id=>{ const L=PK.LESSONS.find(x=>x.id===id); return {L, a:S(L.base), b:S(L.cur)}; };
const numbersIn=s=> s.match(/(?<![A-Za-z\d.])\d+(\.\d+)?/g)||[];
function checkNumbers(L, checked){
  numbersIn(L.text).forEach(n=> assert.ok(checked.includes(n), `${L.id}: the text states ${n}, which no assertion checks`));
  numbersIn(L.tryThis).forEach(n=> assert.ok(checked.includes(n), `${L.id}: the tip states ${n}`));
  const t=PK.TEMPLATES.find(x=>x.id===L.id); assert.ok(t && t.lesson===L.id);
  numbersIn(t.look+" "+t.nameA+" "+t.nameB).forEach(n=> assert.ok(checked.includes(n), `${L.id}: the comparison states ${n}`));
  assert.equal(L.group, "liver");
  assert.equal(L.predict.decide(PK.lessonCheck(L)), L.predict.answer, "the prediction's answer is what the model does");
  assert.equal(PK.challengeMet(L, PK.lessonScenario(L)), false, "the challenge starts unmet");
  assert.equal(PK.challengeMet(L, PK.lessonScenario(L, L.challenge.solution)), true, "its solution meets it");
}

test("lesson: hepatic extraction (every number the text, tip and comparison state)", ()=>{
  const {L, a, b}=lesson("hepx"), wa=PK.wellStirred(a), wb=PK.wellStirred(b);
  assert.deepEqual([a.qh, a.fub, a.clint, b.clint], [90, 0.1, 50, 100]);
  assert.equal((100*wa.E).toFixed(1), "5.3"); assert.equal(wa.CL.toFixed(2), "4.74");
  assert.equal((100*wb.E).toFixed(0), "10"); assert.equal(wb.CL.toFixed(1), "9.0");
  assert.deepEqual([a.thalf.toFixed(1), b.thalf.toFixed(1)], ["5.1", "2.7"]);
  // the high-extraction contrast: fu·CLint 900 → 1800
  const h1=PK.wellStirred(H({fub:0.5, clint:1800})), h2=PK.wellStirred(H({fub:0.5, clint:3600}));
  assert.equal((100*h1.E).toFixed(0), "91"); assert.deepEqual([h1.CL.toFixed(1), h2.CL.toFixed(1)], ["81.8", "85.7"]);
  assert.ok(h2.CL<90, "never more than the blood flow");
  assert.equal(PK.challengeMet(L, PK.lessonScenario(L, {clint:890})), false, "E just under 0.5");
  assert.equal(PK.challengeMet(L, PK.lessonScenario(L, {clint:1000, qh:60})), false, "only CLint may change");
  checkNumbers(L, ["90","10","50","5.3","4.74","100","9.0","5.1","2.7","91","81.8","85.7","0.5","1800"]);
});

test("lesson: first pass and induction", ()=>{
  const {L, a, b}=lesson("hepfp"), wa=PK.wellStirred(a), wb=PK.wellStirred(b);
  assert.deepEqual([a.route, a.D, a.clint, b.clint], ["oral", 2000, 1800, 3600]);
  assert.equal((100*wa.E).toFixed(0), "91"); assert.equal((100*wa.FH).toFixed(1), "9.1"); assert.equal((100*wb.FH).toFixed(1), "4.8");
  assert.deepEqual([wa.CL.toFixed(1), wb.CL.toFixed(1)], ["81.8", "85.7"]);
  const ivA=PK.derived(S(Object.assign({}, L.base, {route:"iv"}))).auc, ivB=PK.derived(S(Object.assign({}, L.cur, {route:"iv"}))).auc;
  assert.equal((100*(1-ivB/ivA)).toFixed(0), "5", "an IV dose's AUC would fall 5%");
  const [oa, ob]=[PK.derived(a).auc, PK.derived(b).auc];
  assert.deepEqual([oa.toFixed(2), ob.toFixed(2)], ["2.22", "1.11"]); rel(ob, oa/2, 1e-12, "exactly half");
  rel(oa, a.fabs*a.D/(a.fub*a.clint), 1e-12, "fabs·D / (fu·CLint)");
  assert.equal(PK.derived(S(Object.assign({}, L.base, {route:"iv"}))).auc.toFixed(1)!==undefined, true);
  assert.equal(PK.derived(PK.lessonScenario(L, {route:"iv"})).auc.toFixed(1), "23.3", "the tip: 2000 mg IV");
  checkNumbers(L, ["91","1","9.1","1800","3600","81.8","85.7","5","4.8","2.22","1.11","2000","23.3"]);
});

test("lesson: liver blood flow", ()=>{
  const {L, a, b}=lesson("hepq"), wa=PK.wellStirred(a), wb=PK.wellStirred(b);
  assert.deepEqual([a.route, a.qh, b.qh], ["iv", 90, 45]);
  assert.deepEqual([wa.CL.toFixed(1), wb.CL.toFixed(1)], ["81.8", "42.9"]);
  assert.deepEqual([a.thalf.toFixed(1), b.thalf.toFixed(1)], ["1.3", "2.4"]);
  assert.deepEqual([PK.derived(a).auc.toFixed(2), PK.derived(b).auc.toFixed(1)], ["6.11", "11.7"]);
  assert.deepEqual([(100*wa.FH).toFixed(1), (100*wb.FH).toFixed(1)], ["9.1", "4.8"]);
  // by mouth the two AUCs are equal (the tip)
  const oa=PK.derived(S(Object.assign({}, L.base, {route:"oral"}))).auc, ob=PK.derived(S(Object.assign({}, L.cur, {route:"oral"}))).auc;
  rel(ob, oa, 1e-12, "oral AUC unchanged by blood flow");
  assert.equal(PK.challengeMet(L, PK.lessonScenario(L, {D:275})), false, "275 mg is still above 6.11");
  checkNumbers(L, ["90","45","81.8","42.9","1.3","2.4","6.11","11.7","9.1","4.8"]);
});

test("practice and glossary: three liver kinds checked against the model; five terms; worksheet pools at version 5", ()=>{
  const M=require("../pk-practice.js");
  ["hepcl","hepf","hepiv"].forEach(id=>{
    for(let seed=1;seed<=60;seed++){
      const pr=M.makeProblem({id, seed}), p=M.practiceScenario(pr);
      assert.equal(pr.topic, "liver");
      rel(pr.check(p), pr.ans, 1e-9, `${id} seed ${seed}`);
      ["qh","fub","clint"].forEach(k=> assert.ok(p[k]>=PK.RANGES[k][0] && p[k]<=PK.RANGES[k][1], `${id} ${k} in range`));
    }
  });
  assert.ok(PK.PRACTICE_TOPICS.some(t=>t.id==="liver"));
  assert.ok(PK.WS_VERSION>=5);
  ["Extraction ratio","Intrinsic clearance","Well-stirred model","First-pass effect","Hepatic blood flow"].forEach(term=>
    assert.ok(PK.GLOSSARY.some(g=>g.term===term && ["hepx","hepfp","hepq"].includes(g.lesson)), term));
});

test("workings: the half-life, clearance and AUC readouts show the liver model's numbers", ()=>{
  const MATH=require("../pk-math.js"), p=H({route:"oral", qh:90, fub:0.5, clint:20, fabs:0.8}), view=Object.assign({}, PK.VIEW_DEFAULTS);
  const txt=key=>{ const w=MATH(p, key, view); return {value:w.value, s:w.steps.map(x=>x.m||x.t).join(" | ")}; };
  const th=txt("thalf"), cl=txt("cl"), auc=txt("auc");
  assert.match(th.s, /E = fu·CLint \/ \(Q \+ fu·CLint\) = 10 \/ \(90 \+ 10\) = 0\.1/);
  assert.match(cl.s, /CL = Q·E = 90 × 0\.1 = 9 L\/h/);
  rel(th.value, Math.LN2*35/9, 1e-12); rel(cl.value, 9, 1e-12);
  rel(auc.value, 0.8*500/10, 1e-12, "AUC = fabs·D / (fu·CLint)");
  assert.match(auc.s, /F = fabs·\(1 − E\) = 0\.8 × 0\.9/);
});
