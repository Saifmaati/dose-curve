/* DoseCurve PK engine
   One-compartment linear pharmacokinetics (first-order oral absorption, IV bolus, IV infusion),
   regimens with loading and missed doses, exposure metrics, the teaching presets, and the
   share-link codec. Pure functions with no DOM access: the page loads this file as window.PK and
   the tests load it with require(). */
(function(root, factory){
  const api=factory();
  if(typeof module==="object" && module.exports) module.exports=api;
  else root.PK=api;
})(typeof self!=="undefined" ? self : this, function(){
  "use strict";

  const VERSION=1;

  /* ================= SCENARIO MODEL ================= */
  // A scenario is a flat object of these keys. The time window, thresholds and chart settings are
  // view settings, shared by the two scenarios in a comparison.
  const PK_KEYS=["route","dosing","D","F","ka","thalf","V","tinf","tau","nDoses","loadMult","missed","wt","clFn"];
  const DEFAULTS={route:"oral",dosing:"single",D:500,F:0.9,ka:1.2,thalf:4,V:35,tinf:1,tau:8,nDoses:6,loadMult:1,missed:1,wt:70,clFn:100};
  const CHOICES={route:["oral","iv","inf"],dosing:["single","repeated"],loadMult:[1,1.5,2]};
  // Numeric limits, shared with the sliders. missed = 1 means no dose is missed.
  const RANGES={D:[25,2000],F:[0.1,1],ka:[0.1,3],tinf:[0.25,96],thalf:[0.5,24],V:[5,120],tau:[2,24],
    nDoses:[2,20],missed:[1,19],wt:[40,120],clFn:[25,150]};
  const INTEGER_KEYS=["nDoses","missed"];
  const VIEW_DEFAULTS={duration:24,mec:2,mtc:12,scale:"lin",zoom:"full"};
  const VIEW_RANGES={duration:[6,168],mec:[0,10000],mtc:[0,10000]};
  // Settings that "Vary only" can hold apart while every other setting is shared by A and B.
  const LOCKS=[["D","Dose"],["tau","Dosing interval"],["loadMult","Loading dose"],["missed","Missed dose"],["route","Route"],
    ["clFn","Organ function"],["thalf","Half-life"],["V","Volume"],["F","Bioavailability"],["ka","Absorption rate"]];

  const scenario=over=>Object.assign({},DEFAULTS,over);
  // Cross-setting rule the individual ranges can't express: a missed dose must fall inside the regimen
  // (and can't be the final dose). Otherwise it is cleared, so the controls never show a missed dose
  // the model is ignoring.
  function normalizeScenario(p){
    const q=Object.assign({},p);
    if(q.missed>=q.nDoses) q.missed=1;
    return q;
  }
  const clamp=(v,[lo,hi])=>Math.min(hi,Math.max(lo,v));

  /* ================= PK ENGINE ================= */
  const keOf = p=> (Math.LN2/p.thalf) * (p.clFn/100);
  const vOf  = p=> p.V * (p.wt/70);
  // The final dose can't be skipped: final-interval peak and trough are defined by it, and skipping it
  // is the same as giving one dose fewer.
  const missedOf = p=> (p.dosing==="repeated" && p.missed>1 && p.missed<p.nDoses) ? p.missed : 0;

  function singleConc(p, t, mult){
    if(t<0) return 0;
    const k=keOf(p), V=vOf(p), D=p.D*mult;
    if(p.route==="iv"){
      return (D/V)*Math.exp(-k*t);
    }
    if(p.route==="inf"){
      const Ti=p.tinf, R0=D/Ti;
      if(t<=Ti) return (R0/(k*V))*(1-Math.exp(-k*t));
      const cEnd=(R0/(k*V))*(1-Math.exp(-k*Ti));
      return cEnd*Math.exp(-k*(t-Ti));
    }
    const ka=p.ka, F=p.F;
    if(Math.abs(ka-k)<1e-6) return (F*D/V)*ka*t*Math.exp(-ka*t);
    return (F*D*ka)/(V*(ka-k))*(Math.exp(-k*t)-Math.exp(-ka*t));
  }

  function doseEvents(p){
    if(p.dosing==="single") return [{t:0,mult:1,n:1}];
    const skip=missedOf(p), ev=[];
    for(let i=0;i<p.nDoses;i++){
      if(i+1===skip) continue;
      ev.push({t:i*p.tau, mult:i===0?p.loadMult:1, n:i+1});
    }
    return ev;
  }

  // Superposition of every dose actually given.
  function conc(p, t, ev){
    ev=ev||doseEvents(p);
    let sum=0;
    for(const e of ev) if(t>=e.t) sum+=singleConc(p, t-e.t, e.mult);
    return sum;
  }

  function derived(p){
    const k=keOf(p), V=vOf(p);
    const d={thalfEff:Math.LN2/k, ke:k, CL:k*V, V:V, mgkg:p.D/p.wt};
    const Ffac = p.route==="oral" ? p.F : 1;
    d.auc=(Ffac*p.D)/(V*k);
    if(p.route==="iv"){ d.tmax=0; d.cmax=p.D/V; }
    else if(p.route==="inf"){
      d.tmax=p.tinf;
      d.cmax=singleConc(p,p.tinf,1);
    } else {
      const ka=p.ka;
      d.tmax=Math.abs(ka-k)<1e-6 ? 1/k : Math.log(ka/k)/(ka-k);
      d.cmax=singleConc(p,d.tmax,1);
    }
    if(p.dosing==="repeated"){
      const ev=doseEvents(p);
      d.Rac=1/(1-Math.exp(-k*p.tau));
      d.t90=3.32*d.thalfEff;
      d.fSS=1-Math.exp(-k*p.nDoses*p.tau); // fraction of steady state reached by the final trough
      const t0=(p.nDoses-1)*p.tau, t1=p.nDoses*p.tau;
      let mx=0, tmx=t0; const N=400;
      for(let i=0;i<=N;i++){ const t=t0+(t1-t0)*i/N, c=conc(p,t,ev); if(c>mx){mx=c;tmx=t;} }
      d.cmaxSS=mx; d.tmaxSS=tmx; d.cminSS=conc(p,t1,ev);
    }
    return d;
  }

  // Numerical exposure summary over [0, T] against a therapeutic window [mec, mtc].
  function windowStats(p, T, mec, mtc){
    const ev=doseEvents(p), N=600, dt=T/N;
    let prev=conc(p,0,ev), cmax=prev, tmax=0, auc=0, tIn=0, tBelow=0, tAbove=0;
    for(let i=1;i<=N;i++){
      const t=i*dt, c=conc(p,t,ev), m=(prev+c)/2;
      auc+=m*dt;
      if(m>mtc) tAbove+=dt; else if(m>=mec) tIn+=dt; else tBelow+=dt;
      if(c>cmax){ cmax=c; tmax=t; }
      prev=c;
    }
    return {cmax,tmax,auc,tIn,tBelow,tAbove,T};
  }

  // Peak and trough of every dose interval, plus where an uninterrupted regimen settles.
  function ssProfile(p){
    const ev=doseEvents(p), k=keOf(p), tau=p.tau, S=60, skip=missedOf(p);
    const peakTrough=(q,a,evq)=>{
      let pk=0;
      for(let j=0;j<=S;j++){ const c=conc(q,a+tau*j/S,evq); if(c>pk) pk=c; }
      return [pk, conc(q,a+tau-1e-9,evq)];
    };
    const rows=[];
    for(let i=0;i<p.nDoses;i++){
      const [peak,trough]=peakTrough(p,i*tau,ev);
      rows.push({n:i+1, peak, trough, missed:i+1===skip});
    }
    const Nss=Math.min(400, Math.ceil(Math.log(1e4)/(k*tau))+2);
    const pss=Object.assign({},p,{nDoses:Nss,loadMult:1,missed:1});
    const [ssPeak,ssTrough]=peakTrough(pss,(Nss-1)*tau,doseEvents(pss));
    const clears=ssTrough<0.01*ssPeak; // essentially nothing carries over from one dose to the next
    return {rows, ssPeak, ssTrough, clears, swing:clears?null:ssPeak/ssTrough,
      Rac:1/(1-Math.exp(-k*tau)), t90:3.32*Math.LN2/k, dosesTo90:Math.ceil(Math.log(10)/(k*tau))};
  }

  /* ================= COMPARISON ================= */
  // Metrics for scenario a vs scenario b over the same window. kind says how the change is expressed:
  // pct = % change, ratio = % change of a ratio, pp = percentage points, abs = hours, count = doses.
  // A null value means the metric doesn't apply (shown as "—").
  function compareRows(a, b, T, mec, mtc){
    const wa=windowStats(a,T,mec,mtc), wb=windowStats(b,T,mec,mtc), da=derived(a), db=derived(b);
    const rows=[{key:"cmax", name:"Peak (Cmax)", unit:"mg/L", a:wa.cmax, b:wb.cmax, kind:"pct", dp:2}];
    if(a.dosing==="single" && b.dosing==="single") rows.push({key:"tmax", name:"Time of peak", unit:"h", a:wa.tmax, b:wb.tmax, kind:"abs", dp:1});
    rows.push({key:"auc", name:`AUC 0–${T} h`, unit:"mg·h/L", a:wa.auc, b:wb.auc, kind:"pct", dp:1});
    if(a.dosing==="repeated" && b.dosing==="repeated"){
      const sa=ssProfile(a), sb=ssProfile(b);
      rows.push(
        {key:"trough", name:"Final trough", unit:"mg/L", a:da.cminSS, b:db.cminSS, kind:"pct", dp:2},
        {key:"rac", name:"Accumulation", unit:"×", a:sa.Rac, b:sb.Rac, kind:"ratio", dp:2},
        {key:"swing", name:"Peak ÷ trough at SS", unit:"×", a:sa.swing, b:sb.swing, kind:"ratio", dp:1},
        // in hours: it depends only on the half-life, while the dose count also moves with the interval
        {key:"t90", name:"Time to 90% of SS", unit:"h", a:sa.t90, b:sb.t90, kind:"abs", dp:1});
    }
    rows.push(
      {key:"thalf", name:"Effective t½", unit:"h", a:da.thalfEff, b:db.thalfEff, kind:"pct", dp:1},
      {key:"tin", name:"Time in window", unit:"% of window", a:100*wa.tIn/T, b:100*wb.tIn/T, kind:"pp", dp:0},
      {key:"tabove", name:"Time above MTC", unit:"% of window", a:100*wa.tAbove/T, b:100*wb.tAbove/T, kind:"pp", dp:0},
      {key:"tbelow", name:"Time below MEC", unit:"% of window", a:100*wa.tBelow/T, b:100*wb.tBelow/T, kind:"pp", dp:0});
    return {rows, wa, wb, da, db};
  }

  // Change from a to b: {na} when either side doesn't apply, else {dir: -1|0|1, value: magnitude}.
  // Changes too small to show at display precision count as no change (dir 0).
  function diff(kind, a, b){
    if(a==null || b==null) return {na:true, dir:0, value:0};
    if(kind==="pct" || kind==="ratio"){
      if(Math.abs(a)<1e-9) return Math.abs(b)<1e-9 ? {dir:0,value:0} : {dir:1,value:Infinity};
      const r=(b-a)/Math.abs(a)*100;
      return Math.abs(r)<0.5 ? {dir:0,value:0} : {dir:Math.sign(r), value:Math.abs(r)};
    }
    const d=b-a, eps={pp:0.5, abs:0.05, count:0.5}[kind];
    return Math.abs(d)<eps ? {dir:0,value:0} : {dir:Math.sign(d), value:Math.abs(d)};
  }

  /* ================= PRESETS ================= */
  const DRUGS = [
    {id:"ibu", name:"Ibuprofen", sub:"400 mg PO",
     s:{route:"oral",dosing:"single",D:400,F:0.9,ka:1.5,thalf:2,V:10,mec:10,mtc:50,duration:12}},
    {id:"amox", name:"Amoxicillin", sub:"500 mg PO q8h",
     s:{route:"oral",dosing:"repeated",D:500,F:0.9,ka:1.0,thalf:1.2,V:27,tau:8,nDoses:6,loadMult:1,mec:2,mtc:25,duration:48}},
    {id:"caf", name:"Caffeine", sub:"100 mg PO",
     s:{route:"oral",dosing:"single",D:100,F:1,ka:3,thalf:5,V:36,mec:1,mtc:15,duration:24}},
    {id:"theo", name:"Theophylline ER", sub:"narrow window",
     s:{route:"oral",dosing:"repeated",D:300,F:0.95,ka:0.3,thalf:8,V:35,tau:12,nDoses:6,loadMult:1,mec:10,mtc:20,duration:72}},
    {id:"gent", name:"Gentamicin", sub:"120 mg IV inf q8h",
     s:{route:"inf",dosing:"repeated",D:120,tinf:0.5,thalf:2.5,V:18,tau:8,nDoses:6,loadMult:1,mec:4,mtc:12,duration:48}},
    {id:"vanc", name:"Vancomycin", sub:"1 g IV inf",
     s:{route:"inf",dosing:"single",D:1000,tinf:1,thalf:6,V:49,mec:10,mtc:40,duration:36}}
  ];

  // Each lesson loads `base` as the baseline and `cur` as the live scenario (both merged over DEFAULTS).
  // The claims in each text are checked against the model in tests/pk-engine.test.js.
  const LESSONS = [
    {id:"route", tag:"F · Tmax", title:"Oral vs IV bolus", sum:"Absorption delay, Tmax, Cmax and bioavailability.", baseLabel:"IV bolus",
     text:"Same 500 mg dose, two routes. The IV bolus (dashed) puts everything in plasma at t = 0, so it peaks instantly at D/V. The oral dose has to be absorbed first: its peak comes later and sits lower, and its AUC is smaller by the bioavailability factor F.",
     tryThis:"Push kₐ to 3 h⁻¹ and F to 1.0. The oral curve closes in on the IV one.",
     view:{duration:24,mec:2,mtc:12},
     base:{route:"iv"}, cur:{route:"oral",F:0.7,ka:0.8}},
    {id:"inf", tag:"T·inf", title:"Bolus vs infusion", sum:"Controlling the peak with infusion duration.", baseLabel:"IV bolus",
     text:"The same 1 g given two ways. Pushed as a bolus it spikes past the toxic line. Spread over a 3 h infusion, the peak stays under it and arrives when the infusion ends. Total exposure (AUC) is identical because the same amount goes in.",
     tryThis:"Stretch the infusion to 8 h and watch the peak fall further and shift right.",
     view:{duration:36,mec:8,mtc:18},
     base:{route:"iv",D:1000,thalf:6,V:49}, cur:{route:"inf",D:1000,thalf:6,V:49,tinf:3}},
    {id:"accum", tag:"Rac", title:"Repeated dosing", sum:"Accumulation, peaks and troughs, steady state.", baseLabel:"single dose",
     text:"Each dose lands on whatever is left of the one before. With the interval equal to the half-life (8 h), half of every dose is still there when the next arrives, so levels climb until the amount eliminated per interval matches the dose: about 2× a single dose.",
     tryThis:"Cut the interval to 4 h and accumulation jumps. Stretch it to 16 h and it almost disappears.",
     view:{duration:96,mec:5,mtc:20},
     base:{dosing:"single",D:300,thalf:8,ka:1}, cur:{dosing:"repeated",D:300,thalf:8,ka:1,tau:8,nDoses:12}},
    {id:"load", tag:"LD", title:"Loading dose", sum:"Reaching the target sooner vs staying there.", baseLabel:"no loading dose",
     text:"A 12 h half-life means roughly 40 h to reach 90% of steady state. Doubling the first dose fills the volume of distribution up front, so levels start near their final range. The maintenance dose, not the load, decides where they settle.",
     tryThis:"Set the loading dose back to “No load” and count how many doses it takes to enter the window.",
     view:{duration:120,mec:6,mtc:16},
     base:{dosing:"repeated",D:300,thalf:12,ka:1,tau:12,nDoses:10}, cur:{dosing:"repeated",D:300,thalf:12,ka:1,tau:12,nDoses:10,loadMult:2}},
    {id:"cl", tag:"CL", title:"Reduced clearance", sum:"Longer half-life, more exposure, more accumulation.", baseLabel:"organ function 100%",
     text:"Same regimen, but organ function drops to 50%. Clearance halves, so the effective half-life doubles: each dose lingers, troughs rise, accumulation grows and steady state arrives later. Total exposure nearly doubles, and the peaks now cross the toxic line.",
     tryThis:"Lengthen the dosing interval and watch exposure fall back toward the baseline curve.",
     view:{duration:72,mec:3,mtc:15},
     base:{dosing:"repeated",D:400,thalf:4,tau:8,nDoses:9}, cur:{dosing:"repeated",D:400,thalf:4,tau:8,nDoses:9,clFn:50}},
    {id:"vd", tag:"V", title:"Volume of distribution", sum:"Dilution, half-life and why AUC can stay put.", baseLabel:"V = 20 L",
     text:"Clearance is held constant while V triples from 20 to 60 L. The same dose spreads through three times the space, so the starting concentration (D/V) is a third as high. Since CL = kₑ·V, a larger V at the same clearance means slower elimination: the half-life triples and total exposure (AUC) doesn't change.",
     tryThis:"Drag the half-life back to 3 h with V still at 60 L. Clearance triples and the AUC collapses.",
     view:{duration:72,mec:2,mtc:25},
     base:{route:"iv",D:600,V:20,thalf:3}, cur:{route:"iv",D:600,V:60,thalf:9}},
    {id:"miss", tag:"✕", title:"Missed dose", sum:"The dip, and how long recovery takes.", baseLabel:"every dose taken",
     text:"Dose 6 is skipped. With nothing coming in, concentration keeps falling through the gap and drops below the effective level. Once regular doses resume, it takes a few intervals to climb back to the usual peak–trough pattern.",
     tryThis:"Move the missed dose, or shorten the half-life for a sharper dip and a faster recovery.",
     view:{duration:96,mec:4,mtc:16},
     base:{dosing:"repeated",D:400,thalf:6,ka:1,tau:8,nDoses:12}, cur:{dosing:"repeated",D:400,thalf:6,ka:1,tau:8,nDoses:12,missed:6}},
    {id:"er", tag:"TW", title:"Narrow window", sum:"Fitting a regimen between effective and toxic.", baseLabel:"immediate release",
     text:"The window here is narrow. Once at steady state, an immediate-release profile (fast kₐ) overshoots the toxic line at each peak and dips below the effective line at each trough. Slowing absorption, as an extended-release formulation does, flattens the swing so more of every interval sits inside the window, at the same total exposure.",
     tryThis:"Go back to kₐ = 2 and instead split the same daily amount into 150 mg every 6 h.",
     view:{duration:96,mec:5,mtc:10},
     base:{dosing:"repeated",D:300,F:0.95,ka:2,thalf:8,tau:12,nDoses:8}, cur:{dosing:"repeated",D:300,F:0.95,ka:0.3,thalf:8,tau:12,nDoses:8}},
    {id:"half", tag:"t½", title:"Short vs long half-life", sum:"Dosing frequency and accumulation trade-offs.", baseLabel:"t½ = 2 h",
     text:"Same regimen, two drugs. The 2 h drug is nearly gone before each new dose: big swings, almost no accumulation, steady state within hours. The 12 h drug piles up to nearly 3× a single dose and needs about 40 h to settle.",
     tryThis:"Find the interval that gives the 12 h drug the same peak-to-trough swing as the 2 h one.",
     view:{duration:96,mec:2,mtc:20},
     base:{dosing:"repeated",D:250,thalf:2,tau:8,nDoses:12}, cur:{dosing:"repeated",D:250,thalf:12,tau:8,nDoses:12}},
    {id:"split", tag:"τ", title:"Once vs twice daily", sum:"Same daily dose, different swing.", baseLabel:"600 mg once daily",
     text:"Same 600 mg per day. Giving it as 300 mg every 12 h keeps average exposure the same, because AUC per day depends on the dosing rate rather than how it's split (the small AUC gap in the table is just drug still on board when the window closes). What changes is the swing: a lower peak and a higher trough.",
     tryThis:"Try 200 mg every 8 h and watch the swing narrow again.",
     view:{duration:120,mec:4,mtc:20},
     base:{dosing:"repeated",D:600,thalf:8,ka:1,tau:24,nDoses:5}, cur:{dosing:"repeated",D:300,thalf:8,ka:1,tau:12,nDoses:10}}
  ];

  // One-click comparisons: A is the lesson's baseline scenario, B its live scenario.
  const TEMPLATES = [
    {id:"split", lesson:"split", title:"Once vs twice daily", nameA:"600 mg once daily", nameB:"300 mg twice daily",
     look:"Same daily dose. B's peaks are lower and its troughs higher, while AUC barely moves."},
    {id:"load", lesson:"load", title:"Loading dose", nameA:"No loading dose", nameB:"2× loading dose",
     look:"B is inside the window almost from the start; both settle at the same steady state."},
    {id:"cl", lesson:"cl", title:"Normal vs 50% clearance", nameA:"Organ function 100%", nameB:"Organ function 50%",
     look:"Same regimen. B's half-life doubles, its troughs climb and its peaks cross the toxic line."},
    {id:"route", lesson:"route", title:"IV bolus vs oral", nameA:"IV bolus", nameB:"Oral, F 0.7",
     look:"B peaks later and lower, and its AUC is smaller by the bioavailability factor."},
    {id:"inf", lesson:"inf", title:"Bolus vs infusion", nameA:"IV bolus", nameB:"3 h infusion",
     look:"Same dose and the same AUC, but B's peak stays under the toxic line."},
    {id:"miss", lesson:"miss", title:"On time vs missed dose", nameA:"Every dose taken", nameB:"Dose 6 missed",
     look:"B dips below the effective level after the gap, then climbs back over the next few doses."}
  ];

  /* ================= COMPARE STATE ================= */
  // A comparison is {a, b, names:{a,b}, lock, edit}. These operations never modify their input; each
  // returns a new comparison, so the page can't accidentally change one scenario while editing the other.
  const DEFAULT_NAMES={a:"Scenario A", b:"Scenario B"};
  const otherOf=side=> side==="a" ? "b" : "a";
  function newComparison(p){
    return {a:scenario(p), b:scenario(p), names:Object.assign({},DEFAULT_NAMES), lock:"", edit:"a"};
  }
  // Apply edited settings to one side. With "Vary only" set, every other changed setting is mirrored to
  // the other side, so the two scenarios keep differing in that one setting only.
  function cmpApply(c, side, patch){
    const o=otherOf(side), next=Object.assign({},c,{[side]:Object.assign({},c[side],patch)});
    if(c.lock){
      const shared={};
      Object.keys(patch).forEach(k=>{ if(PK_KEYS.includes(k) && k!==c.lock) shared[k]=patch[k]; });
      next[o]=normalizeScenario(Object.assign({},c[o],shared));
    }
    next[side]=normalizeScenario(next[side]);
    return next;
  }
  function cmpCopy(c, from, to){
    return Object.assign({},c,{[to]:Object.assign({},c[from])});
  }
  function cmpSwap(c){
    return Object.assign({},c,{a:Object.assign({},c.b), b:Object.assign({},c.a), names:{a:c.names.b, b:c.names.a}});
  }
  // Turning a lock on makes B match A in everything except the locked setting.
  // True when A and B differ in nothing but the locked setting, which is what "Vary only" promises.
  function lockHolds(c){
    return !c.lock || PK_KEYS.every(k=> k===c.lock || c.a[k]===c.b[k]);
  }
  function cmpSetLock(c, k){
    if(!k) return Object.assign({},c,{lock:""});
    return Object.assign({},c,{lock:k, b:normalizeScenario(Object.assign({},c.a,{[k]:c.b[k]}))});
  }
  // Back to the app defaults, with the default name. The other side is left exactly as it was, so a
  // "Vary only" lock (which ties the two sides together) is switched off rather than broken silently.
  function cmpReset(c, side){
    return Object.assign({},c,{[side]:scenario(), names:Object.assign({},c.names,{[side]:DEFAULT_NAMES[side]}), lock:""});
  }

  /* ================= SHARE LINKS ================= */
  // A scenario is written as the settings that differ from DEFAULTS, e.g. "D:400,clFn:50" ("" = defaults).
  function encodeScenario(p){
    return PK_KEYS.filter(k=>p[k]!==DEFAULTS[k]).map(k=>k+":"+p[k]).join(",");
  }
  // Unknown keys and invalid values are ignored; numbers are clamped to their allowed range.
  function decodeScenario(str){
    const p=scenario();
    String(str||"").split(",").forEach(pair=>{
      const i=pair.indexOf(":");
      if(i<1) return;
      const k=pair.slice(0,i), raw=pair.slice(i+1);
      if(!PK_KEYS.includes(k)) return;
      if(k==="route" || k==="dosing"){ if(CHOICES[k].includes(raw)) p[k]=raw; return; }
      let v=parseFloat(raw);
      if(!isFinite(v)) return;
      if(k==="loadMult"){ if(CHOICES.loadMult.includes(v)) p.loadMult=v; return; }
      if(INTEGER_KEYS.includes(k)) v=Math.round(v);
      p[k]=clamp(v,RANGES[k]);
    });
    return normalizeScenario(p);
  }
  function encodeView(v){
    const out=[];
    ["duration","mec","mtc"].forEach(k=>{ if(v[k]!==VIEW_DEFAULTS[k]) out.push(k+":"+v[k]); });
    if(v.scale==="log") out.push("scale:log");
    if(v.zoom==="last") out.push("zoom:last");
    return out.join(",");
  }
  function decodeView(str){
    const v=Object.assign({},VIEW_DEFAULTS);
    String(str||"").split(",").forEach(pair=>{
      const [k,raw]=pair.split(":");
      if(VIEW_RANGES[k]){ const n=parseFloat(raw); if(isFinite(n)) v[k]=clamp(n,VIEW_RANGES[k]); }
      else if(k==="scale" && (raw==="lin"||raw==="log")) v.scale=raw;
      else if(k==="zoom" && (raw==="full"||raw==="last")) v.zoom=raw;
    });
    return v;
  }

  // Link state ↔ URL hash, e.g. "v=1&s=D:400,clFn:50&w=duration:48".
  // Simulator links carry s (scenario), base (baseline), bl (baseline label) and l (lesson id);
  // compare links carry m=cmp, a, b, na/nb (names), lk (Vary only key) and ed (side being edited).
  function encodeLink(st){
    const parts=["v="+VERSION];
    if(st.mode==="cmp"){
      parts.push("m=cmp", "a="+encodeScenario(st.a), "b="+encodeScenario(st.b));
      if(st.nameA) parts.push("na="+encodeURIComponent(st.nameA));
      if(st.nameB) parts.push("nb="+encodeURIComponent(st.nameB));
      if(st.lock) parts.push("lk="+st.lock);
      if(st.edit==="b") parts.push("ed=b");
    } else {
      parts.push("s="+encodeScenario(st.s));
      if(st.base){
        parts.push("base="+encodeScenario(st.base));
        if(st.baseLabel) parts.push("bl="+encodeURIComponent(st.baseLabel));
      }
      if(st.lesson) parts.push("l="+st.lesson);
    }
    const w=encodeView(st.view||VIEW_DEFAULTS);
    if(w) parts.push("w="+w);
    return parts.join("&");
  }
  function decodeLink(hash){
    const q={};
    const safe=s=>{ try{ return decodeURIComponent(s); }catch(e){ return ""; } };
    String(hash||"").replace(/^#/,"").split("&").forEach(kv=>{
      const i=kv.indexOf("=");
      if(i>0) q[kv.slice(0,i)]=kv.slice(i+1);
    });
    if(!q.v) return null;
    // Links pasted through chat apps sometimes arrive with ':' and ',' percent-encoded.
    const sc=s=>decodeScenario(safe(s||""));
    // names are plain text: control characters and text-direction overrides are removed
    const name=s=>s ? safe(s).replace(/[\u0000-\u001f\u007f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g,"").trim().slice(0,40) : "";
    const st={version:parseInt(q.v,10)||VERSION, mode:q.m==="cmp"?"cmp":"sim", view:decodeView(safe(q.w||""))};
    if(st.mode==="cmp"){
      st.a=sc(q.a); st.b=sc(q.b);
      st.nameA=name(q.na); st.nameB=name(q.nb);
      st.lock=LOCKS.some(l=>l[0]===q.lk) ? q.lk : "";
      if(!lockHolds(st)) st.lock="";   // a hand-edited link can't claim a lock its scenarios don't honour
      st.edit=q.ed==="b" ? "b" : "a";
    } else {
      st.s=sc(q.s);
      st.base=("base" in q) ? sc(q.base) : null;
      st.baseLabel=name(q.bl);
      st.lesson=LESSONS.some(L=>L.id===q.l) ? q.l : "";
    }
    return st;
  }

  return {VERSION, PK_KEYS, DEFAULTS, CHOICES, RANGES, VIEW_DEFAULTS, VIEW_RANGES, LOCKS, scenario,
    keOf, vOf, missedOf, singleConc, doseEvents, conc, derived, windowStats, ssProfile, compareRows, diff,
    DRUGS, LESSONS, TEMPLATES,
    DEFAULT_NAMES, newComparison, cmpApply, cmpCopy, cmpSwap, cmpSetLock, cmpReset, lockHolds, normalizeScenario,
    encodeScenario, decodeScenario, encodeView, decodeView, encodeLink, decodeLink};
});
