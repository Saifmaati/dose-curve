// Run with: node --test
// Hemodialysis (pk-hd.js): the closed forms during and between sessions, mass balance (what the body clears plus
// what the dialyzer removes is what was given), removal as the integral of CLd·C, the independent solver, v11 links,
// the readouts' worked formulas, the steady state that dialysis takes away, the lesson, the practice kind, and the
// gentamicin case.
const test=require("node:test");
const assert=require("node:assert/strict");
const PK=require("../pk-engine.js");
const C=require("../cases.js");
const {scenario}=PK;

const near=(actual, expected, tol, msg)=>
  assert.ok(Math.abs(actual-expected)<=tol, `${msg?msg+": ":""}expected ${expected} ± ${tol}, got ${actual}`);
const rel=(actual, expected, frac, msg)=> near(actual, expected, Math.abs(expected)*frac, msg);
const S=o=> PK.normalizeScenario(scenario(o));
const H=PK.hd;
const REF=require("../validation/reference-results.json");

test("an IV bolus and one session: exponential at kₑ, then at kₑ + CLd/V during the session, then at kₑ again", ()=>{
  const p=S({route:"iv", D:500, V:20, thalf:10, hd:1, hdcl:6, hdstart:6, hddur:4, hdevery:48}), k=Math.LN2/10, kd=6/20, c0=25;
  [0, 3, 6].forEach(t=> rel(PK.conc(p,t), c0*Math.exp(-k*t), 1e-12, `before, at ${t} h`));
  [7, 9.5].forEach(t=> rel(PK.conc(p,t), c0*Math.exp(-k*t-kd*(t-6)), 1e-12, `during, at ${t} h`));
  [10, 30, 48].forEach(t=> rel(PK.conc(p,t), c0*Math.exp(-k*t-kd*4), 1e-12, `after, at ${t} h`));
  const r=H.sessionTable(p, 48)[0];
  rel(r.fall, 1-Math.exp(-(k+kd)*4), 1e-9, "read 1e-9 h before the end"); rel(H.sessionFraction(p).fall, r.fall, 1e-9);
  // the dialyzer's share: kd / (k + kd) of what is lost while the session runs
  rel(r.removed, (kd/(k+kd))*(r.pre-r.post)*20, 1e-10, "amount removed");
  rel(r.supplement, (r.pre-r.post)*20, 1e-12, "the dose that restores the level");
});

test("mass balance: what the body clears plus what the dialyzer removes is everything given, for every route and schedule", ()=>{
  const cases=[{route:"iv", dosing:"single"}, {route:"oral", dosing:"repeated", tau:12, nDoses:6, F:0.7, ka:0.8},
    {route:"inf", dosing:"repeated", tau:8, nDoses:5, tinf:3}, {route:"inf", dosing:"repeated", tau:6, nDoses:4, tinf:9},
    {dosing:"custom", events:[{t:0, mg:300, route:"iv"}, {t:5, mg:200, route:"oral"}, {t:30, mg:400, route:"inf", dur:6}], F:0.9, ka:1.2},
    {route:"iv", dosing:"repeated", tau:24, nDoses:4, loadMult:2, missed:2}, {route:"oral", dosing:"single", ka:0.5, F:1, S:0.92}];
  cases.forEach(o=>{
    const p=S(Object.assign({D:400, V:30, thalf:12, hd:1, hdcl:5, hdstart:7, hddur:4, hdevery:30}, o));
    const given=PK.doseEvents(p).reduce((s,e)=> s+(e.route==="oral" ? PK.fOf(p) : 1)*PK.saltOf(p)*e.mg, 0);
    const cr=H.course(p), CL=PK.keOf(p)*PK.vOf(p), end=H.stateAt(p, cr.H);
    rel(CL*cr.aucInf+end.removed, given, 1e-9, JSON.stringify(o));
    rel(PK.derived(p).auc, cr.aucInf, 1e-12, "derived AUC is the course's");
  });
});

test("each session removes ∫CLd·C dt over it (Simpson's rule on the curve)", ()=>{
  const p=S({route:"oral", dosing:"repeated", D:400, F:0.8, ka:1, tau:12, nDoses:8, V:40, thalf:16, hd:1, hdcl:8, hdstart:10, hddur:4, hdevery:30});
  H.sessionTable(p, 96).forEach(r=>{
    const N=2000, h=(r.end-r.start)/N; let s=0;
    for(let i=0;i<=N;i++){ const t=Math.min(r.start+i*h, r.end-1e-9); s+=PK.conc(p,t)*(i===0||i===N ? 1 : i%2 ? 4 : 2); }
    rel(r.removed, p.hdcl*s*h/3, 1e-8, `session ${r.n}`);
  });
});

test("no sessions in reach, or none until after the drug is gone: the curve is the one without dialysis", ()=>{
  const base={route:"inf", dosing:"repeated", D:800, tinf:1, tau:8, nDoses:4, V:25, thalf:3};
  const off=S(base), late=S(Object.assign({}, base, {hd:1, hdstart:300, hdevery:168}));
  [0.5, 4, 9, 20, 31.9].forEach(t=> rel(PK.conc(late,t), PK.conc(off,t), 1e-12, `${t} h`));
  rel(PK.windowStats(late,48,2,12).auc, PK.windowStats(off,48,2,12).auc, 1e-10);
});

test("the independent solver agrees: 8 scenarios, the level at six times and each session's levels and removal", ()=>{
  const R=REF.hd;
  assert.ok(R && R.scenarios.length>=8);
  R.scenarios.forEach(s=>{
    const p=S(s.scenario), tab=H.sessionTable(p, s.T).filter(r=>r.end<=s.T);
    Object.entries(s.reference.at).forEach(([f,v])=> rel(PK.conc(p, +f*s.T-1e-9), v, R.tolerance.rel, `${s.name} at ${+f*s.T} h`));
    s.reference.sessions.forEach((r,i)=>{
      rel(tab[i].pre, r.pre, R.tolerance.rel, `${s.name}, session ${i+1}: before`);
      rel(tab[i].post, r.post, R.tolerance.rel, `${s.name}, session ${i+1}: after`);
      rel(tab[i].removed, r.removed, R.tolerance.rel, `${s.name}, session ${i+1}: removed`);
    });
  });
});

test("dialysis takes away the steady state: the dose table is read off the curve, and the steady-state readouts give way", ()=>{
  const p=S({route:"inf", dosing:"repeated", D:1000, tinf:1, tau:12, nDoses:6, V:28, thalf:4.8, hd:1, hdcl:5, hdstart:20, hddur:4, hdevery:48});
  const ss=PK.ssProfile(p), d=PK.derived(p);
  assert.equal(ss.hd, true); assert.equal(ss.ssPeak, null); assert.equal(PK.ssConc(p, 1), null);
  ss.rows.forEach((r,i)=> rel(r.trough, PK.conc(p, (i+1)*p.tau-1e-9), 1e-12));
  assert.deepEqual([d.Rac, d.t90, d.fSS], [null, null, null]);
  rel(d.cminSS, PK.conc(p, 72-1e-9), 1e-9);
  // the antimicrobial indices are read over the window instead
  assert.equal(PK.micStats(p, 4, 72).ss, false);
  // its readouts and their worked formulas
  assert.deepEqual(PK.readoutKeys(p), PK.READOUT_KEYS_HD.repeated);
  const view={duration:72, mec:2, mtc:12};
  PK.READOUT_KEYS_HD.repeated.concat(PK.READOUT_KEYS_HD.single).forEach(k=>{
    const q=k==="aucHd"||k==="peakWin"||k==="tpeakWin" ? S(Object.assign({}, p, {dosing:"single"})) : p, r=PK.metricMath(q, k, view);
    assert.ok(r && r.title && r.steps.every(st=> !/NaN|undefined|null|Infinity/.test(st.m||st.t)), k);
  });
  rel(PK.metricMath(p, "hdCl", view).value, d.CL+5, 1e-12);
  rel(PK.metricMath(p, "hdFall", view).value, 100*H.sessionFraction(p).fall, 1e-9);
  rel(PK.metricMath(S(Object.assign({}, p, {dosing:"single"})), "aucHd", view).value, H.course(S(Object.assign({}, p, {dosing:"single"}))).aucInf, 1e-12);
  // the effect-site delay doesn't apply with dialysis
  assert.equal(PK.keqOf(S(Object.assign({}, p, {teq:2}))), 0);
});

test("links: dialysis needs v11 and round-trips; it applies to first-order one-compartment scenarios only", ()=>{
  const V=PK.VIEW_DEFAULTS, p=S({hd:1, hdcl:7.5, hdstart:30, hddur:5.5, hdevery:72}), link=PK.encodeLink({mode:"sim", s:p, view:V});
  assert.ok(link.startsWith("v=11&"), link);
  const back=PK.decodeLink(link).s;
  ["hd","hdcl","hdstart","hddur","hdevery"].forEach(k=> assert.equal(back[k], p[k], k));
  ["v=1&s=D:400", "v=10&s=idr:1"].forEach(h=> assert.equal(PK.decodeLink(h).s.hd, 0, h));
  const bad=PK.decodeLink("v=11&s=hd:2,hdcl:99,hddur:0,hdevery:1").s;
  assert.deepEqual([bad.hd, bad.hdcl, bad.hddur, bad.hdevery], [0, 20, 1, 12]);
  assert.equal(PK.hdOn(S({hd:1, kin:"mm"})), false); assert.equal(PK.hdOn(S({hd:1, cmt:2})), false);
  assert.equal(PK.isRelevant("hdcl", S({hd:1})), true); assert.equal(PK.isRelevant("hdcl", S({})), false);
  assert.equal(PK.isRelevant("teq", S({hd:1})), false);
});

/* ---------- lesson, practice, case ---------- */
const numbersIn=s=> s.match(/(?<![A-Za-z\d.])\d+(\.\d+)?/g)||[];
const r=(v,dp)=> String(+v.toFixed(dp));

test("lesson: hemodialysis sessions (every number the text, tip and comparison state)", ()=>{
  const L=PK.LESSONS.find(x=>x.id==="hd"), a=S(L.base), b=S(L.cur), T=144;
  assert.equal(L.group, "pk");
  const c=C.caseById("gent-hd"), cp=C.caseScenario(c, {D:120, tau:48});
  assert.deepEqual([a.age, a.wt, a.scr, b.hdstart, b.hddur, b.hdevery], [c.patient.age, c.patient.wt, c.patient.scr, 40, 8, 48], "the case's patient and sessions");
  near(b.hdcl, cp.hdcl, 0.005, "the case's dialysis clearance, which gives the label's 50%");
  assert.equal(r(PK.patientOf(a).crcl,0), "11"); assert.equal(r(Math.LN2/PK.keOf(a),0), "27");
  assert.equal(r(PK.conc(a,40),2), "2.07"); assert.equal(r(PK.conc(a,48),2), "1.68"); assert.equal(r(PK.conc(b,48-1e-9),2), "1.04");
  const s1=H.sessionTable(b, T)[0], f=H.sessionFraction(b);
  assert.equal(r(100*f.fall,0), "50"); assert.equal(r(s1.removed,0), "15"); assert.equal(r(100*f.byDialysis/f.fall,0), "70");
  assert.equal(r(H.stateAt(b, H.course(b).H).removed,0), "18");
  assert.equal(r(PK.derived(a).auc,0), "224"); assert.equal(r(PK.derived(b).auc,0), "190");
  assert.equal(r(100*H.sessionFraction(S(Object.assign({}, L.cur, {hddur:4}))).fall,0), "29");
  const checked=["120","11","27","2.07","40","1.68","48","8","1.25","50","1.04","15","70","18","224","190","4","29"];
  numbersIn(L.text).forEach(n=> assert.ok(checked.includes(n), `the text states ${n}`));
  numbersIn(L.tryThis).forEach(n=> assert.ok(checked.includes(n), `the tip states ${n}`));
  const t=PK.TEMPLATES.find(x=>x.id==="hd");
  numbersIn(t.look+" "+t.nameA+" "+t.nameB).forEach(n=> assert.ok(checked.includes(n), `the comparison states ${n}`));
  // the prediction's reasoning: the combined half-life during a session is 8 h
  assert.equal(r(Math.LN2*PK.vOf(b)/(PK.derived(b).CL+b.hdcl),0), "8"); assert.equal(r(PK.derived(b).CL,2), "0.54");
  assert.equal(L.predict.decide(PK.lessonCheck(L)), L.predict.answer);
  [[{hdcl:3}, false], [{hdcl:3.5}, true], [{hddur:4, hdcl:20}, false]].forEach(([o, ok])=> assert.equal(PK.challengeMet(L, PK.lessonScenario(L, o)), ok, JSON.stringify(o)));
});

test("the gentamicin case: the label's 50% per 8-hour session and 1–1.7 mg/kg after each, graded per kg", ()=>{
  const c=C.caseById("gent-hd"), p=C.caseScenario(c, {D:120, tau:48});
  assert.equal(p.dosing, "custom"); assert.deepEqual(p.events.map(e=>e.t), [0, 48, 96]);
  rel(H.sessionFraction(p).fall, 0.5, 1e-3, "an eight-hour session lowers the level by about 50%");
  H.sessionTable(p, 144).forEach(s=> near(s.fall, 0.5, 2e-3, `session ${s.n}`));
  [[79, false], [80, true], [136, true], [137, false]].forEach(([D, ok])=> assert.equal(C.gradeCase(c, {D, tau:48}).ok, ok, `${D} mg`));
  assert.deepEqual(C.reference(c), {D:120, tau:48});
  assert.ok(/1 to 1\.7 mg\/kg/.test(c.target.why) && /approximately 50%/.test(c.target.why));
  assert.deepEqual(C.caseWindow(c), {mec:4, mtc:12});
});

test("practice: the fall over a session is new in worksheet version 8", ()=>{
  assert.ok(PK.WS_VERSION>=8);
  const g=PK.PRACTICE.find(x=>x.id==="hdfall"); assert.equal(g.since, 8); assert.equal(g.topic, "single");
  const v7=PK.makeWorksheet({topic:"single", count:15, seed:5, v:7});
  assert.ok(v7.problems.every(x=>x.id!=="hdfall"), "a version-7 sheet doesn't change");
  const glossary=t=> PK.GLOSSARY.find(x=>x.term===t);
  ["Dialysis clearance","Post-dialysis rebound"].forEach(t=> assert.ok(glossary(t) && glossary(t).lesson==="hd", t));
});
