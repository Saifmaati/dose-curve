// Run with: node --test
// Antimicrobial PK/PD indices (micStats): fT>MIC on the unbound level, Cmax/MIC and AUC24/MIC, against closed forms,
// limits and the independent solver; piperacillin-tazobactam in the library; the v9 links that carry fu, the MIC and
// doses above 2,000 mg; the two lessons (every number they state); the practice kinds; and the reduced-CrCl case.
const test=require("node:test");
const assert=require("node:assert/strict");
const PK=require("../pk-engine.js");
const C=require("../cases.js");
const {scenario}=PK;

const near=(actual, expected, tol, msg)=>
  assert.ok(Math.abs(actual-expected)<=tol, `${msg?msg+": ":""}expected ${expected} ± ${tol}, got ${actual}`);
const rel=(actual, expected, frac, msg)=> near(actual, expected, Math.abs(expected)*frac, msg);
const S=o=> PK.normalizeScenario(scenario(o));
const REF=require("../validation/reference-results.json");
const rnd=(seed=>()=>{ seed=(seed*16807)%2147483647; return (seed-1)/2147483646; })(20260930);
const between=(a,b)=> a+(b-a)*rnd();

/* ---------- closed forms and limits ---------- */

test("IV bolus at steady state: fT>MIC = ln(C0,ss / (MIC/fu)) / kₑ, capped at τ, over τ", ()=>{
  for(let i=0;i<200;i++){
    const D=Math.round(between(100,2000)), V=+between(10,80).toFixed(1), th=+between(0.5,12).toFixed(2), tau=[4,6,8,12,24][i%5], fu=+between(0.1,1).toFixed(2);
    const p=S({route:"iv", dosing:"repeated", D, V, thalf:th, tau, nDoses:6, fu}), k=Math.LN2/th, c0=D/V/(1-Math.exp(-k*tau)), tr=c0*Math.exp(-k*tau);
    const mic=fu*between(0.3*tr, 1.3*c0), thr=mic/fu, m=PK.micStats(p, mic, 48), where=JSON.stringify({D,V,th,tau,fu,mic});
    const t=thr>=c0 ? 0 : thr<=tr ? tau : Math.log(c0/thr)/k;
    near(m.ft, 100*t/tau, 1e-7, where);
    assert.equal(m.ss, true); rel(m.cmax, c0, 1e-12, "the peak is C0,ss"); rel(m.cmin, tr, 1e-7, "the trough (read 1e-9 h before the next dose)");
    rel(m.auc24, D*24/tau/(k*V), 1e-8, "AUC24 = daily dose / CL");
  }
});

test("continuous infusion (T·inf = τ, or longer): exactly 100% when fu·Css > MIC, exactly 0% when below", ()=>{
  [[1000,8],[3000,6],[500,12],[2000,24]].forEach(([D,tau])=>{
    [1,2].forEach(mult=>{
      const p=S({route:"inf", dosing:"repeated", D, tau, tinf:tau*mult, thalf:2, V:20, nDoses:10, fu:0.6}), css=D/tau/(Math.LN2/2*20);
      const m=PK.micStats(p, 0.6*css*0.999, 48), z=PK.micStats(p, 0.6*css*1.001, 48);
      assert.equal(m.ft, 100, `${D} q${tau} over ${tau*mult} h: above`); assert.equal(z.ft, 0, "below");
      rel(m.cmax, css, 1e-9, "the level holds at Css"); rel(m.auc24, 24*css, 1e-9);
    });
  });
});

test("1-compartment infusion at steady state: the rise and the fall each cross the threshold where the closed form says", ()=>{
  for(let i=0;i<100;i++){
    const D=Math.round(between(200,4000)), V=+between(10,60).toFixed(1), th=+between(0.6,6).toFixed(2), tau=[6,8,12][i%3], Ti=+between(0.25,0.8*tau).toFixed(2), fu=+between(0.4,1).toFixed(2);
    const k=Math.LN2/th, CL=k*V, R=D/Ti, ex=x=>Math.exp(-k*x);
    const peak=R/CL*(1-ex(Ti))/(1-ex(tau)), tr=peak*ex(tau-Ti), thr=between(tr*1.05, peak*0.95), mic=thr*fu;
    // rising: C(s) = R/CL − (R/CL − Ctr)·e^(−ks), so the crossing is at s = ln((R/CL − Ctr)/(R/CL − thr)) / k; falling from the peak
    const up=Math.log((R/CL-tr)/(R/CL-thr))/k, down=Ti+Math.log(peak/thr)/k;
    const m=PK.micStats(S({route:"inf", dosing:"repeated", D, V, thalf:th, tau, tinf:Ti, nDoses:8, fu}), mic, 48);
    near(m.ft, 100*(down-up)/tau, 1e-7, JSON.stringify({D,V,th,tau,Ti,fu}));
    rel(m.cmax, peak, 1e-10, "the peak is at the end of the infusion");
  }
});

test("indices scale as they should: Cmax/MIC and AUC24/MIC halve when the MIC doubles; fu matters only to fT>MIC; unbound versions are fu × total", ()=>{
  const p=S({route:"oral", dosing:"repeated", D:500, F:0.8, ka:1.1, thalf:3, V:30, tau:8, nDoses:8, fu:0.5});
  const a=PK.micStats(p, 1, 48), b=PK.micStats(p, 2, 48), q=PK.micStats(Object.assign({}, p, {fu:1}), 2, 48);
  rel(b.cmaxMic, a.cmaxMic/2, 1e-12); rel(b.aucMic, a.aucMic/2, 1e-12);
  near(PK.micStats(Object.assign({}, p, {fu:1}), 2*0.5, 48).ft, PK.micStats(p, 0.5*1, 48).ft, 1e-12, "fT>MIC at fu 0.5 is fT above 2·MIC at fu 1");
  near(q.ft, PK.micStats(p, 1, 48).ft, 1e-12, "MIC 2 with fu 1 is MIC 1 with fu 0.5");
  rel(a.fcmaxMic, 0.5*a.cmaxMic, 1e-15); rel(a.faucMic, 0.5*a.aucMic, 1e-15);
  rel(a.auc24, 24*0.8*500/(Math.LN2/3*30)/8, 1e-8, "oral AUC24 = F·daily dose / CL");
  // fT>MIC falls as the MIC rises
  let last=101; [0.5,1,2,4,8,16].forEach(mic=>{ const f=PK.micStats(p, mic, 48).ft; assert.ok(f<=last, `MIC ${mic}`); last=f; });
  assert.equal(PK.micStats(p, 0, 48), null, "no MIC, no indices");
});

test("loading and missed doses don't change the steady state; a single dose or a custom schedule is read over the window", ()=>{
  const base={route:"inf", dosing:"repeated", D:1000, tau:8, tinf:0.5, thalf:1, V:17, nDoses:6, fu:0.98};
  const m=PK.micStats(S(base), 2, 48);
  [{loadMult:2},{missed:3}].forEach(o=> assert.deepEqual(PK.micStats(S(Object.assign({}, base, o)), 2, 48), m, JSON.stringify(o)));
  const single=S(Object.assign({}, base, {dosing:"single"})), w=PK.windowStats(single, 24, 2/0.98, Infinity), s=PK.micStats(single, 2, 24);
  assert.equal(s.ss, false); near(s.ft, 100*w.tIn/24, 1e-12); near(s.cmax, w.cmax, 1e-12); rel(s.auc24, PK.derived(single).auc, 1e-6, "AUC0–24 of one dose that is gone by 24 h");
  const custom=S({route:"iv", dosing:"custom", V:20, thalf:2, fu:1, events:[{t:0, mg:500}, {t:12, mg:500}]}), cs=PK.micStats(custom, 1, 36);
  const k=Math.LN2/2, c2=25+25*Math.exp(-12*k);   // the second dose lands on what is left of the first
  near(cs.ft, 100*(Math.log(25)/k+Math.log(c2)/k)/36, 1e-6, "two bolus doses, each above the MIC for ln(C0/MIC)/k");
  // a saturable regimen with no steady state is read over the window too
  const mm=S({kin:"mm", route:"oral", dosing:"repeated", D:2000, tau:12, nDoses:6, vmax:7, km:4, V:49});
  assert.equal(PK.micStats(mm, 5, 72).ss, false);
});

test("the independent solver agrees: 12 regimens run to steady state in scipy", ()=>{
  const R=REF.pkpd;
  assert.ok(R && R.scenarios.length>=12, "the reference has the PK/PD section");
  assert.ok(R.scenarios.some(s=>s.scenario.route==="oral") && R.scenarios.some(s=>s.scenario.route==="iv") && R.scenarios.some(s=>s.scenario.cmt===2) && R.scenarios.some(s=>s.scenario.pm==="clinical"));
  assert.ok(R.scenarios.filter(s=>s.reference.ft_pct>0.5 && s.reference.ft_pct<99.5).length>=8, "most cross the MIC within the interval");
  R.scenarios.forEach(s=>{
    const m=PK.micStats(S(s.scenario), s.mic, 24), r=s.reference;
    near(m.ft, r.ft_pct, R.tolerance.ft_pp, `${s.name}: fT>MIC`);
    rel(m.cmaxMic, r.cmax_mic, R.tolerance.ratio, `${s.name}: Cmax/MIC`);
    rel(m.aucMic, r.auc24_mic, R.tolerance.ratio, `${s.name}: AUC24/MIC`);
  });
});

test("compare rows: fT>MIC, Cmax/MIC and AUC24/MIC appear with an MIC, and match micStats", ()=>{
  const a=S({route:"inf", dosing:"repeated", D:3000, tau:6, tinf:0.5, thalf:0.84, V:15.1, nDoses:8, fu:0.7}), b=Object.assign({}, a, {tinf:3});
  assert.ok(!PK.compareRows(a, b, 24, 16, 250, null).rows.some(r=>r.key==="ftmic"), "none without an MIC");
  const rows=PK.compareRows(a, b, 24, 16, 250, null, 16).rows, row=k=> rows.find(r=>r.key===k);
  near(row("ftmic").a, PK.micStats(a,16,24).ft, 1e-12); near(row("ftmic").b, PK.micStats(b,16,24).ft, 1e-12);
  assert.equal(row("ftmic").unit, "% of interval");
  rel(row("aucmic").a, row("aucmic").b, 1e-9, "the same AUC24/MIC");
  assert.ok(row("cmaxmic").a>row("cmaxmic").b);
});

/* ---------- the drug ---------- */

test("piperacillin-tazobactam from its label: clearance 207 mL/min and AUC 242 for 3 g reproduced; 30% bound; 68% renal", ()=>{
  const d=PK.DRUGS.find(x=>x.id==="pip"), p=S(PK.drugScenario(d)), dd=PK.derived(p);
  near(dd.CL*1000/60, 207, 1.5, "CL (mL/min)"); near(dd.auc, 242, 1.5, "AUC per 3 g dose");
  assert.equal(p.D, 3000); assert.equal(p.tau, 6); assert.equal(p.tinf, 0.5); assert.equal(p.fu, 0.7); assert.equal(d.fe, 0.68);
  near(PK.ssPeakTrough(p).peak, 164, 0.5, "the model's peak, stated in the source note"); assert.ok(d.refs.find(r=>r.k==="V").note.includes("164"));
  assert.ok(d.refs.find(r=>r.k==="V").note.includes("(241)")); near(dd.auc, 241, 0.5);
  assert.equal(PK.drugScenario(d).mic, 16, "loading it sets the FDA breakpoint as the MIC");
  assert.equal(d.pkpd.index, "ft"); assert.equal(d.pkpd.lo, undefined, "the label gives no number, so none is set");
  // the indices each antimicrobial names come from a cited source; a numeric target only where its source gives one
  PK.DRUGS.filter(x=>x.pkpd).forEach(x=>{ assert.ok(PK.SOURCES[x.pkpd.src], x.id); assert.ok(["ft","cmax","auc"].includes(x.pkpd.index)); });
  assert.deepEqual(PK.DRUGS.filter(x=>x.pkpd && x.pkpd.lo!=null).map(x=>x.id), ["vanc"]);
  // loading any drug sets fu (1 where the library has none) and the MIC (0 where it has none)
  PK.DRUGS.forEach(x=>{ const s=PK.drugScenario(x); assert.equal(s.fu, x.fu==null ? 1 : x.fu); assert.ok(s.mic>=0); });
});

/* ---------- links ---------- */

test("links: fu, an MIC or a dose above 2,000 mg need v9; older links open exactly as before", ()=>{
  const V=PK.VIEW_DEFAULTS;
  assert.ok(PK.encodeLink({mode:"sim", s:S({}), view:V}).startsWith("v=1&"), "the default is still v1");
  [[S({fu:0.7}), V], [S({}), Object.assign({}, V, {mic:4})], [S({D:3000}), V]].forEach(([s, view])=>{
    const link=PK.encodeLink({mode:"sim", s, view}), back=PK.decodeLink(link);
    assert.ok(link.startsWith("v=9&"), link);
    assert.equal(back.s.fu, s.fu); assert.equal(back.s.D, s.D); assert.equal(back.view.mic, view.mic||0);
  });
  // a v8 link (levels) keeps v8, and every older link decodes without fu or an MIC
  assert.ok(PK.encodeLink({mode:"sim", s:S({pm:"clinical", lv:[{n:2, dt:1, c:5}]}), view:V}).startsWith("v=8&"));
  ["v=1&s=D:400", "v=5&s=pm:clinical,age:70", "v=8&s=pm:clinical,lv:2@1=5"].forEach(h=>{ const st=PK.decodeLink(h); assert.equal(st.s.fu, 1, h); assert.equal(st.view.mic, 0, h); assert.equal(st.newer, false); });
  assert.equal(PK.decodeLink("v=8&s=D:3000").s.D, 2000, "a v8 link is clamped as its page clamped it");
  assert.equal(PK.decodeLink("v=9&s=D:99999&w=mic:-3").s.D, 4000); assert.equal(PK.decodeLink("v=9&s=&w=mic:-3").view.mic, 0);
  assert.equal(PK.decodeLink("v=9&s=fu:0").s.fu, 0.01, "clamped");
  // compare links carry each side's fu and the shared MIC
  const st={mode:"cmp", a:S({fu:0.5}), b:S({fu:0.9, D:3000}), view:Object.assign({}, V, {mic:2}), lock:"", edit:"a", nameA:"", nameB:""};
  const back=PK.decodeLink(PK.encodeLink(st));
  assert.deepEqual([back.a.fu, back.b.fu, back.b.D, back.view.mic], [0.5, 0.9, 3000, 2]);
});

/* ---------- lessons ---------- */

const numbersIn=s=> s.match(/(?<![A-Za-z\d.])\d+(\.\d+)?/g)||[];
function checkNumbers(L, checked){
  numbersIn(L.text).forEach(n=> assert.ok(checked.includes(n), `${L.id}: the text states ${n}, which no assertion checks`));
  numbersIn(L.tryThis).forEach(n=> assert.ok(checked.includes(n), `${L.id}: the tip states ${n}`));
  const t=PK.TEMPLATES.find(x=>x.id===L.id); assert.ok(t && t.lesson===L.id);
  numbersIn(t.look+" "+t.nameA+" "+t.nameB).forEach(n=> assert.ok(checked.includes(n), `${L.id}: the comparison states ${n}`));
  assert.equal(L.group, "abx");
}
const r=(v,dp)=> String(+v.toFixed(dp));

test("lesson: extended infusion (every number the text, tip and comparison state)", ()=>{
  const L=PK.LESSONS.find(x=>x.id==="ptz"), V=Object.assign({}, PK.VIEW_DEFAULTS, L.view), a=S(L.base), b=S(L.cur);
  const ma=PK.micStats(a, V.mic, V.duration), mb=PK.micStats(b, V.mic, V.duration), mc=PK.micStats(S(Object.assign({}, L.cur, {tinf:6})), V.mic, V.duration);
  const lod=PK.micStats(S(Object.assign({}, L.cur, {tinf:4, tau:8})), V.mic, V.duration);
  const d=PK.DRUGS.find(x=>x.id==="pip").s;
  assert.deepEqual([a.thalf, a.V, a.fu, a.D, a.tau, b.tinf, V.mic], [d.thalf, d.V, 0.7, 3000, 6, 3, 16], "the label's values, the FDA breakpoint");
  assert.equal(r(V.mic/0.7,1), "22.9");
  assert.equal(r(ma.cmax,0), "164"); assert.equal(r(ma.cmin,2), "1.75"); assert.equal(r(ma.ft,0), "47");
  assert.equal(r(mb.cmax,0), "74"); assert.equal(r(mb.ft,0), "69");
  assert.equal(r(mc.cmax,1), "40.1"); assert.equal(mc.ft, 100);
  [ma,mb,mc].forEach(m=>{ assert.equal(r(m.auc24,0), "963"); assert.equal(r(m.aucMic,0), "60"); });
  assert.equal(r(lod.ft,0), "57"); assert.equal(3000*24/8/1000, 9);
  checkNumbers(L, ["3.375","6","3","12","0.84","15.1","30","0.7","16","22.9","164","1.75","47","74","69","40.1","100","963","24","60",
    "2007","4","8","9","57"]);
  // the prediction, and the challenge: only a whole-interval infusion keeps the unbound level above the MIC for all of it
  assert.equal(L.predict.decide(PK.lessonCheck(L)), L.predict.answer);
  assert.equal(PK.challengeMet(L, PK.lessonScenario(L, {tinf:5})), false, "5 h leaves a gap");
  assert.equal(PK.challengeMet(L, PK.lessonScenario(L, {tinf:6, D:4000})), false, "3 g, not 4");
  assert.equal(PK.challengeMet(L, PK.lessonScenario(L, {tinf:6})), true);
});

test("lesson: once daily vs divided (every number the text, tip and comparison state)", ()=>{
  const L=PK.LESSONS.find(x=>x.id==="gcmax"), V=Object.assign({}, PK.VIEW_DEFAULTS, L.view), a=S(L.base), b=S(L.cur);
  const ma=PK.micStats(a, V.mic, V.duration), mb=PK.micStats(b, V.mic, V.duration);
  const d=PK.DRUGS.find(x=>x.id==="gent");
  assert.deepEqual([a.thalf, a.V, a.fu, a.D*24/a.tau, b.D*24/b.tau], [d.s.thalf, d.s.V, d.fu, 480, 480]);
  assert.equal(r(mb.cmax,1), "24.9"); assert.equal(r(mb.cmaxMic,1), "24.9"); assert.equal(r(ma.cmaxMic,1), "9.3");
  assert.equal(r(ma.aucMic,0), "96"); assert.equal(r(mb.aucMic,0), "96");
  assert.equal(r(ma.ft,1), "99.5"); assert.equal(r(mb.ft,0), "48"); assert.equal(r(mb.cmin,2), "0.04");
  const ma2=PK.micStats(a, 2, V.duration), mb2=PK.micStats(b, 2, V.duration);
  assert.equal(r(mb2.cmaxMic,1), "12.5"); assert.equal(r(ma2.cmaxMic,1), "4.7"); assert.equal(r(mb2.aucMic,0), "48");
  checkNumbers(L, ["480","2.5","18","0.85","160","8","24","30","1","24.9","9.3","96","99.5","48","0.04","1987","2","12.5","4.7"]);
  assert.equal(L.predict.decide(PK.lessonCheck(L)), L.predict.answer);
  // 480 mg a day kept above the MIC the whole time: every 6 h, or a 24-hour infusion; not 160 mg every 8 h (99.5%)
  [[{D:120, tau:6}, true], [{tinf:24}, true], [{D:160, tau:8}, false], [{D:240, tau:6}, false]].forEach(([o, ok])=>
    assert.equal(PK.challengeMet(L, PK.lessonScenario(L, o)), ok, JSON.stringify(o)));
});

/* ---------- practice ---------- */

test("practice: the antimicrobial topic's three kinds are new in worksheet version 6, so older worksheets don't change", ()=>{
  assert.ok(PK.WS_VERSION>=6);
  const kinds=PK.PRACTICE.filter(g=>g.topic==="abx");
  assert.deepEqual(kinds.map(g=>g.id), ["ftmic","cmaxmic","aucmic"]);
  kinds.forEach(g=> assert.equal(g.since, 6));
  ["","single","pd","liver"].forEach(topic=>{
    const a=PK.makeWorksheet({topic, count:15, seed:99, v:5});
    assert.ok(a.problems.every(p=>p.topic!=="abx"), `v5 sheets have none (${topic||"all"})`);
  });
  assert.ok(PK.makeWorksheet({topic:"abx", count:5, seed:3, v:6}).problems.every(p=>p.topic==="abx"));
  // each answer is the hand formula, and the scenario charts it with the MIC line on
  [1,2,3,4,5].forEach(seed=>{
    const f=PK.makeProblem({id:"ftmic", seed}), p=PK.practiceScenario(f);
    assert.ok(f.view.mic>0 && p.fu<=1 && p.route==="iv");
    const k=Math.LN2/p.thalf, c0=p.D/p.V/(1-Math.exp(-k*p.tau));
    rel(f.ans, 100*Math.log(c0*p.fu/f.view.mic)/k/p.tau, 1e-12, `ftmic ${seed}`);
    assert.ok(f.ans>0 && f.ans<100, "the threshold is crossed inside the interval");
  });
});
