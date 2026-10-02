// Run with: node --test
// Indirect response models (pk-idr.js): baseline with no drug, the analytic plateau and time constant at a constant
// level, the four types' directions, the independent solver, v10 links, the lesson (every number it states), the
// comparison, and the glossary.
const test=require("node:test");
const assert=require("node:assert/strict");
const PK=require("../pk-engine.js");
const {scenario}=PK;

const near=(actual, expected, tol, msg)=>
  assert.ok(Math.abs(actual-expected)<=tol, `${msg?msg+": ":""}expected ${expected} ± ${tol}, got ${actual}`);
const rel=(actual, expected, frac, msg)=> near(actual, expected, Math.abs(expected)*frac, msg);
const S=o=> PK.normalizeScenario(scenario(o));
const I=PK.idr;
const REF=require("../validation/reference-results.json");

test("with no drug the response stays at its baseline, exactly, for every type", ()=>{
  [1,2,3,4].forEach(idr=>{
    const p=S({route:"iv", D:500, idr, tout:7, imax:0.8, smax:3}), cr=I.course(p, 72, ()=>0);
    assert.ok(cr.rs.every(r=>r===100), `type ${idr}`);
    assert.equal(I.rate(p, 100, 0), 0);
  });
});

test("at a constant level the response approaches its plateau exponentially, with time constant 1/kout (types 1, 3) or 1/(kout·(1 ∓ D)) (types 2, 4)", ()=>{
  [[1,0.9,2],[2,0.7,1.5],[3,4,1],[4,2,2]].forEach(([idr, mx, hill])=>{
    [0.5, 4, 40].forEach(c=>{
      [0.5, 6, 48].forEach(tout=>{
        const p=S({idr, tout, imax:idr<3 ? mx : 1, smax:idr>2 ? mx : 4, ec50:4, hill}), k=Math.LN2/tout, f=c**hill/(4**hill+c**hill);
        const D=idr<3 ? mx*f : mx*f, Rss=idr===1 ? 100*(1-D) : idr===2 ? 100/(1-D) : idr===3 ? 100*(1+D) : 100/(1+D);
        const lam=idr===2 ? k*(1-D) : idr===4 ? k*(1+D) : k, where=`type ${idr}, C ${c}, t½,out ${tout}`;
        rel(I.plateau(p, c), Rss, 1e-12, where); rel(I.approach(p, c), lam, 1e-12, where);
        const T=Math.min(240, 6/lam), cr=I.course(p, T, ()=>c);
        [0.1, 0.5, 1, 2, 5].map(x=>x/lam).filter(t=>t<=T).forEach(t=>
          rel(I.interp(cr, t), Rss+(100-Rss)*Math.exp(-lam*t), 1e-7, `${where} at ${t.toFixed(2)} h`));
        // one time constant covers 63.2% of the way
        if(1/lam<=T) rel((I.interp(cr, 1/lam)-100)/(Rss-100), 1-Math.exp(-1), 1e-6, `${where}: 63.2% at 1/λ`);
      });
    });
  });
});

test("each type moves the response the way its mechanism says, lags the plasma peak, and comes back", ()=>{
  const dir={1:-1, 2:1, 3:1, 4:-1};
  [1,2,3,4].forEach(idr=>{
    const p=S({route:"oral", D:500, ka:1.5, thalf:3, V:35, idr, tout:8, imax:0.9, smax:3, ec50:4}), st=I.stats(p, 96);
    assert.equal(Math.sign(st.change), dir[idr], `type ${idr}`);
    assert.ok(st.lag>0, `type ${idr}: the response peaks after the level (${st.lag.toFixed(2)} h)`);
    assert.ok(st.back!==null && st.back>st.tExt, `type ${idr}: back within 10% of the change by ${st.back}`);
    near(I.at(p, 96, 0), 100, 1e-12);
  });
  // a slower turnover: later and smaller (the level has fallen by then); a faster one approaches the plateau curve
  const p=t=> S({route:"oral", D:500, ka:1.5, thalf:3, V:35, idr:1, tout:t, ec50:4}), fast=I.stats(p(0.25),48), slow=I.stats(p(24),48);
  assert.ok(slow.tExt>fast.tExt && Math.abs(slow.change)<Math.abs(fast.change));
  const q=p(0.25), tm=PK.windowStats(q,48,0,Infinity).tmax;
  near(I.at(q,48,tm+2), I.plateau(q, PK.conc(q,tm+2)), 2, "with a 15-minute turnover the response tracks the plateau of the current level");
  // inhibition of production can't go below 100·(1 − Imax); stimulation of loss can't go below 100 / (1 + Smax)
  const big=S({route:"iv", D:4000, V:20, thalf:12, idr:1, imax:0.6, tout:1, ec50:1});
  assert.ok(I.stats(big,72).ext>=40-1e-9);
  const big4=S({route:"iv", D:4000, V:20, thalf:12, idr:4, smax:3, tout:1, ec50:1});
  assert.ok(I.stats(big4,72).ext>=25-1e-9);
});

test("the independent solver agrees: 12 scenarios (four types, every route, custom, two compartments, saturable, a CrCl patient)", ()=>{
  const R=REF.idr;
  assert.ok(R && R.scenarios.length>=12);
  [1,2,3,4].forEach(t=> assert.ok(R.scenarios.some(s=>s.scenario.idr===t), `type ${t}`));
  ["oral","iv","inf"].forEach(r=> assert.ok(R.scenarios.some(s=>s.scenario.route===r), r));
  assert.ok(R.scenarios.some(s=>s.scenario.dosing==="custom") && R.scenarios.some(s=>s.scenario.cmt===2) && R.scenarios.some(s=>s.scenario.kin==="mm") && R.scenarios.some(s=>s.scenario.pm==="clinical"));
  R.scenarios.forEach(s=>{
    const p=S(s.scenario), st=I.stats(p, s.T);
    Object.entries(s.reference.at).forEach(([f,v])=> rel(I.at(p, s.T, +f*s.T), v, R.tolerance.rel, `${s.name} at ${+f*s.T} h`));
    rel(st.ext, s.reference.ext, R.tolerance.rel, `${s.name}: largest change`);
    near(st.tExt, s.reference.t_ext, R.tolerance.t_h, `${s.name}: when`);
  });
});

test("links: an indirect response needs v10 and round-trips; older links have none", ()=>{
  const V=PK.VIEW_DEFAULTS, p=S({idr:3, tout:30, smax:7.5, ec50:2, hill:1.5}), link=PK.encodeLink({mode:"sim", s:p, view:V});
  assert.ok(link.startsWith("v=10&"), link);
  const back=PK.decodeLink(link).s;
  ["idr","tout","smax","ec50","hill"].forEach(k=> assert.equal(back[k], p[k], k));
  assert.ok(PK.encodeLink({mode:"sim", s:S({fu:0.5}), view:V}).startsWith("v=9&"), "fu alone is still v9");
  ["v=1&s=D:400", "v=6&s=teq:2", "v=9&s=fu:0.5"].forEach(h=> assert.equal(PK.decodeLink(h).s.idr, 0, h));
  const bad=PK.decodeLink("v=10&s=idr:7,tout:0,imax:3,smax:-1").s;
  assert.deepEqual([bad.idr, bad.tout, bad.imax, bad.smax], [0, 0.25, 1, 0.1], "unknown type ignored, numbers clamped");
  // relevance: the direct model's E₀ and Emax give way to the response's settings; since v14 the effect-site delay
  // stays, and drives the response through the effect site
  const r=S({idr:2});
  assert.deepEqual(["e0","emax","teq","tout","imax","smax"].map(k=>PK.isRelevant(k,r)), [false,false,true,true,true,false]);
  assert.deepEqual(["e0","emax","teq","tout","imax","smax"].map(k=>PK.isRelevant(k,S({}))), [true,true,true,false,false,false]);
  assert.ok(PK.LOCKS.some(l=>l[0]==="tout"), "Vary only can hold the turnover apart");
});

test("compare rows: the largest change in response and its time, for A and B", ()=>{
  const a=S({route:"oral", D:500, idr:1, tout:2}), b=S({route:"oral", D:500, idr:1, tout:20});
  const rows=PK.compareRows(a, b, 48, 2, 12, 50).rows, row=k=> rows.find(x=>x.key===k);
  near(row("rchange").a, I.stats(a,48).change, 1e-12); near(row("rtime").b, I.stats(b,48).tExt, 1e-12);
  assert.ok(!rows.some(x=>x.key==="epeak"), "the direct-effect rows give way");
  assert.ok(PK.compareRows(S({}), S({D:600}), 24, 2, 12, 50).rows.some(x=>x.key==="epeak"), "direct effects keep theirs");
});

/* ---------- lesson ---------- */
const numbersIn=s=> s.match(/(?<![A-Za-z\d.])\d+(\.\d+)?/g)||[];
const r=(v,dp)=> String(+v.toFixed(dp));

test("lesson: indirect response (every number the text, tip and comparison state)", ()=>{
  const L=PK.LESSONS.find(x=>x.id==="idr"), V=Object.assign({}, PK.VIEW_DEFAULTS, L.view), a=S(L.base), b=S(L.cur), T=V.duration;
  const sa=I.stats(a,T), sb=I.stats(b,T), d=PK.derived(a);
  assert.equal(L.group, "pd"); assert.equal(V.pd, true);
  // the warfarin label's values: effective half-life about 40 h, volume about 0.14 L/kg, peak within the first 4 hours
  assert.equal(a.thalf, 40); near(a.V, 0.14*70, 1e-9); assert.ok(d.tmax<4); assert.equal(r(d.tmax,1), "3.6");
  assert.deepEqual([a.tout, b.tout], [5, 60], "factor VII's 4–6 hours and factor II's 60 hours");
  assert.equal(r(sa.ext,0), "37"); assert.equal(r(sa.tExt,0), "24"); assert.equal(r(I.at(a,T,96),0), "64");
  assert.equal(r(sb.ext,0), "67"); assert.equal(r(sb.tExt,0), "96");
  const daily=S(Object.assign({}, L.cur, {dosing:"repeated", tau:24, nDoses:7}));
  assert.equal(r(I.stats(daily,T).ext,0), "29");
  const checked=["40","0.14","9.8","3.6","4","25","1","6","60","5","37","24","64","96","67","72","7","29"];
  numbersIn(L.text).forEach(n=> assert.ok(checked.includes(n), `the text states ${n}`));
  numbersIn(L.tryThis).forEach(n=> assert.ok(checked.includes(n), `the tip states ${n}`));
  const t=PK.TEMPLATES.find(x=>x.id==="idr");
  numbersIn(t.look+" "+t.nameA+" "+t.nameB).forEach(n=> assert.ok(checked.includes(n), `the comparison states ${n}`));
  assert.equal(L.predict.decide(PK.lessonCheck(L)), L.predict.answer);
  // the challenge: not by a bigger single dose, nor by a faster turnover
  [[{D:100}, false], [{tout:5}, false], [{dosing:"repeated", tau:24, nDoses:7}, true]].forEach(([o, ok])=>
    assert.equal(PK.challengeMet(L, PK.lessonScenario(L, o)), ok, JSON.stringify(o)));
});

test("glossary: the indirect-response terms, and the effect compartment's origin", ()=>{
  const g=t=> PK.GLOSSARY.find(x=>x.term===t);
  ["Indirect response","Response turnover","Baseline response"].forEach(t=> assert.ok(g(t) && g(t).lesson==="idr", t));
  assert.match(g("Effect compartment").def, /1979/);
  // the baseline relation the glossary states: R₀·(1 − Imax·f) for inhibited production
  const p=S({idr:1, imax:0.5, ec50:2}); rel(I.plateau(p, 2), 100*(1-0.5*0.5), 1e-12);
  ["dayneka1993","sheinerStanski1979","warfarin"].forEach(k=> assert.ok(PK.SOURCES[k] && PK.SOURCES[k].url, k));
});

test("an effect-site delay drives the response through the effect site (2.17), and older links open as they did", ()=>{
  const V=PK.VIEW_DEFAULTS, base={route:"oral", dosing:"single", D:25, F:1, ka:1.2, thalf:40, V:9.8, ec50:1, idr:1, imax:1, tout:5};
  const plain=S(base), slow=S({...base, teq:6});
  // no delay: the response follows the plasma level exactly as before; a delay of 0 is the same scenario
  assert.equal(PK.keqOf(plain), 0); assert.ok(PK.keqOf(slow)>0);
  const a=I.stats(plain, 168), b=I.stats(slow, 168);
  assert.ok(b.tExt>a.tExt+2, `the largest change comes later with the delay (${a.tExt.toFixed(2)} → ${b.tExt.toFixed(2)} h)`);
  assert.ok(Math.abs(b.change)<Math.abs(a.change), "and is smaller, as the effect site never reaches the plasma peak");
  assert.equal(b.tCmax, a.tCmax, "the plasma peak itself doesn't move");
  // at a constant plasma level the delay changes nothing once the effect site has caught up
  const flat=t=> 2, cf=I.course(slow, 400, flat), cp=I.course(plain, 400, flat);
  near(I.interp(cf, 400), I.interp(cp, 400), 1e-9, "a level passed in directly is used as given");
  // links: the pair needs v14 and round-trips; a v13 link with both opens as it always did, driven by plasma
  const link=PK.encodeLink({mode:"sim", s:slow, view:V});
  assert.ok(link.startsWith("v=14&"), link);
  assert.equal(PK.decodeLink(link).s.teq, 6);
  assert.equal(PK.decodeLink(link.replace("v=14&","v=13&")).s.teq, 0, "before v14 the delay did nothing with a response");
  assert.equal(PK.decodeLink("v=13&s=teq:2").s.teq, 2, "a direct effect keeps its delay");
  assert.ok(PK.encodeLink({mode:"sim", s:plain, view:V}).startsWith("v=10&"), "a response without a delay is still v10");
  // the population band follows the same course
  const Pop=require("../pop-worker.js"), r=Pop.population(PK, slow, {T:168, n:50, cvCL:0, cvV:0, seed:1, pd:1});
  const worst=Math.max(...r.t.map((t,i)=> Math.abs(r.e50[i]-I.at(slow, 168, t))));
  assert.ok(worst<0.05, `with no variability the band's median is the response itself (worst ${worst.toFixed(4)} points)`);
});
