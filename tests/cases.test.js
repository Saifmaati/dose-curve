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

test("there are 6 to 12 cases, each with its patient, target, task, what else a pharmacist weighs, and sources", ()=>{
  assert.ok(C.CASES.length>=6 && C.CASES.length<=12);
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
