// Run with: node --test
// Checks the engine against closed-form pharmacokinetics, the regimen edge cases, the comparison
// metrics, the share-link codec, every quantitative claim the lessons make, and every practice answer.
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
    for(let i=0;i<6;i++) sum+=PK.singleConc(p, t-i*8, p.D);
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
  near(PK.conc(loaded,30)-PK.conc(base,30), PK.singleConc(base,30,base.D), 1e-9, "later: one extra first dose");
});

test("a missed middle dose removes exactly that dose", ()=>{
  const full=scenario({dosing:"repeated", tau:8, nDoses:10});
  const miss=scenario({dosing:"repeated", tau:8, nDoses:10, missed:4});
  assert.equal(PK.doseEvents(miss).length, 9);
  [20,26,40,70].forEach(t=>
    near(PK.conc(full,t)-PK.conc(miss,t), PK.singleConc(full,t-24,full.D), 1e-9, `t=${t}`));
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

/* ---------- compare state ---------- */

const frozen=o=>JSON.parse(JSON.stringify(o));
const sample=()=>{
  let c=PK.newComparison({dosing:"repeated", D:600, tau:24, nDoses:5});
  c=PK.cmpApply(c,"b",{D:300, tau:12, nDoses:10});
  c.names={a:"Once daily", b:"Twice daily"};
  return c;
};

test("reset A restores A to the defaults and leaves B untouched", ()=>{
  const c=sample(), before=frozen(c);
  const r=PK.cmpReset(c,"a");
  assert.deepEqual(r.a, scenario());
  assert.deepEqual(r.b, before.b);
  assert.equal(r.names.a, "Scenario A");
  assert.equal(r.names.b, "Twice daily", "the other side keeps its custom name");
  assert.deepEqual(c, before, "the input comparison is not modified");
});

test("reset B restores B to the defaults and leaves A untouched", ()=>{
  const c=sample(), before=frozen(c);
  const r=PK.cmpReset(c,"b");
  assert.deepEqual(r.b, scenario());
  assert.deepEqual(r.a, before.a);
  assert.equal(r.names.a, "Once daily");
  assert.equal(r.names.b, "Scenario B");
});

test("reset switches Vary only off instead of quietly changing the other side", ()=>{
  const c=PK.cmpSetLock(sample(),"D");
  assert.equal(c.lock, "D");
  const r=PK.cmpReset(c,"a");
  assert.equal(r.lock, "");
  assert.deepEqual(r.b, c.b);
});

test("reset works after swap and copy", ()=>{
  const swapped=PK.cmpSwap(sample());
  assert.equal(swapped.names.a, "Twice daily");
  const r1=PK.cmpReset(swapped,"b");
  assert.deepEqual(r1.a, swapped.a);
  assert.deepEqual(r1.b, scenario());
  const copied=PK.cmpCopy(sample(),"b","a");
  assert.deepEqual(copied.a, copied.b);
  assert.notEqual(copied.a, copied.b, "copies are independent objects");
  const r2=PK.cmpReset(copied,"a");
  assert.deepEqual(r2.b, copied.b);
});

test("a reset comparison survives a share link", ()=>{
  const r=PK.cmpReset(sample(),"a");
  const link=PK.encodeLink({mode:"cmp", a:r.a, b:r.b, nameA:"", nameB:r.names.b, lock:r.lock, edit:"a", view:PK.VIEW_DEFAULTS});
  assert.ok(link.includes("a=&"), "a reset scenario is just the defaults");
  const back=PK.decodeLink(link);
  assert.deepEqual(back.a, r.a);
  assert.deepEqual(back.b, r.b);
  assert.equal(back.nameB, "Twice daily");
  assert.equal(back.lock, "");
});

test("Vary only mirrors every other edit and keeps the locked setting apart", ()=>{
  let c=PK.cmpSetLock(sample(),"tau");
  assert.deepEqual(Object.assign({},c.b,{tau:c.a.tau}), c.a, "turning the lock on aligns B with A except τ");
  c=PK.cmpApply(c,"b",{D:450, tau:6});
  assert.equal(c.b.D, 450); assert.equal(c.a.D, 450, "dose is mirrored");
  assert.equal(c.b.tau, 6);  assert.equal(c.a.tau, 24, "the locked interval is not");
  const off=PK.cmpApply(PK.cmpSetLock(c,""),"a",{D:100});
  assert.equal(off.b.D, 450, "with the lock off, edits stay on their own side");
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
  const view=Object.assign({}, PK.VIEW_DEFAULTS, {duration:96, mec:4, mtc:16, scale:"log", zoom:"last"});
  // B differs from A only in dose, as the app guarantees while "Vary only: dose" is on
  const cmp={mode:"cmp", a:scenario({D:600,tau:24,dosing:"repeated",nDoses:5}), b:scenario({D:300,tau:24,dosing:"repeated",nDoses:5}),
    nameA:"Once daily & more", nameB:"B = #2, 50%", lock:"D", edit:"b", view};
  const back=PK.decodeLink(PK.encodeLink(cmp));
  assert.equal(back.mode,"cmp");
  assert.deepEqual(back.a, cmp.a); assert.deepEqual(back.b, cmp.b);
  assert.equal(back.nameA, cmp.nameA); assert.equal(back.nameB, cmp.nameB);
  assert.equal(back.lock, "D"); assert.equal(back.edit, "b");
  assert.deepEqual(back.view, view);

  const sim={mode:"sim", s:scenario({clFn:50}), base:scenario(), baseLabel:"before", lesson:"cl",
    view:Object.assign({}, PK.VIEW_DEFAULTS, {duration:24, mec:2, mtc:12, scale:"lin", zoom:"full"})};
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

/* ---------- audit: input hardening and invariants ---------- */

test("a missed dose outside the regimen is cleared, not kept invisibly", ()=>{
  assert.equal(PK.decodeScenario("dosing:repeated,nDoses:6,missed:15").missed, 1);
  assert.equal(PK.decodeScenario("dosing:repeated,nDoses:6,missed:6").missed, 1, "the final dose can't be the missed one");
  assert.equal(PK.decodeScenario("dosing:repeated,nDoses:6,missed:5").missed, 5);
});

test("Vary only on the missed dose: shrinking the regimen can't strand the other side's missed dose", ()=>{
  let c=PK.cmpSetLock(PK.newComparison({dosing:"repeated", nDoses:12}),"missed");
  c=PK.cmpApply(c,"b",{missed:9});
  c=PK.cmpApply(c,"a",{nDoses:6});
  assert.equal(c.b.nDoses, 6);
  assert.equal(c.b.missed, 1);
  const again=PK.cmpSetLock(PK.cmpSetLock(PK.newComparison({dosing:"repeated", nDoses:4}),""),"missed");
  assert.ok(again.b.missed < again.b.nDoses);
});

test("a hand-edited link can't claim a lock its scenarios break", ()=>{
  assert.equal(PK.decodeLink("v=1&m=cmp&a=D:400&b=D:800,thalf:12&lk=D").lock, "", "differs in more than dose");
  assert.equal(PK.decodeLink("v=1&m=cmp&a=D:400&b=D:800&lk=D").lock, "D", "a lock the scenarios honour is kept");
  const c=PK.cmpApply(PK.cmpSetLock(PK.newComparison(),"tau"),"b",{D:300, tau:12});
  assert.ok(PK.lockHolds(c), "edits made through cmpApply keep the invariant");
});

test("names drop control characters and text-direction overrides", ()=>{
  assert.equal(PK.decodeLink("v=1&m=cmp&na=%E2%80%AEevil%E2%81%A6x").nameA, "evilx");
  assert.equal(PK.decodeLink("v=1&m=cmp&na=a%00b%7Fc").nameA, "abc");
});

test("malformed, truncated and oversized links degrade safely", ()=>{
  assert.doesNotThrow(()=>PK.decodeLink("v=1&s=D%3A4%E0%A4%A&na=%E0%A4%A"));
  assert.equal(PK.decodeLink("v=1&m=cmp&a=D:40").a.D, 40, "a truncated value is still clamped into range");
  const st=PK.decodeLink("v=1&m=cmp&na="+"x".repeat(200000));
  assert.equal(st.nameA.length, 40);
  assert.equal(PK.decodeLink("v=9&s=D:400").s.D, 400, "newer versions are read best-effort");
  assert.equal(PK.decodeLink("v=9&s=D:400").newer, true, "and flagged");
  [1,2,3].forEach(v=> assert.equal(PK.decodeLink(`v=${v}&s=D:400`).newer, false, `v${v} is current`));
});

test("steady state is exact even in the slowest-clearing regimen", ()=>{
  // longest half-life, lowest organ function, shortest interval: once capped at 400 simulated doses (99.7%)
  const p=scenario({route:"iv", dosing:"repeated", thalf:24, clFn:25, tau:2, nDoses:20});
  const k=PK.keOf(p), C0=p.D/PK.vOf(p);
  rel(PK.ssProfile(p).ssTrough, C0*Math.exp(-k*2)/(1-Math.exp(-k*2)), 1e-9);
  rel(PK.ssProfile(p).ssPeak, C0/(1-Math.exp(-k*2)), 1e-9, "a bolus peaks the instant it's given");
});

test("closed-form steady state matches summing every earlier dose, for every route", ()=>{
  const brute=(p,s)=>{ let c=0; for(let j=0;j<5000;j++) c+=PK.singleConc(p, s+j*p.tau, p.D); return c; };
  [
    ["oral", {route:"oral", thalf:6, tau:8, ka:1.2}],
    ["oral, kₐ = kₑ", {route:"oral", thalf:4, tau:6, ka:Math.LN2/4}],
    ["IV bolus", {route:"iv", thalf:10, tau:12}],
    ["infusion shorter than τ", {route:"inf", thalf:6, tau:8, tinf:2}],
    ["infusion as long as τ", {route:"inf", thalf:6, tau:8, tinf:8}],
    ["infusions overlapping", {route:"inf", thalf:6, tau:8, tinf:20}],
  ].forEach(([name,o])=>{
    const p=scenario(Object.assign({dosing:"repeated", nDoses:10}, o));
    [0, 0.5, 2, p.tau/2, p.tau-0.01].forEach(s=> rel(PK.ssConc(p,s), brute(p,s), 1e-9, `${name}, s=${s}`));
  });
});

test("steady state finds an infusion's exact peak at its end", ()=>{
  const p=scenario({route:"inf", dosing:"repeated", thalf:6, tau:8, tinf:20, nDoses:10});
  rel(PK.ssProfile(p).ssPeak, PK.ssConc(p, 20%8), 1e-12);
  const oneLong=scenario({route:"inf", dosing:"repeated", thalf:6, tau:8, tinf:8, nDoses:10});
  const S=PK.ssProfile(oneLong);
  rel(S.ssPeak, S.ssTrough, 1e-6, "back-to-back infusions hold a constant level");
  rel(S.ssPeak, (oneLong.D/8)/(PK.keOf(oneLong)*PK.vOf(oneLong)), 1e-6, "the level is rate / CL");
});

/* ---------- custom dose schedules ---------- */

const ev=(t,mg,extra)=>Object.assign({t, mg, type:"maintenance", status:"given"}, extra);
const custom=(events,over)=>PK.normalizeScenario(scenario(Object.assign({dosing:"custom", events}, over)));
const sampleTimes=[0,0.5,3,7.9,8,12.4,20,33,47.5,60,72];

test("converting a regimen to a custom schedule doesn't change the curve", ()=>{
  const regimens=[
    scenario(),
    scenario({route:"iv", dosing:"repeated", tau:8, nDoses:6}),
    scenario({dosing:"repeated", tau:12, nDoses:8, loadMult:2, missed:4}),
    scenario({route:"inf", dosing:"repeated", tinf:0.5, tau:8, nDoses:6, loadMult:1.5}),
    ...PK.LESSONS.map(L=>scenario(L.cur))
  ];
  regimens.forEach((p,i)=>{
    const c=Object.assign({}, p, {dosing:"custom", events:PK.eventsFromBasic(p)});
    sampleTimes.forEach(t=> near(PK.conc(c,t), PK.conc(p,t), 1e-9, `regimen ${i}, t=${t}`));
  });
});

test("conversion keeps loading and missed doses as labelled events", ()=>{
  const e=PK.eventsFromBasic(scenario({dosing:"repeated", tau:12, nDoses:5, loadMult:2, missed:3}));
  assert.deepEqual(e.map(x=>[x.t, x.mg, x.type, x.status]), [
    [0,1000,"loading","given"], [12,500,"maintenance","given"], [24,500,"maintenance","missed"],
    [36,500,"maintenance","given"], [48,500,"maintenance","given"]]);
  const long=PK.eventsFromBasic(scenario({dosing:"repeated", tau:24, nDoses:20}));
  assert.equal(long.length, 8, "doses after 168 h are left out");
});

test("an irregular schedule is the sum of its doses", ()=>{
  const p=custom([ev(0,500), ev(5,250), ev(14.5,750), ev(30,400)]);
  sampleTimes.forEach(t=>{
    const sum=[[0,500],[5,250],[14.5,750],[30,400]].reduce((s,[t0,mg])=>s+PK.singleConc(p,t-t0,mg),0);
    near(PK.conc(p,t), sum, 1e-12, `t=${t}`);
  });
});

test("a delayed dose shifts that dose's contribution and nothing else", ()=>{
  const onTime=custom([ev(0,500), ev(8,500), ev(16,500)]);
  const late=custom([ev(0,500), ev(11,500), ev(16,500)]);
  near(PK.conc(late,9), PK.conc(onTime,9)-PK.singleConc(onTime,1,500), 1e-12, "before the late dose");
  near(PK.conc(late,20), PK.conc(onTime,20)-PK.singleConc(onTime,12,500)+PK.singleConc(onTime,9,500), 1e-12);
});

test("doses at the same time add together", ()=>{
  const two=custom([ev(0,300), ev(0,200)]), one=custom([ev(0,500)]);
  [1,4,10].forEach(t=> near(PK.conc(two,t), PK.conc(one,t), 1e-12));
});

test("missed events contribute nothing; loading is a label, the amount is what counts", ()=>{
  const p=custom([ev(0,1000,{type:"loading"}), ev(12,500,{status:"missed"}), ev(24,500)]);
  const q=custom([ev(0,1000), ev(24,500)]);
  sampleTimes.forEach(t=> near(PK.conc(p,t), PK.conc(q,t), 1e-12));
  const d=PK.derived(p);
  assert.equal(d.nGiven, 2); assert.equal(d.nMissed, 1); assert.equal(d.totalMg, 1500);
  rel(d.auc, 0.9*1500/d.CL, 1e-12, "AUC∞ = F·(total given)/CL");
});

test("an empty custom schedule is a flat zero curve, not an error", ()=>{
  const p=custom([]);
  assert.equal(PK.conc(p,10), 0);
  const w=PK.windowStats(p,24,2,12);
  assert.equal(w.auc, 0); near(w.tBelow, 24, 1e-9);
});

test("invalid events are dropped or clamped, and the schedule is sorted and capped", ()=>{
  const e=PK.normalizeEvents([
    {t:10, mg:500}, {t:"abc", mg:500}, {t:5, mg:NaN}, null, 7, {t:-3, mg:99999, type:"weird", status:"??"},
    {t:500, mg:1, id:"e1"}, {t:2, mg:300, id:"e1"}]);
  assert.deepEqual(e.map(x=>[x.t,x.mg,x.type,x.status]),
    [[0,4000,"maintenance","given"], [2,300,"maintenance","given"], [10,500,"maintenance","given"], [168,25,"maintenance","given"]]);
  assert.equal(new Set(e.map(x=>x.id)).size, e.length, "ids are unique");
  const many=PK.normalizeEvents(Array.from({length:60},(_,i)=>({t:i, mg:100})));
  assert.equal(many.length, 40);
  assert.equal(many[39].t, 39, "the earliest 40 are kept");
});

test("A and B never share a schedule: copy, swap, reset and new comparisons clone it", ()=>{
  let c=PK.cmpApply(PK.newComparison(), "a", {dosing:"custom", events:[ev(0,500), ev(8,500)]});
  c=PK.cmpCopy(c,"a","b");
  assert.notEqual(c.a.events, c.b.events);
  c.a.events[0].mg=9999;                 // even an in-place edit of A can't reach B
  assert.equal(c.b.events[0].mg, 500);
  const sw=PK.cmpSwap(c);
  assert.notEqual(sw.a.events, c.b.events); assert.notEqual(sw.b.events, c.a.events);
  const r=PK.cmpReset(c,"a");
  assert.deepEqual(r.a.events, []); assert.equal(r.b.events.length, 2);
  const fresh=PK.newComparison({dosing:"custom", events:[ev(0,100)]});
  assert.notEqual(fresh.a.events, fresh.b.events);
  assert.notEqual(PK.scenario().events, PK.DEFAULTS.events, "defaults are never handed out");
});

test("editing one side's schedule leaves the other side alone", ()=>{
  let c=PK.cmpCopy(PK.cmpApply(PK.newComparison(),"a",{dosing:"custom", events:[ev(0,500)]}),"a","b");
  const before=PK.eventsKey(c.b.events);
  c=PK.cmpApply(c,"a",{events:[ev(0,500), ev(6,250)]});
  assert.equal(PK.eventsKey(c.b.events), before);
  assert.equal(c.a.events.length, 2);
});

test("Vary only is off whenever a custom schedule is involved", ()=>{
  const custA=PK.cmpApply(PK.newComparison(),"a",{dosing:"custom", events:[ev(0,500)]});
  assert.equal(PK.cmpSetLock(custA,"D").lock, "", "can't be turned on");
  const locked=PK.cmpSetLock(PK.newComparison({dosing:"repeated"}),"tau");
  const switched=PK.cmpApply(locked,"b",{dosing:"custom", events:[ev(0,500)]});
  assert.equal(switched.lock, "", "switching a side to custom turns it off");
  assert.equal(switched.a.dosing, "repeated", "and the other side isn't dragged along");
  assert.equal(PK.lockHolds({a:switched.a, b:switched.b, lock:"tau"}), false);
});

test("schedule equality ignores ids but not times, amounts, type or status", ()=>{
  const a=custom([ev(0,500), ev(8,500)]), b=custom([ev(8,500,{id:"x9"}), ev(0,500,{id:"zz"})]);
  assert.ok(PK.sameSetting("events",a,b));
  assert.ok(!PK.sameSetting("events",a,custom([ev(0,500), ev(8,500,{status:"missed"})])));
  assert.ok(!PK.sameSetting("events",a,custom([ev(0,500,{type:"loading"}), ev(8,500)])));
  assert.ok(!PK.isRelevant("D",a) && PK.isRelevant("events",a) && !PK.isRelevant("events",scenario()));
});

test("custom schedules travel in v2 links; regular regimens still write v1", ()=>{
  const s=custom([ev(0,1000,{type:"loading"}), ev(12.5,250), ev(24,250,{status:"missed"})], {route:"iv"});
  const link=PK.encodeLink({mode:"sim", s, base:null, view:PK.VIEW_DEFAULTS});
  assert.ok(link.startsWith("v=2&"));
  assert.ok(link.includes("ev:0@1000L;12.5@250;24@250m"));
  const back=PK.decodeLink(link).s;
  assert.equal(back.dosing, "custom"); assert.equal(back.route, "iv");
  assert.ok(PK.sameSetting("events", back, s));
  assert.ok(PK.encodeLink({mode:"sim", s:scenario({dosing:"repeated"}), view:PK.VIEW_DEFAULTS}).startsWith("v=1&"));
  const cmp=PK.encodeLink({mode:"cmp", a:scenario(), b:s, view:PK.VIEW_DEFAULTS});
  assert.ok(cmp.startsWith("v=2&"));
  assert.ok(PK.sameSetting("events", PK.decodeLink(cmp).b, s));
});

test("malformed schedule data in a link is skipped, never trusted", ()=>{
  const p=PK.decodeScenario("dosing:custom,ev:0@500;bad;@;12@;-4@100;7@1e9;8@300Lm;9@200x");
  assert.deepEqual(p.events.map(e=>[e.t,e.mg,e.type,e.status]),
    [[0,500,"maintenance","given"], [8,300,"loading","missed"]], "only well-formed tokens survive");
  const flood=PK.decodeScenario("dosing:custom,ev:"+"1@1;".repeat(300)+"200@9999");
  assert.equal(flood.events.length, 40, "capped");
  assert.ok(flood.events.every(e=>e.t>=0 && e.t<=168 && e.mg>=25 && e.mg<=4000), "clamped");
  assert.equal(PK.decodeScenario("dosing:custom").events.length, 0, "custom with no ev is an empty schedule");
});

test("comparisons with a custom schedule show dose totals and drop regular-regimen rows", ()=>{
  const a=scenario({dosing:"repeated", tau:12, nDoses:4});
  const b=custom([ev(0,500), ev(10,500), ev(26,500)]);
  const keys=PK.compareRows(a,b,48,2,12).rows.map(r=>r.key);
  assert.ok(keys.includes("ngiven") && keys.includes("mg"));
  assert.ok(!keys.includes("trough") && !keys.includes("rac") && !keys.includes("t90"));
  const rows=PK.compareRows(a,b,48,2,12).rows;
  assert.equal(rows.find(r=>r.key==="ngiven").a, 4);
  assert.equal(rows.find(r=>r.key==="mg").b, 1500);
  assert.ok(!PK.compareRows(a,a,48,2,12).rows.some(r=>r.key==="ngiven"), "regular comparisons are unchanged");
});

/* ---------- the 168-hour limit ---------- */

test("Add places the next dose one interval on, never past 168 h", ()=>{
  assert.equal(PK.nextEventTime([]), 0);
  assert.equal(PK.nextEventTime(PK.normalizeEvents([ev(0,500), ev(8,500)])), 16, "follows the last interval");
  assert.equal(PK.nextEventTime(PK.normalizeEvents([ev(150,500)])), 162, "12 h when there's no interval to infer");
  assert.equal(PK.nextEventTime(PK.normalizeEvents([ev(144,500), ev(156,500)])), 168, "at 156 h: lands exactly on the limit");
  assert.equal(PK.nextEventTime(PK.normalizeEvents([ev(100,500), ev(156,500)])), 168, "capped at 168 h");
});

test("Add is blocked once the schedule reaches 168 h; Duplicate still doses at the same time", ()=>{
  const L=PK.normalizeEvents([ev(160,500), ev(168,500)]);
  assert.equal(PK.nextEventTime(L), null);
  assert.equal(PK.duplicateEventTime(L,1), 168, "duplicating the 168 h dose stacks it");
  assert.equal(PK.duplicateEventTime(L,0), 164, "other doses still go halfway to the next");
});

test("a schedule at the limit survives a link and stays at the limit", ()=>{
  const s=custom([ev(0,500), ev(84,500), ev(168,500)]);
  const back=PK.decodeLink(PK.encodeLink({mode:"sim", s, view:PK.VIEW_DEFAULTS})).s;
  assert.ok(PK.sameSetting("events",back,s));
  assert.equal(PK.nextEventTime(back.events), null);
});

test("a blocked Add on A leaves B's schedule alone", ()=>{
  let c=PK.cmpApply(PK.newComparison(),"a",{dosing:"custom", events:[ev(0,500), ev(168,500)]});
  c=PK.cmpApply(c,"b",{dosing:"custom", events:[ev(0,500), ev(12,500)]});
  const before=PK.eventsKey(c.b.events);
  assert.equal(PK.nextEventTime(c.a.events), null, "A can't add");
  assert.equal(PK.nextEventTime(c.b.events), 24, "B still can");
  assert.equal(PK.eventsKey(c.b.events), before);
});

/* ---------- time inspection ---------- */

test("inspectAt reads the curve: IV bolus value, trend and time since the dose", ()=>{
  const p=scenario({route:"iv", D:500, V:35, thalf:4});
  const i=PK.inspectAt(p, 3, 2, 12);
  rel(i.c, (500/35)*Math.exp(-Math.LN2/4*3), 1e-12);
  assert.equal(i.trend, "falling");
  assert.equal(i.status, "in");
  assert.deepEqual(i.last, {t:0, mg:500, count:1, loading:false, route:"iv", dur:null});
  assert.equal(i.since, 3);
  assert.equal(PK.inspectAt(p, 0, 2, 12).trend, "peak", "a bolus peaks the moment it's given");
});

test("inspectAt: an oral dose rises before its peak and falls after", ()=>{
  const p=scenario(), tmax=PK.derived(p).tmax;
  assert.equal(PK.inspectAt(p, tmax-0.5, 2, 12).trend, "rising");
  assert.equal(PK.inspectAt(p, tmax+0.5, 2, 12).trend, "falling");
  assert.equal(PK.inspectAt(p, tmax, 2, 12).trend, "peak");
  assert.equal(PK.inspectAt(p, PK.extrema(p,24).peaks[0].t, 2, 12).trend, "peak", "the peak navigation lands on reads as a peak");
  assert.equal(PK.inspectAt(p, 0, 2, 12).trend, "rising", "an oral dose starts rising at once");
  const rep=scenario({route:"iv", dosing:"repeated", tau:8, nDoses:3});
  assert.equal(PK.inspectAt(rep, PK.extrema(rep,24).troughs[0].t, 2, 12).trend, "trough");
  assert.equal(PK.inspectAt(p, 0.1, 2, 12).status, "below", "just after dosing, before it reaches MEC");
  assert.equal(PK.inspectAt(scenario({D:2000}), tmax, 2, 12).status, "above");
});

test("inspectAt groups same-time doses and never counts a missed dose as given", ()=>{
  const p=custom([ev(0,300,{type:"loading"}), ev(0,200), ev(8,500), ev(16,500,{status:"missed"})]);
  assert.deepEqual(PK.inspectAt(p,4,2,12).last, {t:0, mg:500, count:2, loading:true, route:"oral", dur:null});
  const after=PK.inspectAt(p,20,2,12);
  assert.equal(after.last.t, 8, "the missed 16 h dose isn't the last dose");
  assert.equal(after.since, 12);
  assert.deepEqual(after.missedSince, [16]);
  assert.deepEqual(PK.inspectAt(p,12,2,12).next, {t:16, mg:500, missed:true, route:"oral", dur:null}, "the next scheduled dose is shown even if missed");
  const before=PK.inspectAt(custom([ev(6,500)]),2,2,12);
  assert.equal(before.last, null); assert.equal(before.trend, "flat"); assert.equal(before.c, 0);
});

test("extrema: one oral peak at Tmax, none for the window's truncated ends", ()=>{
  const p=scenario(), ex=PK.extrema(p,24);
  assert.equal(ex.peaks.length, 1);
  near(ex.peaks[0].t, PK.derived(p).tmax, 24/2400, "within one grid step");
  assert.equal(ex.troughs.length, 0);
});

test("extrema: repeated IV boluses peak at each dose and trough just before the next", ()=>{
  const p=scenario({route:"iv", dosing:"repeated", tau:8, nDoses:3});
  const ex=PK.extrema(p,24);
  assert.deepEqual(ex.peaks.map(e=>+e.t.toFixed(4)), [0,8,16]);
  assert.deepEqual(ex.troughs.map(e=>+e.t.toFixed(3)), [8,16]);
  rel(ex.troughs[0].c, PK.conc(p,8-1e-9), 1e-5);
});

test("extrema: infusions peak when they end; irregular schedules find every peak", ()=>{
  const inf=PK.extrema(scenario({route:"inf", tinf:3, thalf:6, V:49, D:1000}),36);
  assert.equal(inf.peaks.length, 1); near(inf.peaks[0].t, 3, 1e-9);
  const irr=PK.extrema(custom([ev(0,500), ev(9,500), ev(15,800), ev(30,300)]),48);
  assert.equal(irr.peaks.length, 4);
  assert.equal(irr.troughs.length, 3);
  assert.ok(irr.troughs.every((tr,i)=> tr.t>irr.peaks[i].t && tr.t<irr.peaks[i+1].t), "troughs sit between peaks");
});

test("doseSchedule lists every scheduled dose in time order, missed ones flagged", ()=>{
  assert.deepEqual(PK.doseSchedule(scenario({dosing:"repeated", tau:12, nDoses:3, loadMult:2, missed:2})).map(d=>[d.t,d.mg,d.loading,d.missed]),
    [[0,1000,true,false],[12,500,false,true],[24,500,false,false]]);
  assert.deepEqual(PK.doseSchedule(scenario()).map(d=>d.t), [0]);
});

/* ---------- scenario library ---------- */

const V=PK.VIEW_DEFAULTS;
const simState=()=>({mode:"sim", s:scenario({dosing:"repeated", clFn:50}), base:scenario({dosing:"repeated"}), baseLabel:"before", lesson:"cl",
  view:Object.assign({}, PK.VIEW_DEFAULTS, {duration:72, mec:3, mtc:15, scale:"lin", zoom:"full"})});
const cmpState=()=>({mode:"cmp", a:custom([ev(0,1000,{type:"loading"}), ev(12,500), ev(24,500,{status:"missed"})]),
  b:scenario({dosing:"repeated", tau:12}), nameA:"Custom plan", nameB:"Every 12 h", lock:"", edit:"b", view:V});

test("a saved simulator item restores scenario, baseline, lesson and view", ()=>{
  const it=PK.libraryItem("Reduced clearance study", simState(), "2026-09-27T12:00:00.000Z", "abc");
  assert.deepEqual([it.id, it.kind, it.name, it.savedAt], ["abc","sim","Reduced clearance study","2026-09-27T12:00:00.000Z"]);
  const st=PK.decodeLink(it.link);
  assert.deepEqual(st.s, simState().s); assert.deepEqual(st.base, simState().base);
  assert.equal(st.baseLabel, "before"); assert.equal(st.lesson, "cl"); assert.deepEqual(st.view, simState().view);
});

test("a saved comparison keeps both scenarios, custom schedules, names and the edited side", ()=>{
  const it=PK.libraryItem("", cmpState());
  assert.equal(it.kind, "cmp");
  assert.equal(it.name, "Custom plan vs Every 12 h", "a sensible default name");
  const st=PK.decodeLink(it.link);
  assert.ok(PK.sameSetting("events", st.a, cmpState().a));
  assert.deepEqual(st.b, cmpState().b);
  assert.equal(st.nameA, "Custom plan"); assert.equal(st.edit, "b");
});

test("saved names are plain text: control and direction characters removed, trimmed, capped at 60", ()=>{
  const it=PK.libraryItem("  <img src=x onerror=alert(1)>\u202e\u0007 "+"x".repeat(100), simState());
  assert.ok(it.name.startsWith("<img src=x onerror=alert(1)>"), "kept as text for the page to escape");
  assert.ok(!/[\u202e\u0007]/.test(it.name));
  assert.equal(it.name.length, 60);
});

test("parseLibrary rejects files that aren't DoseCurve libraries", ()=>{
  assert.equal(PK.parseLibrary("{not json").error, "not valid JSON");
  assert.equal(PK.parseLibrary({format:"something-else", items:[]}).error, "not a DoseCurve scenario file");
  assert.equal(PK.parseLibrary(null).error, "not a DoseCurve scenario file");
  assert.deepEqual(PK.parseLibrary(PK.exportLibrary([])).library.items, []);
});

test("parseLibrary keeps valid items, skips broken ones, and re-encodes links canonically", ()=>{
  const good=PK.libraryItem("Good", simState(), "2026-09-27T12:00:00.000Z", "good1");
  const sloppy={id:"sl0ppy", name:"Sloppy", link:"v=1&s=D%3A99999%2CclFn%3A50", savedAt:"2026-09-01T00:00:00Z"};
  const doc={format:"dosecurve-library", version:1, items:[good, sloppy, {name:"no link"}, {link:"not a link"}, 42, null,
    {id:"good1", name:"Same id", link:good.link}, {name:"Huge", link:"v=1&s="+"D:1,".repeat(6000)}]};
  const r=PK.parseLibrary(JSON.stringify(doc));
  assert.equal(r.skipped, 5);
  assert.deepEqual(r.library.items.map(i=>i.name), ["Good","Sloppy","Same id"]);
  assert.equal(PK.decodeLink(r.library.items[1].link).s.D, 2000, "out-of-range values are clamped");
  assert.equal(r.library.items[1].link, "v=1&s=D:2000,clFn:50", "and the link is stored in canonical form");
  assert.notEqual(r.library.items[2].id, "good1", "a repeated id gets a fresh one");
  assert.equal(new Set(r.library.items.map(i=>i.id)).size, 3);
});

test("older and newer library versions: a bare array migrates, a newer file is read and flagged", ()=>{
  const it=PK.libraryItem("Old", simState());
  const v0=PK.parseLibrary(JSON.stringify([it]));
  assert.equal(v0.library.version, PK.LIBRARY_VERSION); assert.equal(v0.library.items.length, 1);
  const future=PK.parseLibrary({format:"dosecurve-library", version:99, items:[it]});
  assert.equal(future.newer, true); assert.equal(future.library.items.length, 1);
});

test("the library is capped at 200 items, on read and on import", ()=>{
  const it=PK.libraryItem("x", simState());
  const many=PK.parseLibrary({format:"dosecurve-library", version:1, items:Array.from({length:230},()=>it)});
  assert.equal(many.library.items.length, 200); assert.equal(many.skipped, 30);
  const merged=PK.mergeLibrary(many.library, [it, it]);
  assert.equal(merged.added, 0); assert.equal(merged.dropped, 2);
});

test("export then import gives back the same setups, and merging never collides ids", ()=>{
  const items=[PK.libraryItem("A", simState()), PK.libraryItem("B", cmpState())];
  const back=PK.parseLibrary(PK.exportLibrary(items)).library.items;
  assert.deepEqual(back.map(i=>[i.name,i.kind,i.link]), items.map(i=>[i.name,i.kind,i.link]));
  const m=PK.mergeLibrary({format:"dosecurve-library", version:1, items}, back);
  assert.equal(m.added, 2);
  assert.equal(new Set(m.library.items.map(i=>i.id)).size, 4);
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

/* ---------- moving doses (drag and ±0.5 h) ---------- */

const plan=()=>PK.normalizeEvents([ev(0,1000,{type:"loading"}), ev(12,500), ev(24,500,{status:"missed"}), ev(36,500)]);
const at=(list,id)=>list.find(e=>e.id===id);

test("snapTime keeps drags on the half-hour grid inside 0–168 h", ()=>{
  assert.equal(PK.MOVE_STEP, 0.5);
  assert.deepEqual([12.26, 12.74, 12.75, 0.2, -5, 167.9, 400].map(t=>PK.snapTime(t)), [12.5, 12.5, 13, 0, 0, 168, 168]);
  assert.equal(PK.snapTime(NaN), null); assert.equal(PK.snapTime("later"), null); assert.equal(PK.snapTime(Infinity), null);
});

test("moving a dose earlier or later re-sorts the schedule and changes nothing else", ()=>{
  const L=plan(), snapshot=JSON.stringify(L);
  const later=PK.moveEvent(L,"e2",30);
  assert.deepEqual(later.map(e=>e.id), ["e1","e3","e2","e4"], "the moved dose takes its new place in time order");
  assert.deepEqual(at(later,"e2"), Object.assign({}, at(L,"e2"), {t:30}), "only its time changed");
  ["e1","e3","e4"].forEach(id=> assert.deepEqual(at(later,id), at(L,id), id));
  const earlier=PK.moveEvent(L,"e4",6);
  assert.deepEqual(earlier.map(e=>`${e.id}@${e.t}`), ["e1@0","e4@6","e2@12","e3@24"]);
  assert.equal(JSON.stringify(L), snapshot, "the input schedule is never modified");
  assert.notEqual(later, L);
});

test("moves stop at 0 h and 168 h", ()=>{
  const L=plan();
  assert.equal(at(PK.moveEvent(L,"e2",0),"e2").t, 0);
  assert.equal(at(PK.moveEvent(L,"e2",-6),"e2").t, 0);
  assert.equal(at(PK.moveEvent(L,"e2",168),"e2").t, 168);
  assert.equal(at(PK.moveEvent(L,"e2",500),"e2").t, 168);
  assert.equal(PK.moveEvent(L,"e2",168).at(-1).id, "e2", "the last dose after moving to the end");
});

test("a dose moved onto another dose's time stacks with it, and the doses add together", ()=>{
  const L=plan(), moved=PK.moveEvent(L,"e4",12);
  assert.equal(moved.length, 4, "neither dose is dropped");
  assert.deepEqual(moved.filter(e=>e.t===12).map(e=>e.id), ["e2","e4"]);
  const stacked=custom(moved), single=custom([ev(0,1000,{type:"loading"}), ev(12,1000), ev(24,500,{status:"missed"})]);
  sampleTimes.forEach(t=> rel(PK.conc(stacked,t)+1e-12, PK.conc(single,t)+1e-12, 1e-12, `t=${t}`));
});

test("moving keeps a missed dose missed and a loading dose a loading dose", ()=>{
  const L=plan();
  const m=at(PK.moveEvent(L,"e3",27.5),"e3");
  assert.deepEqual([m.t, m.status, m.mg], [27.5, "missed", 500]);
  const ld=at(PK.moveEvent(L,"e1",2),"e1");
  assert.deepEqual([ld.t, ld.type, ld.mg], [2, "loading", 1000]);
  const p=custom(PK.moveEvent(L,"e3",27.5));
  assert.equal(PK.conc(p,30), PK.conc(custom(L),30), "a missed dose still adds nothing wherever it goes");
});

test("an unknown dose or an unusable time leaves the schedule as it was", ()=>{
  const L=plan();
  [["nope",20], ["e2",NaN], ["e2","soon"], ["e2",undefined]].forEach(([id,t])=>{
    const r=PK.moveEvent(L,id,t);
    assert.deepEqual(r, L, `${id} ${t}`); assert.notEqual(r, L, "still a fresh copy");
  });
  assert.deepEqual(PK.moveEvent(null,"e1",4), []);
});

test("undoing a move restores the exact schedule", ()=>{
  const L=plan(), moved=PK.moveEvent(L,"e2",30);
  assert.deepEqual(PK.normalizeEvents(L), L, "the list kept for undo is already canonical");
  assert.notEqual(PK.eventsKey(moved), PK.eventsKey(L));
  const back=PK.moveEvent(moved,"e2",12);
  assert.deepEqual(back, L, "moving it back is the same schedule, ids included");
});

test("a moved schedule survives links, the library and Compare isolation", ()=>{
  const moved=PK.moveEvent(plan(),"e2",30.5);
  const s=custom(moved), key=PK.eventsKey(moved);
  const sim=PK.decodeLink(PK.encodeLink({mode:"sim", s, base:null, baseLabel:"", lesson:null, view:V}));
  assert.equal(PK.eventsKey(sim.s.events), key, "share link");
  const it=PK.parseLibrary(PK.exportLibrary([PK.libraryItem("Moved", {mode:"sim", s, view:V})])).library.items[0];
  assert.equal(PK.eventsKey(PK.decodeLink(it.link).s.events), key, "library export and import");

  let c=PK.cmpApply(PK.newComparison(), "a", {dosing:"custom", events:plan()});
  c=PK.cmpCopy(c,"a","b");
  c=PK.cmpApply(c, "a", {events:PK.moveEvent(c.a.events,"e2",30.5)});
  assert.equal(PK.eventsKey(c.a.events), key);
  assert.equal(PK.eventsKey(c.b.events), PK.eventsKey(plan()), "moving A's dose leaves B's schedule alone");
  const sw=PK.cmpSwap(c);
  assert.equal(PK.eventsKey(sw.b.events), key, "swap carries the moved schedule");
  const cp=PK.cmpCopy(c,"a","b");
  assert.equal(PK.eventsKey(cp.b.events), key, "copy carries it too");
  assert.notEqual(cp.a.events, cp.b.events);
  assert.equal(PK.cmpReset(c,"a").a.dosing, PK.DEFAULTS.dosing, "reset still clears it");
  const cl=PK.decodeLink(PK.encodeLink({mode:"cmp", a:c.a, b:c.b, nameA:"", nameB:"", lock:"", edit:"a", view:V}));
  assert.deepEqual([PK.eventsKey(cl.a.events), PK.eventsKey(cl.b.events)], [key, PK.eventsKey(plan())], "comparison link");
});

/* ---------- per-dose routes and infusion events ---------- */

const inf=(t,mg,dur,extra)=>Object.assign({t, mg, route:"inf", dur, type:"maintenance", status:"given"}, extra);
const bolus=(t,mg,extra)=>Object.assign({t, mg, route:"iv", type:"maintenance", status:"given"}, extra);
const oral=(t,mg,extra)=>Object.assign({t, mg, route:"oral", type:"maintenance", status:"given"}, extra);
const kOf=p=>PK.keOf(p), vOf=p=>PK.vOf(p);

test("an infusion event follows the zero-order closed form, during and after it runs", ()=>{
  const p=custom([inf(2,600,3)]), k=kOf(p), V=vOf(p), R=600/3;
  assert.equal(PK.conc(p,2), 0);
  [0.5,1.5,3].forEach(s=> rel(PK.conc(p,2+s), R/(k*V)*(1-Math.exp(-k*s)), 1e-12, `${s} h in`));
  const cEnd=R/(k*V)*(1-Math.exp(-k*3));
  [4,10,30].forEach(s=> rel(PK.conc(p,5+s), cEnd*Math.exp(-k*s), 1e-12, `${s} h after the end`));
});

test("a converted infusion regimen keeps each infusion's duration", ()=>{
  const p=scenario({route:"inf", dosing:"repeated", tinf:0.5, tau:8, nDoses:4});
  const ev=PK.eventsFromBasic(p);
  assert.deepEqual(ev.map(e=>[e.route,e.dur]), [["inf",0.5],["inf",0.5],["inf",0.5],["inf",0.5]]);
  const c=PK.normalizeScenario(Object.assign({}, p, {dosing:"custom", events:ev}));
  sampleTimes.forEach(t=> near(PK.conc(c,t), PK.conc(p,t), 1e-12, `t=${t}`));
});

test("overlapping infusions add their rates", ()=>{
  const both=custom([inf(0,1200,12), inf(6,600,4)]);
  const a=custom([inf(0,1200,12)]), b=custom([inf(6,600,4)]);
  [3,6,8,10,12,20].forEach(t=> near(PK.conc(both,t), PK.conc(a,t)+PK.conc(b,t), 1e-12, `t=${t}`));
  const i=PK.inspectAt(both,8,2,12);
  assert.equal(i.infusing.length, 2);
  near(i.infusing.reduce((s,r)=>s+r.rate,0), 100+150, 1e-9, "combined rate");
});

test("infusionOverlap finds infusions running at once, and only those", ()=>{
  assert.deepEqual(PK.infusionOverlap(custom([inf(0,1200,12), inf(6,600,4)])), {maxRunning:2, from:6});
  assert.deepEqual(PK.infusionOverlap(custom([inf(0,500,4), inf(2,500,10), inf(3,500,2)])), {maxRunning:3, from:3});
  assert.equal(PK.infusionOverlap(custom([inf(0,500,8), inf(8,500,8)])), null, "back to back is not overlap");
  assert.equal(PK.infusionOverlap(custom([inf(0,500,12), inf(6,500,4,{status:"missed"})])), null, "missed doses don't run");
  assert.equal(PK.infusionOverlap(custom([inf(0,500,12), ev(6,500,{route:"iv"})])), null, "a bolus isn't an infusion");
  const reg=o=>scenario(Object.assign({route:"inf", dosing:"repeated", nDoses:6, tau:8}, o));
  assert.deepEqual(PK.infusionOverlap(reg({tinf:20})), {maxRunning:3, from:16}, "T·inf 20 h every 8 h: three at once");
  assert.equal(PK.infusionOverlap(reg({tinf:8})), null, "T·inf = τ runs back to back");
  assert.equal(PK.infusionOverlap(reg({tinf:2})), null);
  assert.equal(PK.infusionOverlap(reg({tinf:20, nDoses:1})), null, "one dose can't overlap");
  assert.equal(PK.infusionOverlap(scenario({route:"inf", dosing:"single", tinf:48})), null);
});

test("steady state exists only for a regular repeated regimen", ()=>{
  assert.equal(PK.ssProfile(scenario({dosing:"single"})), null);
  assert.equal(PK.ssProfile(custom([ev(0,500), ev(12,500), ev(24,500)])), null);
  assert.equal(PK.ssConc(scenario({dosing:"single"}), 1), null);
  assert.equal(PK.ssConc(custom([ev(0,500)]), 1), null);
  assert.ok(PK.ssProfile(scenario({dosing:"repeated"})).ssPeak>0);
  const C=PK.compareRows(scenario({dosing:"repeated"}), custom([ev(0,500), ev(12,500)]), 48, 2, 12);
  assert.ok(!JSON.stringify(C).match(/steady|accumulation/i), "no steady-state rows when either side is custom");
});

test("a long infusion settles at rate ÷ CL", ()=>{
  const p=custom([inf(0,8400,168)]), CL=kOf(p)*vOf(p);
  rel(PK.conc(p,160), 50/CL, 1e-9, "50 mg/h plateau");
});

test("a loading bolus of plateau × V makes an infusion flat from the first minute", ()=>{
  const base=custom([inf(0,1440,24)]), k=kOf(base), V=vOf(base), Css=60/(k*V);
  const p=custom([bolus(0,Math.round(Css*V*10)/10,{type:"loading"}), inf(0,1440,24)]);
  for(let t=0;t<=24;t+=0.25) rel(PK.conc(p,t), Css, 2e-4, `t=${t}`);   // amounts are kept to 0.1 mg
  assert.ok(PK.conc(base,6) < 0.8*Css, "the infusion alone is still climbing");
});

test("with mixed routes, F and kₐ only change the oral doses", ()=>{
  const list=[oral(0,500), bolus(8,300), inf(16,600,2)];
  const p1=custom(list,{F:0.9}), p2=custom(list,{F:0.45}), ivOnly=custom([bolus(8,300), inf(16,600,2)]);
  const oralOnly=custom([oral(0,500)],{F:0.9});
  sampleTimes.forEach(t=>{
    near(PK.conc(p1,t)-PK.conc(p2,t), PK.conc(oralOnly,t)/2, 1e-12, `F halves only the oral part, t=${t}`);
    near(PK.conc(p1,t)-PK.conc(oralOnly,t), PK.conc(ivOnly,t), 1e-12, `IV part untouched, t=${t}`);
  });
  const fast=custom(list,{ka:3});
  near(PK.conc(fast,12)-PK.conc(ivOnly,12), PK.conc(custom([oral(0,500)],{ka:3}),12), 1e-12, "kₐ too");
});

test("a custom schedule's AUC counts each dose by its own route", ()=>{
  const p=custom([oral(0,500), bolus(8,300), inf(16,600,2)],{F:0.8}), CL=kOf(p)*vOf(p);
  rel(PK.derived(p).auc, (0.8*500+300+600)/CL, 1e-12);
  rel(PK.windowStats(p,168,2,12).auc, PK.derived(p).auc, 0.005, "the window captures it all by 168 h");
  assert.equal(PK.derived(p).totalMg, 1400);
});

test("window totals count only what an infusion has delivered", ()=>{
  const p=custom([bolus(0,200), inf(0,2400,24)]);
  assert.deepEqual(PK.doseTotals(p,6), {n:2, mg:200+600});
  assert.deepEqual(PK.doseTotals(p,48), {n:2, mg:2600});
});

test("routes and durations are validated", ()=>{
  const L=PK.normalizeEvents([{t:0,mg:500}, {t:4,mg:500,route:"rectal"}, {t:8,mg:500,route:"inf"}, {t:10,mg:500,route:"inf",dur:0},
    {t:12,mg:500,route:"inf",dur:"x"}, {t:20,mg:500,route:"inf",dur:900}], {route:"iv", tinf:2});
  assert.deepEqual(L.map(e=>[e.t,e.route]), [[0,"iv"],[0,"inf"],[4,"iv"],[8,"inf"],[10,"inf"],[12,"inf"]],
    "missing or unknown routes take the scenario's");
  assert.deepEqual(L.filter(e=>e.route==="inf").map(e=>[e.t,e.dur]), [[0,168],[8,2],[10,0.25],[12,2]],
    "durations default to T·inf, clamp to 0.25–168 h, and a 900 h infusion starts at 0 so it ends by 168 h");
  assert.ok(!("dur" in L.find(e=>e.route==="iv")), "only infusions carry a duration");
  const late=PK.normalizeEvents([{t:160,mg:500,route:"inf",dur:24}]);
  assert.deepEqual([late[0].t, late[0].dur], [144, 24], "an infusion ends by 168 h, so its start is held back");
  const big=PK.normalizeEvents([{t:0,mg:99999,route:"inf",dur:48}, {t:1,mg:99999,route:"iv"}, {t:2,mg:99999}]);
  assert.deepEqual(big.map(e=>e.mg), [10000,4000,4000], "infusions may carry up to 10,000 mg");
  const back=PK.normalizeEvents([Object.assign({}, big[0], {route:"oral"})]);
  assert.deepEqual([back[0].mg, "dur" in back[0]], [4000, false], "switching an infusion to oral drops its duration and caps its amount");
});

test("a missed infusion adds nothing and isn't running", ()=>{
  const p=custom([bolus(0,300), inf(4,1200,12,{status:"missed"})]), q=custom([bolus(0,300)]);
  sampleTimes.forEach(t=> near(PK.conc(p,t), PK.conc(q,t), 1e-12, `t=${t}`));
  assert.deepEqual(PK.inspectAt(p,8,2,12).infusing, []);
  assert.deepEqual(PK.doseTotals(p,24), {n:1, mg:300});
});

test("moving an infusion keeps its duration and stops where it would end past 168 h", ()=>{
  const L=PK.normalizeEvents([bolus(0,300), inf(12,1200,24)]);
  const id=L[1].id, moved=PK.moveEvent(L,id,160);
  assert.deepEqual([moved[1].t, moved[1].dur, moved[1].mg], [144, 24, 1200]);
  assert.deepEqual(PK.moveEvent(L,id,30)[1], Object.assign({}, L[1], {t:30}));
});

test("inspectAt describes a running infusion", ()=>{
  const p=custom([inf(0,1440,24)]);
  const i=PK.inspectAt(p,6,2,12);
  assert.deepEqual(i.infusing, [{start:0, end:24, rate:60, delivered:360, mg:1440}]);
  assert.deepEqual([i.last.route, i.last.dur], ["inf", 24]);
  assert.equal(i.trend, "rising");
  assert.deepEqual(PK.inspectAt(p,24,2,12).infusing, [], "stopped at its end");
  assert.equal(PK.inspectAt(p,24,2,12).trend, "peak");
});

test("the peak at an infusion's end is found exactly", ()=>{
  const p=custom([inf(0.37,900,2.71)]), end=0.37+2.71;
  const e=PK.extrema(p,24);
  near(e.peaks[0].t, end, 1e-9, "extrema");
  const w=PK.windowStats(p,24,2,12);
  near(w.tmax, end, 1e-9, "window Cmax time"); near(w.cmax, PK.conc(p,end), 1e-12, "window Cmax");
});

test("routeOf names the route every dose uses", ()=>{
  assert.equal(PK.routeOf(scenario({route:"iv"})), "iv");
  assert.equal(PK.routeOf(custom([inf(0,500,2), inf(8,500,4)])), "inf");
  assert.equal(PK.routeOf(custom([oral(0,500), bolus(8,500)])), "mixed");
  assert.equal(PK.routeOf(custom([],{route:"iv"})), "iv", "an empty schedule falls back to the scenario's route");
});

test("F, kₐ and T·inf are relevant only where they shape the curve", ()=>{
  assert.equal(PK.isRelevant("F", custom([bolus(0,500), inf(4,500,2)])), false);
  assert.equal(PK.isRelevant("ka", custom([bolus(0,500), oral(4,500)])), true);
  assert.equal(PK.isRelevant("tinf", custom([inf(0,500,2)],{route:"inf"})), false, "each infusion has its own duration");
  assert.equal(PK.isRelevant("tinf", scenario({route:"inf"})), true);
});

test("links: schedules v2 could express are written exactly as before", ()=>{
  const p=custom([ev(0,500), ev(8,500,{status:"missed"})],{route:"inf", tinf:2});
  const link=PK.encodeLink({mode:"sim", s:p, base:null, view:V});
  assert.equal(link, "v=2&s=route:inf,dosing:custom,tinf:2,ev:0@500;8@500m");
  const old=PK.decodeLink("#v=2&s=route:iv,dosing:custom,ev:0@500L;12@250m").s;
  assert.deepEqual(old.events.map(e=>[e.t,e.route,e.type,e.status]), [[0,"iv","loading","given"],[12,"iv","maintenance","missed"]],
    "an old link's doses take the scenario's route");
  const oldInf=PK.decodeLink("#v=2&s=route:inf,tinf:3,dosing:custom,ev:0@500").s;
  assert.deepEqual([oldInf.events[0].route, oldInf.events[0].dur], ["inf", 3]);
});

test("links: mixed routes and per-infusion durations round-trip as v3", ()=>{
  const p=custom([bolus(0,350,{type:"loading"}), inf(0,1456,24), oral(30,500), inf(40,200,0.5,{status:"missed"})],{route:"iv"});
  const link=PK.encodeLink({mode:"sim", s:p, base:null, view:V});
  assert.ok(link.startsWith("v=3&"), link);
  assert.ok(link.includes("ev:0@350L;0@1456i24;30@500o;40@200i0.5m"), link);
  const back=PK.decodeLink(link).s;
  assert.deepEqual(back.events, p.events);
  assert.equal(PK.decodeLink(link).version, 3);
  const cmpLink=PK.encodeLink({mode:"cmp", a:scenario(), b:p, view:V});
  assert.equal(PK.eventsKey(PK.decodeLink(cmpLink).b.events), PK.eventsKey(p.events));
});

test("links: garbled route codes are clamped or dropped", ()=>{
  const s=PK.decodeLink("#v=3&s=dosing:custom,ev:0@500i0;1@500i999;2@500x;3@500i;4@500bi2;170@500i24;5@99999i2;6@99999b;7@300o").s;
  assert.deepEqual(s.events.map(e=>`${e.t}@${e.mg}${e.route==="inf"?"i"+e.dur:e.route==="iv"?"b":"o"}`),
    ["0@500i0.25","0@500i168","5@10000i2","6@4000b","7@300o","144@500i24"]);
});

test("library items carry mixed-route schedules", ()=>{
  const p=custom([bolus(0,350), inf(0,1456,24), oral(30,500)],{route:"iv"});
  const it=PK.parseLibrary(PK.exportLibrary([PK.libraryItem("Mixed", {mode:"sim", s:p, view:V})])).library.items[0];
  assert.deepEqual(PK.decodeLink(it.link).s.events, p.events);
});

test("A and B never share a dose's route or duration", ()=>{
  let c=PK.cmpApply(PK.newComparison(), "a", {dosing:"custom", events:[bolus(0,300), inf(0,1200,12)]});
  c=PK.cmpCopy(c,"a","b");
  assert.deepEqual(c.b.events, c.a.events);
  c.a.events[1].dur=99; c.a.events[1].route="oral";
  assert.deepEqual([c.b.events[1].route, c.b.events[1].dur], ["inf", 12]);
  assert.deepEqual(PK.cloneEvents([inf(0,500,3,{id:"x"})])[0], inf(0,500,3,{id:"x"}), "cloning keeps route and duration");
});

test("lesson: loading bolus + infusion", ()=>{
  const {base,cur,mec}=lesson("ldinf"), k=kOf(cur), V=vOf(cur), CL=k*V, inf24=base.events[0];
  const Css=inf24.mg/inf24.dur/CL;
  near(inf24.mg/inf24.dur, 60.7, 0.05, "60.7 mg/h"); near(Css, 10, 0.01, "plateau 10 mg/L");
  const reach=(level)=>{ for(let t=0;t<=24;t+=0.01) if(PK.conc(base,t)>=level) return t; return null; };
  near(reach(mec), 9.3, 0.05, "9.3 h to the 8 mg/L effective level");
  near(reach(0.9*Css), 13.3, 0.05, "13.3 h to within 10% of the plateau");
  near(13.3/(Math.LN2/k), 3.3, 0.05, "3.3 half-lives");
  const b=cur.events.find(e=>e.route==="iv");
  assert.equal(b.mg, 350); rel(10*V, 350, 1e-9, "plateau × V = 10 mg/L × 35 L");
  for(let t=0;t<=24;t+=0.1) rel(PK.conc(cur,t), Css, 1e-3, `flat at t=${t}`);
});

test("lesson: continuous vs intermittent infusion", ()=>{
  const {base,cur,T,mtc}=lesson("cvi"), CL=kOf(cur)*vOf(cur);
  assert.equal(base.events.reduce((s,e)=>s+e.mg,0), 2880); assert.equal(cur.events.reduce((s,e)=>s+e.mg,0), 2880);
  assert.equal(cur.events.length, 8); assert.ok(cur.events.every(e=>e.route==="inf" && e.dur===1 && e.mg===360));
  near(base.events[0].mg/base.events[0].dur, 60, 1e-9, "60 mg/h");
  near(PK.conc(base,47), 60/CL, 0.01, "holds 9.9 mg/L"); near(60/CL, 9.9, 0.05);
  const x=PK.extrema(cur,T), lastPeak=x.peaks[x.peaks.length-1], lastTrough=x.troughs[x.troughs.length-1];
  near(lastPeak.c, 14.6, 0.05, "peaks near 14.6 mg/L"); assert.ok(lastPeak.c > mtc, "over the toxic line");
  near(lastTrough.c, 6.1, 0.05, "about 6.1 mg/L before each dose");
  let auc=0; const N=600; for(let i=0;i<N;i++){ const t=42+6*(i+0.5)/N; auc+=PK.conc(cur,t)*6/N; }
  near(auc/6, 9.9, 0.05, "the same 9.9 mg/L on average over an interval");
  rel(PK.derived(cur).auc, PK.derived(base).auc, 1e-12, "the same total exposure");
});

/* ---------- pharmacodynamics (concentration → effect) ---------- */

const pd=o=>PK.normalizeScenario(scenario(Object.assign({route:"iv"}, o)));

test("the sigmoid Emax curve: baseline, half-max at EC50, ceiling and steepness", ()=>{
  const p=pd({e0:10, emax:80, ec50:4, hill:2});
  assert.equal(PK.effectOf(p,0), 10);
  near(PK.effectOf(p,4), 10+40, 1e-12, "E0 + Emax/2 at EC50");
  near(PK.effectOf(p,8), 10+80*4/5, 1e-12, "2× EC50 with n = 2 gives 4/5 of Emax");
  near(PK.effectOf(p,1e9), 90, 1e-9, "the ceiling is E0 + Emax");
  assert.equal(PK.effectOf(p,1e-300), 10, "tiny concentrations stay exact");
  assert.ok(Number.isFinite(PK.effectOf(p,1e300)));
  [1,2,4].forEach(n=> near(PK.effectOf(pd({hill:n}),8), 100*2**n/(1+2**n), 1e-9, `n = ${n}`));
});

test("concForEffect inverts the curve, and knows what's out of reach", ()=>{
  const p=pd({e0:5, emax:70, ec50:3, hill:1.7});
  [6,20,40,60,74].forEach(E=> near(PK.effectOf(p,PK.concForEffect(p,E)), E, 1e-9, `E = ${E}`));
  assert.equal(PK.concForEffect(p,5), 0, "the baseline needs no drug");
  assert.equal(PK.concForEffect(p,75), null, "E0 + Emax is never reached");
  assert.equal(PK.concForEffect(p,90), null);
});

test("time above a target effect matches the IV bolus closed form", ()=>{
  const p=pd({D:500, ec50:4}), k=PK.keOf(p), C0=500/PK.vOf(p), ct=PK.concForEffect(p,60);
  const e=PK.effectStats(p,24,60);
  near(e.tAbove, Math.log(C0/ct)/k, 1e-5, "ln(C0 / C_target) / kₑ");
  assert.equal(e.onset, 0); near(e.peak, PK.effectOf(p,C0), 1e-9); assert.equal(e.tPeak, 0);
});

test("doubling an IV bolus adds exactly one half-life above target", ()=>{
  const half=Math.LN2/PK.keOf(pd({}));
  [[500,50],[300,30],[800,70]].forEach(([D,tg])=>{
    const a=PK.effectStats(pd({D, ec50:2}),48,tg), b=PK.effectStats(pd({D:2*D, ec50:2}),48,tg);
    near(b.tAbove-a.tAbove, half, 1e-6, `${D} mg, ${tg}% target`);
  });
});

test("an oral dose reaches the target where its concentration crosses C_target", ()=>{
  const p=PK.normalizeScenario(scenario({ec50:4})), ct=PK.concForEffect(p,50);
  let lo=0, hi=PK.derived(p).tmax;
  for(let i=0;i<60;i++){ const m=(lo+hi)/2; if(PK.conc(p,m)<ct) lo=m; else hi=m; }
  const e=PK.effectStats(p,24,50);
  near(e.onset, hi, 1e-4, "onset"); near(e.tPeak, PK.windowStats(p,24,0,Infinity).tmax, 1e-12);
});

test("targets out of reach, or already met at baseline", ()=>{
  const partial=PK.effectStats(pd({ec50:2, emax:60}),24,70);
  assert.deepEqual([partial.tAbove, partial.onset, partial.ct], [0, null, null]);
  const baseline=PK.effectStats(pd({e0:30}),24,20);
  near(baseline.tAbove, 24, 1e-9, "the whole window"); assert.equal(baseline.onset, 0);
});

test("PD settings never change the concentration curve", ()=>{
  const a=pd({}), b=pd({e0:20, emax:50, ec50:30, hill:3});
  sampleTimes.forEach(t=> assert.equal(PK.conc(a,t), PK.conc(b,t)));
  const flat=custom([bolus(0,350,{type:"loading"}), inf(0,1456,24)]);
  const e=[1,6,12,20].map(t=>PK.effectOf(flat, PK.conc(flat,t)));
  e.forEach(v=> near(v, e[0], 0.05, "a flat concentration gives a flat effect"));
});

test("PD settings are clamped, and E0 + Emax stays within 100%", ()=>{
  assert.equal(pd({e0:40, emax:90}).emax, 60);
  const s=PK.decodeScenario("ec50:0,hill:99,e0:-5,emax:1");
  assert.deepEqual([s.ec50, s.hill, s.e0, s.emax], [0.1, 5, 0, 5]);
  assert.deepEqual(PK.decodeScenario("e0:50,emax:100").emax, 50);
});

test("links: PD settings round-trip as v4, and older links stay as they were", ()=>{
  const s=pd({ec50:8, emax:80, hill:2.5, e0:10}), view=Object.assign({}, V, {pd:true, etgt:60});
  const link=PK.encodeLink({mode:"sim", s, base:null, view});
  assert.ok(link.startsWith("v=4&"), link);
  assert.ok(link.includes("w=pd:1,etgt:60"), link);
  const back=PK.decodeLink(link);
  assert.deepEqual(back.s, s); assert.deepEqual(back.view, view); assert.equal(back.version, 4);
  assert.equal(PK.encodeLink({mode:"sim", s:scenario(), base:null, view:V}), "v=1&s=", "defaults still write v1");
  assert.ok(PK.encodeLink({mode:"sim", s:scenario(), base:null, view:Object.assign({},V,{pd:true})}).startsWith("v=4"), "the effect view alone is v4");
  const old=PK.decodeLink("#v=1&s=D:400&w=duration:48");
  assert.deepEqual([old.view.pd, old.view.etgt, old.s.ec50], [false, 50, 4], "old links open with the effect view off");
  const bad=PK.decodeLink("#v=4&s=ec50:abc&w=pd:yes,etgt:500").view;
  assert.deepEqual([bad.pd, bad.etgt], [false, 99]);
});

test("library items and comparisons carry PD settings", ()=>{
  const a=pd({ec50:2}), b=pd({ec50:8, hill:3});
  const st={mode:"cmp", a, b, nameA:"", nameB:"", lock:"", edit:"b", view:Object.assign({},V,{pd:true})};
  const it=PK.parseLibrary(PK.exportLibrary([PK.libraryItem("PD", st)])).library.items[0];
  const back=PK.decodeLink(it.link);
  assert.deepEqual([back.a, back.b, back.view.pd], [a, b, true]);
});

test("compare rows add the effect metrics only when asked", ()=>{
  const a=pd({ec50:2}), b=pd({ec50:8});
  assert.ok(!PK.compareRows(a,b,24,2,30).rows.some(r=>r.key==="epeak"));
  const rows=PK.compareRows(a,b,24,2,30,50).rows, row=k=>rows.find(r=>r.key===k);
  near(row("epeak").a, 87.72, 0.01); near(row("epeak").b, 64.10, 0.01);
  near(row("eabove").a, 11.35, 0.01); near(row("eabove").b, 3.35, 0.01);
  assert.equal(PK.diff("pp", row("epeak").a, row("epeak").b).dir, -1);
});

test("“Vary only EC50” keeps B's EC50 and shares everything else", ()=>{
  let c=PK.cmpApply(PK.newComparison({route:"iv"}), "b", {ec50:8, hill:2});
  c=PK.cmpSetLock(c,"ec50");
  assert.deepEqual([c.b.ec50, c.b.hill], [8, 1], "B takes A's Hill slope");
  assert.ok(PK.lockHolds(c));
  c=PK.cmpApply(c,"b",{emax:70});
  assert.equal(c.a.emax, 70, "other changes are mirrored to A");
  assert.ok(PK.LOCKS.some(l=>l[0]==="hill") && PK.LOCKS.some(l=>l[0]==="emax"));
});

const pdLesson=id=>{ const x=lesson(id); return Object.assign(x, {tg:x.L.view.etgt}); };

test("lesson: potency (EC50)", ()=>{
  const {base,cur,T,tg}=pdLesson("potency"), a=PK.effectStats(base,T,tg), b=PK.effectStats(cur,T,tg);
  sampleTimes.forEach(t=> assert.equal(PK.conc(base,t), PK.conc(cur,t)));
  near(a.peak, 88, 0.5); near(b.peak, 64, 0.5); near(a.tAbove, 11.3, 0.05); near(b.tAbove, 3.3, 0.05);
  const four=PK.normalizeScenario(Object.assign({}, cur, {D:2000}));
  sampleTimes.forEach(t=> near(PK.effectOf(four,PK.conc(four,t)), PK.effectOf(base,PK.conc(base,t)), 1e-9, `4× the dose matches, t=${t}`));
});

test("lesson: efficacy (Emax)", ()=>{
  const {base,cur,T,tg}=pdLesson("efficacy"), a=PK.effectStats(base,T,tg), b=PK.effectStats(cur,T,tg);
  near(a.peak, 88, 0.5); near(a.tAbove, 6.5, 0.05);
  near(b.peak, 53, 0.5); assert.equal(b.tAbove, 0); assert.equal(b.onset, null);
  const big=PK.effectStats(PK.normalizeScenario(Object.assign({}, cur, {D:2000})),T,tg);
  near(big.peak, 58, 0.5, "2,000 mg only reaches 58%"); assert.equal(big.tAbove, 0);
});

test("lesson: Hill slope", ()=>{
  const {base,cur,T,tg}=pdLesson("hill"), k=PK.keOf(cur);
  [base,cur].forEach(p=> near(PK.effectStats(p,T,50).tAbove, 7.3, 0.05, "both cross 50% at 7.3 h"));
  near(PK.effectStats(base,T,tg).peak, 78, 0.5); assert.equal(PK.effectStats(base,T,tg).tAbove, 0);
  near(PK.effectStats(cur,T,tg).peak, 99, 0.5); near(PK.effectStats(cur,T,tg).tAbove, 5.3, 0.05);
  near(Math.log(PK.concForEffect(cur,90)/PK.concForEffect(cur,10))/k, 6.3, 0.05, "90% → 10% in 6.3 h");
  near(Math.log(PK.concForEffect(base,90)/PK.concForEffect(base,10))/k, 25, 0.5, "25 h with n = 1");
});

test("lesson: dose vs duration of effect", ()=>{
  const {base,cur,T,tg}=pdLesson("pdose"), a=PK.effectStats(base,T,tg), b=PK.effectStats(cur,T,tg);
  near(a.peak, 78, 0.5); near(b.peak, 88, 0.5);
  near(a.tAbove, 7.3, 0.05); near(b.tAbove, 11.3, 0.05);
  near(b.tAbove-a.tAbove, Math.LN2/PK.keOf(cur), 1e-6, "exactly one half-life");
  near(PK.effectStats(PK.normalizeScenario(Object.assign({}, cur, {D:2000})),T,tg).peak, 93, 0.5);
});

/* ---------- the exponential-sum engine ---------- */

// A two-term body (fast and slow phase), the shape a two-compartment model will have.
const twoTerms=[{c:1/20, k:0.9}, {c:1/80, k:0.08}];
const simpson=(f,a,b,n=4000)=>{ if(b<=a) return 0; const h=(b-a)/n; let s=f(a)+f(b); for(let i=1;i<n;i++) s+=(i%2?4:2)*f(a+i*h); return s*h/3; };

test("a one-compartment body is a single exponential term", ()=>{
  const p=scenario({V:40, thalf:5, clFn:80, wt:84});
  assert.deepEqual(PK.disposition(p), [{c:1/PK.vOf(p), k:PK.keOf(p)}]);
  rel(1/PK.aucPerMg(PK.disposition(p)), PK.keOf(p)*PK.vOf(p), 1e-12, "CL = kₑ·V");
  rel(PK.derived(p).CL, PK.keOf(p)*PK.vOf(p), 1e-12);
});

test("oral and infusion responses match numerical convolution for a two-term body", ()=>{
  const ka=1.3, Ti=3;
  [0.5,2,3,7,20].forEach(t=>{
    rel(PK.oralResp(twoTerms,t,ka), simpson(u=>ka*Math.exp(-ka*u)*PK.bolusResp(twoTerms,t-u),0,t), 1e-9, `oral, t=${t}`);
    rel(PK.infResp(twoTerms,t,Ti), simpson(u=>PK.bolusResp(twoTerms,t-u)/Ti,0,Math.min(t,Ti)), 1e-9, `infusion, t=${t}`);
  });
  rel(PK.aucPerMg(twoTerms), 1/20/0.9+1/80/0.08, 1e-12, "AUC per mg is Σ c/k");
  rel(simpson(t=>PK.bolusResp(twoTerms,t),0,400,20000), PK.aucPerMg(twoTerms), 1e-6, "…which the curve integrates to");
});

test("kₐ equal to one disposition rate stays exact", ()=>{
  const ka=0.9;   // the first term's rate
  [1,4,10].forEach(t=> rel(PK.oralResp(twoTerms,t,ka), simpson(u=>ka*Math.exp(-ka*u)*PK.bolusResp(twoTerms,t-u),0,t), 1e-9, `t=${t}`));
  near(PK.oralResp(twoTerms,4,ka+2e-6), PK.oralResp(twoTerms,4,ka), 1e-6, "continuous across the switch to the limit");
});

/* ---------- guards and the short-vs-long infusion lesson ---------- */

test("garbled PD settings in a link are clamped, never NaN or Infinity", ()=>{
  ["ec50:abc,hill:NaN,e0:Infinity,emax:-Infinity", "ec50:1e999,hill:-3,e0:1e9,emax:0", "ec50:,hill:,e0:,emax:"].forEach(raw=>{
    const p=PK.decodeScenario(raw);
    PK.PD_KEYS.forEach(k=> assert.ok(Number.isFinite(p[k]), `${k} from "${raw}"`));
    assert.ok(p.e0+p.emax<=100);
    [0,1e-9,0.5,4,1e6].forEach(c=> assert.ok(Number.isFinite(PK.effectOf(p,c)), `effect at ${c}`));
  });
});

test("effect metrics stay finite across random scenarios and every target", ()=>{
  let seed=7; const rnd=()=>{ seed=(seed*16807)%2147483647; return seed/2147483647; };
  for(let i=0;i<60;i++){
    const p=PK.normalizeScenario(scenario({route:["oral","iv","inf"][i%3], dosing:["single","repeated"][i%2], D:25+rnd()*1975,
      thalf:0.5+rnd()*23.5, ec50:0.1+rnd()*99.9, hill:0.5+rnd()*4.5, emax:5+rnd()*95, e0:rnd()*50}));
    [1,25,50,75,99].forEach(tg=>{
      const e=PK.effectStats(p,48,tg);
      assert.ok(Number.isFinite(e.peak) && Number.isFinite(e.tPeak) && Number.isFinite(e.tAbove), `scenario ${i}, target ${tg}`);
      assert.ok(e.tAbove>=0 && e.tAbove<=48+1e-9);
      assert.ok(e.onset===null || (e.onset>=0 && e.onset<=48));
      assert.ok(e.ct===null || Number.isFinite(e.ct));
    });
  }
});

test("lesson: short vs long infusion", ()=>{
  const {base,cur,T,mtc}=lesson("infdur"), a=stats(base,T,0,mtc), b=stats(cur,T,0,mtc);
  near(base.D/base.tinf, 2000, 1e-9, "2,000 mg/h"); near(cur.D/cur.tinf, 250, 1e-9, "250 mg/h");
  near(a.cmax, 19.8, 0.05, "short: 19.8 mg/L"); near(a.tmax, 0.5, 1e-9, "at 0.5 h");
  near(a.tAbove, 0.8, 0.05, "0.8 h above the MTC line");
  near(b.cmax, 16.3, 0.05, "long: 16.3 mg/L"); near(b.tmax, 4, 1e-9, "at 4 h"); assert.equal(b.tAbove, 0);
  const reach=(p,level)=>{ for(let t=0;t<=12;t+=0.001) if(PK.conc(p,t)>=level) return t; return null; };
  near(reach(base,10), 0.25, 0.01, "10 mg/L at 0.25 h"); near(reach(cur,10), 2.2, 0.05, "and at 2.2 h");
  near(PK.derived(base).auc, 176.7, 0.05, "AUC 176.7"); rel(PK.derived(cur).auc, PK.derived(base).auc, 1e-12, "the same AUC");
  const eight=PK.normalizeScenario(Object.assign({}, cur, {tinf:8}));
  assert.ok(stats(eight,T).cmax < b.cmax && stats(eight,T).tmax > b.tmax, "8 h: lower and later");
  rel(PK.derived(eight).auc, PK.derived(cur).auc, 1e-12, "and still the same AUC");
});

/* ---------- lessons: objective, prediction, challenge, why it matters ---------- */

test("every lesson has an objective, a prediction, a challenge and why it matters, in a known group", ()=>{
  const groups=PK.LESSON_GROUPS.map(g=>g.id), ids=new Set();
  PK.LESSONS.forEach(L=>{
    assert.ok(!ids.has(L.id), `duplicate id ${L.id}`); ids.add(L.id);
    assert.ok(groups.includes(L.group), `${L.id}: group`);
    assert.ok(typeof L.objective==="string" && L.objective.length>20, `${L.id}: objective`);
    const P=L.predict;
    assert.ok(typeof P.q==="string" && Array.isArray(P.choices) && P.choices.length>=2 && P.choices.length<=4, `${L.id}: question and choices`);
    assert.ok(Number.isInteger(P.answer) && P.answer>=0 && P.answer<P.choices.length, `${L.id}: answer index`);
    assert.ok(typeof P.why==="string" && typeof P.decide==="function" && typeof P.show==="function", `${L.id}: why, decide, show`);
    assert.ok(typeof L.challenge.text==="string" && typeof L.challenge.goal==="function" && L.challenge.solution && typeof L.challenge.solution==="object", `${L.id}: challenge`);
    assert.ok(typeof L.matters==="string" && L.matters.length>20, `${L.id}: why it matters`);
  });
  // grouped order: each group's lessons sit together, in the groups' order, and every group has one
  const order=PK.LESSONS.map(L=>groups.indexOf(L.group));
  assert.deepEqual(order, order.slice().sort((a,b)=>a-b));
  groups.forEach(g=> assert.ok(PK.LESSONS.some(L=>L.group===g), `group ${g} has a lesson`));
});

test("every prediction's answer is the one the model gives", ()=>{
  PK.LESSONS.forEach(L=>{
    const m=PK.lessonCheck(L);
    assert.equal(L.predict.decide(m), L.predict.answer, `${L.id}: "${L.predict.choices[L.predict.answer]}"`);
    assert.ok(!/NaN|undefined|null|Infinity/.test(L.predict.show(m)), `${L.id}: ${L.predict.show(m)}`);
  });
});

test("every challenge starts unmet and is met by its stated solution", ()=>{
  PK.LESSONS.forEach(L=>{
    assert.equal(PK.challengeMet(L, PK.lessonScenario(L)), false, `${L.id}: not met when the lesson opens`);
    assert.equal(PK.challengeMet(L, PK.lessonScenario(L, L.challenge.solution)), true, `${L.id}: met by ${JSON.stringify(L.challenge.solution)}`);
  });
});

test("challenges hold their conditions, not just the headline number", ()=>{
  const L=id=>PK.LESSONS.find(x=>x.id===id);
  assert.equal(PK.challengeMet(L("vd"), PK.lessonScenario(L("vd"),{D:1800, V:40})), false, "V must stay at 60 L");
  assert.equal(PK.challengeMet(L("potency"), PK.lessonScenario(L("potency"),{D:2000, ec50:2})), false, "EC50 must stay at 8");
  assert.equal(PK.challengeMet(L("split"), PK.lessonScenario(L("split"),{D:300, tau:8, nDoses:15})), false, "600 mg a day, not 900");
  assert.equal(PK.challengeMet(L("ldinf"), PK.lessonScenario(L("ldinf"),{events:[{t:0,mg:400,route:"iv"},{t:0,mg:1456}]})), false, "the bolus must be under 350 mg");
  assert.equal(PK.challengeMet(L("spacing"), PK.lessonScenario(L("spacing"),{events:[{t:0,mg:500},{t:6,mg:500},{t:12,mg:500},{t:18,mg:500}]})), false, "eight 250 mg doses");
});

test("lesson: evenly spaced vs bunched doses", ()=>{
  const {base,cur,T,mec,mtc}=lesson("spacing"), a=stats(base,T,mec,mtc), b=stats(cur,T,mec,mtc);
  assert.deepEqual([base.events.length, cur.events.length], [8, 8]);
  assert.ok(base.events.concat(cur.events).every(e=>e.mg===250 && e.route==="oral"));
  near(100*a.tIn/T, 99, 0.5, "evenly: in the window 99% of the time"); near(a.cmax, 7.7, 0.05, "peaking at 7.7 mg/L");
  near(b.cmax, 13.9, 0.05, "bunched: 13.9 mg/L"); near(b.tAbove, 4.9, 0.05, "4.9 h above the MTC line");
  near(PK.conc(cur,23.99), 0.85, 0.005, "0.85 mg/L before the next day's first dose"); near(b.tBelow, 10.3, 0.05, "10.3 h below the MEC");
  near(PK.derived(base).auc, 296.8, 0.05, "AUC 296.8"); rel(PK.derived(cur).auc, PK.derived(base).auc, 1e-12, "identical AUC");
});

test("lesson and template wording stays descriptive", ()=>{
  const words=/\b(safe|unsafe|best|recommended?)\b/i;
  PK.LESSONS.forEach(L=>{
    [L.title, L.sum, L.text, L.tryThis, L.objective, L.predict.q, L.predict.why, ...L.predict.choices, L.challenge.text, L.matters]
      .forEach(t=> assert.ok(!words.test(t), `${L.id}: "${t}"`));
  });
  PK.TEMPLATES.forEach(t=> [t.title, t.nameA, t.nameB, t.look].forEach(x=> assert.ok(!words.test(x), `${t.id}: "${x}"`)));
});

/* ---------- practice problems ---------- */
// Every generator, over many seeds: the answer is what the simulation gives for the problem's own scenario,
// that scenario fits the model's ranges, and the worked solution ends on the answer.
const SEEDS=Array.from({length:60},(_,i)=>(i+1)*104729);
const everyProblem=fn=> PK.PRACTICE.forEach(g=> SEEDS.forEach(seed=> fn(PK.makeProblem({id:g.id, seed}), g)));

test("every practice topic has problems, and every problem a known topic", ()=>{
  const topics=PK.PRACTICE_TOPICS.map(t=>t.id);
  PK.PRACTICE.forEach(g=> assert.ok(topics.includes(g.topic), g.id));
  topics.forEach(t=> assert.ok(PK.PRACTICE.filter(g=>g.topic===t).length>=3, `${t} has at least 3 kinds`));
  assert.equal(new Set(PK.PRACTICE.map(g=>g.id)).size, PK.PRACTICE.length, "ids are unique");
});

test("a seed reproduces a problem, and the topic and kind filters hold", ()=>{
  const a=PK.makeProblem({seed:42}), b=PK.makeProblem({seed:42});
  assert.equal(a.q, b.q); assert.equal(a.ans, b.ans);
  PK.PRACTICE_TOPICS.forEach(t=> SEEDS.slice(0,20).forEach(seed=> assert.equal(PK.makeProblem({topic:t.id, seed}).topic, t.id)));
  assert.equal(PK.makeProblem({id:"rac", seed:1}).id, "rac");
  SEEDS.slice(0,20).forEach(seed=> assert.notEqual(PK.makeProblem({topic:"pd", not:"effc", seed}).id, "effc"));
  assert.equal(PK.makeProblem({topic:"nope"}), null);
});

test("every practice answer is what the simulation gives for the problem's scenario", ()=>{
  everyProblem((pr,g)=>{
    assert.ok(Number.isFinite(pr.ans) && pr.ans>0, `${g.id} seed ${pr.seed}: answer ${pr.ans}`);
    rel(pr.check(PK.practiceScenario(pr)), pr.ans, 2e-3, `${g.id} seed ${pr.seed}`);
  });
});

test("practice scenarios fit the model's ranges and keep the asked-about moment in view", ()=>{
  everyProblem((pr,g)=>{
    const p=PK.practiceScenario(pr), where=`${g.id} seed ${pr.seed}`;
    Object.entries(pr.viz).forEach(([k,v])=>{
      if(k==="events"){
        assert.equal(p.events.length, v.length, `${where}: events kept`);
        v.forEach((e,i)=> near(p.events[i].mg, e.mg, 0.05, `${where}: event ${i} amount`));
        return;
      }
      if(PK.RANGES[k]) assert.ok(v>=PK.RANGES[k][0] && v<=PK.RANGES[k][1], `${where}: ${k}=${v} outside ${PK.RANGES[k]}`);
      assert.equal(p[k], v, `${where}: ${k} unchanged by normalizing`);
    });
    const [lo,hi]=PK.VIEW_RANGES.duration;
    assert.ok(pr.view.duration>=lo && pr.view.duration<=hi, `${where}: window ${pr.view.duration}`);
    if(pr.at!==undefined) assert.ok(pr.at>=0 && pr.at<=pr.view.duration, `${where}: cursor at ${pr.at} in a ${pr.view.duration} h window`);
    if(p.dosing==="repeated") assert.ok(p.nDoses*p.tau<=pr.view.duration, `${where}: every dose in view`);
    assert.equal(pr.view.pd, g.topic==="pd", `${where}: effect charts on for concentration–effect problems only`);
  });
});

test("worked solutions end on the answer, as the checker shows it", ()=>{
  everyProblem((pr,g)=>{
    const shown=String(+pr.ans.toFixed(pr.dp));
    assert.ok(pr.sol.join("").includes(`<b>${shown}`), `${g.id} seed ${pr.seed}: solution doesn't show ${shown}`);
    assert.ok(pr.q.length>20 && pr.type && pr.unit, `${g.id}: question, type and unit`);
  });
});

test("the practice checker accepts rounded answers and rejects a 5% miss", ()=>{
  everyProblem((pr,g)=>{
    assert.ok(PK.practiceCorrect(pr, pr.ans), g.id);
    assert.ok(PK.practiceCorrect(pr, +pr.ans.toFixed(pr.dp)), `${g.id}: the answer as shown`);
    if(pr.ans*0.05>Math.pow(10,-pr.dp)/2) assert.ok(!PK.practiceCorrect(pr, pr.ans*1.05), `${g.id} seed ${pr.seed}: 5% high`);
  });
  const pr=PK.makeProblem({id:"ct", seed:7});
  assert.ok(!PK.practiceCorrect(pr, NaN)); assert.ok(!PK.practiceCorrect(pr, "3")); assert.ok(!PK.practiceCorrect(pr, Infinity));
});

test("practice wording stays descriptive", ()=>{
  const words=/\b(safe|unsafe|best|recommended?|patient)\b/i;
  everyProblem((pr,g)=> [pr.type, pr.q, ...pr.sol].forEach(t=> assert.ok(!words.test(t), `${g.id}: "${t}"`)));
});

test("steady-state practice problems chart a regimen within 0.1% of steady state", ()=>{
  // mean over [t0, t1] (Simpson's rule), of the regimen as charted and of the exact steady state
  const simpson=(f,t0,t1)=>{ const N=400, h=(t1-t0)/N; let s=0; for(let i=0;i<=N;i++) s+=f(i===N ? t1-1e-9 : t0+i*h)*(i===0||i===N ? 1 : i%2 ? 4 : 2); return s*h/3/(t1-t0); };
  SEEDS.forEach(seed=>{
    let pr=PK.makeProblem({id:"trough", seed}), p=PK.practiceScenario(pr);
    assert.equal(pr.at, p.nDoses*p.tau, "the cursor sits on the last trough");
    rel(PK.conc(p, pr.at-1e-9), pr.ans, 1e-3, `trough seed ${seed}: the charted trough`);
    ["cavg","mdose"].forEach(id=>{
      pr=PK.makeProblem({id, seed}); p=PK.practiceScenario(pr);
      const t1=p.nDoses*p.tau, charted=simpson(t=>PK.conc(p,t), t1-p.tau, t1), ss=simpson(s=>PK.ssConc(p,s), 0, p.tau);
      rel(charted, ss, 1e-3, `${id} seed ${seed}: the last interval's mean`);
      if(id==="cavg") rel(ss, pr.ans, 1e-3, `cavg seed ${seed}`);
    });
    pr=PK.makeProblem({id:"rate", seed}); p=PK.practiceScenario(pr);
    const R0=p.D/p.tinf, long=PK.scenario(Object.assign({},p,{tinf:500, D:R0*500}));
    rel(PK.conc(p,p.tinf), PK.conc(long,500), 1e-3, `rate seed ${seed}: the level at the end of the infusion`);
  });
});

/* ---------- fit the data ---------- */
const FIT_SEEDS=Array.from({length:120},(_,i)=>i*7919+3);
const eachFit=fn=> PK.FIT_KINDS.forEach(k=> FIT_SEEDS.forEach(seed=> fn(PK.makeFit({kind:k.id, seed}), k)));
const fitGood=(f,over)=> PK.fitStatus(f, PK.fitScenario(f,over)).good;

test("fit data: reproducible, on the sliders' steps, and measured inside the window", ()=>{
  const a=PK.makeFit({kind:"oral", seed:9}), b=PK.makeFit({kind:"oral", seed:9});
  assert.deepEqual(a.obs, b.obs); assert.deepEqual(a.truth, b.truth);
  eachFit((f,k)=>{
    const T=f.truth, where=`${k.id} seed ${f.seed}`;
    assert.equal(T.thalf%0.5, 0, `${where}: t½ on a 0.5 h step`);
    assert.ok(Number.isInteger(T.V), `${where}: V on a 1 L step`);
    ["thalf","V","D"].concat(k.id==="oral" ? ["F","ka"] : []).forEach(key=>
      assert.ok(T[key]>=PK.RANGES[key][0] && T[key]<=PK.RANGES[key][1], `${where}: ${key}=${T[key]}`));
    if(k.id==="oral") assert.ok(Math.abs(T.ka/0.05-Math.round(T.ka/0.05))<1e-9, `${where}: kₐ on a 0.05 step`);
    assert.ok(f.obs.length>=6, `${where}: at least 6 points`);
    f.obs.forEach((o,i)=>{
      assert.ok(o.t>=0.25 && o.t<=f.view.duration && o.c>0, `${where}: point ${i}`);
      if(i) assert.ok(o.t>f.obs[i-1].t, `${where}: times ascending`);
      assert.equal(o.c, +o.c.toPrecision(3), `${where}: 3 significant figures`);
    });
    assert.ok(f.view.duration<=PK.VIEW_RANGES.duration[1]);
  });
});

test("fit data: the settings that made the data fit; the start and 20% misses don't", ()=>{
  eachFit((f,k)=>{
    const T=f.truth, where=`${k.id} seed ${f.seed}`;
    assert.ok(fitGood(f), `${where}: the data's own settings`);
    assert.ok(!fitGood(f, f.start), `${where}: the starting sliders`);
    [{thalf:T.thalf*1.2},{thalf:T.thalf/1.2},{V:T.V*1.2},{V:T.V/1.2}].forEach(o=>
      assert.ok(!fitGood(f,o), `${where}: ${JSON.stringify(o)}`));
    const s=PK.fitStatus(f, PK.fitScenario(f));
    assert.ok(s.floor>0 && s.floor<15 && s.target===s.floor+4, `${where}: scatter ${s.floor}`);
  });
});

test("fit data: a different dose, route or physiology is a setup mismatch, never a good fit", ()=>{
  const f=PK.makeFit({kind:"iv", seed:5});
  [{D:f.truth.D+100},{route:"oral"},{dosing:"repeated"},{wt:80},{clFn:50}].forEach(o=>{
    const s=PK.fitStatus(f, PK.fitScenario(f,o));
    assert.equal(s.mismatch, "setup", JSON.stringify(o)); assert.ok(!s.good);
  });
  const g=PK.makeFit({kind:"oral", seed:5});
  [{F:g.truth.F===1 ? 0.9 : 1},{ka:g.truth.ka+0.1}].forEach(o=> assert.equal(PK.fitStatus(g, PK.fitScenario(g,o)).mismatch, "setup"));
});

test("fit error is zero on exact data and grows with the misfit", ()=>{
  const f=PK.makeFit({kind:"iv", seed:1}), p=PK.fitScenario(f);
  const exact=f.obs.map(o=>({t:o.t, c:PK.conc(p,o.t)}));
  near(PK.fitError(p, exact), 0, 1e-9);
  near(PK.fitError(p, exact.map(o=>({t:o.t, c:o.c*Math.exp(0.1)}))), 10, 1e-9, "a uniform 10% log offset reads 10%");
  const e1=PK.fitError(PK.fitScenario(f,{thalf:f.truth.thalf*1.1}), exact), e2=PK.fitError(PK.fitScenario(f,{thalf:f.truth.thalf*1.3}), exact);
  assert.ok(e2>e1 && e1>0);
});

test("estimates made from the data by hand land near the settings that made it", ()=>{
  eachFit((f,k)=>{
    const e=PK.fitEstimate(f), tol=k.id==="iv" ? 0.12 : 0.25, where=`${k.id} seed ${f.seed}`;
    rel(e.thalf, f.truth.thalf, tol, `${where}: t½`);
    rel(e.V, f.truth.V, tol, `${where}: V`);
  });
  // on exact data the IV line gives the settings back exactly
  const f=PK.makeFit({kind:"iv", seed:2}), p=PK.fitScenario(f);
  const e=PK.fitEstimate(Object.assign({}, f, {obs:f.obs.map(o=>({t:o.t, c:PK.conc(p,o.t)}))}));
  rel(e.thalf, f.truth.thalf, 1e-9); rel(e.V, f.truth.V, 1e-9);
});
