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
  const view={duration:96, mec:4, mtc:16, scale:"log", zoom:"last"};
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
});

test("steady state stays within 0.5% even in the slowest-clearing regimen", ()=>{
  // longest half-life, lowest organ function, shortest interval: the case the 400-dose cap limits most
  const p=scenario({route:"iv", dosing:"repeated", thalf:24, clFn:25, tau:2, nDoses:20});
  const k=PK.keOf(p), C0=p.D/PK.vOf(p);
  rel(PK.ssProfile(p).ssTrough, C0*Math.exp(-k*2)/(1-Math.exp(-k*2)), 0.005);
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
  assert.deepEqual(i.last, {t:0, mg:500, count:1, loading:false});
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
  assert.deepEqual(PK.inspectAt(p,4,2,12).last, {t:0, mg:500, count:2, loading:true});
  const after=PK.inspectAt(p,20,2,12);
  assert.equal(after.last.t, 8, "the missed 16 h dose isn't the last dose");
  assert.equal(after.since, 12);
  assert.deepEqual(after.missedSince, [16]);
  assert.deepEqual(PK.inspectAt(p,12,2,12).next, {t:16, mg:500, missed:true}, "the next scheduled dose is shown even if missed");
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
  view:{duration:72, mec:3, mtc:15, scale:"lin", zoom:"full"}});
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
