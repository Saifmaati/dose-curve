// Run with: node --test
// v1.0 clinical layer: Cockcroft–Gault, ideal and adjusted body weight, renal scaling of clearance, units,
// the salt factor, the cited drug library and the v5 links that carry all of it.
const test=require("node:test");
const assert=require("node:assert/strict");
const PK=require("../pk-engine.js");
const {scenario}=PK;

const near=(actual, expected, tol, msg)=>
  assert.ok(Math.abs(actual-expected)<=tol, `${msg?msg+": ":""}expected ${expected} ± ${tol}, got ${actual}`);
const rel=(actual, expected, frac, msg)=> near(actual, expected, Math.abs(expected)*frac, msg);
const drug=id=> PK.DRUGS.find(d=>d.id===id);
const drugP=(id, over)=> PK.normalizeScenario(scenario(Object.assign(PK.drugScenario(drug(id)), over||{})));

/* ---------- the plan's hand-computed values ---------- */

test("Cockcroft–Gault: 65-year-old, 70 kg, SCr 1.0 mg/dL gives 72.9 mL/min (man) and 62.0 mL/min (woman)", ()=>{
  assert.equal(PK.crclCG(65,70,1.0,"M").toFixed(1), "72.9");
  assert.equal(PK.crclCG(65,70,1.0,"F").toFixed(1), "62.0");
  near(PK.crclCG(65,70,1.0,"M"), 75*70/72, 1e-12, "(140 − age) × weight / (72 × SCr)");
  rel(PK.crclCG(65,70,1.0,"F"), 0.85*PK.crclCG(65,70,1.0,"M"), 1e-12, "× 0.85 for women");
  rel(PK.crclCG(65,70,2.0,"M"), PK.crclCG(65,70,1.0,"M")/2, 1e-12, "inversely proportional to SCr");
});

test("Devine ideal body weight: 70-inch man 73.0 kg, 65-inch woman 57.0 kg; adjusted weight is IBW + 0.4 × (actual − IBW)", ()=>{
  assert.equal(PK.ibwDevine("M",70).toFixed(1), "73.0");
  assert.equal(PK.ibwDevine("F",65).toFixed(1), "57.0");
  assert.equal(PK.ibwDevine("M",60), 50); assert.equal(PK.ibwDevine("F",60), 45.5);
  near(PK.adjBW(73,120), 73+0.4*47, 1e-12);
  near(PK.cmToIn(177.8), 70, 1e-12, "height is entered in cm");
  // the patient's CrCl uses the weight chosen
  const base={pm:"clinical", age:65, sex:"M", ht:177.8, scr:1, wt:120};
  near(PK.patientOf(scenario(base)).crcl, PK.crclCG(65,120,1,"M"), 1e-9, "actual");
  near(PK.patientOf(scenario(Object.assign({},base,{wtm:"ibw"}))).crcl, PK.crclCG(65,73,1,"M"), 1e-9, "ideal");
  near(PK.patientOf(scenario(Object.assign({},base,{wtm:"adj"}))).crcl, PK.crclCG(65,73+0.4*47,1,"M"), 1e-9, "adjusted");
});

test("renal scaling of clearance: fe = 0 ignores CrCl, fe = 1 scales with it, and CrCl 120 mL/min is the reference", ()=>{
  [10,30,60,120,150].forEach(cr=>{
    assert.equal(PK.renalFactor(0,cr), 1, `fe 0 at CrCl ${cr}`);
    near(PK.renalFactor(1,cr), cr/120, 1e-12, `fe 1 at CrCl ${cr}`);
    near(PK.renalFactor(0.9,cr), 0.1+0.9*cr/120, 1e-12);
  });
  assert.equal(PK.renalFactor(0.6,120), 1);
  // in the simulator: clearance = CL_ref × factor, with the volume untouched
  const ref=PK.derived(scenario({thalf:2.5, V:18}));
  const p=scenario({thalf:2.5, V:18, pm:"clinical", fe:0.9, age:65, sex:"M", ht:175, scr:1, wt:70});
  const d=PK.derived(p), cr=PK.crclCG(65,70,1,"M");
  rel(d.CL, ref.CL*(0.1+0.9*cr/120), 1e-12);
  assert.equal(d.V, ref.V);
  // the organ-function slider does nothing in clinical mode, and the clinical inputs nothing in simple mode
  rel(PK.derived(Object.assign({},p,{clFn:50})).CL, d.CL, 1e-12);
  rel(PK.derived(scenario({thalf:2.5, V:18, scr:5, age:90})).CL, ref.CL, 1e-12);
  assert.equal(PK.isRelevant("clFn",p), false); assert.equal(PK.isRelevant("scr",p), true);
  assert.equal(PK.isRelevant("scr",scenario()), false);
});

test("the explainer's example: CrCl 73 → 41 mL/min for a 90% renal drug cuts clearance by the renal factor", ()=>{
  // CrCl 72.9 → 40.5 (SCr 1.0 → 1.8, 65-year-old man, 70 kg), fe 0.9
  const a=scenario({pm:"clinical", fe:0.9, age:65, scr:1.0, thalf:2.5, V:18, route:"inf", tinf:0.5, dosing:"repeated", D:120, tau:8, nDoses:6});
  const b=Object.assign({},a,{scr:1.8});
  const ca=PK.patientOf(a).crcl, cb=PK.patientOf(b).crcl;
  assert.deepEqual([ca.toFixed(0), cb.toFixed(0)], ["73","41"]);
  const da=PK.derived(a), db=PK.derived(b);
  rel(db.CL/da.CL, (0.1+0.9*cb/120)/(0.1+0.9*ca/120), 1e-12);
  assert.equal(Math.round((1-db.CL/da.CL)*100), 38, "clearance falls 38%");
  assert.deepEqual([da.thalfEff.toFixed(1), db.thalfEff.toFixed(1)], ["3.9","6.2"]);
  assert.ok(db.thalfEff>da.thalfEff && PK.ssProfile(b).ssTrough>PK.ssProfile(a).ssTrough);
});

test("the default scenario is untouched: simple mode, and clinical mode starts near the reference CrCl", ()=>{
  const d=PK.derived(scenario()), w=PK.windowStats(scenario(),24,2,12);
  assert.equal(d.cmax.toFixed(1), "9.3"); assert.equal(d.auc.toFixed(1), "74.2"); assert.equal((100*w.tIn/24).toFixed(0), "48");
  const c=PK.patientOf(scenario({pm:"clinical"}));
  assert.equal(c.crcl.toFixed(1), "121.5", "40-year-old man, 70 kg, SCr 0.8");
  near(c.factor, 121.5/120, 1e-3);
});

/* ---------- units and the salt factor ---------- */

test("salt factor: lithium carbonate 300 mg is 8.12 mEq of lithium, from Li₂CO₃'s molecular weight 73.89", ()=>{
  const li=drug("li");
  assert.equal((300*li.S).toFixed(2), "8.12");
  near(li.S, 2/73.89, 1e-6);
  // every dose is multiplied by S: AUC = F·S·D / CL, and concentrations scale by S
  const p=drugP("li", {dosing:"single"}), q=Object.assign({},p,{S:1}), d=PK.derived(p);
  rel(d.auc, p.F*p.S*p.D/d.CL, 1e-12);
  [1,4,12,48].forEach(t=> rel(PK.conc(p,t), p.S*PK.conc(q,t), 1e-12, `t=${t}`));
  rel(PK.ssConc(Object.assign({},p,{dosing:"repeated"}),3), p.S*PK.ssConc(Object.assign({},q,{dosing:"repeated"}),3), 1e-12, "steady state too");
  const inf=scenario({route:"inf", tinf:2, dosing:"repeated", S:0.8}), inf1=Object.assign({},inf,{S:1});
  [0.5,1,3,7].forEach(s=> rel(PK.ssConc(inf,s), 0.8*PK.ssConc(inf1,s), 1e-12, "an infusion's steady state applies S once"));
  // phenytoin sodium: 100 mg delivers 92 mg of phenytoin
  assert.equal(drug("phe").S, 0.92);
});

test("unit round trips for every library drug: the same curve in mg/L, and back again", ()=>{
  for(const d of PK.DRUGS){
    const p=drugP(d.id), U=PK.unitsOf(p);
    assert.equal(U.id, d.units, d.id);
    const mg=PK.convertUnits(p,"mg"), back=PK.convertUnits(mg, d.units);
    [0.5,2,8,24,72].forEach(t=>{
      const c=PK.conc(p,t);
      rel(PK.conc(mg,t), c*U.toMgL, 1e-12, `${d.id} at ${t} h in mg/L`);
      rel(PK.conc(back,t), c, 1e-12, `${d.id} at ${t} h and back`);
    });
    assert.equal(back.unit, d.units); rel(back.S, p.S, 1e-12);
  }
  // digoxin: 250 mcg in ng/mL is the same as 0.25 mg in mg/L × 1000
  const dig=drugP("dig"), asMg=Object.assign({},dig,{unit:"mg", D:0.25});
  rel(PK.conc(dig,30), 1000*PK.conc(asMg,30), 1e-12);
  // one mEq of lithium is 6.94 mg
  assert.equal(PK.UNITS.meq.toMgL, 6.94);
  // effect is unchanged by converting: EC50 moves with the concentrations
  const pd=Object.assign(drugP("dig"),{ec50:1}), pm=PK.convertUnits(pd,"mg");
  near(PK.effectOf(pm, PK.conc(pm,10)), PK.effectOf(pd, PK.conc(pd,10)), 1e-9);
});

test("comparison rows and the working use the scenario's units", ()=>{
  const dig=drugP("dig"), rows=PK.compareRows(dig, Object.assign({},dig,{D:125}), 336, 0.5, 2, null).rows;
  assert.equal(rows.find(r=>r.key==="cmax").unit, "ng/mL"); assert.equal(rows.find(r=>r.key==="auc").unit, "ng·h/mL");
  assert.equal(rows.find(r=>r.key==="cmax").dp, 3, "one more decimal for ng/mL");
  const li=drugP("li"), m=PK.metricMath(Object.assign({},li,{dosing:"single"}),"auc",{duration:48, mec:0.8, mtc:1.2});
  rel(m.value, PK.derived(Object.assign({},li,{dosing:"single"})).auc, 1e-12, "AUC working includes S");
  assert.ok(m.steps[0].m.includes("S·D") && m.steps[0].m.includes("mEq·h/L"), m.steps[0].m);
  const plain=PK.metricMath(scenario(),"auc",{duration:24, mec:2, mtc:12});
  assert.ok(!plain.steps[0].m.includes("S·"), "S isn't shown when it is 1");
  // clinical mode: the half-life working shows the renal factor and gives the model's value
  const c=scenario({pm:"clinical", fe:0.9, scr:2}), th=PK.metricMath(c,"thalf",{duration:24,mec:2,mtc:12});
  rel(th.value, PK.derived(c).thalfEff, 1e-12);
  assert.ok(th.steps.some(s=>s.m && s.m.startsWith("factor = (1 − fe)")));
  ["cmax","tmax","cl","v","mgkg","ttr"].forEach(k=>{
    const r=PK.metricMath(dig,k,{duration:336,mec:0.5,mtc:2});
    if(r && r.steps.some(s=>s.m && /mg\/L|mg·h\/L/.test(s.m))) assert.fail(`${k} shows mg/L for digoxin`);
  });
  ["peak","trough"].forEach(k=> rel(PK.metricMath(dig,k,{duration:336,mec:0.5,mtc:2}).value,
    k==="peak" ? PK.derived(dig).cmaxSS : PK.derived(dig).cminSS, 1e-3, k));
});

/* ---------- the drug library ---------- */

test("every library value has a source or says it is unverified", ()=>{
  const needed=d=> ["thalf","V","fe","window","strengths"].concat(d.s.route==="oral" ? ["F","ka"] : []).concat(d.S!==1 ? ["S"] : []);
  for(const d of PK.DRUGS){
    const keys=d.refs.map(r=>r.k);
    needed(d).forEach(k=> assert.ok(keys.includes(k), `${d.id}: no reference entry for ${k}`));
    d.refs.forEach(r=>{
      if(r.src){
        assert.ok(PK.SOURCES[r.src], `${d.id}.${r.k}: unknown source ${r.src}`);
        assert.ok(r.note && !r.note.includes(PK.UNVERIFIED), `${d.id}.${r.k}: a sourced value says what the source states`);
      } else assert.ok(r.note.endsWith(PK.UNVERIFIED), `${d.id}.${r.k}: an unsourced value is flagged`);
    });
    assert.ok(["linear","michaelis-menten"].includes(d.kinetics));
    assert.ok(d.fe>=0 && d.fe<=1 && d.S>0 && d.S<=1, d.id);
    assert.ok(PK.UNITS[d.units], d.id);
    assert.ok(d.strengths.mg || d.strengths.round, `${d.id}: strengths or a rounding step`);
  }
  Object.values(PK.SOURCES).forEach(s=> assert.ok(s.cite && (s.url===null || /^https:\/\/(doi\.org|dailymed\.nlm\.nih\.gov|www\.idsociety\.org)\//.test(s.url)), s.cite));
  ["gent","vanc","dig","phe","theo","li"].forEach(id=> assert.ok(drug(id), `${id} is in the library`));
});

test("the numbers the library's notes state follow from its own values", ()=>{
  const tmax=id=> PK.derived(drugP(id,{dosing:"single"})).tmax;
  assert.equal(tmax("amox").toFixed(1), "1.2");
  assert.equal(tmax("theo").toFixed(1), "5.8");
  assert.equal(tmax("dig").toFixed(0), "2");
  assert.equal(tmax("phe").toFixed(0), "6", "saturable: found by integration");
  assert.equal(tmax("li").toFixed(1), "2.2");
  assert.equal((Math.LN2*0.45/(0.65*60/1000)).toFixed(1), "8.0", "theophylline: V 0.45 L/kg and CL 0.65 mL/kg/min");
  assert.equal((Math.LN2*0.4/0.058).toFixed(1), "4.8", "vancomycin: V 0.4 L/kg and CL 0.058 L/kg/h");
  near(drugP("vanc").V, 0.4*70, 1e-9); near(drugP("theo").V, 0.45*70, 1e-9); near(drugP("caf").V, 0.6*70, 1e-9);
  assert.equal(drug("vanc").fe.toFixed(2), (0.048/0.058).toFixed(2), "vancomycin fe from renal ÷ total clearance");
  // the vancomycin label regimen lands inside the guideline's AUC24 target in this model
  const v=drugP("vanc"), auc24=PK.derived(v).auc*24/v.tau;
  assert.ok(auc24>=400 && auc24<=600, `AUC24 ${auc24}`);
  // each drug's own window, units and time span load with it
  for(const d of PK.DRUGS){
    const s=PK.drugScenario(d);
    assert.equal(s.unit, d.units); assert.equal(s.S, d.S); assert.equal(s.fe, d.fe);
    assert.ok(s.mec<s.mtc && s.duration<=PK.VIEW_RANGES.duration[1], d.id);
    Object.keys(PK.RANGES).forEach(k=>{ if(k in s) assert.ok(s[k]>=PK.RANGES[k][0] && s[k]<=PK.RANGES[k][1], `${d.id}.${k}`); });
  }
});

/* ---------- links ---------- */

test("v5 links carry the clinical patient and units; everything else keeps its old version", ()=>{
  const V=PK.VIEW_DEFAULTS;
  assert.ok(PK.encodeLink({mode:"sim", s:scenario(), view:V}).startsWith("v=1&"), "the default is still v1");
  const clin=scenario({pm:"clinical", age:72, sex:"F", ht:160, scr:1.4, alb:3.1, wtm:"ibw", fe:0.9});
  const link=PK.encodeLink({mode:"sim", s:clin, view:V});
  assert.ok(link.startsWith("v=5&"), link);
  const back=PK.decodeLink(link).s;
  ["pm","age","sex","ht","scr","alb","wtm","fe"].forEach(k=> assert.equal(back[k], clin[k], k));
  // a drug with its own units round-trips exactly, and so does its curve
  const dig=drugP("dig"), st=PK.decodeLink(PK.encodeLink({mode:"sim", s:dig, view:Object.assign({},V,{duration:336})}));
  assert.equal(st.view.duration, 336);
  PK.PK_KEYS.filter(k=>k!=="events").forEach(k=> assert.equal(st.s[k], dig[k], k));
  const li=drugP("li"); assert.equal(PK.decodeLink(PK.encodeLink({mode:"sim", s:li, view:V})).s.S, li.S);
  // wider ranges need v5 too: an older page would clamp them
  ["thalf:30","V:200","wt:150"].forEach(kv=>{
    const [k,v]=kv.split(":"), p=scenario({[k]:+v});
    assert.ok(PK.encodeLink({mode:"sim", s:p, view:V}).startsWith("v=5&"), kv);
    assert.equal(PK.decodeLink(PK.encodeLink({mode:"sim", s:p, view:V})).s[k], +v);
  });
  // bad values are ignored or clamped
  const bad=PK.decodeScenario("pm:admin,sex:X,wtm:lean,unit:kg,age:5,scr:0,fe:7,S:-1").valueOf();
  assert.equal(bad.pm, "simple"); assert.equal(bad.sex, "M"); assert.equal(bad.wtm, "actual"); assert.equal(bad.unit, "mg");
  assert.equal(bad.age, 18); assert.equal(bad.scr, 0.2); assert.equal(bad.fe, 1); assert.equal(bad.S, 0.001);
});

test("a v1 share link, with or without its version, decodes to the same scenario as before", ()=>{
  const old="s=D:400,clFn:50,thalf:6&w=duration:48";
  const a=PK.decodeLink("#v=1&"+old), b=PK.decodeLink("#"+old);
  assert.equal(b.version, 1);
  assert.deepEqual(b.s, a.s); assert.deepEqual(b.view, a.view);
  assert.equal(a.s.pm, "simple"); assert.equal(a.s.clFn, 50);
  rel(PK.derived(a.s).CL, Math.LN2/6*35*0.5, 1e-12, "the same clearance as ever");
  assert.equal(PK.decodeLink("#p=rac.12"), null, "task links aren't scenario links");
  const cmp=PK.decodeLink("#m=cmp&a=D:250&b=D:500");
  assert.equal(cmp.mode, "cmp"); assert.equal(cmp.b.D, 500);
});

test("Vary only can hold serum creatinine or age apart", ()=>{
  let c=PK.newComparison({pm:"clinical"});
  c=PK.cmpSetLock(c,"scr");
  c=PK.cmpApply(c,"b",{scr:2});
  c=PK.cmpApply(c,"b",{age:80});
  assert.equal(c.a.scr, 0.8); assert.equal(c.b.scr, 2);
  assert.equal(c.a.age, 80, "every other change applies to both");
  assert.ok(PK.lockHolds(c));
});

test("lesson: kidney function (every number its text states)", ()=>{
  const L=PK.LESSONS.find(x=>x.id==="crcl"), base=scenario(L.base), cur=scenario(L.cur);
  const [a,b]=[base,cur].map(p=>({p, d:PK.derived(p), c:PK.patientOf(p)}));
  assert.deepEqual([a.c.crcl.toFixed(1), b.c.crcl.toFixed(1)], ["72.9","40.5"]);
  assert.deepEqual([a.d.CL.toFixed(2), b.d.CL.toFixed(2)], ["3.23","2.02"]);
  assert.equal(Math.round((1-b.d.CL/a.d.CL)*100), 38);
  assert.deepEqual([a.d.thalfEff.toFixed(1), b.d.thalfEff.toFixed(1)], ["3.9","6.2"]);
  assert.deepEqual([a.d.cminSS.toFixed(1), b.d.cminSS.toFixed(1)], ["2.2","4.7"]);
  assert.deepEqual([a.d.cmaxSS.toFixed(1), b.d.cmaxSS.toFixed(1)], ["8.4","11.0"]);
  assert.ok(a.d.fSS>0.99 && b.d.fSS>0.99, "both have reached steady state by the final trough");
  // the prediction: the trough more than doubles
  const chk=PK.lessonCheck(L);
  assert.equal(L.predict.decide(chk), L.predict.answer);
  assert.ok(chk.cur.trough/chk.base.trough>2);
  // try this: with fe = 0 the creatinine doesn't matter
  [base,cur].forEach(p=> assert.equal(PK.derived(Object.assign({},p,{fe:0})).CL.toFixed(6), PK.derived(Object.assign({},base,{fe:0})).CL.toFixed(6)));
  // the challenge: only the interval may change
  assert.equal(PK.challengeMet(L, PK.lessonScenario(L)), false);
  assert.equal(PK.challengeMet(L, PK.lessonScenario(L,{tau:14})), true);
  assert.equal(PK.challengeMet(L, PK.lessonScenario(L,{D:60})), false, "not by cutting the dose");
  assert.equal(PK.challengeMet(L, PK.lessonScenario(L,{scr:1.0})), false, "not by undoing the creatinine");
  assert.equal(PK.challengeMet(L, PK.lessonScenario(L,{tau:12})), false, "12 h isn't long enough");
  const t=PK.TEMPLATES.find(x=>x.id==="crcl"); assert.ok(t && t.lesson==="crcl");
});
