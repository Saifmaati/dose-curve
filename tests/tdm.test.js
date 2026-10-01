// Run with: node --test
// When to sample (pk-tdm.js, 2.4): steady state in closed form (one compartment: within 10% once e^(−kₑnτ) ≤ 0.1),
// the closed-form interval levels against the engine's own curve, the peak's time for each route (the end of an
// infusion, straight after a bolus, the oral Tmax, and with two compartments the moment the distribution phase is
// 10% of the level), loading and missed doses, the scenarios it leaves alone, and the section's wording.
const test=require("node:test");
const assert=require("node:assert/strict");
const PK=require("../pk-engine.js");
const {scenario}=PK;

const near=(actual, expected, tol, msg)=>
  assert.ok(Math.abs(actual-expected)<=tol, `${msg?msg+": ":""}expected ${expected} ± ${tol}, got ${actual}`);
const S=o=> PK.normalizeScenario(scenario(Object.assign({dosing:"repeated", D:500, tau:12, nDoses:10, thalf:8, V:40}, o)));
const T=PK.tdm;

test("one compartment: steady state from the first dose with e^(−kₑnτ) ≤ 0.1 (and ≤ 0.03), the same for every route", ()=>{
  [{route:"iv"}, {route:"inf", tinf:1}, {route:"oral", F:0.8, ka:1.5}, {thalf:30, tau:8, route:"iv"}, {thalf:2, tau:24, route:"inf", tinf:0.5}].forEach(o=>{
    const p=S(o), w=T.sampling(p), kt=Math.LN2/p.thalf*p.tau, where=JSON.stringify(o);
    assert.equal(w.n90, Math.max(1, Math.ceil(Math.log(10)/kt-1e-12)), `${where}: 90%`);
    assert.equal(w.n97, Math.max(1, Math.ceil(Math.log(1/0.03)/kt-1e-12)), `${where}: 97%`);
    near(w.trough.t, w.n90*p.tau, 1e-12, `${where}: the trough ends dose n's interval`);
    near(w.trough.c, PK.ssProfile(p).ssTrough, 1e-12, `${where}: at the steady-state trough`);
  });
});

test("the closed-form interval levels are the engine's own curve: within 10% at the dose it names, not the dose before", ()=>{
  const v=PK.drugScenario(PK.DRUGS.find(d=>d.id==="vanc"));
  [S({route:"inf", tinf:1}), S({route:"oral", ka:0.8, loadMult:1.5}), S({route:"iv", cmt:2, k12:0.6, k21:0.3}),
   S({route:"inf", tinf:1, cmt:2, k12:0.5, k21:0.25, loadMult:2, missed:3}), PK.normalizeScenario(scenario(Object.assign({}, v, {cmt:2})))].forEach(p=>{
    const w=T.sampling(p), q=PK.normalizeScenario(scenario(Object.assign({}, p, {missed:0, nDoses:w.n90+4}))), ev=PK.doseEvents(q);
    const dev=n=> Math.max(Math.abs(PK.conc(q, n*p.tau-1e-9, ev)/w.trough.c-1), Math.abs(PK.conc(q, (n-1)*p.tau+w.peak.s, ev)/w.peak.c-1));
    for(let n=w.n90;n<=w.n90+4;n++) assert.ok(dev(n)<=0.1+1e-9, `dose ${n}: ${dev(n)}`);
    if(w.n90>1) assert.ok(dev(w.n90-1)>0.1, "the dose before is further out");
    near(PK.conc(q, w.peak.t, ev), w.peak.c, 0.1*w.peak.c, "the peak's time is in that interval");
  });
});

test("the peak's time: the infusion's end, straight after a bolus, the oral Tmax at steady state", ()=>{
  const inf=T.sampling(S({route:"inf", tinf:1.5}));
  assert.equal(inf.peak.kind, "end"); near(inf.peak.s, 1.5, 1e-12); near(inf.peak.t, (inf.n90-1)*12+1.5, 1e-9);
  const bolus=T.sampling(S({route:"iv"}));
  assert.equal(bolus.peak.kind, "bolus"); assert.equal(bolus.peak.s, 0);
  // one compartment, oral, at steady state: Tmax solves kₐe^(−kₐt)/(1 − e^(−kₐτ)) = kₑe^(−kₑt)/(1 − e^(−kₑτ))
  const p=S({route:"oral", ka:1.2}), k=Math.LN2/8, ka=1.2, tau=12, o=T.sampling(p);
  near(o.peak.s, Math.log(ka*(1-Math.exp(-k*tau))/(k*(1-Math.exp(-ka*tau))))/(ka-k), 1e-6, "steady-state Tmax");
  assert.equal(o.peak.kind, "tmax");
});

test("two compartments: the peak waits until the distribution phase is 10% of the level", ()=>{
  [{route:"iv"}, {route:"inf", tinf:1}, {route:"inf", tinf:2, tau:8}].forEach(o=>{
    const p=S(Object.assign({cmt:2, k12:0.8, k21:0.3}, o)), w=T.sampling(p), [fast,slow]=PK.disposition(p);
    assert.equal(w.peak.kind, "dist");
    near(w.peak.s, (p.route==="inf" ? p.tinf : 0)+w.peak.u, 1e-12);
    // the share of the fast term, read off the curve's own slope: −d ln C/dt = f·α + (1 − f)·β
    const h=1e-5, sl=-(Math.log(PK.ssConc(p, w.peak.s+h))-Math.log(PK.ssConc(p, w.peak.s-h)))/(2*h);
    near((sl-slow.k)/(fast.k-slow.k), 0.1, 1e-4, JSON.stringify(o));
    assert.ok(w.peak.u>0, "after the dose's end");
  });
  // a slow exchange: the distribution phase outlasts the interval, and no peak time is given
  const late=T.sampling(S({cmt:2, k12:0.05, k21:0.04, thalf:2, route:"iv", tau:4}));
  assert.ok(!late || late.peak===null);
});

test("a loading dose that matches the accumulation is at steady state from dose 1; one that overshoots takes longer; a missed dose is left out", ()=>{
  const base=S({route:"iv"}), Rac=1/(1-Math.exp(-Math.LN2/8*12));
  assert.equal(T.sampling(S({route:"iv", loadMult:Math.round(Rac*1000)/1000})).n90, 1);
  assert.ok(T.sampling(S({route:"iv", loadMult:4})).n90>1);
  assert.deepEqual(T.sampling(S({route:"iv", missed:2})), T.sampling(base));
  assert.equal(T.sampling(S({route:"iv", nDoses:2})).beyond, true, "a regimen that stops before steady state says so");
});

test("a single dose, saturable elimination and dialysis have no steady state to sample at", ()=>{
  assert.equal(T.sampling(S({dosing:"single"})), null);
  assert.equal(T.sampling(S({kin:"mm", vmax:500, km:4})), null);
  const lev=PK.drugScenario(PK.DRUGS.find(d=>d.id==="gent"));
  const hd=PK.normalizeScenario(scenario(Object.assign({}, lev, {dosing:"repeated", hd:1})));
  assert.ok(PK.hdOn(hd), "dialysis is on"); assert.equal(T.sampling(hd), null);
});

test("the section says what each time is, in plain descriptive words, and cites the guideline only for vancomycin", ()=>{
  const p=S({route:"inf", tinf:1, cmt:2, k12:0.5, k21:0.25}), w=T.sampling(p), f={num:(v,dp)=>v.toFixed(dp), dp:1, unit:"mg/L", drug:null, maxT:336};
  const h=T.html(p, w, f), text=h.replace(/<[^>]+>/g," ");
  assert.ok(!/\b(safe|unsafe|best|recommended?|should|must)\b/i.test(text), "descriptive wording");
  assert.ok(/once distribution is 90% complete/.test(text) && /just before dose/.test(text));
  assert.equal((h.match(/data-jump=/g)||[]).length, 2, "a Show button for the peak and the trough");
  assert.ok(!/Rybak/.test(h));
  assert.ok(/Rybak et al\., 2020/.test(T.html(p, w, Object.assign({}, f, {drug:"vanc"}))));
  const short=S({route:"iv", nDoses:2}), hs=T.html(short, T.sampling(short), f);
  assert.ok(/This regimen stops at dose 2/.test(hs) && (hs.match(/ disabled/g)||[]).length===2, "past the regimen, nothing to show");
});
