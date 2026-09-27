// Run with: node --test tests/
// Checks the engine against closed-form pharmacokinetics, the regimen edge cases, the comparison
// metrics, the share-link codec, and every quantitative claim the lessons make.
const test=require("node:test");
const assert=require("node:assert/strict");
const PK=require("../pk-engine.js");
const {scenario}=PK;

const near=(actual, expected, tol, msg)=>
  assert.ok(Math.abs(actual-expected)<=tol, `${msg?msg+": ":""}expected ${expected} ± ${tol}, got ${actual}`);
const rel=(actual, expected, frac, msg)=> near(actual, expected, Math.abs(expected)*frac, msg);
const lesson=id=>{
  const L=PK.LESSONS.find(x=>x.id===id);
  return {L, base:scenario(L.base), cur:scenario(L.cur), T:L.view.duration, mec:L.view.mec, mtc:L.view.mtc};
};
const stats=(p,T,mec=0,mtc=Infinity)=>PK.windowStats(p,T,mec,mtc);

/* ---------- closed-form one-compartment results ---------- */

test("IV bolus follows C0·e^(−kt) and halves every half-life", ()=>{
  const p=scenario({route:"iv", D:500, V:35, thalf:4});
  const k=Math.LN2/4, C0=500/35;
  [0,1,4,8,12].forEach(t=> rel(PK.conc(p,t), C0*Math.exp(-k*t), 1e-12, `t=${t}`));
  rel(PK.conc(p,4), C0/2, 1e-12);
});

test("oral peak time is ln(kₐ/kₑ)/(kₐ−kₑ) and the curve really peaks there", ()=>{
  const p=scenario();
  const d=PK.derived(p), k=Math.LN2/4;
  rel(d.tmax, Math.log(1.2/k)/(1.2-k), 1e-12);
  assert.ok(PK.conc(p,d.tmax) > PK.conc(p,d.tmax-0.01));
  assert.ok(PK.conc(p,d.tmax) > PK.conc(p,d.tmax+0.01));
});

test("oral AUC∞ = F·D/CL, and the numerical AUC agrees", ()=>{
  const p=scenario();
  const d=PK.derived(p);
  rel(d.auc, 0.9*500/d.CL, 1e-12);
  rel(stats(p,120).auc, d.auc, 0.002);
});

test("oral curve is continuous where kₐ = kₑ", ()=>{
  const k=Math.LN2/4;
  const a=scenario({ka:k}), b=scenario({ka:k+1e-4});
  [1,3,6,10].forEach(t=> rel(PK.conc(a,t), PK.conc(b,t), 1e-3, `t=${t}`));
});

test("IV infusion: plateau formula at the end of infusion, same AUC as a bolus", ()=>{
  const inf=scenario({route:"inf", D:1000, V:49, thalf:6, tinf:3});
  const bolus=scenario({route:"iv", D:1000, V:49, thalf:6});
  const k=Math.LN2/6;
  rel(PK.conc(inf,3), (1000/3)/(k*49)*(1-Math.exp(-k*3)), 1e-12);
  rel(stats(inf,120).auc, stats(bolus,120).auc, 0.005);
});

test("organ function scales clearance: 50% doubles half-life and AUC", ()=>{
  const a=PK.derived(scenario()), b=PK.derived(scenario({clFn:50}));
  rel(b.thalfEff, 2*a.thalfEff, 1e-12);
  rel(b.CL, a.CL/2, 1e-12);
  rel(b.auc, 2*a.auc, 1e-12);
});

test("body weight scales V at a fixed half-life", ()=>{
  const a=PK.derived(scenario()), b=PK.derived(scenario({wt:105}));
  rel(b.V, a.V*1.5, 1e-12);
  rel(b.thalfEff, a.thalfEff, 1e-12);
});

/* ---------- repeated dosing ---------- */

test("repeated dosing is the sum of the individual doses", ()=>{
  const p=scenario({dosing:"repeated", tau:8, nDoses:6});
  [3,11,27.5,44].forEach(t=>{
    let sum=0;
    for(let i=0;i<6;i++) sum+=PK.singleConc(p, t-i*8, 1);
    rel(PK.conc(p,t), sum, 1e-12, `t=${t}`);
  });
});

test("IV steady-state trough matches C0·e^(−kτ)/(1−e^(−kτ)); accumulation is 2× when τ = t½", ()=>{
  const p=scenario({route:"iv", dosing:"repeated", D:400, V:35, thalf:8, tau:8, nDoses:12});
  const k=Math.LN2/8, C0=400/35, S=PK.ssProfile(p);
  rel(S.ssTrough, C0*Math.exp(-k*8)/(1-Math.exp(-k*8)), 1e-4, "simulated to within 1 part in 10,000");
  rel(S.Rac, 2, 1e-12);
});

test("a loading dose scales only the first dose", ()=>{
  const base=scenario({dosing:"repeated", tau:8, nDoses:6});
  const loaded=scenario({dosing:"repeated", tau:8, nDoses:6, loadMult:2});
  rel(PK.conc(loaded,5), 2*PK.conc(base,5), 1e-12, "first interval doubles");
  near(PK.conc(loaded,30)-PK.conc(base,30), PK.singleConc(base,30,1), 1e-9, "later: one extra first dose");
});

test("a missed middle dose removes exactly that dose", ()=>{
  const full=scenario({dosing:"repeated", tau:8, nDoses:10});
  const miss=scenario({dosing:"repeated", tau:8, nDoses:10, missed:4});
  assert.equal(PK.doseEvents(miss).length, 9);
  [20,26,40,70].forEach(t=>
    near(PK.conc(full,t)-PK.conc(miss,t), PK.singleConc(full,t-24,1), 1e-9, `t=${t}`));
});

test("the final dose can't be skipped (it would just be one dose fewer)", ()=>{
  const p=scenario({dosing:"repeated", nDoses:6, missed:6});
  assert.equal(PK.missedOf(p), 0);
  assert.equal(PK.doseEvents(p).length, 6);
  assert.equal(PK.missedOf(scenario({dosing:"single", missed:3})), 0);
});

test("steady-state timing: 90% takes 3.32 half-lives, counted in whole doses", ()=>{
  const S=PK.ssProfile(scenario({dosing:"repeated", thalf:12, tau:12, nDoses:10}));
  rel(S.t90, 3.32*12, 1e-3);
  assert.equal(S.dosesTo90, 4);
  const short=PK.ssProfile(scenario({dosing:"repeated", thalf:24, tau:8, nDoses:4}));
  assert.equal(short.dosesTo90, 10, "a 4-dose regimen can need 10 doses to get there");
});

test("drug that fully clears between doses reports no swing instead of a huge ratio", ()=>{
  const clears=PK.ssProfile(scenario({dosing:"repeated", thalf:0.5, tau:24, nDoses:6}));
  assert.equal(clears.clears, true);
  assert.equal(clears.swing, null);
  const carries=PK.ssProfile(scenario({dosing:"repeated", thalf:8, tau:8, nDoses:6}));
  assert.equal(carries.clears, false);
  assert.ok(carries.swing>1);
});

/* ---------- window metrics ---------- */

test("time below, in and above the window adds up to the window", ()=>{
  const w=stats(scenario({dosing:"repeated", nDoses:8}), 72, 3, 9);
  near(w.tBelow+w.tIn+w.tAbove, 72, 1e-9);
});

test("IV bolus stays above MEC for ln(C0/MEC)/k hours", ()=>{
  const p=scenario({route:"iv", D:500, V:35, thalf:4});
  const k=Math.LN2/4, expected=Math.log((500/35)/2)/k;
  near(stats(p,24,2).tIn, expected, 24/600, "within one sampling step");
});

/* ---------- comparison ---------- */

test("comparing a scenario with itself shows no change anywhere", ()=>{
  const p=scenario({dosing:"repeated", nDoses:8});
  PK.compareRows(p,p,48,2,12).rows.forEach(r=> assert.equal(PK.diff(r.kind,r.a,r.b).dir, 0, r.key));
});

test("comparison rows adapt to the regimens being compared", ()=>{
  const keys=(a,b)=>PK.compareRows(a,b,24,2,12).rows.map(r=>r.key);
  assert.ok(keys(scenario(),scenario()).includes("tmax"));
  assert.ok(!keys(scenario(),scenario()).includes("trough"));
  const rep=scenario({dosing:"repeated"});
  assert.ok(keys(rep,rep).includes("trough") && keys(rep,rep).includes("rac"));
  assert.ok(!keys(scenario(),rep).includes("trough"), "trough only when both are repeated");
  const clears=scenario({dosing:"repeated", thalf:0.5, tau:24});
  const swing=PK.compareRows(rep,clears,48,2,12).rows.find(r=>r.key==="swing");
  assert.equal(swing.b, null);
  assert.equal(PK.diff(swing.kind,swing.a,swing.b).na, true);
});

test("diff expresses each kind of change", ()=>{
  const up=PK.diff("pct",10,12);
  assert.equal(up.dir, 1); near(up.value, 20, 1e-9);
  assert.equal(PK.diff("pct",10,10.04).dir, 0, "under 0.5% is no change");
  assert.deepEqual(PK.diff("pp",48,67), {dir:1, value:19});
  assert.equal(PK.diff("abs",2,1.97).dir, 0);
  assert.deepEqual(PK.diff("count",4,3), {dir:-1, value:1});
  assert.equal(PK.diff("ratio",null,2).na, true);
});

/* ---------- share links ---------- */

test("default scenario encodes to an empty string and back", ()=>{
  assert.equal(PK.encodeScenario(scenario()), "");
  assert.deepEqual(PK.decodeScenario(""), scenario());
});

test("scenarios round-trip through the link format", ()=>{
  const samples=[
    scenario({route:"iv", D:1200, thalf:9, V:60}),
    scenario({route:"inf", dosing:"repeated", tinf:0.5, tau:8, nDoses:20, loadMult:1.5, missed:7, wt:52, clFn:35}),
    ...PK.LESSONS.flatMap(L=>[scenario(L.base), scenario(L.cur)])
  ];
  samples.forEach(p=> assert.deepEqual(PK.decodeScenario(PK.encodeScenario(p)), p));
});

test("decoding ignores unknown keys and bad values, and clamps numbers", ()=>{
  const p=PK.decodeScenario("D:99999,route:rectal,F:abc,nDoses:7.6,loadMult:3,evil:1,thalf:-2,missed:4");
  assert.equal(p.D, 2000);
  assert.equal(p.route, "oral");
  assert.equal(p.F, 0.9);
  assert.equal(p.nDoses, 8);
  assert.equal(p.loadMult, 1);
  assert.equal(p.thalf, 0.5);
  assert.equal(p.missed, 4);
  assert.ok(!("evil" in p));
});

test("full links round-trip, including names with special characters", ()=>{
  const view={duration:96, mec:4, mtc:16, scale:"log", zoom:"last"};
  const cmp={mode:"cmp", a:scenario({D:600,tau:24,dosing:"repeated",nDoses:5}), b:scenario({D:300,tau:12,dosing:"repeated",nDoses:10}),
    nameA:"Once daily & more", nameB:"B = #2, 50%", lock:"D", edit:"b", view};
  const back=PK.decodeLink(PK.encodeLink(cmp));
  assert.equal(back.mode,"cmp");
  assert.deepEqual(back.a, cmp.a); assert.deepEqual(back.b, cmp.b);
  assert.equal(back.nameA, cmp.nameA); assert.equal(back.nameB, cmp.nameB);
  assert.equal(back.lock, "D"); assert.equal(back.edit, "b");
  assert.deepEqual(back.view, view);

  const sim={mode:"sim", s:scenario({clFn:50}), base:scenario(), baseLabel:"before", lesson:"cl",
    view:{duration:24, mec:2, mtc:12, scale:"lin", zoom:"full"}};
  const s2=PK.decodeLink(PK.encodeLink(sim));
  assert.deepEqual(s2.s, sim.s); assert.deepEqual(s2.base, scenario());
  assert.equal(s2.baseLabel, "before"); assert.equal(s2.lesson, "cl");
  assert.equal(PK.encodeLink(sim).includes("w="), false, "default view is left out");
});

test("links reject what they can't trust", ()=>{
  assert.equal(PK.decodeLink(""), null);
  assert.equal(PK.decodeLink("#s=D:400"), null, "no version");
  const st=PK.decodeLink("v=1&m=cmp&lk=evil&ed=zzz&na=%3Cb%3Ehi");
  assert.equal(st.lock, ""); assert.equal(st.edit, "a");
  assert.equal(st.nameA, "<b>hi", "names are plain text; the page escapes them");
  assert.equal(PK.decodeLink("v=1&l=nope").lesson, "");
  assert.equal(PK.decodeLink("v=1&s=D%3A400%2CclFn%3A50").s.clFn, 50, "percent-encoded links still work");
});

/* ---------- every claim the lessons and comparisons make ---------- */

test("lesson: oral vs IV bolus", ()=>{
  const {base,cur}=lesson("route");
  rel(PK.derived(cur).auc/PK.derived(base).auc, 0.7, 1e-9, "AUC smaller by F");
  assert.ok(PK.derived(cur).cmax < PK.derived(base).cmax);
  assert.ok(PK.derived(cur).tmax > 0 && PK.derived(base).tmax===0);
});

test("lesson: bolus vs infusion", ()=>{
  const {base,cur,T,mtc}=lesson("inf");
  assert.ok(stats(base,T).cmax > mtc, "bolus crosses the toxic line");
  assert.ok(stats(cur,T).cmax < mtc, "infusion stays under it");
  rel(stats(cur,T).auc, stats(base,T).auc, 0.01, "same AUC");
});

test("lesson: repeated dosing accumulates about 2×", ()=>{
  rel(PK.ssProfile(lesson("accum").cur).Rac, 2, 1e-9);
});

test("lesson: loading dose", ()=>{
  const {base,cur,T,mec,mtc}=lesson("load");
  rel(PK.derived(base).t90, 39.84, 0.01, "about 40 h to 90%");
  assert.ok(stats(cur,T,mec,mtc).tBelow < stats(base,T,mec,mtc).tBelow/5, "loaded regimen reaches the window much sooner");
  rel(PK.derived(cur).cminSS, PK.derived(base).cminSS, 0.01, "same place to settle");
});

test("lesson: reduced clearance", ()=>{
  const {base,cur,T,mec,mtc}=lesson("cl");
  rel(PK.derived(cur).thalfEff, 2*PK.derived(base).thalfEff, 1e-12);
  const ratio=stats(cur,T).auc/stats(base,T).auc;
  assert.ok(ratio>1.75 && ratio<2, `exposure nearly doubles (${ratio})`);
  assert.equal(stats(base,T,mec,mtc).tAbove, 0);
  assert.ok(stats(cur,T,mec,mtc).tAbove > 0, "peaks cross the toxic line");
});

test("lesson: volume of distribution", ()=>{
  const {base,cur,T}=lesson("vd");
  rel(PK.conc(cur,0)/PK.conc(base,0), 1/3, 1e-12, "a third of the starting concentration");
  rel(PK.derived(cur).CL, PK.derived(base).CL, 1e-12, "same clearance");
  rel(stats(cur,T).auc, stats(base,T).auc, 0.01, "same AUC over the window");
});

test("lesson: missed dose", ()=>{
  const {base,cur,T,mec,mtc}=lesson("miss");
  assert.ok(PK.conc(cur,6*8-1e-9) < mec, "dips below the effective level");
  assert.ok(stats(cur,T,mec,mtc).tBelow > stats(base,T,mec,mtc).tBelow);
  rel(PK.derived(cur).cmaxSS, PK.derived(base).cmaxSS, 0.01, "recovers by the final dose");
});

test("lesson: narrow window", ()=>{
  const {base,cur,mec,mtc}=lesson("er");
  const ir=PK.ssProfile(base), er=PK.ssProfile(cur);
  assert.ok(ir.ssPeak > mtc && ir.ssTrough < mec, "IR crosses both lines at steady state");
  assert.ok(er.ssPeak < mtc && er.ssTrough > mec, "ER stays inside");
});

test("lesson: short vs long half-life", ()=>{
  const {base,cur}=lesson("half");
  const long=PK.ssProfile(cur), short=PK.ssProfile(base);
  assert.ok(long.Rac>2.5 && long.Rac<3, "nearly 3×");
  rel(long.t90, 39.84, 0.01, "about 40 h");
  assert.ok(short.Rac<1.1, "almost no accumulation");
});

test("lesson: once vs twice daily", ()=>{
  const {base,cur,T}=lesson("split");
  rel(stats(cur,T).auc, stats(base,T).auc, 0.05, "same average exposure");
  const a=PK.ssProfile(base), b=PK.ssProfile(cur);
  assert.ok(b.ssPeak < a.ssPeak && b.ssTrough > a.ssTrough, "lower peak, higher trough");
});

test("every comparison template points at a real lesson", ()=>{
  PK.TEMPLATES.forEach(t=> assert.ok(PK.LESSONS.some(L=>L.id===t.lesson), t.id));
});
