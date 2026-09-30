// Run with: node --test
// The clinical cases: every reference regimen passes its own grader, every deliberately wrong regimen fails with
// the hint it should get, nothing numeric is stored that the model could compute, and links round-trip.
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const crypto=require("node:crypto");
const PK=require("../pk-engine.js");
const C=require("../cases.js");

const near=(actual, expected, tol, msg)=>
  assert.ok(Math.abs(actual-expected)<=tol, `${msg?msg+": ":""}expected ${expected} ± ${tol}, got ${actual}`);
const rel=(actual, expected, frac, msg)=> near(actual, expected, Math.abs(expected)*frac, msg);

test("there are 6 to 24 cases, each with its patient, target, task, what else a pharmacist weighs, and sources", ()=>{
  assert.ok(C.CASES.length>=6 && C.CASES.length<=24);
  assert.equal(new Set(C.CASES.map(c=>c.id)).size, C.CASES.length);
  const words=/\b(safe|unsafe|best|recommended?)\b/i;
  C.CASES.forEach(c=>{
    ["title","indication","task","also"].forEach(k=> assert.ok(typeof c[k]==="string" && c[k].length>20, `${c.id}.${k}`));
    ["title","indication","task","also"].forEach(k=> assert.ok(!words.test(c[k]), `${c.id}.${k}: descriptive wording`));
    assert.ok(c.target && c.target.why, `${c.id}: the target says where it comes from`);
    const pt=c.patient; assert.ok(pt.age>=18 && ["M","F"].includes(pt.sex) && pt.wt>0 && pt.scr>0 && pt.ht>0);
    assert.ok(!("name" in pt), "no patient identifiers");
    assert.ok(c.refs.length && c.refs.every(r=>PK.SOURCES[r]), `${c.id}: sources`);
    if(c.drug) assert.ok(PK.DRUGS.some(d=>d.id===c.drug));
  });
  ["gent","gent-lv","gent-ext","vanc","vanc-lv","phe","dig","theo","li"].forEach(id=> assert.ok(C.caseById(id), id));
});

test("each case's reference regimen, worked out from the patient, passes its own grader", ()=>{
  C.CASES.forEach(c=>{
    const ref=C.reference(c), g=C.gradeCase(c, ref);
    assert.ok(g.ok, `${c.id}: ${JSON.stringify(ref)} → ${g.hint}`);
    if(c.target.kind!=="choice"){
      assert.equal(C.roundDose(c, ref.D), ref.D, `${c.id}: the reference is already a practical dose`);
      assert.ok(c.choices.taus.includes(ref.tau), `${c.id}: an interval the case offers`);
    }
  });
});

test("each deliberately wrong regimen fails with the expected hint", ()=>{
  C.CASES.forEach(c=>{
    const wrong=c.wrong||[];
    if(c.target.kind!=="choice") assert.ok(wrong.length>=1, `${c.id} has a wrong regimen`);
    wrong.forEach(w=>{
      const g=C.gradeCase(c, w.reg);
      assert.equal(g.ok, false, `${c.id}: ${JSON.stringify(w.reg)} should miss`);
      assert.equal(g.hint, w.hint, `${c.id}: ${JSON.stringify(w.reg)}`);
      assert.ok(C.HINTS[g.hint]);
    });
    if(c.start) assert.equal(C.gradeCase(c, c.start).ok, false, `${c.id}: the case opens on a regimen to improve`);
  });
  // the late-dose question: the wrong answer gets the half-life hint
  const late=C.caseById("late"), right=C.reference(late).choice;
  assert.equal(C.gradeCase(late, {choice:right==="amox" ? "dig" : "amox"}).hint, "choice");
});

test("the hints read the way the rules say", ()=>{
  assert.equal(C.HINTS.lengthen, "Trough above target and peak in range: lengthen the interval before reducing the dose.");
  // gentamicin: 100 mg every 8 h is exactly that situation
  const g=C.gradeCase(C.caseById("gent"), {D:100, tau:8});
  assert.ok(g.metrics.peak>=5 && g.metrics.peak<=12 && g.metrics.trough>2);
});

test("nothing is stored that the model could compute", ()=>{
  C.CASES.forEach(c=>{
    ["answer","ans","reference","expected","css","auc24","peak","trough"].forEach(k=> assert.ok(!(k in c), `${c.id} stores ${k}`));
    if(c.target.kind!=="choice") assert.equal(typeof c.plan, "function", `${c.id}: the reference is computed`);
  });
  // the walkthrough's numbers are the model's: Cockcroft–Gault and clearance
  const c=C.caseById("gent"), x=C.context(c);
  near(x.crcl, PK.crclCG(72,70,1.6,"M"), 1e-9);
  assert.ok(C.walkthrough(c)[0].includes(`${+x.crcl.toFixed(1)} mL/min`));
  near(x.CL, PK.derived(x.p).CL, 1e-9);
  // change the drug's half-life and the computed reference moves with it
  const d=PK.DRUGS.find(q=>q.id==="gent"), keep=d.s.thalf;
  try{ d.s.thalf=4; assert.notDeepEqual(C.reference(c), {D:130, tau:24}); } finally { d.s.thalf=keep; }
  assert.deepEqual(C.reference(c), {D:130, tau:24});
});

test("the case numbers: vancomycin AUC, phenytoin's Vmax from an adjusted level, lithium's missed dose", ()=>{
  const v=C.caseById("vanc"), gv=C.gradeCase(v, {D:1000, tau:12});
  near(gv.metrics.auc24, 2000/PK.derived(gv.p).CL, 1e-6, "AUC24 = daily dose / CL");
  assert.equal(C.tinfFor(v, 1500), 2.5, "no faster than 10 mg/min");
  const phe=C.caseById("phe"), Vm=C.pheVmax(phe);
  near(Vm, 0.92*300*(4+8/0.6)/(8/0.6), 1e-9);
  const g300=C.gradeCase(phe, {D:300, tau:24});
  near(g300.metrics.css, 8/0.6, 1e-9, "at her current dose the model predicts her albumin-adjusted level");
  assert.equal(C.gradeCase(phe, {D:400, tau:24}).metrics.none, true);
  const li=C.caseById("li"), md=C.missedDose(li, C.reference(li));
  assert.ok(md.low<md.usual && md.recover>0);
  const late=C.lateDose(C.caseById("late"));
  late.forEach(x=> near(x.frac, Math.pow(0.5, x.halfLives), 1e-12));
});

test("practical strengths: combinations of tablets and capsules, or a rounding step", ()=>{
  const phe=C.caseById("phe"), list=C.achievable(phe);
  [30,100,130,300,310,330,360,400].forEach(v=> assert.ok(list.includes(v), `${v} mg`));
  assert.equal(C.roundDose(phe, 308), 310);
  assert.equal(C.roundDose(C.caseById("dig"), 95), 125, "62.5 mcg tablets aren't scored");
  assert.equal(C.roundDose(C.caseById("dig"), 80), 62.5);
  assert.equal(C.roundDose(C.caseById("vanc"), 1100), 1000);
  assert.equal(C.roundDose(C.caseById("gent"), 132.5), 130);
  assert.equal(C.roundDose(C.caseById("li"), 383), 450);
  assert.equal(C.roundDose(C.caseById("theo"), 589), 600);
  const r=C.gradeRounded(C.caseById("vanc"), {D:1100, tau:12});
  assert.equal(r.reg.D, 1000); assert.equal(r.changed, true); assert.ok(r.ok);
});

test("case links round-trip and reject what they can't trust", ()=>{
  const h=C.encodeCaseLink("vanc", {D:1000, tau:12});
  assert.equal(h, "case=vanc&d=1000&t=12");
  assert.deepEqual(C.decodeCaseLink("#"+h), {id:"vanc", reg:{D:1000, tau:12}});
  assert.deepEqual(C.decodeCaseLink("#case=late&c=dig"), {id:"late", reg:{choice:"dig"}});
  assert.equal(C.decodeCaseLink("#case=nope"), null);
  assert.deepEqual(C.decodeCaseLink("#case=vanc&d=1000&t=7"), {id:"vanc", reg:null}, "an interval the case doesn't offer");
  assert.deepEqual(C.decodeCaseLink("#case=vanc&d=-5&t=12"), {id:"vanc", reg:null});
  assert.deepEqual(C.decodeCaseLink("#case=late&c=<b>"), {id:"late", reg:null});
  assert.equal(PK.decodeLink("#case=vanc&d=1000&t=12"), null, "not a scenario link");
});

test("the page loads the cases under their content hash, and the service worker keeps that same file", ()=>{
  const root=path.join(__dirname,"..");
  const hash=crypto.createHash("sha256").update(fs.readFileSync(path.join(root,"cases.js"))).digest("hex").slice(0,10);
  const page=fs.readFileSync(path.join(root,"index.html"),"utf8"), sw=fs.readFileSync(path.join(root,"sw.js"),"utf8");
  assert.ok(page.includes(`cases.js?v=${hash}`), `index.html should load cases.js?v=${hash}`);
  assert.ok(sw.includes(`./cases.js?v=${hash}`), `sw.js should precache cases.js?v=${hash}`);
  assert.ok(/Educational model, not for clinical dosing/.test(fs.readFileSync(path.join(root,"cases.js"),"utf8")));
});

test("grading is quick enough to run on every click", ()=>{
  C.CASES.forEach(c=>{
    const t0=process.hrtime.bigint();
    C.gradeCase(c, c.target.kind==="choice" ? {choice:"dig"} : Object.assign({}, c.start, {D:c.start.D*1.07}));
    const ms=Number(process.hrtime.bigint()-t0)/1e6;
    assert.ok(ms<100, `${c.id}: ${ms.toFixed(1)} ms`);
  });
});

test("vancomycin from two levels: the first-order estimate, the dose it leads to, and why the peak waits for distribution", ()=>{
  const c=C.caseById("vanc-lv"), L=C.levelsOf(c), e=C.twoLevel(L);
  // the levels are the model's own, reported to 0.1 mg/L, and nothing numeric is stored on the case
  near(L.peak, PK.ssConc(L.p, L.T+1), 0.05); near(L.trough, PK.ssConc(L.p, 12-1e-9), 0.05);
  assert.ok(!("levels" in c) && !("peakLevel" in c));
  // the first-order equations: k from the two levels, Cmax back at the end of the infusion, then the areas
  near(e.k, Math.log(L.peak/L.trough)/(12-L.T-1), 1e-12);
  near(e.Cmax*Math.exp(-e.k*(12-L.T)), L.trough, 1e-9, "Cmax decays to the trough by the end of the interval");
  near(e.auc24, (L.T*(L.trough+e.Cmax)/2+(e.Cmax-L.trough)/e.k)*2, 1e-9);
  // a one-compartment patient: the estimate is within 1% of the model's exact AUC24 (daily dose / CL)
  const exact=PK.derived(L.p).auc*2; rel(e.auc24, exact, 0.01);
  assert.ok(exact<400, "1 g every 12 h is below the target, so the case has something to fix");
  // with rounding-free levels the only difference left is the straight-line infusion phase, and it is small
  const ex=C.twoLevel(Object.assign({}, L, {peak:PK.ssConc(L.p, L.T+1), trough:PK.ssConc(L.p, 12-1e-9)}));
  rel(ex.k, PK.keOf(L.p), 1e-9, "the two levels give the model's own k"); rel(ex.auc24, exact, 0.005);
  // the plan's dose: proportional to the target, from the estimate, and it passes the grader
  assert.deepEqual(C.reference(c), {D:1500, tau:12});
  // a two-compartment version: a peak drawn as the infusion ends overestimates, one drawn an hour later doesn't
  const q=C.twoCmtOf(L.p), truth=PK.derived(q).auc*2, at=a=> C.twoLevel({peak:PK.ssConc(q, L.T+a), trough:PK.ssConc(q, 12-1e-9), T:L.T, after:a, tau:12}).auc24;
  assert.ok(at(0)/truth-1>0.10, `drawn during distribution: ${at(0)} vs ${truth}`);
  assert.ok(Math.abs(at(1)/truth-1)<0.05, `drawn after distribution: ${at(1)} vs ${truth}`);
  const w=C.walkthrough(c).join(" ");
  [`${+e.k.toFixed(4)} h⁻¹`, `${+e.auc24.toFixed(0)} mg·h/L`, "1500 mg every 12 h", `${+exact.toFixed(0)} mg·h/L`].forEach(s=> assert.ok(w.includes(s), s));
  assert.ok(PK.SOURCES.rybakCid.url.endsWith("10.1093/cid/ciaa303"));
});

test("gentamicin from two levels (Sawchuk–Zaske): the levels recover this patient's own k and V, which differ from the prediction", ()=>{
  const c=C.caseById("gent-lv"), L=C.levelsOf(c), p=L.p, k0=PK.keOf(p), V0=PK.vOf(p);
  // the premise is stated, and the model patient carries it: 1.8× the predicted clearance, 1.4× the volume
  assert.ok(/1\.8 times faster/.test(c.indication) && /1\.4 times/.test(c.indication) && /premise/.test(c.indication));
  const pop=C.caseScenario(Object.assign({}, c, {clMult:0, vMult:0}), c.current);
  rel(PK.derived(p).CL, 1.8*PK.derived(pop).CL, 1e-9); rel(V0, 1.4*PK.vOf(pop), 1e-9);
  // levels as reported (0.1 mg/L, or two significant figures below 1 mg/L) from the model's steady state
  near(L.peak, PK.ssConc(p, L.T+0.5), 0.05); near(L.trough, PK.ssConc(p, 6), 0.005); assert.equal(L.second, 6);
  // the method: k from the two levels, then V from the infusion equation, both close to the patient's own
  const w=C.walkthrough(c).join(" "), k=Math.log(L.peak/L.trough)/(6-L.T-0.5);
  rel(k, k0, 0.02, "k from the levels"); assert.ok(w.includes(`${+k.toFixed(4)} h⁻¹`));
  const V=+(w.match(/= <b>([\d.]+) L<\/b>, against the/)||[])[1]; rel(V, V0, 0.02, "V from the levels");
  assert.ok(w.includes("Cockcroft–Gault predicts a clearance"), "the prediction comes before the levels");
  // the opening regimen is too low, the reference is on target, and the method shortens the interval
  assert.equal(C.gradeCase(c, c.current).hint, "increase");
  const ref=C.reference(c); assert.ok(ref.tau<c.current.tau && C.gradeCase(c, ref).ok);
  ["zaske1976","sawchukZaske"].forEach(r=> assert.ok(c.refs.includes(r) && PK.SOURCES[r].url.startsWith("https://doi.org/10.")));
});

test("meropenem with reduced kidney function: the label's renal table, and what the model says it does to exposure", ()=>{
  const c=C.caseById("mero-renal"), x=C.context(c);
  near(x.crcl, PK.crclCG(68,80,2.0,"M"), 1e-9); assert.equal(Math.round(x.crcl), 40);
  // Table 1 rows by Cockcroft–Gault clearance
  [[80,8,1],[51,8,1],[50,12,1],[26,12,1],[25,12,0.5],[10,12,0.5],[9,24,0.5]].forEach(([cr,tau,frac])=>{
    const r=C.tableRow(c.target, cr); assert.equal(r.tau, tau, `${cr} mL/min`); assert.equal(r.frac, frac, `${cr} mL/min`); });
  assert.deepEqual(C.reference(c), {D:1000, tau:12});
  // the unadjusted regimen nearly doubles the exposure of a normal-kidney patient on it; the adjusted one stays near it
  const g8=C.gradeCase(c, {D:1000, tau:8}), g12=C.gradeCase(c, {D:1000, tau:12}), normal=3000/(x.CL/x.factor);
  near(g8.metrics.auc24, 3000/x.CL, 1e-6); near(g12.metrics.auc24, 2000/x.CL, 1e-6);
  assert.ok(g8.metrics.auc24>1.8*normal && Math.abs(g12.metrics.auc24/normal-1)<0.3);
  // time above the MIC at steady state, against a direct scan
  let n=0; for(let i=0;i<20000;i++) if(PK.ssConc(g12.p, 12*(i+0.5)/20000)>=2) n++;
  near(g12.metrics.aboveMic, n/200, 0.05); assert.ok(g12.metrics.aboveMic>70 && g8.metrics.aboveMic>99);
  const w=C.walkthrough(c).join(" ");
  [`${Math.round(g8.metrics.auc24)} mg·h/L`, `${Math.round(normal)} mg·h/L`, `${Math.round(g12.metrics.aboveMic)}%`].forEach(s=> assert.ok(w.includes(s), s));
});

test("levetiracetam with reduced kidney function: creatinine clearance per 1.73 m², the label's ranges, and matched exposure", ()=>{
  const c=C.caseById("lev-renal"), x=C.context(c), bsa=C.mosteller(160,58), crN=x.crcl*1.73/bsa;
  near(bsa, Math.sqrt(160*58/3600), 1e-12); assert.equal(crN.toFixed(1), "34.8");
  const row=C.tableRow(c.target, crN); assert.deepEqual([row.lo, row.hi, row.tau], [250, 750, 12]);
  [[81,500,1500],[80,500,1000],[50,500,1000],[49,250,750],[30,250,750],[29,250,500]].forEach(([cr,lo,hi])=>{ const r=C.tableRow(c.target, cr); assert.deepEqual([r.lo,r.hi], [lo,hi], `${cr}`); });
  // any tablet dose in the range passes, twice daily; outside it, or once daily, doesn't
  [250,500,750].forEach(D=> assert.ok(C.gradeCase(c,{D, tau:12}).ok, `${D}`));
  [[1000,12,"tableDose"],[1500,12,"tableDose"],[500,24,"tableInterval"]].forEach(([D,tau,h])=> assert.equal(C.gradeCase(c,{D,tau}).hint, h, `${D} q${tau}h`));
  // the reference matches the exposure of 1,000 mg twice daily with normal kidneys, within the tablets' rounding
  assert.deepEqual(C.reference(c), {D:500, tau:12});
  const normal=2000/(x.CL/x.factor), g=C.gradeCase(c,{D:500, tau:12});
  assert.ok(Math.abs(g.metrics.auc24/normal-1)<0.05, `${g.metrics.auc24} vs ${normal}`);
  assert.ok(C.gradeCase(c,{D:1500, tau:12}).metrics.auc24>2.8*normal, "her current dose triples it");
  const w=C.walkthrough(c).join(" ");
  ["34.8 mL/min/1.73 m²", "250 to 750 mg every 12 hours", `${Math.round(normal)} for a woman of her size`].forEach(s=> assert.ok(w.includes(s), s));
});

test("Bayesian cases: levels drawn an hour apart mislead the two-level method, and the Bayesian estimate still leads on target", ()=>{
  // vancomycin: the two-level AUC24 looks on target (no change); the true AUC24 on that regimen is above it
  const v=C.caseById("vanc-bayes"), b=C.bayesOf(v);
  assert.deepEqual(b.lv.map(l=>l.c), [41.8, 35.8]); assert.deepEqual(b.lv.map(l=>l.dt), [2.25, 3.25]);
  assert.equal(b.sz.auc24.toFixed(0), "583"); assert.ok(b.sz.auc24>=400 && b.sz.auc24<=600, "the two-level estimate says: on target");
  assert.equal((1500/b.trueCL).toFixed(0), "772", "the true AUC24 on 750 mg every 12 h");
  assert.ok(Math.abs(b.est.CL/b.trueCL-1)<0.08, "the Bayesian clearance is within 8% of the truth");
  assert.ok(Math.abs(b.sz.CL/b.trueCL-1)>Math.abs(b.est.CL/b.trueCL-1), "and closer than the two-level one");
  assert.deepEqual(C.reference(v), {D:500, tau:12});
  const g=C.gradeCase(v, {D:500, tau:12}); assert.ok(g.ok); assert.equal(g.metrics.auc24.toFixed(0), "514");
  assert.equal(C.gradeCase(v, {D:750, tau:12}).hint, "aucHigh", "staying on the regimen the two-level estimate endorses misses");
  // gentamicin: the second level is higher than the first, so the two-level method breaks; the Bayesian estimate doesn't
  const gc=C.caseById("gent-bayes"), gb=C.bayesOf(gc);
  assert.deepEqual(gb.lv.map(l=>l.c), [10.8, 11.2]);
  assert.ok(gb.sz.broken && gb.sz.k<0);
  assert.equal(gb.est.thalf.toFixed(1), "6.8"); assert.equal((Math.LN2*gb.trueV/gb.trueCL).toFixed(1), "10.6");
  assert.deepEqual(C.reference(gc), {D:130, tau:24});
  const gg=C.gradeCase(gc, {D:130, tau:24}); assert.ok(gg.ok);
  assert.deepEqual([gg.metrics.peak.toFixed(1), gg.metrics.trough.toFixed(1)], ["7.5","1.6"]);
  assert.equal(PK.ssProfile(gb.truth).ssTrough.toFixed(1), "8.2", "the trough on 120 mg every 8 h");
  // "Open in simulator" gives the patient as the model predicts her (no premise), on the levels' regimen, with the levels
  [v, gc].forEach(c=>{
    const p=C.bayesOf(c).prior;
    assert.deepEqual(p.lv, C.bayesOf(c).lv);
    assert.equal(PK.derived(p).CL.toFixed(6), PK.bayes.priorOf(p).CL.toFixed(6));
    assert.ok(Math.abs(PK.derived(p).CL-C.bayesOf(c).trueCL)>0.1, "the premise is left out");
    assert.equal(p.D, c.current.D); assert.equal(p.tau, c.current.tau);
    assert.ok(c.refs.includes("sheiner1979") && PK.SOURCES.sheiner1979.url.includes("10.1002/cpt1979263294"));
  });
});
