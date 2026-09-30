// Run with: node --test
// Two compartments: the engine's sum of exponentials against the closed form, an independent step-by-step
// integration of the compartments, the identities that hold whatever the distribution, and the lesson.
const test=require("node:test");
const assert=require("node:assert/strict");
const PK=require("../pk-engine.js");
const C=require("../cases.js");
const P=require("../pop-worker.js");
const {scenario}=PK;

const near=(actual, expected, tol, msg)=>
  assert.ok(Math.abs(actual-expected)<=tol, `${msg?msg+": ":""}expected ${expected} ± ${tol}, got ${actual}`);
const rel=(actual, expected, frac, msg)=> near(actual, expected, Math.abs(expected)*frac, msg);
const VANC2={V:14, thalf:2.39, cmt:2, k12:0.545, k21:0.545};

// α, β, A and B worked out here from k10, k12, k21 and V1, independently of the engine
function closedForm(p){
  const k10=Math.LN2/p.thalf, V1=p.V*p.wt/70, s=k10+p.k12+p.k21, r=Math.sqrt(s*s-4*k10*p.k21), a=(s+r)/2, b=(s-r)/2;
  return {a, b, A:(a-p.k21)/((a-b)*V1), B:(p.k21-b)/((a-b)*V1), k10, V1};
}
// the two compartments integrated step by step (RK4, fine steps): central A1, peripheral A2, gut G
function integrate(p, T, h=0.0005){
  const {k10, V1}=closedForm(p), ev=PK.doseEvents(p), n=Math.round(T/h);
  let A1=0, A2=0, G=0; const out=[];
  // steps line up with every dose and infusion edge, so the input rate is constant within a step
  const rate=t=> ev.reduce((s,e)=> s+(e.route==="inf" && t>=e.t && t<e.t+e.dur ? e.mg/e.dur : 0), 0);
  const give=t=>{ ev.forEach(e=>{ if(Math.abs(e.t-t)<h/2){ if(e.route==="iv") A1+=e.mg; else if(e.route==="oral") G+=p.F*e.mg; } }); };
  give(0);
  for(let i=0;i<n;i++){
    const t=i*h, r=rate(t+h/2), f=([g,a1,a2])=>[-p.ka*g, p.ka*g+r-(k10+p.k12)*a1+p.k21*a2, p.k12*a1-p.k21*a2];
    const y=[G,A1,A2], k1=f(y), k2=f(y.map((v,j)=>v+h/2*k1[j])), k3=f(y.map((v,j)=>v+h/2*k2[j])), k4=f(y.map((v,j)=>v+h*k3[j]));
    [G,A1,A2]=y.map((v,j)=>v+h/6*(k1[j]+2*k2[j]+2*k3[j]+k4[j]));
    give((i+1)*h);
    out.push([(i+1)*h, A1/V1]);
  }
  return out;
}

test("an IV bolus follows D·(A·e^(−αt) + B·e^(−βt)), with A + B = 1/V1", ()=>{
  const p=scenario(Object.assign({route:"iv", D:1000}, VANC2)), cf=closedForm(p);
  [0,0.25,1,3,8,24].forEach(t=> rel(PK.conc(p,t), 1000*(cf.A*Math.exp(-cf.a*t)+cf.B*Math.exp(-cf.b*t)), 1e-12, `t=${t}`));
  near(cf.A+cf.B, 1/cf.V1, 1e-15);
  near(Math.LN2/cf.b, 5.5, 0.01, "terminal half-life 5.5 h");
  near(Math.LN2/cf.a, 0.55, 0.01, "distribution half-life 0.55 h");
  assert.equal(PK.derived(p).thalfEff.toFixed(2), (Math.LN2/cf.b).toFixed(2));
});

test("oral doses, infusions and repeated regimens agree with a step-by-step integration of the two compartments (1 in a million)", ()=>{
  [{route:"oral", F:0.8, ka:1.1, dosing:"repeated", D:500, tau:8, nDoses:4},
   {route:"inf", tinf:1, dosing:"repeated", D:1000, tau:12, nDoses:3},
   {route:"iv", dosing:"repeated", D:500, tau:6, nDoses:4, missed:2}].forEach(o=>{
    const p=PK.normalizeScenario(scenario(Object.assign({}, VANC2, o))), steps=integrate(p, 36);
    steps.filter((x,i)=>i%2000===1777).forEach(([t,c])=> rel(PK.conc(p,t), c, 1e-6, `${o.route} at ${t.toFixed(4)} h`));
  });
});

test("whatever the distribution: AUC = F·D / CL, Vss = V1·(1 + k12/k21), and the same clearance gives the same exposure", ()=>{
  const p=scenario(Object.assign({route:"inf", D:1000, tinf:1}, VANC2)), d=PK.derived(p), cf=closedForm(p);
  rel(d.CL, cf.k10*cf.V1, 1e-12, "CL = k10·V1");
  rel(d.auc, 1000/d.CL, 1e-12, "AUC = D/CL");
  rel(PK.windowStats(p, 200, 0, Infinity).auc, d.auc, 0.002, "the integrated area");
  rel(d.Vss, 14*(1+0.545/0.545), 1e-12);
  const one=scenario({route:"inf", D:1000, tinf:1, V:28, thalf:Math.LN2*28/d.CL});
  rel(PK.derived(one).auc, d.auc, 1e-9, "one compartment, same clearance: same AUC");
  // steady state: trough over first-dose trough, and the exact periodic solution
  const rep=PK.normalizeScenario(Object.assign({}, p, {dosing:"repeated", tau:12, nDoses:20}));
  rel(PK.derived(rep).cminSS, PK.ssConc(rep, 12-1e-9), 1e-6, "20 doses reach the geometric-series steady state");
  near(PK.ssProfile(rep).t90, 3.32*Math.LN2/cf.b, 1e-9, "time to 90% on the terminal phase");
});

test("the last dose's peak is the curve's true maximum (an infusion's at its end), and the share of steady state is exact", ()=>{
  [{}, VANC2].forEach(two=>{
    const inf=PK.normalizeScenario(scenario(Object.assign({route:"inf", tinf:1, dosing:"repeated", D:1000, tau:12, nDoses:8}, two))), d=PK.derived(inf);
    rel(d.cmaxSS, PK.conc(inf, 85), 1e-9, "at the end of the last infusion"); near(d.tmaxSS, 85, 1e-6);
    const oral=PK.normalizeScenario(scenario(Object.assign({route:"oral", F:0.8, ka:0.9, dosing:"repeated", D:500, tau:8, nDoses:6}, two))), o=PK.derived(oral);
    let mx=0; for(let t=40;t<=48;t+=1e-4) mx=Math.max(mx, PK.conc(oral,t));
    assert.ok(o.cmaxSS>=mx-1e-12 && o.cmaxSS-mx<1e-6, `oral: ${o.cmaxSS} vs a 0.0001 h scan ${mx}`);
  });
  const p=PK.normalizeScenario(scenario(Object.assign({route:"iv", dosing:"repeated", D:500, tau:12, nDoses:3, missed:2}, VANC2))), d=PK.derived(p);
  const full=PK.normalizeScenario(scenario(Object.assign({route:"iv", dosing:"repeated", D:500, tau:12, nDoses:3}, VANC2)));
  rel(d.fSS, PK.conc(full, 36-1e-9)/PK.ssConc(full, 12-1e-9), 1e-9, "the full regimen's trough over the steady-state one");
  assert.ok(d.fSS>0.5 && d.fSS<1);
});

test("population mode works with two compartments: no variability collapses onto the curve, and PTA reads the exact steady state", ()=>{
  const p=PK.normalizeScenario(scenario(Object.assign({route:"inf", tinf:1, dosing:"repeated", D:1000, tau:12, nDoses:8}, VANC2)));
  const r=P.population(PK, p, {n:50, cvCL:0, cvV:0, seed:1, T:96, mec:10, mtc:60});
  r.t.forEach((t,i)=> near(r.q50[i], PK.conc(p,t), 1e-12));
  const s=PK.ssPeakTrough(p); rel(s.peak, PK.ssConc(p,1), 1e-9); rel(s.trough, PK.ssConc(p,12-1e-9), 1e-9);
  assert.equal(r.pta, 0, "a trough of 8.0 mg/L misses an MEC of 10");
  assert.equal(P.population(PK, p, {n:50, cvCL:0, cvV:0, seed:1, T:96, mec:7, mtc:60}).pta, 1);
});

test("fast exchange makes two compartments behave as one with the steady-state volume", ()=>{
  const two=scenario({route:"iv", D:1000, V:14, thalf:2.39, cmt:2, k12:5, k21:5}), one=scenario({route:"iv", D:1000, V:28, thalf:4.78});
  [4,8,16].forEach(t=> rel(PK.conc(two,t), PK.conc(one,t), 0.03, `t=${t}`));
});

test("links carry the two-compartment settings (v5), and a saturable scenario ignores them", ()=>{
  const p=scenario(VANC2), link=PK.encodeLink({mode:"sim", s:p, view:PK.VIEW_DEFAULTS});
  assert.ok(link.startsWith("v=5&"), link);
  const back=PK.decodeLink(link).s; ["cmt","k12","k21","V","thalf"].forEach(k=> assert.equal(back[k], p[k], k));
  assert.equal(PK.decodeScenario("cmt:3").cmt, 1, "only 1 or 2");
  const mm=scenario({kin:"mm", cmt:2}); assert.equal(PK.disposition(mm).length, 1);
  assert.equal(PK.isRelevant("k12", mm), false);
});

test("show the math for two compartments gives the model's values", ()=>{
  const p=PK.normalizeScenario(scenario(Object.assign({route:"inf", dosing:"repeated", D:1000, tinf:1, tau:12, nDoses:8}, VANC2))), d=PK.derived(p), view={duration:96, mec:10, mtc:40};
  rel(PK.metricMath(p,"thalf",view).value, d.thalfEff, 1e-12);
  rel(PK.metricMath(p,"v",view).value, d.V, 1e-12);
  rel(PK.metricMath(p,"rac",view).value, d.Rac, 1e-12);
  rel(PK.metricMath(p,"peak",view).value, d.cmaxSS, 1e-12);
  assert.ok(PK.metricMath(p,"thalf",view).steps.some(s=>s.m && s.m.includes("α =")));
});

test("lesson: one or two compartments (every number its text states)", ()=>{
  const L=PK.LESSONS.find(x=>x.id==="twocmt"), a=PK.normalizeScenario(scenario(L.base)), b=PK.normalizeScenario(scenario(L.cur));
  const da=PK.derived(a), db=PK.derived(b), sa=PK.ssProfile(a), sb=PK.ssProfile(b);
  assert.deepEqual([da.CL.toFixed(2), db.CL.toFixed(2)], ["4.06","4.06"]);
  assert.equal(db.Vss.toFixed(0), "28"); assert.equal((Math.LN2/db.alpha).toFixed(2), "0.55");
  assert.deepEqual([da.thalfEff.toFixed(1), db.thalfEff.toFixed(1)], ["4.8","5.5"]);
  assert.deepEqual([sa.ssPeak.toFixed(1), sb.ssPeak.toFixed(1)], ["40.3","57.6"]);
  assert.deepEqual([sa.ssTrough.toFixed(1), sb.ssTrough.toFixed(1)], ["8.2","8.0"]);
  assert.deepEqual([(da.auc*2).toFixed(1), (db.auc*2).toFixed(1)], ["492.6","492.6"], "AUC24 at 1 g every 12 h");
  // every number the text states is one checked above (or a setting of the regimen)
  const checked=["1","12","4.06","28","14","0.545","0.55","5.5","4.8","57.6","40.3","8.0","8.2","492.6"];
  (L.text.match(/(?<![A-Za-z\d.])\d+(\.\d+)?/g)||[]).forEach(n=> assert.ok(checked.includes(n), `the text states ${n}, which no assertion checks`));
  const chk=PK.lessonCheck(L); assert.equal(L.predict.decide(chk), L.predict.answer);
  assert.equal(PK.challengeMet(L, PK.lessonScenario(L)), false);
  assert.equal(PK.challengeMet(L, PK.lessonScenario(L,{k12:4, k21:4})), true);
  assert.equal(PK.challengeMet(L, PK.lessonScenario(L,{k12:3, k21:3})), false, "not quite");
  assert.equal(PK.challengeMet(L, PK.lessonScenario(L,{cmt:1})), false, "not by dropping a compartment");
  const t=PK.TEMPLATES.find(x=>x.id==="twocmt"); assert.ok(t && t.lesson==="twocmt");
});

test("the vancomycin case compares its regimen with a two-compartment version of the patient", ()=>{
  const c=C.caseById("vanc"), step=C.walkthrough(c).find(s=>s.includes("two-compartment"));
  assert.ok(step, "the walkthrough has the comparison");
  const auc=[...step.matchAll(/AUC24 is still (\d+) mg·h\/L \(one compartment: (\d+)\)/g)][0];
  assert.ok(auc && auc[1]===auc[2], "the same AUC24 either way");
  assert.equal(PK.drugScenario(PK.DRUGS.find(d=>d.id==="vanc")).cmt, 1, "loading a drug starts from one compartment");
});

test("the glossary's formulas hold: residuals give back k10, k12 and k21 exactly; the infusion equation gives back V", ()=>{
  [{V:14, thalf:2.39, k12:0.545, k21:0.545}, {V:25, thalf:4, k12:1.2, k21:0.3}, {V:9, thalf:1.5, k12:0.4, k21:0.9}].forEach(x=>{
    const p=scenario(Object.assign({route:"iv", D:1000, cmt:2}, x)), q=PK.disposition(p), V1=PK.vOf(p);
    const a=q[0].k, b=q[1].k, A=1000*q[0].c, B=1000*q[1].c;
    const k21=(A*b+B*a)/(A+B), k10=a*b/k21, k12=a+b-k21-k10;
    rel(k21, x.k21, 1e-9); rel(k10, Math.LN2/x.thalf, 1e-9); rel(k12, x.k12, 1e-9); rel(1000/(A+B), V1, 1e-9);
  });
  // Sawchuk–Zaske on exact steady-state levels of a one-compartment infusion: k and V come back exactly
  const p=PK.normalizeScenario(scenario({route:"inf", dosing:"repeated", D:200, tinf:0.5, tau:6, nDoses:20, V:27, thalf:1.6}));
  const T=0.5, t1=1, t2=6-1e-9, C1=PK.ssConc(p,t1), C2=PK.ssConc(p,t2), k=Math.log(C1/C2)/(t2-t1);
  const Cmax=C1*Math.exp(k*(t1-T)), Cmin=C2, V=(200/T)*(1-Math.exp(-k*T))/(k*(Cmax-Cmin*Math.exp(-k*T)));
  rel(k, Math.LN2/1.6, 1e-9); rel(V, 27, 1e-9);
});

test("time to 90%: with two compartments 3.32 terminal half-lives errs long, and the working gives the exact infusion figure", ()=>{
  const L=PK.LESSONS.find(x=>x.id==="twocmt"), p=PK.normalizeScenario(scenario(L.cur)), r=PK.metricMath(p,"t90",{duration:96, mec:10, mtc:40});
  const q=PK.normalizeScenario(scenario({route:"inf", dosing:"single", D:100000, tinf:1000, V:14, thalf:2.39, cmt:2, k12:0.545, k21:0.545}));
  const plateau=PK.conc(q,999); let lo=0, hi=40; for(let i=0;i<60;i++){ const m=(lo+hi)/2; if(PK.conc(q,m)<0.9*plateau) lo=m; else hi=m; }
  near(r.exactInfusion, hi, 1e-6, "the two-exponential fraction against a simulated infusion");
  assert.ok(r.exactInfusion<r.value, "the rule of thumb is an upper estimate");
  assert.ok(r.steps.some(s=>s.t && s.t.includes(`${+r.exactInfusion.toFixed(1)} h`)));
});
