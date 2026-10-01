// Run with: node --test
// Sensitivity analysis (pk-sens.js): the closed-form changes (clearance ±20% moves AUC24 by +25% and −16.7%, dose
// moves it in proportion, volume leaves it alone), the signs every input should have, the inputs offered for each
// kind of scenario, the sentence that names the dominant input, and the chart.
const test=require("node:test");
const assert=require("node:assert/strict");
const PK=require("../pk-engine.js");
const {scenario}=PK;

const near=(actual, expected, tol, msg)=>
  assert.ok(Math.abs(actual-expected)<=tol, `${msg?msg+": ":""}expected ${expected} ± ${tol}, got ${actual}`);
const S=o=> PK.normalizeScenario(scenario(o));
const X=PK.sens, view={duration:96, mec:2, mtc:12};
const row=(res, id)=> res.rows.find(r=>r.id===id);

test("closed forms at steady state: clearance ±20% moves AUC24 by +25% and −16.7%, dose in proportion, interval like clearance, volume not at all", ()=>{
  [{route:"iv"}, {route:"oral", F:0.8, ka:1.2}, {route:"inf", tinf:2}, {route:"iv", cmt:2, k12:0.6, k21:0.3}, {route:"oral", pm:"clinical", age:70, scr:1.6, fe:0.8}].forEach(o=>{
    const p=S(Object.assign({dosing:"repeated", D:500, tau:12, nDoses:8, thalf:6, V:40}, o)), res=X.analyse(p, view), where=JSON.stringify(o);
    near(row(res,"cl").auc.lo, 25, 1e-9, `${where}: CL −20%`); near(row(res,"cl").auc.hi, -100/6, 1e-9, `${where}: CL +20%`);
    near(row(res,"d").auc.lo, -20, 1e-9, where); near(row(res,"d").auc.hi, 20, 1e-9, where);
    near(row(res,"tau").auc.lo, 25, 1e-9, where); near(row(res,"tau").auc.hi, -100/6, 1e-9, where);
    near(row(res,"v").auc.lo, 0, 1e-9, `${where}: V`); near(row(res,"v").auc.hi, 0, 1e-9, `${where}: V`);
    ["cmax","cmin"].forEach(m=>{ near(row(res,"d")[m].hi, 20, 1e-6, `${where}: ${m} scales with the dose`); });
    near(res.base.auc, PK.derived(p).auc*24/12, 1e-9*res.base.auc, "the base is the engine's own");
  });
  // an IV bolus peak at steady state: C0,ss = (D/V)/(1 − e^(−kτ)), so V +20% with CL held moves it by a known amount
  const p=S({route:"iv", dosing:"repeated", D:500, tau:12, nDoses:8, thalf:6, V:40}), k=Math.LN2/6, pk=(V,k)=> 500/V/(1-Math.exp(-k*12));
  near(row(X.analyse(p,view),"v").cmax.hi, 100*(pk(48, k/1.2)/pk(40, k)-1), 1e-6, "V +20%, the half-life 20% longer");
});

test("signs: every input moves each output the way the pharmacology says", ()=>{
  const p=S({route:"oral", dosing:"repeated", D:400, F:0.7, ka:1, tau:8, nDoses:10, thalf:8, V:35}), res=X.analyse(p, view);
  const up=(id,m)=> row(res,id)[m].hi, down=(id,m)=> row(res,id)[m].lo;
  assert.ok(up("cl","auc")<0 && up("cl","cmax")<0 && up("cl","cmin")<0, "more clearance, less of everything");
  assert.ok(up("d","auc")>0 && up("d","cmax")>0 && up("d","cmin")>0);
  assert.ok(up("f","auc")>0 && down("f","auc")<0);
  assert.ok(up("ka","cmax")>0 && up("ka","cmin")<0, "faster absorption: a higher peak and a lower trough");
  assert.ok(up("tau","cmin")<0 && up("tau","auc")<0, "a longer interval at the same dose: less a day, a lower trough");
  assert.ok(up("v","cmax")<0 && up("v","cmin")>0, "a larger volume (and longer half-life): a lower peak, a higher trough");
});

test("the inputs offered fit the scenario, and F is capped at 1", ()=>{
  const ids=o=> X.inputs(S(o)).map(i=>i.id);
  assert.deepEqual(ids({route:"iv"}), ["cl","v","d"]);
  assert.deepEqual(ids({route:"oral", dosing:"repeated"}), ["cl","v","f","ka","d","tau"]);
  assert.deepEqual(ids({route:"iv", cmt:2}), ["cl","v","d","k12","k21"]);
  assert.deepEqual(ids({kin:"mm", route:"oral", dosing:"repeated"}), ["vmax","km","v","f","ka","d","tau"]);
  assert.deepEqual(ids({hep:1, route:"oral"}), ["v","ka","d"], "the liver model sets clearance and F itself");
  const p=S({route:"oral", F:0.9}), r=row(X.analyse(p, view), "f");
  assert.equal(r.capped, true); near(r.auc.hi, 100*(1/0.9-1), 1e-6, "F capped at 1");
  // custom schedules scale every dose
  const c=S({dosing:"custom", events:[{t:0, mg:300, route:"iv"}, {t:12, mg:200, route:"oral"}]}), rc=X.analyse(c, view);
  assert.equal(rc.base.ss, false); near(row(rc,"d").cmax.hi, 20, 1e-6);
});

test("the window reading for a single dose, a custom schedule and dialysis; saturable drugs at steady state", ()=>{
  const single=S({route:"iv", D:500, thalf:6, V:40}), b=X.outputs(single, view);
  assert.equal(b.ss, false); near(b.auc, PK.windowStats(single, 24, 2, 12).auc, 1e-12); near(b.cmin, PK.conc(single, 96-1e-9), 1e-15);
  const hd=S({route:"iv", dosing:"repeated", D:500, tau:12, nDoses:8, thalf:20, V:40, hd:1, hdcl:6, hdstart:20, hddur:4, hdevery:48});
  assert.equal(X.outputs(hd, view).ss, false, "no steady state on dialysis");
  const mm=S({kin:"mm", route:"oral", dosing:"repeated", D:300, tau:24, nDoses:14, F:1, ka:0.4, V:49, vmax:7, km:4}), r=X.analyse(mm, {duration:336, mec:10, mtc:20});
  assert.equal(r.base.ss, true);
  assert.ok(row(r,"d").auc.hi>20, "saturable: 20% more dose raises the exposure by more than 20%");
  assert.ok(row(r,"vmax").auc.hi<0 && row(r,"km").auc.hi>0);
});

test("the sentence names the dominant input with its numbers, and the chart has a pair of bars per input", ()=>{
  const p=S({route:"iv", dosing:"repeated", D:500, tau:12, nDoses:8, thalf:6, V:40}), res=X.analyse(p, view);
  const rk=X.ranked(res, "auc");
  assert.match(rk.text, /^AUC24 at steady state is most sensitive to clearance and dosing interval: −20% changes it by \+25\.0%, \+20% by −16\.7%\.$/);
  assert.match(X.ranked(res, "cmax").text, /most sensitive to/);
  const sv=X.svg(rk);
  assert.equal((sv.markup.match(/<rect /g)||[]).length, 2*rk.rows.length+2, "two bars per input and the legend");
  assert.ok(!/NaN|undefined|null/.test(sv.markup+rk.text));
  // ranked: largest effect first, by the larger of the two bars
  const spans=rk.rows.map(r=> Math.max(Math.abs(r.auc.lo), Math.abs(r.auc.hi)));
  assert.deepEqual(spans, spans.slice().sort((a,b)=>b-a));
  // descriptive wording only
  ["auc","cmax","cmin","tin"].forEach(m=> assert.ok(!/\b(safe|unsafe|best|recommended?|patient)\b/i.test(X.ranked(res, m).text), m));
});
