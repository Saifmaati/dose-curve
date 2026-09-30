// Run with: node --test
// Saturable (Michaelis–Menten) elimination: the RK4 path against analytic limits, steady state, mass balance,
// schedules, speed, the phenytoin teaching numbers, the Sheiner–Tozer tool and the lesson.
const test=require("node:test");
const assert=require("node:assert/strict");
const PK=require("../pk-engine.js");
const {scenario}=PK;

const near=(actual, expected, tol, msg)=>
  assert.ok(Math.abs(actual-expected)<=tol, `${msg?msg+": ":""}expected ${expected} ± ${tol}, got ${actual}`);
const rel=(actual, expected, frac, msg)=> near(actual, expected, Math.abs(expected)*frac, msg);
const mm=over=> PK.normalizeScenario(scenario(Object.assign({kin:"mm", vmax:7, km:4, V:49}, over)));
const phenytoin=over=> PK.normalizeScenario(scenario(Object.assign(PK.drugScenario(PK.DRUGS.find(d=>d.id==="phe")), over||{})));
const VmH=p=> p.vmax*p.wt/24;

test("low-concentration limit: with C ≪ Km the curve is first-order with kₑ = Vmax / (Km·V), within 1%", ()=>{
  // IV bolus, oral and infusion, levels about 1/1000 of Km
  [{route:"iv", D:10}, {route:"oral", D:10, F:0.8, ka:1.1}, {route:"inf", D:10, tinf:2}].forEach(o=>{
    const p=mm(Object.assign({km:400}, o)), k=VmH(p)/(p.km*PK.vOf(p));
    const lin=scenario(Object.assign({}, o, {V:p.V, thalf:Math.LN2/k}));
    [0.5,2,10,48,200].forEach(t=> rel(PK.conc(p,t), PK.conc(lin,t), 0.01, `${o.route} at ${t} h`));
  });
});

test("steady state: a constant input settles at Km·R / (Vmax − R) within 1%, and t90 follows the formula", ()=>{
  [0.3,0.6,0.85].forEach(f=>{
    const Vm=7*70/24, R=f*Vm, p=mm({route:"inf", dosing:"repeated", tau:24, tinf:24, nDoses:14, D:R*24});
    const c=PK.mmCss(p), css=4*R/(Vm-R);
    rel(c.css, css, 1e-12);
    rel(PK.mmSteady(p).avg, css, 0.01, `R/Vmax ${f}: steady-state average`);
    const t90=PK.mmT90(p);
    if(t90<300){
      rel(PK.conc(p,t90), 0.9*css, 0.01, `R/Vmax ${f}: 90% of Css at t90 = ${t90.toFixed(1)} h`);
      rel(PK.conc(p,330), css, t90<100 ? 0.001 : 0.05, "near Css by the end");
    }
  });
  // oral doses swing around it: phenytoin 300 mg daily averages within 3% of the constant-input value
  const d=PK.derived(phenytoin());
  rel(d.mm.avg, d.css, 0.03); assert.ok(d.mm.peak>d.css && d.mm.trough<d.css);
});

test("an input at or above Vmax never plateaus", ()=>{
  [1, 1.05, 1.3].forEach(f=>{
    const Vm=7*70/24, R=f*Vm, p=mm({route:"inf", dosing:"repeated", tau:24, tinf:24, nDoses:14, D:R*24});
    assert.equal(PK.mmCss(p).css, null); assert.ok(PK.mmSteady(p).none);
    assert.equal(PK.ssProfile(p).ssTrough, null);
    let prev=0; for(let t=12;t<=336;t+=12){ const c=PK.conc(p,t); assert.ok(c>prev, `still rising at ${t} h (R/Vmax ${f})`); prev=c; }
    if(f>1){   // it climbs at (R − Vmax·C / (Km + C)) / V, never slower than (R − Vmax) / V
      const V=PK.vOf(p), c0=PK.conc(p,329), c1=PK.conc(p,331), cm=PK.conc(p,330), slope=(c1-c0)/2;
      rel(slope, (R-Vm*cm/(p.km+cm))/V, 0.005, `slope at 330 h (R/Vmax ${f})`);
      assert.ok(slope>(R-Vm)/V);
    }
  });
});

test("mass balance: dose given = eliminated + still in the body (gut and plasma), within 0.1%", ()=>{
  const p=mm({route:"oral", dosing:"repeated", D:300, tau:24, nDoses:10, F:0.9, ka:0.4, S:0.92});
  const T=300, doses=PK.doseEvents(p), steps=PK.mmIntegrate(p, doses, T);
  const Vm=PK.vmaxOf(p), V=PK.vOf(p), elim=a=> Vm*(a/V)/(p.km+a/V);
  let out=0;
  for(const st of steps){ const h=st.t1-st.t0, am=PK.mmAmount(steps, st.t0+h/2);
    out+=h/6*(elim(st.a0)+4*elim(am)+elim(st.a1)); }
  const last=steps[steps.length-1], given=doses.filter(e=>e.t<T).reduce((s,e)=>s+p.F*p.S*e.mg,0);
  rel(out+last.a1+last.g1, given, 1e-3);
});

test("the RK4 step keeps the peak within 0.5% of a ten times finer step", ()=>{
  [{route:"iv", D:1000}, {route:"oral", D:600, ka:3, F:1}, {route:"inf", D:900, tinf:0.5}].forEach(o=>{
    const p=mm(Object.assign({dosing:"repeated", tau:12, nDoses:6}, o)), ev=PK.doseEvents(p);
    const peak=steps=>{ let mx=0; for(let t=0;t<=72;t+=0.01) mx=Math.max(mx, PK.mmAmount(steps,t)); return mx; };
    const a=peak(PK.mmIntegrate(p, ev, 73)), b=peak(PK.mmIntegrate(p, ev, 73, null, PK.MM_STEP/10));
    rel(a, b, 0.005, o.route);
    rel(a, b, 1e-4, `${o.route} (in fact far closer)`);
  });
});

test("missed doses and custom schedules run through the saturable path", ()=>{
  const reg=phenytoin({missed:4});
  const cust=Object.assign({}, reg, {dosing:"custom", events:PK.eventsFromBasic(reg)});
  const c=PK.normalizeScenario(cust);
  assert.equal(c.events.filter(e=>e.status==="missed").length, 1);
  // a custom schedule holds doses up to 168 h, so compare within that
  [10, 80, 90, 100, 150, 167].forEach(t=> rel(PK.conc(c,t), PK.conc(reg,t), 1e-9, `custom = repeated at ${t} h`));
  const full=phenytoin();
  assert.ok(PK.conc(reg, 4*24-0.1) < PK.conc(full, 4*24-0.1), "the missed dose lowers the level before the next one");
  // mixed routes in one schedule: a bolus and an infusion
  const mix=PK.normalizeScenario(mm({dosing:"custom", events:[{t:0, mg:500, route:"iv"}, {t:12, mg:600, route:"inf", dur:6}, {t:30, mg:300, route:"oral"}]}));
  assert.ok(PK.conc(mix,0)>0 && PK.conc(mix,18)>PK.conc(mix,12) && PK.conc(mix,34)>PK.conc(mix,30));
  const w=PK.windowStats(mix, 72, 0, Infinity); assert.ok(w.cmax>0 && w.auc>0);
});

test("linear drugs are untouched: the saturable settings change nothing unless kinetics is saturable", ()=>{
  const a=scenario(), b=scenario({vmax:15, km:20});
  [0.5,2,8,24].forEach(t=> assert.equal(PK.conc(b,t), PK.conc(a,t)));
  assert.deepEqual(PK.derived(b), PK.derived(a));
  assert.equal(PK.encodeLink({mode:"sim", s:a, view:PK.VIEW_DEFAULTS}), "v=1&s=");
  assert.equal(PK.isRelevant("vmax", a), false); assert.equal(PK.isRelevant("thalf", mm({})), false);
  const d=PK.derived(scenario()); assert.equal(d.cmax.toFixed(1), "9.3"); assert.equal(d.auc.toFixed(1), "74.2");
});

test("speed: a 14-day daily-dosing simulation takes well under 100 ms on the main thread", ()=>{
  for(let i=0;i<3;i++){
    const p=phenytoin({D:300+25*i, ka:0.37+0.01*i});   // a fresh scenario each time, so nothing is cached
    const t0=process.hrtime.bigint();
    PK.windowStats(p, 336, 10, 20); PK.derived(p);
    const ms=Number(process.hrtime.bigint()-t0)/1e6;
    assert.ok(ms<100, `took ${ms.toFixed(1)} ms`);
  }
});

test("phenytoin: 300 → 400 mg a day, the numbers the lesson, the comparison and the explainer use", ()=>{
  const a=PK.derived(phenytoin()), b=PK.derived(phenytoin({D:400}));
  assert.equal((0.92*300/490*100).toFixed(0), "56"); assert.equal((0.92*400/490*100).toFixed(0), "75");
  assert.equal(a.css.toFixed(1), "5.2"); assert.equal(b.css.toFixed(1), "12.1");
  assert.equal((b.css/a.css).toFixed(1), "2.3");
  assert.equal((a.t90/24).toFixed(1), "3.8"); assert.equal((b.t90/24).toFixed(1), "10.5");
  const c450=PK.derived(phenytoin({D:450}));
  assert.equal((0.92*450/490*100).toFixed(0), "84"); assert.ok(c450.css>20);
  assert.ok(PK.derived(phenytoin({D:550})).mm.none, "550 mg a day exceeds Vmax");
  // the level-dependent half-life: longer at the higher level
  assert.ok(b.thalfEff>a.thalfEff);
  near(a.thalfEff, Math.LN2*49*(4+a.mm.avg)/(7*70/24), 1e-9);
  // show the math agrees with the simulation
  const view={duration:336, mec:10, mtc:20};
  rel(PK.metricMath(phenytoin(),"css",view).value, a.css, 1e-12);
  rel(PK.metricMath(phenytoin(),"t90",view).value, a.t90, 1e-12);
  rel(PK.metricMath(phenytoin(),"ratio",view).value, 100*0.92*300/490, 1e-9);
  assert.match(PK.metricMath(phenytoin({D:600}),"css",view).steps.map(s=>s.t||"").join(" "), /No steady state: input rate exceeds Vmax/);
  assert.deepEqual(PK.readoutKeys(phenytoin()), ["peak","trough","css","t90","thalf","ratio","mgkg","ttr"]);
  // units and the salt factor: the same curve in another unit system
  const p=phenytoin(), q=PK.convertUnits(p,"mcg");
  [24,100,300].forEach(t=> rel(PK.conc(q,t), 1000*PK.conc(p,t), 1e-6, `mcg at ${t} h`));
});

test("Sheiner–Tozer: a measured phenytoin level adjusted for albumin", ()=>{
  const r=PK.sheinerTozer(8, 2.5, false);
  near(r.factor, 0.6, 1e-12); assert.equal(r.value.toFixed(1), "13.3");
  const e=PK.sheinerTozer(8, 2.5, true);
  near(e.factor, 0.35, 1e-12); assert.equal(e.value.toFixed(1), "22.9");
  near(PK.sheinerTozer(10, 4.5, false).value, 10, 1e-12, "at albumin 4.5 g/dL nothing changes");
});

test("lesson: saturable elimination", ()=>{
  const L=PK.LESSONS.find(x=>x.id==="mm"), chk=PK.lessonCheck(L);
  assert.equal(L.predict.decide(chk), L.predict.answer);
  assert.equal(PK.challengeMet(L, PK.lessonScenario(L)), false);
  assert.equal(PK.challengeMet(L, PK.lessonScenario(L,{D:425})), true);
  assert.equal(PK.challengeMet(L, PK.lessonScenario(L,{D:400})), false, "not the largest");
  assert.equal(PK.challengeMet(L, PK.lessonScenario(L,{D:450})), false, "over 20 mg/L");
  assert.equal(PK.challengeMet(L, PK.lessonScenario(L,{D:425, vmax:8})), false, "only the dose may change");
  assert.ok(L.text.includes("12.1 mg/L") && L.text.includes("10.5 days") && L.text.includes("3.8"));
  const t=PK.TEMPLATES.find(x=>x.id==="mm"); assert.ok(t && t.lesson==="mm");
});

test("the saturable steady state is truly periodic: one interval maps its trough back onto itself, even near Vmax", ()=>{
  // at 75% of Vmax the approach to steady state takes thousands of hours; repeated simulation stops short of
  // it (an earlier search was 0.12% off here), while the periodic solution is exact
  [{route:"inf", vmax:4.58, km:3.42, V:47, D:316, tau:24, tinf:1.9}, {route:"oral", vmax:7, km:4, V:49, D:300, tau:24, ka:0.4, S:0.92},
   {route:"iv", vmax:6, km:2, V:40, D:100, tau:8}].forEach(o=>{
    const p=PK.normalizeScenario(scenario(Object.assign({kin:"mm", dosing:"repeated", nDoses:10, F:1, wt:70}, o))), m=PK.mmSteady(p), V=PK.vOf(p);
    const ag=o.route==="oral" ? p.F*PK.saltOf(p)*p.D*Math.exp(-p.ka*p.tau)/(1-Math.exp(-p.ka*p.tau)) : 0;
    const one=PK.mmIntegrate(p, [{t:0, mg:p.D, route:p.route, dur:p.tinf}], p.tau, {t:0, ag, a:m.trough*V}, 0.005);
    rel(one[one.length-1].a1/V, m.trough, 1e-9, `${o.route}: the trough after one interval (finer steps)`);
    assert.ok(m.trough<=m.avg && m.avg<=m.peak);
  });
  const t0=process.hrtime.bigint();
  for(let i=0;i<200;i++) PK.mmSteady(PK.normalizeScenario(scenario({kin:"mm", dosing:"repeated", route:"oral", vmax:5+i/100, km:4, V:49, D:300, tau:24})));
  const ms=Number(process.hrtime.bigint()-t0)/1e6; assert.ok(ms<1000, `200 steady states in ${ms.toFixed(0)} ms`);
});
