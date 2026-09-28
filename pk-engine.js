/* DoseCurve PK engine
   One-compartment linear pharmacokinetics (first-order oral absorption, IV bolus, IV infusion),
   regular regimens with loading and missed doses, custom dose schedules, exposure metrics, the
   teaching presets, and the share-link codec. Pure functions with no DOM access: the page loads this file as window.PK and
   the tests load it with require(). */
(function(root, factory){
  const api=factory();
  if(typeof module==="object" && module.exports) module.exports=api;
  else root.PK=api;
})(typeof self!=="undefined" ? self : this, function(){
  "use strict";

  // Share-link format: 1 = single and repeated regimens; 2 adds custom dose schedules. Links are written
  // as v=1 whenever no custom schedule is involved, so older links and older pages keep working.
  const VERSION=2;

  /* ================= SCENARIO MODEL ================= */
  // A scenario is a flat object of these keys. The time window, thresholds and chart settings are
  // view settings, shared by the two scenarios in a comparison.
  // dosing "custom" uses `events` instead of D/τ/n/load/missed; the other two ignore `events`.
  const PK_KEYS=["route","dosing","D","F","ka","thalf","V","tinf","tau","nDoses","loadMult","missed","wt","clFn","events"];
  const DEFAULTS=Object.freeze({route:"oral",dosing:"single",D:500,F:0.9,ka:1.2,thalf:4,V:35,tinf:1,tau:8,nDoses:6,loadMult:1,missed:1,wt:70,clFn:100,
    events:Object.freeze([])});
  const CHOICES={route:["oral","iv","inf"],dosing:["single","repeated","custom"],loadMult:[1,1.5,2]};
  // Numeric limits, shared with the sliders. missed = 1 means no dose is missed.
  const RANGES={D:[25,2000],F:[0.1,1],ka:[0.1,3],tinf:[0.25,96],thalf:[0.5,24],V:[5,120],tau:[2,24],
    nDoses:[2,20],missed:[1,19],wt:[40,120],clFn:[25,150]};
  const INTEGER_KEYS=["nDoses","missed"];
  const VIEW_DEFAULTS={duration:24,mec:2,mtc:12,scale:"lin",zoom:"full"};
  const VIEW_RANGES={duration:[6,168],mec:[0,10000],mtc:[0,10000]};
  // Settings that "Vary only" can hold apart while every other setting is shared by A and B.
  const LOCKS=[["D","Dose"],["tau","Dosing interval"],["loadMult","Loading dose"],["missed","Missed dose"],["route","Route"],
    ["clFn","Organ function"],["thalf","Half-life"],["V","Volume"],["F","Bioavailability"],["ka","Absorption rate"]];

  const clamp=(v,[lo,hi])=>Math.min(hi,Math.max(lo,v));
  const round=(v,dp)=>Math.round(v*10**dp)/10**dp;

  /* ---------- custom dose schedules ---------- */
  // An event is {id, t (h), mg, type: "maintenance"|"loading", status: "given"|"missed"}. Scenarios never
  // share an events array: every copy clones it, so editing A's schedule can't change B's.
  const EVENT_LIMITS={max:40, t:[0,168], mg:[25,4000]};
  const cloneEvents=list=>(list||[]).map(e=>({id:e.id, t:e.t, mg:e.mg, type:e.type, status:e.status}));
  const cloneScenario=p=>Object.assign({},p,{events:cloneEvents(p.events)});
  const scenario=over=>cloneScenario(Object.assign({},DEFAULTS,over));

  // Validated, sorted copy: bad entries are dropped, times and amounts clamped, ids made unique, type and
  // status limited to their two values, and at most 40 events kept (the earliest).
  function normalizeEvents(list){
    const out=[], seen=new Set();
    for(const e of (Array.isArray(list) ? list.slice(0,200) : [])){
      if(!e || typeof e!=="object") continue;
      const t=Number(e.t), mg=Number(e.mg);
      if(!isFinite(t) || !isFinite(mg)) continue;
      const id=(typeof e.id==="string" && /^[a-z0-9-]{1,16}$/.test(e.id) && !seen.has(e.id)) ? e.id : "";
      if(id) seen.add(id);
      out.push({id, t:round(clamp(t,EVENT_LIMITS.t),2), mg:round(clamp(mg,EVENT_LIMITS.mg),1),
        type:e.type==="loading"?"loading":"maintenance", status:e.status==="missed"?"missed":"given"});
    }
    let n=0;
    out.forEach(e=>{ if(!e.id){ do{ n++; }while(seen.has("e"+n)); e.id="e"+n; seen.add(e.id); } });
    out.sort((a,b)=> a.t-b.t || (a.id<b.id ? -1 : a.id>b.id ? 1 : 0));
    return out.slice(0,EVENT_LIMITS.max);
  }
  // Where "Add dose" puts the next dose: one interval after the last (the gap between the last two doses,
  // or 12 h when there's no gap to go on), capped at 168 h. null once the schedule reaches 168 h, so the
  // button can say why it's disabled instead of quietly stacking doses at the limit.
  function nextEventTime(list){
    if(!list || !list.length) return 0;
    const last=list[list.length-1].t, prev=list.length>1 ? list[list.length-2].t : null;
    if(last>=EVENT_LIMITS.t[1]) return null;
    return Math.min(EVENT_LIMITS.t[1], last+(prev!==null && last>prev ? last-prev : 12));
  }
  // Where "Duplicate" puts a copy of dose i: halfway to the next dose, or 8 h after the last one. At the
  // 168 h limit the copy stays at 168 h, so it doses at the same time (simultaneous doses add together).
  function duplicateEventTime(list, i){
    const e=list[i], next=list[i+1];
    return next ? Math.round((e.t+Math.max(0.25,(next.t-e.t)/2))*4)/4 : Math.min(EVENT_LIMITS.t[1], e.t+8);
  }
  // Canonical text of a schedule, used for equality and in share links (ids don't count).
  const eventsKey=list=>(list||[]).map(e=>`${e.t}@${e.mg}${e.type==="loading"?"L":""}${e.status==="missed"?"m":""}`).join(";");

  // Cross-setting rules the individual ranges can't express: a missed dose must fall inside the regimen
  // (and can't be the final dose), otherwise it is cleared so the controls never show a missed dose the
  // model is ignoring; and the schedule is always a validated, sorted, private copy.
  function normalizeScenario(p){
    const q=Object.assign({},p);
    if(q.missed>=q.nDoses) q.missed=1;
    q.events=normalizeEvents(q.events);
    return q;
  }
  // Whether a setting means anything for a scenario (F only orally, τ only for a regular regimen, …).
  function isRelevant(k,s){
    if(k==="F"||k==="ka") return s.route==="oral";
    if(k==="tinf") return s.route==="inf";
    if(k==="tau"||k==="nDoses"||k==="loadMult"||k==="missed") return s.dosing==="repeated";
    if(k==="D") return s.dosing!=="custom";
    if(k==="events") return s.dosing==="custom";
    return true;
  }
  // Equality that understands schedules (plain === would compare array identity).
  const sameSetting=(k,a,b)=> k==="events" ? eventsKey(a.events)===eventsKey(b.events) : a[k]===b[k];

  /* ================= PK ENGINE ================= */
  const keOf = p=> (Math.LN2/p.thalf) * (p.clFn/100);
  const vOf  = p=> p.V * (p.wt/70);
  // The final dose can't be skipped: final-interval peak and trough are defined by it, and skipping it
  // is the same as giving one dose fewer.
  const missedOf = p=> (p.dosing==="repeated" && p.missed>1 && p.missed<p.nDoses) ? p.missed : 0;

  // Concentration at time t after one dose of `mg`.
  function singleConc(p, t, mg){
    if(t<0) return 0;
    const k=keOf(p), V=vOf(p), D=mg;
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

  // Every dose actually given, as {t, mg, n}. This is the one place regimens turn into doses, so the
  // simulation, window metrics and exports all follow custom schedules automatically.
  function doseEvents(p){
    if(p.dosing==="custom") return p.events.filter(e=>e.status==="given").map((e,i)=>({t:e.t, mg:e.mg, n:i+1, id:e.id}));
    if(p.dosing==="single") return [{t:0, mg:p.D, n:1}];
    const skip=missedOf(p), ev=[];
    for(let i=0;i<p.nDoses;i++){
      if(i+1===skip) continue;
      ev.push({t:i*p.tau, mg:p.D*(i===0?p.loadMult:1), n:i+1});
    }
    return ev;
  }
  // The schedule a regimen describes, as editable events. Missed doses stay in, marked missed; doses
  // after 168 h (the longest window) are left out because nothing shown can depend on them.
  function eventsFromBasic(p){
    if(p.dosing==="custom") return normalizeEvents(p.events);
    if(p.dosing==="single") return normalizeEvents([{id:"e1", t:0, mg:p.D, type:"maintenance", status:"given"}]);
    const skip=missedOf(p), out=[];
    for(let i=0;i<p.nDoses && i*p.tau<=EVENT_LIMITS.t[1];i++){
      out.push({id:"e"+(i+1), t:i*p.tau, mg:p.D*(i===0?p.loadMult:1),
        type:i===0 && p.loadMult>1 ? "loading" : "maintenance", status:i+1===skip ? "missed" : "given"});
    }
    return normalizeEvents(out);
  }
  // Doses given, and total mg, within [0, T].
  function doseTotals(p, T){
    const ev=doseEvents(p).filter(e=>e.t<=T);
    return {n:ev.length, mg:ev.reduce((s,e)=>s+e.mg,0)};
  }

  // Superposition of every dose actually given.
  function conc(p, t, ev){
    ev=ev||doseEvents(p);
    let sum=0;
    for(const e of ev) if(t>=e.t) sum+=singleConc(p, t-e.t, e.mg);
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
      d.cmax=singleConc(p,p.tinf,p.D);
    } else {
      const ka=p.ka;
      d.tmax=Math.abs(ka-k)<1e-6 ? 1/k : Math.log(ka/k)/(ka-k);
      d.cmax=singleConc(p,d.tmax,p.D);
    }
    if(p.dosing==="custom"){
      // a custom schedule has no single dose or regular interval: totals over every dose given
      const given=doseEvents(p);
      d.nGiven=given.length; d.nMissed=p.events.length-given.length;
      d.totalMg=given.reduce((s,e)=>s+e.mg,0);
      d.auc=(Ffac*d.totalMg)/(V*k);
      d.mgkg=d.totalMg/p.wt;
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

  /* ================= TIME INSPECTION ================= */
  // Every scheduled dose, missed ones included: {t, mg, loading, missed, n}, in time order.
  function doseSchedule(p){
    let out;
    if(p.dosing==="custom") out=p.events.map((e,i)=>({t:e.t, mg:e.mg, loading:e.type==="loading", missed:e.status==="missed", n:i+1}));
    else if(p.dosing==="single") out=[{t:0, mg:p.D, loading:false, missed:false, n:1}];
    else {
      const skip=missedOf(p); out=[];
      for(let i=0;i<p.nDoses;i++) out.push({t:i*p.tau, mg:p.D*(i===0?p.loadMult:1), loading:i===0 && p.loadMult>1, missed:i+1===skip, n:i+1});
    }
    return out.sort((a,b)=>a.t-b.t);
  }

  // What the model says at time t. The trend compares the curve 0.02 h either side: above both is a peak
  // (an IV bolus at the moment it's given is one), below both a trough, otherwise the slope just after t
  // says rising or falling. `last` is the most recent dose actually given, with doses at the same time
  // counted as one administration; missed doses never count as given and are listed in missedSince.
  function inspectAt(p, t, mec, mtc){
    const ev=doseEvents(p), c=conc(p,t,ev), d=0.02, tol=1e-9*Math.max(1,c);
    const left=conc(p,t-d,ev), right=conc(p,t+d,ev), slope=conc(p,t+1e-4,ev)-c;
    const trend = Math.max(Math.abs(c-left),Math.abs(c-right))<=tol ? "flat"
      : c>left+tol && c>right+tol ? "peak"
      : c<left-tol && c<right-tol ? "trough"
      : Math.abs(slope)<=tol ? "flat" : slope>0 ? "rising" : "falling";
    const sched=doseSchedule(p), given=sched.filter(x=>!x.missed && x.t<=t+1e-9);
    let last=null;
    if(given.length){
      const lt=given[given.length-1].t, grp=given.filter(x=>Math.abs(x.t-lt)<1e-9);
      last={t:lt, mg:grp.reduce((s,x)=>s+x.mg,0), count:grp.length, loading:grp.some(x=>x.loading)};
    }
    const missedSince=sched.filter(x=>x.missed && x.t<=t+1e-9 && (!last || x.t>last.t+1e-9)).map(x=>x.t);
    const nx=sched.find(x=>x.t>t+1e-9);
    return {t, c, trend, status:c>mtc ? "above" : c>=mec ? "in" : "below", last, since:last ? t-last.t : null,
      missedSince, next:nx ? {t:nx.t, mg:nx.mg, missed:nx.missed} : null};
  }

  // Local peaks and troughs over [0, T]. The grid includes every dose time (and the instant before it,
  // and each infusion end) so the jumps of an IV bolus and the tops of infusions are caught exactly.
  function extrema(p, T){
    const ev=doseEvents(p), N=2400, pts=new Set();
    for(let i=0;i<=N;i++) pts.add(T*i/N);
    ev.forEach(e=>{
      [e.t-1e-6, e.t, e.t+1e-6].forEach(x=>{ if(x>=0 && x<=T) pts.add(x); });
      if(p.route==="inf" && e.t+p.tinf<=T) pts.add(e.t+p.tinf);
    });
    const ts=[...pts].sort((a,b)=>a-b), cs=ts.map(t=>conc(p,t,ev));
    const peaks=[], troughs=[], add=(list,t,c)=>{ const prev=list[list.length-1]; if(!prev || t-prev.t>1e-3) list.push({t,c}); };
    if(cs.length>1 && cs[0]>0 && cs[0]>cs[1]) add(peaks,ts[0],cs[0]);   // an IV bolus at t = 0
    for(let i=1;i<ts.length-1;i++){
      const c=cs[i], l=cs[i-1], r=cs[i+1];
      if(c>l && c>=r) add(peaks,ts[i],c);
      else if(c<l && c<=r) add(troughs,ts[i],c);
    }
    return {peaks, troughs};
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
    if(a.dosing==="custom" || b.dosing==="custom"){
      const ta=doseTotals(a,T), tb=doseTotals(b,T);
      rows.push(
        {key:"ngiven", name:`Doses given 0–${T} h`, unit:"doses", a:ta.n, b:tb.n, kind:"count", dp:0},
        {key:"mg", name:`Total dose 0–${T} h`, unit:"mg", a:ta.mg, b:tb.mg, kind:"pct", dp:0});
    }
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
  const isCustom=c=> c.a.dosing==="custom" || c.b.dosing==="custom";
  function newComparison(p){
    return {a:scenario(p), b:scenario(p), names:Object.assign({},DEFAULT_NAMES), lock:"", edit:"a"};
  }
  // Apply edited settings to one side. With "Vary only" set, every other changed setting is mirrored to
  // the other side, so the two scenarios keep differing in that one setting only. The lock needs two
  // regular regimens: a custom schedule on either side switches it off instead of being mirrored.
  function cmpApply(c, side, patch){
    const o=otherOf(side), next=Object.assign({},c);
    next[side]=normalizeScenario(Object.assign({},c[side],patch));
    if(c.lock && (next[side].dosing==="custom" || c[o].dosing==="custom")) next.lock="";
    else if(c.lock){
      const shared={};
      Object.keys(patch).forEach(k=>{ if(PK_KEYS.includes(k) && k!==c.lock) shared[k]=patch[k]; });
      next[o]=normalizeScenario(Object.assign({},c[o],shared));
    }
    return next;
  }
  function cmpCopy(c, from, to){
    return Object.assign({},c,{[to]:cloneScenario(c[from])});
  }
  function cmpSwap(c){
    return Object.assign({},c,{a:cloneScenario(c.b), b:cloneScenario(c.a), names:{a:c.names.b, b:c.names.a}});
  }
  // True when A and B differ in nothing but the locked setting, which is what "Vary only" promises.
  function lockHolds(c){
    if(!c.lock) return true;
    if(isCustom(c)) return false;
    return PK_KEYS.every(k=> k===c.lock || sameSetting(k,c.a,c.b));
  }
  // Turning a lock on makes B match A in everything except the locked setting (regular regimens only).
  function cmpSetLock(c, k){
    if(!k || isCustom(c)) return Object.assign({},c,{lock:""});
    return Object.assign({},c,{lock:k, b:normalizeScenario(Object.assign({},c.a,{[k]:c.b[k]}))});
  }
  // Back to the app defaults, with the default name. The other side is left exactly as it was, so a
  // "Vary only" lock (which ties the two sides together) is switched off rather than broken silently.
  function cmpReset(c, side){
    return Object.assign({},c,{[side]:scenario(), names:Object.assign({},c.names,{[side]:DEFAULT_NAMES[side]}), lock:""});
  }

  // Names are plain text: control characters and text-direction overrides are removed, then trimmed and capped.
  const cleanName=(v,max)=> String(v==null?"":v).replace(/[\u0000-\u001f\u007f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g,"").trim().slice(0,max);

  /* ================= SHARE LINKS ================= */
  // A scenario is written as the settings that differ from DEFAULTS, e.g. "D:400,clFn:50" ("" = defaults).
  // A custom schedule is added as "ev:0@500L;12@250;24@250m" (L = loading, m = missed).
  function encodeScenario(p){
    const parts=PK_KEYS.filter(k=>k!=="events" && p[k]!==DEFAULTS[k]).map(k=>k+":"+p[k]);
    if(p.dosing==="custom" && p.events.length) parts.push("ev:"+eventsKey(p.events));
    return parts.join(",");
  }
  // Tokens that don't parse are skipped; the rest go through normalizeEvents like any other schedule.
  function decodeEvents(raw){
    const out=[];
    String(raw).split(";").slice(0,200).forEach(tok=>{
      const m=/^(\d+(?:\.\d+)?)@(\d+(?:\.\d+)?)(L?)(m?)$/.exec(tok);
      if(m) out.push({t:parseFloat(m[1]), mg:parseFloat(m[2]), type:m[3]?"loading":"maintenance", status:m[4]?"missed":"given"});
    });
    return normalizeEvents(out);
  }
  // Unknown keys and invalid values are ignored; numbers are clamped to their allowed range.
  function decodeScenario(str){
    const p=scenario();
    String(str||"").split(",").forEach(pair=>{
      const i=pair.indexOf(":");
      if(i<1) return;
      const k=pair.slice(0,i), raw=pair.slice(i+1);
      if(k==="ev"){ p.events=decodeEvents(raw); return; }
      if(!PK_KEYS.includes(k) || k==="events") return;
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
    const scen=st.mode==="cmp" ? [st.a,st.b] : [st.s,st.base].filter(Boolean);
    const parts=["v="+(scen.some(p=>p.dosing==="custom") ? VERSION : 1)];
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
    const name=s=>s ? cleanName(safe(s),40) : "";
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

  /* ================= SCENARIO LIBRARY ================= */
  // Saved scenarios live in the browser's localStorage; the page does the reading and writing. Each item
  // stores its setup in the share-link format, so saving, loading and importing reuse the link validation,
  // schema versions (v1/v2) and clamping, and anything a link can carry (custom schedules, A/B names, the
  // lock, the baseline, the lesson, the view) is saved too.
  const LIBRARY_FORMAT="dosecurve-library", LIBRARY_VERSION=1;
  const LIBRARY_LIMITS={items:200, name:60, link:20000, importItems:1000};
  const emptyLibrary=()=>({format:LIBRARY_FORMAT, version:LIBRARY_VERSION, items:[]});
  const newItemId=()=> "s"+Math.random().toString(36).slice(2,10)+Date.now().toString(36);
  function defaultItemName(st){
    return st.mode==="cmp" ? `${st.nameA||DEFAULT_NAMES.a} vs ${st.nameB||DEFAULT_NAMES.b}` : "Simulator scenario";
  }
  // A new saved item for the given link state (the same object encodeLink takes).
  function libraryItem(name, st, now, id){
    const when=now || new Date().toISOString();
    return {id:id || newItemId(), name:cleanName(name,LIBRARY_LIMITS.name) || defaultItemName(st),
      kind:st.mode==="cmp" ? "cmp" : "sim", link:encodeLink(st), savedAt:when, updatedAt:when};
  }
  // One stored or imported item, validated: its link must decode, and is stored re-encoded (canonical and
  // clamped). null when it can't be used.
  function validItem(x){
    if(!x || typeof x!=="object" || typeof x.link!=="string" || x.link.length>LIBRARY_LIMITS.link) return null;
    const st=decodeLink(x.link);
    if(!st) return null;
    const time=v=> typeof v==="string" && !isNaN(Date.parse(v)) ? new Date(v).toISOString() : null;
    const savedAt=time(x.savedAt) || time(x.updatedAt) || new Date(0).toISOString();
    return {id:typeof x.id==="string" && /^[a-z0-9]{1,24}$/.test(x.id) ? x.id : newItemId(),
      name:cleanName(x.name,LIBRARY_LIMITS.name) || defaultItemName(st),
      kind:st.mode, link:encodeLink(st), savedAt, updatedAt:time(x.updatedAt) || savedAt};
  }
  // Reads a library document (object or JSON text) from storage or an import file. Version 0, a bare array
  // of items, is migrated; a newer version is read best-effort and flagged. Returns {library, skipped,
  // error?, newer?}; `skipped` counts items that were invalid or over the limit.
  function parseLibrary(input){
    let data=input;
    if(typeof input==="string"){
      try{ data=JSON.parse(input); }catch(e){ return {library:emptyLibrary(), skipped:0, error:"not valid JSON"}; }
    }
    if(Array.isArray(data)) data={format:LIBRARY_FORMAT, version:0, items:data};
    if(!data || typeof data!=="object" || data.format!==LIBRARY_FORMAT) return {library:emptyLibrary(), skipped:0, error:"not a DoseCurve scenario file"};
    const raw=Array.isArray(data.items) ? data.items : [];
    const items=[], ids=new Set();
    let skipped=Math.max(0, raw.length-LIBRARY_LIMITS.importItems);
    raw.slice(0,LIBRARY_LIMITS.importItems).forEach(x=>{
      const it=validItem(x);
      if(!it){ skipped++; return; }
      while(ids.has(it.id)) it.id=newItemId();
      ids.add(it.id);
      items.push(it);
    });
    if(items.length>LIBRARY_LIMITS.items){ skipped+=items.length-LIBRARY_LIMITS.items; items.length=LIBRARY_LIMITS.items; }
    const out={library:{format:LIBRARY_FORMAT, version:LIBRARY_VERSION, items}, skipped};
    if(typeof data.version==="number" && data.version>LIBRARY_VERSION) out.newer=true;
    return out;
  }
  // Adds imported items after the existing ones, with fresh ids, up to the item limit.
  function mergeLibrary(lib, incoming){
    const items=lib.items.slice(), ids=new Set(items.map(i=>i.id));
    let added=0, dropped=0;
    incoming.forEach(it=>{
      if(items.length>=LIBRARY_LIMITS.items){ dropped++; return; }
      const copy=Object.assign({},it);
      while(ids.has(copy.id)) copy.id=newItemId();
      ids.add(copy.id); items.push(copy); added++;
    });
    return {library:{format:LIBRARY_FORMAT, version:LIBRARY_VERSION, items}, added, dropped};
  }
  const exportLibrary=items=> JSON.stringify({format:LIBRARY_FORMAT, version:LIBRARY_VERSION, items}, null, 2);

  return {VERSION, PK_KEYS, DEFAULTS, CHOICES, RANGES, VIEW_DEFAULTS, VIEW_RANGES, LOCKS, EVENT_LIMITS, scenario,
    cloneScenario, cloneEvents, normalizeEvents, nextEventTime, duplicateEventTime, eventsKey, doseSchedule, inspectAt, extrema, sameSetting, isRelevant, eventsFromBasic, doseTotals,
    keOf, vOf, missedOf, singleConc, doseEvents, conc, derived, windowStats, ssProfile, compareRows, diff,
    DRUGS, LESSONS, TEMPLATES,
    DEFAULT_NAMES, newComparison, cmpApply, cmpCopy, cmpSwap, cmpSetLock, cmpReset, lockHolds, normalizeScenario,
    encodeScenario, decodeScenario, encodeView, decodeView, encodeLink, decodeLink, cleanName,
    LIBRARY_FORMAT, LIBRARY_VERSION, LIBRARY_LIMITS, emptyLibrary, libraryItem, validItem, parseLibrary, mergeLibrary, exportLibrary};
});
