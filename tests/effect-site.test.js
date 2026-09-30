// Run with: node --test
// The effect-site delay (teq, the equilibration half-life ln 2 / ke0): its closed forms against an independent
// integration of dCe/dt = ke0·(C − Ce), the identities it must keep, the v6 links that carry it, and the lesson.
const test=require("node:test");
const assert=require("node:assert/strict");
const PK=require("../pk-engine.js");
const {scenario}=PK;

const near=(actual, expected, tol, msg)=>
  assert.ok(Math.abs(actual-expected)<=tol, `${msg?msg+": ":""}expected ${expected} ± ${tol}, got ${actual}`);
const rel=(actual, expected, frac, msg)=> near(actual, expected, Math.abs(expected)*frac, msg);
const S=o=> PK.normalizeScenario(scenario(o));

// RK4 on dCe/dt = ke0·(C − Ce), with plasma read from the engine, stepping separately between doses and
// infusion ends (where plasma jumps or kinks)
function integrate(p, T, h){
  const k0=Math.LN2/p.teq, ev=PK.doseEvents(p), cuts=new Set([0,T]);
  ev.forEach(e=>{ if(e.t<T) cuts.add(e.t); if(e.route==="inf" && e.t+e.dur<T) cuts.add(e.t+e.dur); });
  const cs=[...cuts].sort((a,b)=>a-b);
  let ce=0;
  for(let i=0;i<cs.length-1;i++){
    const a=cs[i], b=cs[i+1], n=Math.max(1,Math.ceil((b-a)/h)), dt=(b-a)/n;
    const C=t=> PK.conc(p, Math.min(b-1e-12, Math.max(a+1e-12, t)), ev), f=(t,y)=>k0*(C(t)-y);
    for(let j=0;j<n;j++){
      const t=a+j*dt, k1=f(t,ce), k2=f(t+dt/2,ce+dt/2*k1), k3=f(t+dt/2,ce+dt/2*k2), k4=f(t+dt,ce+dt*k3);
      ce+=dt/6*(k1+2*k2+2*k3+k4);
    }
  }
  return ce;
}

test("effect site: an IV bolus into one compartment is C0·ke0/(ke0 − k)·(e^(−kt) − e^(−ke0·t)), peaking where it meets plasma", ()=>{
  const p=S({route:"iv", teq:1}), k=Math.LN2/4, k0=Math.LN2, C0=500/35;
  [0.25,1,2,5,12,30].forEach(t=> rel(PK.ceConc(p,t), C0*k0/(k0-k)*(Math.exp(-k*t)-Math.exp(-k0*t)), 1e-12, `t = ${t}`));
  assert.equal(PK.ceConc(p,0), 0, "the site starts empty");
  // the peak: t = ln(ke0/k) / (ke0 − k); there the site's level equals plasma's (dCe/dt = 0)
  const tp=Math.log(k0/k)/(k0-k), st=PK.effectStats(p,24,50);
  near(st.tPeak, tp, 1e-6, "time of peak effect"); rel(PK.ceConc(p,tp), PK.conc(p,tp), 1e-12, "the loop meets the curve at the peak");
  rel(st.peak, PK.effectOf(p, C0*Math.pow(k/k0, k/(k0-k))), 1e-9, "peak effect from the closed-form peak level");
  // equal rates: C0·ke0·t·e^(−ke0·t)
  const q=S({route:"iv", teq:4});
  [0.5,4,9].forEach(t=> rel(PK.ceConc(q,t), C0*k*t*Math.exp(-k*t), 1e-12, `ke0 = k, t = ${t}`));
});

test("effect site: the closed forms match an independent integration for every route, two compartments, regimens and custom schedules", ()=>{
  const cases=[
    {route:"iv",teq:0.5,thalf:0.5}, {route:"oral",teq:2}, {route:"oral",teq:4,ka:Math.LN2/4}, {route:"oral",teq:Math.LN2/1.2},
    {route:"oral",teq:4.0001,ka:Math.LN2/4*1.0000001}, {route:"oral",teq:12,ka:3}, {route:"inf",tinf:2,teq:1.5},
    {route:"inf",tinf:0.25,teq:6,cmt:2,k12:1,k21:0.3}, {route:"oral",dosing:"repeated",tau:6,nDoses:5,teq:3,cmt:2,k12:2,k21:0.4},
    {route:"iv",dosing:"repeated",tau:8,nDoses:4,missed:2,teq:0.25}, {route:"inf",dosing:"repeated",tau:6,nDoses:6,tinf:8,teq:4},
    {route:"oral",dosing:"repeated",tau:12,nDoses:3,loadMult:2,teq:1,pm:"clinical",scr:2,fe:0.8},
    {dosing:"custom",teq:1.5,events:[{t:0,mg:500,route:"iv"},{t:3,mg:250,route:"oral"},{t:7,mg:400,route:"inf",dur:2},{t:9,mg:300,route:"iv",status:"missed"}]}
  ];
  cases.forEach(o=>{
    const p=S(o);
    [0.3,1,3.7,8.5,14,26].forEach(T=> rel(PK.ceConc(p,T), integrate(p,T,0.004), 1e-8, `${JSON.stringify(o)} at ${T} h`));
  });
});

test("effect site: no delay is plasma exactly; saturable elimination keeps the direct link; exposure is conserved", ()=>{
  const p=S({}), ev=PK.doseEvents(p);
  [0,0.4,1.885,7,23].forEach(t=> assert.equal(PK.ceConc(p,t,ev), PK.conc(p,t,ev)));
  assert.equal(PK.keqOf(p), 0);
  assert.deepEqual(PK.effectStats(p,24,50), PK.effectStats(S({teq:0}),24,50));
  const mm=S({kin:"mm", teq:2});
  assert.equal(PK.keqOf(mm), 0); assert.equal(PK.isRelevant("teq", mm), false); assert.equal(PK.isRelevant("teq", S({})), true);
  assert.equal(PK.ceConc(mm,5), PK.conc(mm,5));
  // the site holds a negligible amount and passes everything on: over a long window its area is plasma's AUC,
  // F·D / CL (to the window's Simpson sum, 336 h in 600 steps)
  [{teq:2},{route:"iv",teq:0.5,cmt:2,k12:1,k21:0.5},{route:"inf",tinf:3,teq:6}].forEach(o=>{
    const q=S(o);
    rel(PK.windowStats(q,336,0,Infinity,"effect").auc, PK.derived(q).auc, 5e-5, JSON.stringify(o));
  });
  // the effect statistics follow the site: a later, lower peak, with the time above target by exact crossings
  const d=S({teq:2}), st=PK.effectStats(d,24,50), ct=PK.concForEffect(d,50);
  near(PK.ceConc(d,st.onset), ct, 1e-9, "onset is where the site reaches the target level");
  let n=0; for(let i=0;i<48000;i++) if(PK.ceConc(d,(i+0.5)*24/48000)>=ct) n++;
  near(st.tAbove, n*24/48000, 1e-3, "time at or above target, by a dense count");
});

test("links: an effect-site delay needs a v6 link and round-trips; older links and the defaults are unchanged", ()=>{
  const V=PK.VIEW_DEFAULTS;
  assert.equal(PK.VERSION, 6);
  const link=PK.encodeLink({mode:"sim", s:S({teq:1.5}), view:Object.assign({},V,{pd:true})});
  assert.ok(link.startsWith("v=6&"), link); assert.ok(link.includes("teq:1.5"), link);
  assert.equal(PK.decodeLink(link).s.teq, 1.5);
  assert.ok(PK.encodeLink({mode:"sim", s:S({}), view:V}).startsWith("v=1&"), "the default scenario still makes a v1 link");
  assert.ok(PK.encodeLink({mode:"sim", s:S({ec50:2}), view:V}).startsWith("v=4&"), "other effect settings still make v4");
  assert.equal(PK.decodeLink("v=5&s=D:400").s.teq, 0, "a v5 link has no delay");
  assert.equal(PK.decodeLink("v=6&s=teq:99").s.teq, 12, "clamped"); assert.equal(PK.decodeLink("v=6&s=teq:-1").s.teq, 0);
  assert.equal(PK.decodeLink("v=6&s=teq:x").s.teq, 0);
  assert.equal(PK.decodeLink("v=7&s=teq:1").newer, true);
});

test("lesson: effect delay (hysteresis), every number the text and the comparison state", ()=>{
  const L=PK.LESSONS.find(x=>x.id==="delay"), a=S(L.base), b=S(L.cur), T=L.view.duration, tg=L.view.etgt;
  const wa=PK.windowStats(a,T,0,Infinity), wb=PK.windowStats(b,T,0,Infinity);
  assert.equal(wa.cmax.toFixed(1), "9.3"); assert.equal(wa.tmax.toFixed(1), "1.9"); assert.equal(wb.cmax, wa.cmax, "identical plasma curves");
  const ea=PK.effectStats(a,T,tg), eb=PK.effectStats(b,T,tg);
  assert.deepEqual([ea.onset.toFixed(1), eb.onset.toFixed(1)], ["0.3","2.1"]);
  assert.deepEqual([ea.tPeak.toFixed(1), eb.tPeak.toFixed(1)], ["1.9","5.0"]);
  assert.deepEqual([ea.peak.toFixed(0), eb.peak.toFixed(0)], ["70","61"]);
  assert.equal((eb.tPeak-ea.tPeak).toFixed(1), "3.1"); assert.equal((eb.onset-ea.onset).toFixed(1), "1.8");
  // the same plasma level, 4 mg/L (the EC50), on the way up and on the way down
  assert.equal(a.ec50, 4);
  const cross=[]; let prev=PK.conc(b,0);
  for(let i=1;i<=24000;i++){ const t=T*i/24000, c=PK.conc(b,t); if((prev<4)!==(c<4)){ let lo=t-T/24000, hi=t; for(let k=0;k<60;k++){ const m=(lo+hi)/2; if((PK.conc(b,m)<4)===(prev<4)) lo=m; else hi=m; } cross.push(hi); } prev=c; }
  assert.equal(cross.length, 2);
  assert.deepEqual(cross.map(t=> PK.effectOf(b, PK.ceConc(b,t)).toFixed(0)), ["5","58"]);
  assert.deepEqual(cross.map(t=> PK.effectOf(a, PK.ceConc(a,t)).toFixed(0)), ["50","50"], "without the delay, 50% both ways");
  // counterclockwise: below the direct-link curve while plasma rises, above it while plasma falls
  [0.5,1,1.5].forEach(t=> assert.ok(PK.ceConc(b,t)<PK.conc(b,t)));
  [6,10,20].forEach(t=> assert.ok(PK.ceConc(b,t)>PK.conc(b,t)));
  const checked=["500","9.3","1.9","2","50","2.1","0.3","5.0","61","70","4","5","58"];
  (L.text.match(/(?<![A-Za-z\d.])\d+(\.\d+)?/g)||[]).forEach(n=> assert.ok(checked.includes(n), `the text states ${n}, which no assertion checks`));
  const t=PK.TEMPLATES.find(x=>x.id==="delay"); assert.ok(t && t.lesson==="delay");
  (t.look.match(/\d+(\.\d+)?/g)||[]).concat(t.nameB.match(/\d+/g)).forEach(n=> assert.ok(checked.concat(["3.1","1.8"]).includes(n), `the comparison states ${n}`));
  // prediction and challenge
  assert.equal(L.predict.decide(PK.lessonCheck(L)), L.predict.answer);
  assert.equal(PK.challengeMet(L, PK.lessonScenario(L)), false);
  assert.equal(PK.challengeMet(L, PK.lessonScenario(L, L.challenge.solution)), true);
  assert.equal(PK.challengeMet(L, PK.lessonScenario(L, {D:725})), false, "not quite");
  assert.equal(PK.challengeMet(L, PK.lessonScenario(L, {teq:0})), false, "not by removing the delay");
  ["Effect compartment","Hysteresis"].forEach(term=> assert.ok(PK.GLOSSARY.some(g=> g.term===term && g.lesson==="delay"), term));
});

test("“Vary only effect-site delay” keeps B's delay and shares everything else, and survives a link", ()=>{
  let c=PK.cmpApply(PK.newComparison({route:"oral"}), "b", {teq:2, ec50:6});
  c=PK.cmpSetLock(c,"teq");
  assert.deepEqual([c.a.teq, c.b.teq, c.b.ec50], [0, 2, 4], "B keeps its delay and takes A's EC50");
  assert.ok(PK.lockHolds(c));
  c=PK.cmpApply(c,"b",{D:750});
  assert.equal(c.a.D, 750, "other changes are mirrored to A");
  const st=PK.decodeLink(PK.encodeLink({mode:"cmp", a:c.a, b:c.b, lock:"teq", view:PK.VIEW_DEFAULTS}));
  assert.equal(st.lock, "teq"); assert.equal(st.b.teq, 2);
});

