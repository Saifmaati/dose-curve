"use strict";
// The 3D chart's numbers (ui-chart3d.js, 2.18): every surface, trajectory and cloud it draws comes from the engine,
// and these tests hold each to it. The drawing itself is checked in a browser (BUILD_REPORT 46).
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const crypto=require("node:crypto");
const PK=require("../pk-engine.js");
const C3=require("../ui-chart3d.js");
const Pop=require("../pop-worker.js");
const S=o=> PK.normalizeScenario(PK.scenario(o));
const rel=(a,b,f,msg)=> assert.ok(Math.abs(a-b)<=Math.abs(b)*f+1e-12, `${msg}: ${a} vs ${b}`);
const root=path.join(__dirname,".."), read=f=> fs.readFileSync(path.join(root,f),"utf8");

test("3D: the page's easing is cubic-bezier(0.22, 1, 0.36, 1): from 0 to 1, never backwards, front-loaded", ()=>{
  const E=C3.EASE;
  assert.equal(E(0), 0); assert.equal(E(1), 1);
  let last=0; for(let i=1;i<=200;i++){ const v=E(i/200); assert.ok(v>=last-1e-12, `monotone at ${i/200}`); last=v; }
  assert.ok(E(.25)>.7 && E(.5)>.93, "most of the move in its first half");
  // the curve passes through its own control points' x(t), y(t): at t = 0.5 of the parameter
  const bx=t=> 3*(1-t)*(1-t)*t*.22+3*(1-t)*t*t*.36+t*t*t, by=t=> 3*(1-t)*(1-t)*t*1+3*(1-t)*t*t*1+t*t*t;
  [.1,.3,.5,.8].forEach(t=> assert.ok(Math.abs(E(bx(t))-by(t))<1e-6, `on the bezier at t=${t}`));
});

test("3D: a dragged dose snaps to practical strengths: a drug's own tablets and vials, else steps that suit the dose", ()=>{
  const ibu={strengths:{mg:[200,400,600,800]}}, vanc={strengths:{round:250}}, dig={strengths:{mg:[62.5,125,250]}};
  assert.deepEqual(C3.doseSteps(100, 1300, ibu), [200,400,600,800,1000,1200]);
  assert.deepEqual(C3.doseSteps(600, 1800, vanc), [750,1000,1250,1500,1750]);
  assert.ok(C3.doseSteps(60, 400, dig).includes(187.5) && C3.doseSteps(60, 400, dig).includes(375), "sums of up to three tablets");
  assert.deepEqual(C3.doseSteps(125, 1250, null, 500).slice(0,4), [150,200,250,300], "a tenth of the dose, rounded to 1, 2, 2.5 or 5 × 10ⁿ: 50 mg");
  assert.equal(C3.nearest(1040, [750,1000,1250]), 1000);
  assert.deepEqual(C3.TAUS, [4,6,8,12,24], "the intervals a regimen snaps to stay within the simulator's 2–24 h");
});

test("3D: the dose surface is the engine's level for each dose, nothing else changed", ()=>{
  [S({}), S({route:"inf", dosing:"repeated", D:1000, tinf:1, tau:12, nDoses:4, cmt:2, k12:.8, k21:.3}), S({kin:"mm", dosing:"repeated", D:300, tau:24, nDoses:5})].forEach(p=>{
    const G=C3.doseGrid(PK, p, 0, 48, [p.D/2, p.D, p.D*2], 25);
    G.doses.forEach((D,r)=>{ const q=S(Object.assign({}, p, {D})), ev=PK.doseEvents(q); G.ts.forEach((t,j)=> assert.equal(G.c[r][j], PK.conc(q, t, ev))); });
    if(p.kin!=="mm") G.ts.forEach((t,j)=> rel(G.c[2][j], 4*G.c[0][j], 1e-9, "linear kinetics: the level scales with the dose"));
    else assert.ok(G.c[2][24]>4*G.c[0][24], "saturable: twice the dose more than doubles the level");
  });
});

test("3D: the regimen map's targets at steady state: AUC24 = F·S·D/CL·24/τ, the trough and peak the engine's, none where a saturable regimen never settles", ()=>{
  const p=S({route:"oral", F:.8, ka:1, thalf:6, V:40}), doses=[250,500,1000], taus=[6,12,24];
  const auc=C3.regimenGrid(PK, p, doses, taus, "auc", 0), tr=C3.regimenGrid(PK, p, doses, taus, "trough", 0), pk=C3.regimenGrid(PK, p, doses, taus, "peak", 0);
  taus.forEach((tau,r)=> doses.forEach((D,c)=>{
    const q=C3.regimenOf(PK, p, D, tau), ss=PK.ssPeakTrough(q);
    assert.equal(q.dosing, "repeated"); assert.equal(q.loadMult, 1); assert.equal(q.missed, 1);
    rel(auc.v[r][c], .8*D/PK.derived(q).CL*24/tau, 1e-12, "AUC24");
    assert.equal(tr.v[r][c], ss.trough); assert.equal(pk.v[r][c], ss.peak);
    // and AUC24 is the area of one interval at steady state, per day
    const n=40, area=(()=>{ let s=0; for(let i=0;i<n;i++){ const a=tau*i/n, b=tau*(i+1)/n; s+=(b-a)/6*(PK.ssConc(q,a)+4*PK.ssConc(q,(a+b)/2)+PK.ssConc(q,Math.min(b,tau-1e-9))); } return s; })();
    rel(auc.v[r][c], area*24/tau, 2e-4, "AUC24 against the steady-state curve");
  }));
  const mm=S({kin:"mm", vmax:7, km:4, dosing:"repeated", tau:24, D:300});
  assert.equal(C3.ssMetric(PK, C3.regimenOf(PK, mm, 2000, 24), "trough", 0), null, "past Vmax: no steady state, no value");
  const mic=C3.regimenGrid(PK, S({route:"inf", tinf:.5, thalf:1, V:20}), [1000], [8], "ft", 2).v[0][0];
  assert.equal(mic, PK.micStats(C3.regimenOf(PK, S({route:"inf", tinf:.5, thalf:1, V:20}), 1000, 8), 2, 24).ft);
});

test("3D: the peripheral compartment: an IV bolus matches the closed form, and a long infusion brings both levels together", ()=>{
  const p=S({route:"iv", dosing:"single", D:1000, V:20, thalf:4, cmt:2, k12:.8, k21:.3});
  const ts=Array.from({length:97},(_,i)=> i*0.25), R=C3.periphCourse(PK, p, ts);
  const k10=Math.LN2/4, s=k10+.8+.3, root=Math.sqrt(s*s-4*k10*.3), a=(s+root)/2, b=(s-root)/2, V2=20*.8/.3;
  ts.forEach((t,i)=>{ const A2=1000*.8/(a-b)*(Math.exp(-b*t)-Math.exp(-a*t)); assert.ok(Math.abs(R.c2[i]-A2/V2)<=1e-6*Math.max(1,A2/V2), `t=${t}: ${R.c2[i]} vs ${A2/V2}`); });
  assert.equal(R.V2, V2);
  const inf=S({route:"inf", dosing:"single", D:9000, tinf:90, V:20, thalf:4, cmt:2, k12:.8, k21:.3}), T=[0,30,60,89];
  const Ri=C3.periphCourse(PK, inf, T);
  // on a long infusion the peripheral level closes on the central one (5 terminal half-lives in: within 1%)
  const gap=T.map((t,i)=> Ri.c1[i]-Ri.c2[i]);
  assert.ok(gap[1]>0 && gap[2]<gap[1] && gap[3]<gap[2], `the gap shrinks: ${gap.map(g=>g.toFixed(3))}`);
  rel(Ri.c2[3], Ri.c1[3], 1e-2, "nearly equal by the infusion's end");
  // repeated doses: the course passes each dose without stepping over it
  const rep=S({route:"iv", dosing:"repeated", D:500, tau:8, nDoses:4, V:20, thalf:4, cmt:2, k12:.8, k21:.3}), tr=[0,7.9,8.1,16.1,24.1];
  const Rr=C3.periphCourse(PK, rep, tr); assert.ok(Rr.c2.every((v,i)=> i===0 || v>0));
});

test("3D: the population cloud is population mode's own patients (same seed), and its percentiles are the band's", ()=>{
  const p=S({route:"oral", dosing:"repeated", D:500, tau:12, nDoses:4}), o={T:48, n:120, cvCL:30, cvV:20, seed:7};
  const band=Pop.population(PK, p, o), cloud=C3.popCurves(PK, Pop, p, o, band.t);
  assert.equal(cloud.list.length, 120);
  band.t.forEach((t,j)=>{ rel(cloud.q50[j], band.q50[j], 1e-12, `median at ${t} h`); rel(cloud.q05[j], band.q05[j], 1e-12, "5th"); rel(cloud.q95[j], band.q95[j], 1e-12, "95th"); });
  for(let i=1;i<cloud.list.length;i++) assert.ok(cloud.list[i].CL>=cloud.list[i-1].CL, "ordered by clearance, front to back");
  const pts=Pop.patients(PK, p, o), ids=new Set(pts.map(q=> PK.derived(q).CL.toFixed(12)));
  assert.ok(cloud.list.every(x=> ids.has(x.CL.toFixed(12))), "each patient one of the band's");
  const mm=C3.popCurves(PK, Pop, S({kin:"mm", dosing:"repeated", D:300, tau:24, nDoses:3}), {T:72, n:50, cvCL:30, cvV:20, seed:3}, [0,24,48,72]);
  assert.ok(mm.list.every(x=> x.vmax>0 && x.CL===null), "saturable: ordered by Vmax");
});

test("3D: the switch sits with Linear and Log, the code arrives on the first press (Three.js through the stage), and the 2D chart stays the default", ()=>{
  const page=read("index.html"), sw=read("sw.js"), h=crypto.createHash("sha256").update(fs.readFileSync(path.join(root,"ui-chart3d.js"))).digest("hex").slice(0,10);
  assert.match(page, /<div class="mini-seg" id="scaleSeg"[\s\S]*?<\/div>\s*<button type="button" id="tb3d" aria-pressed="false"[^>]*>3D<\/button>/, "beside Linear and Log, off");
  assert.ok(page.includes(`const C3D_SRC="ui-chart3d.js?v=${h}"`) && sw.includes(`"./ui-chart3d.js?v=${h}"`), "stamped and precached");
  assert.match(page, /import\("\.\/"\+STAGE_SRC\)\.then\(m=> m\.loadThree\(\)\)/, "Three.js comes through stage.js");
  const stage=read("stage.js");
  assert.match(stage, /export const loadThree=\(\)=> import\("three"\);/);
  // the stage's own loader calls the export, which no local name inside start() may shadow (a 2.18 review finding)
  assert.match(stage, /return threeLoading=loadThree\(\)\.then\(/);
  assert.ok(!/\b(let|const|var|function)\s+loadThree\b/.test(stage.replace("export const loadThree=", "")), "nothing shadows loadThree");
  assert.ok(!/DCChart3D/.test(page.replace(/function load3d\(\)\{[\s\S]*?\n  \}/,"")), "nothing 3D runs until the press");
  assert.match(page, /\.no-gl #tb3d\{display:none\}/, "no switch without WebGL");
  const c3=read("ui-chart3d.js");
  assert.match(c3, /Educational model, not for clinical dosing\./, "the disclaimer in the 3D view");
  assert.match(c3, /<button type="button" class="c3d-skip">Skip the 3D view<\/button>/, "a skip control");
  assert.match(c3, /role="radiogroup" aria-label="3D view"/);
  assert.match(c3, /aria-describedby="plotSummary"/, "the canvas is described by the chart's own summary");
  assert.match(c3, /prefers-reduced-motion: reduce/, "still under reduced motion");
});

test("3D (review): fT>MIC is read only at steady state, snapping uses a drug only while the scenario is that drug, and liver-model patients are ordered by volume", ()=>{
  // a saturable regimen past Vmax never settles: no fT>MIC either (it used to read the first 24 h as if steady)
  const mm=S({kin:"mm", vmax:7, km:4, route:"iv", dosing:"repeated", tau:6, D:1000});
  const q=C3.regimenOf(PK, mm, 1000, 6);
  assert.equal(PK.mmSteady(q).none, true);
  ["auc","trough","peak","ft"].forEach(m=> assert.equal(C3.ssMetric(PK, q, m, 40), null, m));
  const lin=C3.regimenOf(PK, S({route:"inf", tinf:.5, thalf:1, V:20}), 1000, 8);
  assert.equal(C3.ssMetric(PK, lin, "ft", 2), PK.micStats(lin, 2, 24).ft, "a regimen that settles keeps its value");
  // the drug whose strengths a dose snaps to
  const dig=PK.DRUGS.find(d=> d.id==="dig"), as=Object.assign({}, dig.s, {unit:dig.units});
  assert.equal(C3.drugFor(dig, S(Object.assign({}, as, {D:500}))), dig, "the same drug at another dose");
  assert.equal(C3.drugFor(dig, S({D:500})), null, "another scenario (a lesson, a link): no drug's strengths");
  assert.equal(C3.drugFor(dig, S(Object.assign({}, as, {thalf:as.thalf*2}))), null, "the drug with its half-life changed is no longer it");
  assert.equal(C3.drugFor(null, S({})), null);
  // with the liver model population mode leaves clearance alone (it varies the half-life, which the model replaces),
  // so the cloud is ordered by volume
  const hep=S({hep:1, route:"oral", dosing:"repeated", D:500, tau:12, nDoses:3}), cl=C3.popCurves(PK, Pop, hep, {T:36, n:40, cvCL:30, cvV:20, seed:5}, [0,12,24,36]);
  assert.equal(new Set(cl.list.map(x=> x.CL.toFixed(9))).size, 1, "one clearance for all");
  for(let i=1;i<cl.list.length;i++) assert.ok(cl.list[i].V>=cl.list[i-1].V, "ordered by volume");
});
