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

  // Share-link format: 1 = single and repeated regimens; 2 adds custom dose schedules; 3 adds a route per
  // dose and a duration per infusion; 4 adds the concentration–effect (PK/PD) settings; 5 adds the clinical
  // patient (age, sex, height, creatinine, albumin), the renal fraction fe, the salt factor S, units, and the
  // wider ranges for volume, half-life, weight and the time window. Each link is written at the lowest version
  // that can hold it, so links that older pages understand stay exactly as they were.
  const VERSION=5;

  /* ================= SCENARIO MODEL ================= */
  // A scenario is a flat object of these keys. The time window, thresholds and chart settings are
  // view settings, shared by the two scenarios in a comparison.
  // dosing "custom" uses `events` instead of D/τ/n/load/missed; the other two ignore `events`.
  const PK_KEYS=["route","dosing","D","F","ka","thalf","V","tinf","tau","nDoses","loadMult","missed","wt","clFn","events",
    "e0","emax","ec50","hill", "pm","age","sex","ht","scr","alb","wtm","fe","S","unit"];
  // Pharmacodynamic settings: the drug's concentration–effect relationship (sigmoid Emax model).
  const PD_KEYS=["e0","emax","ec50","hill"];
  // The patient (pm = patient mode): "simple" scales clearance by the organ-function slider (clFn); "clinical"
  // estimates creatinine clearance by Cockcroft–Gault from age, sex, weight and serum creatinine (mg/dL), and
  // scales the renally cleared fraction fe of clearance by it. ht is height in cm, alb albumin in g/dL, and wtm
  // the weight Cockcroft–Gault uses (actual, ideal or adjusted body weight). S is the salt factor: the amount
  // of active drug per unit of dose (lithium carbonate: mEq of lithium per mg). unit names the unit system.
  const DEFAULTS=Object.freeze({route:"oral",dosing:"single",D:500,F:0.9,ka:1.2,thalf:4,V:35,tinf:1,tau:8,nDoses:6,loadMult:1,missed:1,wt:70,clFn:100,
    events:Object.freeze([]), e0:0, emax:100, ec50:4, hill:1,
    pm:"simple", age:40, sex:"M", ht:175, scr:0.8, alb:4, wtm:"actual", fe:1, S:1, unit:"mg"});
  const CHOICES={route:["oral","iv","inf"],dosing:["single","repeated","custom"],loadMult:[1,1.5,2],
    pm:["simple","clinical"],sex:["M","F"],wtm:["actual","ibw","adj"],unit:["mg","mcg","meq"]};
  // Numeric limits, shared with the sliders. missed = 1 means no dose is missed.
  const RANGES={D:[25,2000],F:[0.1,1],ka:[0.1,3],tinf:[0.25,96],thalf:[0.5,72],V:[5,600],tau:[2,24],
    nDoses:[2,20],missed:[1,19],wt:[40,200],clFn:[25,150],e0:[0,50],emax:[5,100],ec50:[0.1,100],hill:[0.5,5],
    age:[18,100],ht:[120,220],scr:[0.2,15],alb:[1,6],fe:[0,1],S:[0.001,1]};
  const INTEGER_KEYS=["nDoses","missed","age","ht"];
  // Settings a v4 page can't hold: anything clinical, or a value beyond its narrower ranges.
  const V5_KEYS=["pm","age","sex","ht","scr","alb","wtm","fe","S","unit"];
  const V4_MAX={thalf:24, V:120, wt:120};
  // pd shows the effect charts; etgt is the target effect (% of the largest possible response).
  const VIEW_DEFAULTS={duration:24,mec:2,mtc:12,scale:"lin",zoom:"full",pd:false,etgt:50};
  const VIEW_RANGES={duration:[6,336],mec:[0,10000],mtc:[0,10000],etgt:[1,99]};
  // Settings that "Vary only" can hold apart while every other setting is shared by A and B.
  const LOCKS=[["D","Dose"],["tau","Dosing interval"],["loadMult","Loading dose"],["missed","Missed dose"],["route","Route"],
    ["clFn","Organ function"],["thalf","Half-life"],["V","Volume"],["F","Bioavailability"],["ka","Absorption rate"],
    ["ec50","EC50"],["emax","Emax"],["hill","Hill slope"],["scr","Serum creatinine"],["age","Age"]];

  const clamp=(v,[lo,hi])=>Math.min(hi,Math.max(lo,v));
  const round=(v,dp)=>Math.round(v*10**dp)/10**dp;

  /* ---------- custom dose schedules ---------- */
  // An event is {id, t (h), mg, type: "maintenance"|"loading", status: "given"|"missed", route: "oral"|"iv"|
  // "inf"}, plus dur (h) for an infusion, which delivers its mg at a constant rate from t to t + dur.
  // Scenarios never share an events array: every copy clones it, so editing A's schedule can't change B's.
  const EVENT_ROUTES=["oral","iv","inf"];
  const EVENT_LIMITS={max:40, t:[0,168], mg:[25,4000], mgInf:[25,10000], dur:[0.25,168]};
  function cloneEvent(e){
    const c={id:e.id, t:e.t, mg:e.mg, type:e.type, status:e.status};
    if(e.route!==undefined) c.route=e.route;
    if(e.dur!==undefined) c.dur=e.dur;
    return c;
  }
  const cloneEvents=list=>(list||[]).map(cloneEvent);
  const cloneScenario=p=>Object.assign({},p,{events:cloneEvents(p.events)});
  const scenario=over=>cloneScenario(Object.assign({},DEFAULTS,over));

  // Validated, sorted copy: bad entries are dropped, times and amounts clamped, ids made unique, type,
  // status and route limited to their values, and at most 40 events kept (the earliest). A dose without a
  // route takes the scenario's (dflt.route) and an infusion without a duration takes its T·inf (dflt.tinf),
  // so schedules from before per-dose routes draw exactly as they did. Infusions may carry up to 10,000 mg
  // and must end by 168 h: the start is held back so the whole infusion fits.
  function normalizeEvents(list, dflt){
    const R=dflt && EVENT_ROUTES.includes(dflt.route) ? dflt.route : "oral";
    const T=dflt && isFinite(Number(dflt.tinf)) ? Number(dflt.tinf) : DEFAULTS.tinf;
    const out=[], seen=new Set();
    for(const e of (Array.isArray(list) ? list.slice(0,200) : [])){
      if(!e || typeof e!=="object") continue;
      const t=Number(e.t), mg=Number(e.mg);
      if(!isFinite(t) || !isFinite(mg)) continue;
      const id=(typeof e.id==="string" && /^[a-z0-9-]{1,16}$/.test(e.id) && !seen.has(e.id)) ? e.id : "";
      if(id) seen.add(id);
      const route=EVENT_ROUTES.includes(e.route) ? e.route : R;
      const ev={id, t:round(clamp(t,EVENT_LIMITS.t),2), mg:round(clamp(mg, route==="inf" ? EVENT_LIMITS.mgInf : EVENT_LIMITS.mg),1),
        type:e.type==="loading"?"loading":"maintenance", status:e.status==="missed"?"missed":"given", route};
      if(route==="inf"){
        const d=e.dur==null || e.dur==="" ? NaN : Number(e.dur);
        ev.dur=round(clamp(isFinite(d) ? d : T, EVENT_LIMITS.dur),2);
        ev.t=Math.min(ev.t, round(EVENT_LIMITS.t[1]-ev.dur,2));
      }
      out.push(ev);
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
  // Dragging a dose snaps it to a half-hour grid inside 0–168 h. null for a time that isn't a number.
  const MOVE_STEP=0.5;
  function snapTime(t, step=MOVE_STEP){
    const v=Number(t);
    return isFinite(v) ? clamp(Math.round(v/step)*step, EVENT_LIMITS.t) : null;
  }
  // Moves one dose to time t and returns a new, sorted schedule. Its amount, type, route, duration and missed
  // status stay as they were, and so does every other dose; landing on another dose's time is allowed (they
  // add together), and an infusion stops where its end reaches 168 h. An unknown id or a time that isn't a
  // number returns an unchanged copy.
  function moveEvent(list, id, t){
    const L=normalizeEvents(list), v=Number(t);
    if(!isFinite(v) || !L.some(e=>e.id===id)) return L;
    return normalizeEvents(L.map(e=> e.id===id ? Object.assign({},e,{t:v}) : e));
  }
  // Canonical text of a schedule, used for equality (ids don't count): "0@350b;0@1456i24;24@500oLm"
  // (o = oral, b = IV bolus, i<h> = infusion over h hours, L = loading, m = missed).
  const routeCode=e=> e.route==="iv" ? "b" : e.route==="inf" ? "i"+e.dur : "o";
  const flags=e=> (e.type==="loading"?"L":"")+(e.status==="missed"?"m":"");
  const eventsKey=list=>(list||[]).map(e=>`${e.t}@${e.mg}${routeCode(e)}${flags(e)}`).join(";");
  // The route every dose of a scenario uses: its own route, or for a custom schedule the one route all of
  // its doses share, or "mixed".
  function routeOf(p){
    if(p.dosing!=="custom" || !p.events.length) return p.route;
    const r=p.events[0].route;
    return p.events.every(e=>e.route===r) ? r : "mixed";
  }

  // Cross-setting rules the individual ranges can't express: a missed dose must fall inside the regimen
  // (and can't be the final dose), otherwise it is cleared so the controls never show a missed dose the
  // model is ignoring; and the schedule is always a validated, sorted, private copy.
  function normalizeScenario(p){
    const q=Object.assign({},p);
    if(q.missed>=q.nDoses) q.missed=1;
    if(q.e0+q.emax>100) q.emax=100-q.e0;   // the effect is a % of the largest possible response
    q.events=normalizeEvents(q.events, q);
    return q;
  }
  // Whether a setting means anything for a scenario (F only orally, τ only for a regular regimen, …).
  function isRelevant(k,s){
    if(k==="F"||k==="ka") return s.dosing==="custom" ? s.events.some(e=>e.route==="oral") : s.route==="oral";
    if(k==="tinf") return s.dosing!=="custom" && s.route==="inf";   // a custom infusion has its own duration
    if(k==="tau"||k==="nDoses"||k==="loadMult"||k==="missed") return s.dosing==="repeated";
    if(k==="D") return s.dosing!=="custom";
    if(k==="events") return s.dosing==="custom";
    if(k==="clFn") return s.pm!=="clinical";
    if(["age","sex","ht","scr","alb","wtm","fe"].includes(k)) return s.pm==="clinical";
    return true;
  }
  // Equality that understands schedules (plain === would compare array identity).
  const sameSetting=(k,a,b)=> k==="events" ? eventsKey(a.events)===eventsKey(b.events) : a[k]===b[k];

  /* ================= CLINICAL PATIENT ================= */
  // Cockcroft–Gault creatinine clearance (mL/min): (140 − age) × weight / (72 × SCr), × 0.85 for women.
  // Cockcroft DW, Gault MH. Nephron 1976;16(1):31–41.
  const crclCG=(age, wtKg, scr, sex)=> (140-age)*wtKg/(72*scr)*(sex==="F" ? 0.85 : 1);
  // Devine ideal body weight (kg): 50 kg (men) or 45.5 kg (women) + 2.3 kg per inch over 5 feet.
  const cmToIn=cm=> cm/2.54;
  const ibwDevine=(sex, heightIn)=> (sex==="F" ? 45.5 : 50)+2.3*(heightIn-60);
  // Adjusted body weight: IBW + 0.4 × (actual − IBW).
  const adjBW=(ibw, actual)=> ibw+0.4*(actual-ibw);
  // Clearance relative to the drug's reference (a CrCl of 120 mL/min): the non-renal part (1 − fe) is kept and
  // the renal part fe scales with creatinine clearance.
  const CRCL_REF=120;
  const renalFactor=(fe, crcl)=> (1-fe)+fe*Math.max(0,crcl)/CRCL_REF;
  // Everything the clinical patient panel shows, for scenario p.
  function patientOf(p){
    const heightIn=cmToIn(p.ht), ibw=ibwDevine(p.sex, heightIn), adj=adjBW(ibw, p.wt);
    const wtUsed=p.wtm==="ibw" ? ibw : p.wtm==="adj" ? adj : p.wt;
    const crcl=crclCG(p.age, wtUsed, p.scr, p.sex);
    return {heightIn, ibw, adj, wtUsed, crcl, factor:renalFactor(p.fe, crcl)};
  }
  // How much of the drug's reference clearance this patient has (1 = all of it).
  const clFactor=p=> p.pm==="clinical" ? patientOf(p).factor : p.clFn/100;

  // Unit systems. The engine is unit-free: a dose of D (in the dose unit) times S, over a volume in litres, gives
  // a concentration in the concentration unit. toMgL converts that unit to mg/L; cdp is extra decimals for
  // concentrations, since digoxin (ng/mL) and lithium (mEq/L) levels are around 1.
  const UNITS={
    mg: {id:"mg",  dose:"mg",  amount:"mg",  conc:"mg/L",  auc:"mg·h/L",  perKg:"mg/kg",  toMgL:1,     cdp:0},
    mcg:{id:"mcg", dose:"mcg", amount:"mcg", conc:"ng/mL", auc:"ng·h/mL", perKg:"mcg/kg", toMgL:0.001, cdp:1},
    // 1 mEq of lithium (monovalent) is 1 mmol, 6.94 mg
    meq:{id:"meq", dose:"mg",  amount:"mEq", conc:"mEq/L", auc:"mEq·h/L", perKg:"mg/kg",  toMgL:6.94,  cdp:1}};
  const unitsOf=p=> UNITS[p && p.unit] || UNITS.mg;
  // The same scenario expressed in another unit system (for comparing A and B drawn in different units): every
  // concentration, and the EC50, scale by the ratio of the two units; the curves are otherwise identical.
  function convertUnits(p, unit){
    const from=unitsOf(p), to=UNITS[unit] || UNITS.mg;
    if(from.id===to.id) return cloneScenario(p);
    const r=from.toMgL/to.toMgL;
    return Object.assign(cloneScenario(p), {unit:to.id, S:(p.S==null ? 1 : p.S)*r, ec50:p.ec50*r});
  }

  /* ================= PK ENGINE ================= */
  const keOf = p=> (Math.LN2/p.thalf) * clFactor(p);
  // Active drug per unit of dose (the salt factor); 1 for most drugs.
  const saltOf = p=> p.S==null ? 1 : p.S;
  const vOf  = p=> p.V * (p.wt/70);
  // The final dose can't be skipped: final-interval peak and trough are defined by it, and skipping it
  // is the same as giving one dose fewer.
  const missedOf = p=> (p.dosing==="repeated" && p.missed>1 && p.missed<p.nDoses) ? p.missed : 0;

  /* ---------- disposition: every dose response as a sum of exponentials ---------- */
  // How the body handles 1 mg put straight into plasma, as terms {c, k}: C(t) = Σ c·e^(−k·t), c in 1/L. A
  // one-compartment body is a single term, 1/V at kₑ. Every route, the steady state and the AUC are built
  // from these terms, so a model with more of them works everywhere at once.
  const disposition=p=> [{c:1/vOf(p), k:keOf(p)}];
  const SAME_RATE=1e-6;   // kₐ this close to a disposition rate uses the exact limit, t·e^(−kₐt)
  // Responses per mg: an instant bolus; an oral dose absorbed at kₐ (multiply by F); an infusion over Ti hours.
  function bolusResp(terms, t){
    let s=0;
    for(const x of terms) s+=x.c*Math.exp(-x.k*t);
    return s;
  }
  function oralResp(terms, t, ka){
    let s=0;
    for(const x of terms) s+= Math.abs(ka-x.k)<SAME_RATE ? x.c*ka*t*Math.exp(-ka*t)
      : x.c*ka*(Math.exp(-x.k*t)-Math.exp(-ka*t))/(ka-x.k);
    return s;
  }
  function infResp(terms, t, Ti){
    let s=0;
    for(const x of terms) s+= t<=Ti ? x.c*(1-Math.exp(-x.k*t))/x.k : x.c*(1-Math.exp(-x.k*Ti))/x.k*Math.exp(-x.k*(t-Ti));
    return s/Ti;
  }
  // Exposure per mg reaching plasma: ∫ Σ c·e^(−kt) dt = Σ c/k, so AUC = F·D·Σ c/k and CL = 1 / Σ c/k.
  const aucPerMg=terms=> terms.reduce((s,x)=>s+x.c/x.k,0);

  // Concentration at time t after one dose of `mg`, given by the dose's own route (and infusion duration)
  // when `e` carries one, else by the scenario's. Oral doses use the scenario's F and kₐ; IV doses have F = 1.
  // `terms` can be passed in when many doses share one scenario.
  function singleConc(p, t, mg, e, terms){
    if(t<0) return 0;
    terms=terms||disposition(p);
    mg*=saltOf(p);
    const route=(e && e.route) || p.route;
    if(route==="iv") return mg*bolusResp(terms,t);
    if(route==="inf") return mg*infResp(terms, t, (e && e.dur) || p.tinf);
    return p.F*mg*oralResp(terms, t, p.ka);
  }

  // Every dose actually given, as {t, mg, n, route} (+ dur for an infusion). This is the one place regimens
  // turn into doses, so the simulation, window metrics and exports all follow custom schedules automatically.
  function doseEvents(p){
    const dose=(t,mg,n,route,dur)=> route==="inf" ? {t, mg, n, route, dur} : {t, mg, n, route};
    if(p.dosing==="custom") return p.events.filter(e=>e.status==="given").map((e,i)=>Object.assign(dose(e.t,e.mg,i+1,e.route,e.dur),{id:e.id}));
    if(p.dosing==="single") return [dose(0,p.D,1,p.route,p.tinf)];
    const skip=missedOf(p), ev=[];
    for(let i=0;i<p.nDoses;i++){
      if(i+1===skip) continue;
      ev.push(dose(i*p.tau, p.D*(i===0?p.loadMult:1), i+1, p.route, p.tinf));
    }
    return ev;
  }
  // The schedule a regimen describes, as editable events. Missed doses stay in, marked missed; doses
  // after 168 h (the longest window) are left out because nothing shown can depend on them.
  function eventsFromBasic(p){
    if(p.dosing==="custom") return normalizeEvents(p.events, p);
    if(p.dosing==="single") return normalizeEvents([{id:"e1", t:0, mg:p.D, type:"maintenance", status:"given"}], p);
    const skip=missedOf(p), out=[];
    for(let i=0;i<p.nDoses && i*p.tau<=EVENT_LIMITS.t[1];i++){
      out.push({id:"e"+(i+1), t:i*p.tau, mg:p.D*(i===0?p.loadMult:1),
        type:i===0 && p.loadMult>1 ? "loading" : "maintenance", status:i+1===skip ? "missed" : "given"});
    }
    return normalizeEvents(out, p);
  }
  // Doses started within [0, T], and the mg delivered in that time: an infusion still running at T counts
  // only what has gone in so far.
  function doseTotals(p, T){
    const ev=doseEvents(p).filter(e=>e.t<=T);
    return {n:ev.length, mg:ev.reduce((s,e)=>s+(e.route==="inf" ? e.mg*Math.min(1,(T-e.t)/e.dur) : e.mg),0)};
  }

  // Superposition of every dose actually given.
  function conc(p, t, ev){
    ev=ev||doseEvents(p);
    const terms=disposition(p);
    let sum=0;
    for(const e of ev) if(t>=e.t) sum+=singleConc(p, t-e.t, e.mg, e, terms);
    return sum;
  }

  function derived(p){
    const k=keOf(p), V=vOf(p), terms=disposition(p), perMg=aucPerMg(terms);
    // the effective half-life is the slowest (terminal) one
    const d={thalfEff:Math.LN2/Math.min(...terms.map(x=>x.k)), ke:k, CL:1/perMg, V:V, mgkg:p.D/p.wt};
    const Ffac = p.route==="oral" ? p.F : 1;
    d.auc=Ffac*saltOf(p)*p.D*perMg;
    if(p.route==="iv"){ d.tmax=0; d.cmax=p.D*bolusResp(terms,0); }
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
      d.auc=given.reduce((s,e)=>s+(e.route==="oral" ? p.F : 1)*e.mg,0)*saltOf(p)*perMg;   // each dose by its own route
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
    // an IV bolus peaks the instant it's given and an infusion at its end: check those exact times too
    ev.forEach(e=>{
      [e.route==="iv" ? e.t : null, e.route==="inf" ? e.t+e.dur : null].forEach(x=>{
        if(x===null || x<0 || x>T) return;
        const c=conc(p,x,ev);
        if(c>cmax+1e-12){ cmax=c; tmax=x; }
      });
    });
    return {cmax,tmax,auc,tIn,tBelow,tAbove,T};
  }

  // Concentration s hours (0 ≤ s < τ) into a dose interval once a regimen of p.D every p.tau hours has run
  // forever: the sum over every earlier dose, Σⱼ C₁(s + jτ). Each single-dose curve is a sum of exponentials
  // (once an infusion has stopped), so all but the first few terms form geometric series with exact sums.
  function ssConc(p, s){
    if(p.dosing!=="repeated") return null;   // only a regular periodic regimen has a steady state
    const terms=disposition(p), tau=p.tau, D=p.D*saltOf(p), geo=l=>1/(1-Math.exp(-l*tau));
    let c=0;
    if(p.route==="iv"){
      for(const x of terms) c+=x.c*Math.exp(-x.k*s)*geo(x.k);
      return D*c;
    }
    if(p.route==="inf"){
      // doses whose infusion is still running at this moment are added one by one; the rest have stopped,
      // and each term decays from where its infusion ended
      const Ti=p.tinf, J0=Math.max(0, Math.ceil((Ti-s)/tau-1e-12));
      for(let j=0;j<J0;j++) c+=singleConc(p, s+j*tau, p.D, null, terms);   // singleConc applies S itself
      for(const x of terms) c+=(D/Ti)*x.c*(1-Math.exp(-x.k*Ti))/x.k*Math.exp(-x.k*(s+J0*tau-Ti))*geo(x.k);
      return c;
    }
    const ka=p.ka;
    for(const x of terms){
      if(Math.abs(ka-x.k)<SAME_RATE){
        // c·kₐ·t·e^(−kₐt) summed over t = s + jτ: Σⱼ (s + jτ)·Xʲ = s/(1 − X) + τX/(1 − X)² with X = e^(−kₐτ)
        const X=Math.exp(-ka*tau);
        c+=x.c*ka*Math.exp(-ka*s)*(s/(1-X)+tau*X/((1-X)*(1-X)));
      } else c+=x.c*ka/(ka-x.k)*(Math.exp(-x.k*s)*geo(x.k)-Math.exp(-ka*s)*geo(ka));
    }
    return p.F*D*c;
  }

  // Peak and trough of every dose interval, plus where an uninterrupted regimen settles.
  function ssProfile(p){
    if(p.dosing!=="repeated") return null;
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
    // steady state in closed form: sample the interval, plus the exact peak of a bolus (s = 0) or an infusion (its end)
    const cand=[0]; if(p.route==="inf") cand.push(p.tinf%tau);
    let ssPeak=0;
    for(let j=0;j<=S;j++) cand.push(tau*j/S);
    cand.forEach(s=>{ const c=ssConc(p,s); if(c>ssPeak) ssPeak=c; });
    const ssTrough=ssConc(p,tau-1e-9);
    const clears=ssTrough<0.01*ssPeak; // essentially nothing carries over from one dose to the next
    return {rows, ssPeak, ssTrough, clears, swing:clears?null:ssPeak/ssTrough,
      Rac:1/(1-Math.exp(-k*tau)), t90:3.32*Math.LN2/k, dosesTo90:Math.ceil(Math.log(10)/(k*tau))};
  }

  // Infusions given at the same time as each other: {maxRunning, from} (the most running at once, and when
  // that many first run together), or null when no two infusions overlap. Back-to-back infusions don't overlap.
  function infusionOverlap(p){
    const edges=[];
    doseEvents(p).forEach(e=>{ if(e.route==="inf"){ edges.push([e.t,1]); edges.push([e.t+e.dur,-1]); } });
    edges.sort((a,b)=>a[0]-b[0] || a[1]-b[1]);   // at the same moment, an infusion ends before the next starts
    let running=0, maxRunning=0, from=null;
    edges.forEach(([t,d])=>{ running+=d; if(running>maxRunning){ maxRunning=running; from=t; } });
    return maxRunning>1 ? {maxRunning, from} : null;
  }

  /* ================= TIME INSPECTION ================= */
  // Every scheduled dose, missed ones included: {t, mg, loading, missed, n, route, dur}, in time order
  // (dur is null except for an infusion).
  function doseSchedule(p){
    let out;
    const dur=p.route==="inf" ? p.tinf : null;
    if(p.dosing==="custom") out=p.events.map((e,i)=>({t:e.t, mg:e.mg, loading:e.type==="loading", missed:e.status==="missed", n:i+1,
      route:e.route, dur:e.route==="inf" ? e.dur : null}));
    else if(p.dosing==="single") out=[{t:0, mg:p.D, loading:false, missed:false, n:1, route:p.route, dur}];
    else {
      const skip=missedOf(p); out=[];
      for(let i=0;i<p.nDoses;i++) out.push({t:i*p.tau, mg:p.D*(i===0?p.loadMult:1), loading:i===0 && p.loadMult>1, missed:i+1===skip, n:i+1,
        route:p.route, dur});
    }
    return out.sort((a,b)=>a.t-b.t);
  }

  // What the model says at time t. The trend compares the curve 0.02 h either side: above both is a peak
  // (an IV bolus at the moment it's given is one), below both a trough, otherwise the slope just after t
  // says rising or falling. `last` is the most recent dose actually given, with doses at the same time
  // counted as one administration; missed doses never count as given and are listed in missedSince.
  // `infusing` lists the infusions running at t: start, end, rate (mg/h) and mg delivered so far.
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
      last={t:lt, mg:grp.reduce((s,x)=>s+x.mg,0), count:grp.length, loading:grp.some(x=>x.loading),
        route:grp.every(x=>x.route===grp[0].route) ? grp[0].route : "mixed", dur:grp.length===1 ? grp[0].dur : null};
    }
    const infusing=ev.filter(e=>e.route==="inf" && e.t<=t+1e-9 && t<e.t+e.dur-1e-9)
      .map(e=>({start:e.t, end:e.t+e.dur, rate:e.mg/e.dur, delivered:e.mg*Math.max(0,t-e.t)/e.dur, mg:e.mg}));
    const missedSince=sched.filter(x=>x.missed && x.t<=t+1e-9 && (!last || x.t>last.t+1e-9)).map(x=>x.t);
    const nx=sched.find(x=>x.t>t+1e-9);
    return {t, c, trend, status:c>mtc ? "above" : c>=mec ? "in" : "below", last, since:last ? t-last.t : null,
      missedSince, infusing, next:nx ? {t:nx.t, mg:nx.mg, missed:nx.missed, route:nx.route, dur:nx.dur} : null};
  }

  // Local peaks and troughs over [0, T]. The grid includes every dose time (and the instant before it,
  // and each infusion end) so the jumps of an IV bolus and the tops of infusions are caught exactly.
  function extrema(p, T){
    const ev=doseEvents(p), N=2400, pts=new Set();
    for(let i=0;i<=N;i++) pts.add(T*i/N);
    ev.forEach(e=>{
      [e.t-1e-6, e.t, e.t+1e-6].forEach(x=>{ if(x>=0 && x<=T) pts.add(x); });
      if(e.route==="inf" && e.t+e.dur<=T) pts.add(e.t+e.dur);
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

  /* ================= PHARMACODYNAMICS ================= */
  // Sigmoid Emax model linked directly to plasma concentration (no effect-site delay):
  // E = E0 + Emax·Cⁿ / (EC50ⁿ + Cⁿ), in % of the largest possible response. Written as Emax / (1 + (EC50/C)ⁿ)
  // so that tiny and huge concentrations stay exact.
  function effectOf(p, c){
    return c>0 ? p.e0+p.emax/(1+Math.pow(p.ec50/c, p.hill)) : p.e0;
  }
  // The concentration that produces effect E: 0 when the baseline already reaches it, null when it's out of
  // reach (E0 + Emax or more).
  function concForEffect(p, E){
    const f=(E-p.e0)/p.emax;
    if(f<=0) return 0;
    if(f>=1) return null;
    return p.ec50*Math.pow(f/(1-f), 1/p.hill);
  }
  // Effect over [0, T] against a target effect. Effect rises with concentration, so the peak effect comes
  // with the concentration peak, and "at or above target" means "concentration at or above ct". Crossings
  // are interpolated between samples. onset is when the target is first reached (null if never).
  function effectStats(p, T, target){
    const w=windowStats(p,T,0,Infinity), ct=concForEffect(p,target), ev=doseEvents(p), N=2400, dt=T/N;
    let above=0, onset=null;
    if(ct!==null){
      let t0=0, c0=conc(p,0,ev);
      if(c0>=ct) onset=0;
      for(let i=1;i<=N;i++){
        const t1=i*dt, c1=conc(p,t1,ev), a0=c0>=ct, a1=c1>=ct;
        if(a0 && a1) above+=dt;
        else if(a0!==a1){
          const tx=t0+(ct-c0)/(c1-c0)*dt;
          if(a1){ above+=t1-tx; if(onset===null) onset=tx; } else above+=tx-t0;
        }
        t0=t1; c0=c1;
      }
    }
    return {peak:effectOf(p,w.cmax), tPeak:w.tmax, ct, tAbove:above, onset};
  }

  /* ================= LESSON CHECKS ================= */
  // One scenario's numbers over a lesson's window, each computed only when a prediction or challenge asks.
  function lessonStats(p, view){
    const T=view.duration, memo={}, once=(k,f)=> k in memo ? memo[k] : (memo[k]=f());
    const w=()=>once("w",()=>windowStats(p,T,view.mec,view.mtc)), d=()=>once("d",()=>derived(p));
    const ss=()=>once("ss",()=> p.dosing==="repeated" ? ssProfile(p) : null);
    const rep=p.dosing==="repeated";
    return {p,
      get cmax(){ return w().cmax; }, get tmax(){ return w().tmax; }, get tin(){ return 100*w().tIn/T; },
      get aucInf(){ return d().auc; }, get trough(){ return rep ? d().cminSS : null; }, get peakSS(){ return rep ? d().cmaxSS : null; },
      get avgSS(){ return rep ? d().auc/p.tau : null; }, get swing(){ const s=ss(); return s ? s.swing : null; }, get rac(){ const s=ss(); return s ? s.Rac : null; },
      get top(){ return p.e0+p.emax; }, get epeak(){ return once("ep",()=>effectStats(p,T,view.etgt).peak); },
      effAbove:tg=> once("ea"+tg,()=>effectStats(p,T,tg).tAbove),
      at:t=> conc(p,t),
      reach:level=> once("r"+level,()=>{ for(let i=0;i<=T*100;i++){ if(conc(p,i/100)>=level) return i/100; } return null; })};
  }
  // "Higher", "Lower" or "About the same" (0, 1, 2): within 1% counts as the same.
  const higherLowerSame=(a,b)=> Math.abs(a-b)<=0.01*Math.max(Math.abs(a),Math.abs(b),1e-9) ? 2 : a>b ? 0 : 1;
  const lessonView=L=> Object.assign({},VIEW_DEFAULTS,L.view);
  const lessonScenario=(L,over)=> normalizeScenario(scenario(Object.assign({},L.cur,over||{})));
  // What a lesson's prediction is judged on: its baseline and its starting scenario.
  function lessonCheck(L){
    const view=lessonView(L);
    return {view, base:lessonStats(normalizeScenario(scenario(L.base)),view), cur:lessonStats(lessonScenario(L),view)};
  }
  // Whether scenario p meets the lesson's challenge (judged over the lesson's own window and thresholds).
  function challengeMet(L, p){
    const view=lessonView(L);
    return !!L.challenge.goal({view, now:lessonStats(normalizeScenario(p),view), base:lessonStats(normalizeScenario(scenario(L.base)),view)});
  }

  /* ================= COMPARISON ================= */
  // Metrics for scenario a vs scenario b over the same window. kind says how the change is expressed:
  // pct = % change, ratio = % change of a ratio, pp = percentage points, abs = hours, count = doses.
  // A null value means the metric doesn't apply (shown as "—").
  // With pd (a target effect, %), the effect rows are added too.
  // Both scenarios are read in a's units (the page converts b first when they differ).
  function compareRows(a, b, T, mec, mtc, pd){
    const wa=windowStats(a,T,mec,mtc), wb=windowStats(b,T,mec,mtc), da=derived(a), db=derived(b), U=unitsOf(a);
    const rows=[{key:"cmax", name:"Peak (Cmax)", unit:U.conc, a:wa.cmax, b:wb.cmax, kind:"pct", dp:2+U.cdp}];
    if(a.dosing==="single" && b.dosing==="single") rows.push({key:"tmax", name:"Time of peak", unit:"h", a:wa.tmax, b:wb.tmax, kind:"abs", dp:1});
    rows.push({key:"auc", name:`AUC 0–${T} h`, unit:U.auc, a:wa.auc, b:wb.auc, kind:"pct", dp:1+U.cdp});
    if(a.dosing==="custom" || b.dosing==="custom"){
      const ta=doseTotals(a,T), tb=doseTotals(b,T);
      rows.push(
        {key:"ngiven", name:`Doses given 0–${T} h`, unit:"doses", a:ta.n, b:tb.n, kind:"count", dp:0},
        {key:"mg", name:`Total dose 0–${T} h`, unit:U.dose, a:ta.mg, b:tb.mg, kind:"pct", dp:0});
    }
    if(a.dosing==="repeated" && b.dosing==="repeated"){
      const sa=ssProfile(a), sb=ssProfile(b);
      rows.push(
        {key:"trough", name:"Final trough", unit:U.conc, a:da.cminSS, b:db.cminSS, kind:"pct", dp:2+U.cdp},
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
    if(pd!=null){
      const ea=effectStats(a,T,pd), eb=effectStats(b,T,pd);
      rows.push(
        {key:"epeak", name:"Peak effect", unit:"% of max", a:ea.peak, b:eb.peak, kind:"pp", dp:0},
        {key:"eabove", name:`Time at or above ${pd}% effect`, unit:"h", a:ea.tAbove, b:eb.tAbove, kind:"abs", dp:1},
        {key:"eonset", name:`Reaches ${pd}% effect at`, unit:"h", a:ea.onset, b:eb.onset, kind:"abs", dp:1});
    }
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
  // Where library values come from. Labels are FDA prescribing information on DailyMed, read on 2026-09-29
  // (Clinical Pharmacology unless a note says otherwise). Papers are cited by DOI where one exists.
  const DM="https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=";
  const SOURCES={
    cg:{cite:"Cockcroft DW, Gault MH. Prediction of creatinine clearance from serum creatinine. Nephron. 1976;16(1):31–41.", url:"https://doi.org/10.1159/000180580"},
    devine:{cite:"Devine BJ. Gentamicin therapy. Drug Intell Clin Pharm. 1974;8(11):650–655 (in its “Clinical Pharmacy: Case Studies” section).", url:"https://doi.org/10.1177/106002807400801104"},
    rybak:{cite:"Rybak MJ, Le J, Lodise TP, et al. Therapeutic monitoring of vancomycin for serious methicillin-resistant Staphylococcus aureus infections: a revised consensus guideline and review by ASHP, IDSA, PIDS and SIDP. Am J Health Syst Pharm. 2020;77(11):835–864.", url:"https://doi.org/10.1093/ajhp/zxaa036"},
    nicolau:{cite:"Nicolau DP, Freeman CD, Belliveau PP, Nightingale CH, Ross JW, Quintiliani R. Experience with a once-daily aminoglycoside program administered to 2,184 adult patients. Antimicrob Agents Chemother. 1995;39(3):650–655.", url:"https://doi.org/10.1128/AAC.39.3.650"},
    sheinerTozer:{cite:"Sheiner LB, Tozer TN. Clinical pharmacokinetics: the use of plasma concentrations of drugs. In: Melmon KL, Morrelli HF, eds. Clinical Pharmacology: Basic Principles in Therapeutics. 2nd ed. Macmillan; 1978.", url:null},
    lanoxin:{cite:"LANOXIN (digoxin) tablets. Prescribing information, ADVANZ PHARMA. DailyMed.", url:DM+"d91e3646-4c63-4512-ab22-db39c085c4dc"},
    dilantin:{cite:"DILANTIN (extended phenytoin sodium capsules). Prescribing information, Viatris. DailyMed.", url:DM+"86dd27d1-9cee-48ae-b55d-e2d2f7dbc593"},
    lithium:{cite:"Lithium carbonate tablets and capsules. Prescribing information, Hikma. DailyMed.", url:DM+"b839ff4b-f62d-41ab-a823-550a756d58ec"},
    theo:{cite:"Theophylline extended-release tablets. Prescribing information, Teva. DailyMed.", url:DM+"25eabefa-518b-4030-9b72-01ac8b3deba9"},
    gent:{cite:"Gentamicin sulfate injection. Prescribing information, Hospira. DailyMed.", url:DM+"977180b3-a222-4282-d485-4a3217674305"},
    vanc:{cite:"Vancomycin hydrochloride for injection (pharmacy bulk package). Prescribing information, Hospira. DailyMed.", url:DM+"b01aaa02-8f1d-4b57-96a5-337503428af1"},
    amox:{cite:"Amoxicillin tablets, oral suspension, chewable tablets and capsules. Prescribing information. DailyMed.", url:DM+"b07b5ac4-253e-4c83-91c3-3fdc46e91a0f"},
    caf:{cite:"Caffeine citrate injection and oral solution. Prescribing information, Sagent. DailyMed.", url:DM+"5f38c395-0093-4afd-89ec-f96e5dc0934a"},
    ibu:{cite:"Ibuprofen tablets 200 mg. OTC Drug Facts label, Aurohealth. DailyMed.", url:DM+"3b9773c6-42a0-4834-bef4-4fd60556af48"}
  };
  const UNVERIFIED="typical textbook value, unverified";
  // A library value and where it comes from: src names a SOURCES entry (and note says what the source states),
  // or is null for a typical textbook value that wasn't verified against a source.
  const ref=(k,v,src,note)=>({k, v, src:src||null, note:src ? note : (note ? note+"; " : "")+UNVERIFIED});
  // The teaching drug library. kinetics is "linear" (Phase 2 adds "michaelis-menten"); fe is the fraction
  // excreted unchanged in urine, fu the unbound fraction (for information), S the salt factor, units the unit
  // system, strengths the forms available (round: the step IV doses are rounded to). s is what loading the drug
  // sets, including the window and time span; drugScenario fills in the rest.
  const DRUGS = [
    {id:"ibu", name:"Ibuprofen", sub:"400 mg PO", kinetics:"linear", fe:0.01, fu:0.01, S:1, units:"mg",
     strengths:{form:"tablets", mg:[200,400,600,800]},
     s:{route:"oral",dosing:"single",D:400,F:0.9,ka:1.5,thalf:2,V:10,mec:10,mtc:50,duration:12},
     refs:[ref("thalf","2 h"), ref("V","10 L"), ref("F","0.9"), ref("ka","1.5 h⁻¹"), ref("fe","0.01"), ref("fu","0.01"),
       ref("window","10–50 mg/L","","an illustrative teaching window"), ref("strengths","200 mg","ibu","Drug Facts: 200 mg tablets"),
       ref("strengths","400, 600, 800 mg","","prescription strengths")]},
    {id:"amox", name:"Amoxicillin", sub:"500 mg PO q8h", kinetics:"linear", fe:0.6, fu:0.8, S:1, units:"mg",
     strengths:{form:"capsules and tablets", mg:[250,500,875]},
     s:{route:"oral",dosing:"repeated",D:500,F:0.9,ka:1.0,thalf:1,V:27,tau:8,nDoses:6,loadMult:1,mec:2,mtc:25,duration:48},
     refs:[ref("thalf","1.0 h","amox","half-life 61.3 minutes"), ref("V","27 L"), ref("F","0.9"),
       ref("ka","1.0 h⁻¹","amox","chosen so the model peaks at 1.2 h; the label gives peaks 1 to 2 hours after a dose"),
       ref("fe","0.6","amox","about 60% of an oral dose is excreted in the urine within 6 to 8 hours, mostly unchanged"),
       ref("fu","0.8","amox","about 20% protein-bound"), ref("window","2–25 mg/L","","an illustrative teaching window"),
       ref("strengths","250, 500 mg capsules; 500, 875 mg tablets","amox","dosage forms and strengths")]},
    {id:"caf", name:"Caffeine", sub:"100 mg PO", kinetics:"linear", fe:0.01, fu:null, S:1, units:"mg",
     strengths:{form:"tablets", mg:[100,200]},
     s:{route:"oral",dosing:"single",D:100,F:1,ka:3,thalf:5,V:42,mec:1,mtc:15,duration:24},
     refs:[ref("thalf","5 h","caf","adult half-life about 5 hours (the label compares infants with adults)"),
       ref("V","42 L (0.6 L/kg)","caf","adult volume of distribution 0.6 L/kg"), ref("F","1"), ref("ka","3 h⁻¹"),
       ref("fe","0.01","caf","in adults about 1% is excreted unchanged in urine"), ref("fu","not set","","not used by the model"),
       ref("window","1–15 mg/L","","an illustrative teaching window"), ref("strengths","100, 200 mg","","common tablet sizes")]},
    {id:"theo", name:"Theophylline ER", sub:"450 mg PO q12h", kinetics:"linear", fe:0.1, fu:0.6, S:1, units:"mg",
     strengths:{form:"extended-release tablets", mg:[300,450]},
     s:{route:"oral",dosing:"repeated",D:450,F:1,ka:0.3,thalf:8,V:31.5,tau:12,nDoses:8,loadMult:1,mec:10,mtc:20,duration:96},
     refs:[ref("thalf","8 h","theo","adult non-smokers: mean half-life 8.7 h, clearance 0.65 mL/kg/min (Table I); with V = 0.45 L/kg that clearance gives 8.0 h"),
       ref("V","31.5 L (0.45 L/kg)","theo","apparent volume about 0.45 L/kg (0.3 to 0.7), based on ideal body weight"),
       ref("F","1","theo","rapidly and completely absorbed (immediate-release forms)"),
       ref("ka","0.3 h⁻¹","theo","chosen so the model peaks at 5.8 h; the label's fasting mean Tmax for this tablet is 6.2 h"),
       ref("fe","0.1","theo","about 10% is excreted unchanged in the urine of adults"), ref("fu","0.6","theo","about 40% bound to plasma protein"),
       ref("window","10–20 mg/L","theo","improvement usually needs peaks above 10 mcg/mL; above 20 mcg/mL adverse reactions become more frequent"),
       ref("strengths","300, 450 mg","theo","each tablet contains 300 mg or 450 mg"),
       ref("smoking","clearance about +50%","theo","tobacco smoking increases clearance by about 50% in young adults")]},
    {id:"gent", name:"Gentamicin", sub:"120 mg IV inf q8h", kinetics:"linear", fe:1, fu:0.85, S:1, units:"mg", trough:2,
     strengths:{form:"injection, 40 mg/mL", round:10},
     s:{route:"inf",dosing:"repeated",D:120,tinf:0.5,thalf:2.5,V:18,tau:8,nDoses:6,loadMult:1,mec:4,mtc:12,duration:48},
     refs:[ref("thalf","2.5 h"), ref("V","18 L (0.25 L/kg)","","gentamicin distributes in extracellular fluid (the label gives no number)"),
       ref("fe","1","gent","excreted principally by glomerular filtration, with little if any metabolism"),
       ref("fu","0.85","gent","binding is low, between 0 and 30%"),
       ref("window","4–12 mg/L","gent","avoid prolonged peaks above 12 mcg/mL and troughs above 2 mcg/mL; a 1 to 1.5 mg/kg IM dose peaks at about 4 to 6 mcg/mL"),
       ref("strengths","40 mg/mL","gent","injection, 40 mg/mL"), ref("round","doses rounded to 10 mg","","a common convention")]},
    {id:"vanc", name:"Vancomycin", sub:"1 g IV inf q12h", kinetics:"linear", fe:0.83, fu:0.45, S:1, units:"mg",
     strengths:{form:"injection", round:250},
     s:{route:"inf",dosing:"repeated",D:1000,tinf:1,thalf:4.8,V:28,tau:12,nDoses:6,loadMult:1,mec:10,mtc:40,duration:72},
     refs:[ref("thalf","4.8 h","vanc","mean half-life 4 to 6 h; 4.8 h follows from the label's clearance, 0.058 L/kg/h, and a volume of 0.4 L/kg"),
       ref("V","28 L (0.4 L/kg)","vanc","distribution coefficient 0.3 to 0.43 L/kg"),
       ref("fe","0.83","vanc","renal clearance 0.048 of a total 0.058 L/kg/h"), ref("fu","0.45","vanc","about 55% protein-bound"),
       ref("dose","1 g every 12 hours","vanc","usual daily dose 2 g, as 500 mg every 6 hours or 1 g every 12 hours"),
       ref("window","10–40 mg/L","","an illustrative window; the 2020 guideline targets an AUC24 of 400–600 mg·h/L instead (see the vancomycin case)"),
       ref("target","AUC24 400–600 mg·h/L (MIC 1 mg/L)","rybak","AUC-guided dosing for serious MRSA infections"),
       ref("strengths","5 g and 10 g bulk packages","vanc","pharmacy bulk package bottles containing the equivalent of 5 g or 10 g of vancomycin"),
       ref("round","doses rounded to 250 mg","","a common convention")]},
    {id:"dig", name:"Digoxin", sub:"250 mcg PO daily", kinetics:"linear", fe:0.6, fu:0.75, S:1, units:"mcg",
     strengths:{form:"tablets", mg:[62.5,125,250]},
     s:{route:"oral",dosing:"repeated",D:250,F:0.7,ka:2.5,thalf:42,V:490,tau:24,nDoses:14,loadMult:1,mec:0.5,mtc:2,duration:336},
     refs:[ref("thalf","42 h","lanoxin","half-life 1.5 to 2 days with normal renal function (3.5 to 5 days in anuric patients)"),
       ref("V","490 L","lanoxin","large apparent volume, about 475 to 500 L; it correlates with lean (ideal) body weight"),
       ref("F","0.7","lanoxin","tablets are 60 to 80% absorbed compared with IV"),
       ref("ka","2.5 h⁻¹","lanoxin","chosen so the model peaks at 2 h; the label gives peaks at 1 to 3 hours"),
       ref("fe","0.6","lanoxin","50 to 70% of an IV dose is excreted unchanged in the urine"), ref("fu","0.75","lanoxin","about 25% bound to protein"),
       ref("window","0.5–2 ng/mL","lanoxin","below 0.5 ng/mL efficacy is diminished; above 2 ng/mL toxicity increases without more benefit"),
       ref("strengths","62.5, 125, 250 mcg","lanoxin","tablets of 62.5 mcg, 125 mcg and 250 mcg"),
       ref("model","one compartment","lanoxin","the label describes a 6 to 8 h tissue distribution phase, which one compartment doesn't show; levels are drawn 6 h or more after a dose")]},
    {id:"phe", name:"Phenytoin", sub:"300 mg PO daily", kinetics:"linear", fe:0.05, fu:0.1, S:0.92, units:"mg",
     strengths:{form:"extended capsules (phenytoin sodium)", mg:[30,100]},
     s:{route:"oral",dosing:"repeated",D:300,F:1,ka:0.4,thalf:22,V:49,tau:24,nDoses:14,loadMult:1,mec:10,mtc:20,duration:336},
     refs:[ref("thalf","22 h","dilantin","plasma half-life averages 22 h (range 7 to 42 h); it rises with the level because metabolism saturates"),
       ref("V","49 L (0.7 L/kg)"), ref("F","1"),
       ref("ka","0.4 h⁻¹","dilantin","chosen so the model peaks at about 7 h; extended capsules peak 4 to 12 hours after a dose"),
       ref("S","0.92","dilantin","the free acid form carries about 8% more drug than the sodium salt in these capsules"),
       ref("fe","0.05"), ref("fu","0.1","","the label says “extensively bound” without a number"),
       ref("window","10–20 mg/L","dilantin","clinically effective total concentration 10 to 20 mcg/mL (unbound 1 to 2 mcg/mL)"),
       ref("strengths","30, 100 mg","dilantin","30 mg and 100 mg extended phenytoin sodium capsules")]},
    {id:"li", name:"Lithium carbonate", sub:"600 mg PO q12h", kinetics:"linear", fe:1, fu:1, S:0.027067, units:"meq",
     strengths:{form:"capsules and tablets", mg:[150,300,600]},
     s:{route:"oral",dosing:"repeated",D:600,F:1,ka:2,thalf:27,V:60,tau:12,nDoses:14,loadMult:1,mec:0.8,mtc:1.2,duration:168},
     refs:[ref("thalf","27 h","lithium","elimination half-life about 18 to 36 hours (27 h is the middle)"),
       ref("V","60 L (0.85 L/kg)","lithium","apparent volume 0.7 to 1 L/kg"), ref("F","1","lithium","completely absorbed"),
       ref("ka","2 h⁻¹","lithium","chosen so the model peaks at 2.2 h; immediate-release forms peak 0.25 to 3 hours after a dose"),
       ref("S","0.027067 mEq per mg","lithium","Li₂CO₃, molecular weight 73.89, carries 2 mEq of lithium per 73.89 mg: 300 mg is 8.12 mEq"),
       ref("fe","1","lithium","primarily excreted in urine; fecal excretion is insignificant"), ref("fu","1","lithium","plasma protein binding is negligible"),
       ref("window","0.8–1.2 mEq/L","lithium","acute goal 0.8 to 1.2 mEq/L (maintenance 0.8 to 1.0); toxic concentrations from 1.5 mEq/L"),
       ref("dose","600 mg twice daily","lithium","usual acute dose 600 mg two to three times daily"),
       ref("strengths","150, 300, 600 mg","lithium","300 mg tablets; 150, 300 and 600 mg capsules")]}
  ];
  // The settings loading a drug sets, completed with the drug's own fe, S and units.
  const drugScenario=d=> Object.assign({}, d.s, {fe:d.fe, S:d.S, unit:d.units});

  // Each lesson loads `base` as the baseline and `cur` as the live scenario (both merged over DEFAULTS).
  // The claims in each text are checked against the model in tests/pk-engine.test.js.
  // A custom schedule in a lesson is stored validated, exactly as a link would decode it.
  const sched=(p,list)=> Object.assign(p,{dosing:"custom", events:normalizeEvents(list,p)});
  const every6h=Array.from({length:8},(_,i)=>({t:i*6, mg:360}));
  const everyDay=hours=> [0,24].flatMap(day=> hours.map(h=>({t:day+h, mg:250})));   // 250 mg at these hours on two days
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
    {id:"infdur", tag:"T·inf", title:"Short vs long infusion", sum:"The same dose, a different exposure shape.", baseLabel:"1 g over 30 min",
     text:"The same 1 g, infused over 30 minutes (2,000 mg/h) or over 4 hours (250 mg/h). The short infusion rises almost as fast as a bolus: it peaks at 19.8 mg/L at 0.5 h and spends 0.8 h above the MTC line. The long infusion rises more slowly (10 mg/L at 2.2 h instead of 0.25 h) and has a lower modeled peak, 16.3 mg/L, when it ends at 4 h. Total exposure is the same, an AUC of 176.7 mg·h/L, because the same amount meets the same clearance; only the shape differs.",
     tryThis:"Stretch the long infusion to 8 h: the peak drops further and arrives later, and the AUC still doesn't change.",
     view:{duration:36,mec:8,mtc:18},
     base:{route:"inf",D:1000,thalf:6,V:49,tinf:0.5}, cur:{route:"inf",D:1000,thalf:6,V:49,tinf:4}},
    {id:"ldinf", tag:"LD · inf", title:"Loading bolus + infusion", sum:"Reaching the plateau in minutes, not hours.", baseLabel:"infusion alone",
     text:"A 1,456 mg infusion over 24 h (60.7 mg/h) settles where drug goes in as fast as it's cleared: rate ÷ CL = 10 mg/L. On its own it creeps up, taking 9.3 h to reach the 8 mg/L effective level and 13.3 h (3.3 half-lives) to get within 10% of its plateau. A 350 mg IV bolus at the start (plateau × V = 10 mg/L × 35 L) fills the volume at once, so the level sits at 10 mg/L from the first minute until the infusion stops.",
     tryThis:"Halve the bolus to 175 mg: the level starts lower, then climbs to the same plateau, because the infusion rate alone decides where it settles.",
     view:{duration:36,mec:8,mtc:14},
     base:sched({route:"inf",tinf:24},[{t:0,mg:1456}]),
     cur:sched({route:"inf",tinf:24},[{t:0,mg:350,route:"iv",type:"loading"},{t:0,mg:1456}])},
    {id:"cvi", tag:"Css", title:"Continuous vs intermittent", sum:"The same amount as a steady drip or in pulses.", baseLabel:"continuous infusion",
     text:"The same 2,880 mg over 48 h, two ways. As a continuous infusion (60 mg/h) the level rises smoothly to 9.9 mg/L and holds there. Given as eight 360 mg infusions over 1 h, every 6 h, it swings: by the last doses it peaks near 14.6 mg/L, over the toxic line, and falls to about 6.1 mg/L before each dose. The average over each interval is the same 9.9 mg/L, and so is total exposure (AUC), because the same amount meets the same clearance.",
     tryThis:"Lengthen each intermittent infusion to 3 h and the swing narrows. At 6 h they run back to back and become the continuous infusion.",
     view:{duration:48,mec:4,mtc:14},
     base:sched({route:"inf",tinf:1},[{t:0,mg:2880,dur:48}]),
     cur:sched({route:"inf",tinf:1},every6h)},
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
    {id:"crcl", tag:"CrCl", title:"Kidney function (CrCl)", sum:"Cockcroft–Gault, the renal fraction and a longer half-life.", baseLabel:"SCr 1.0 mg/dL",
     text:"The same regimen, 120 mg infused over 30 minutes every 8 h, of a drug the kidneys clear 90% of unchanged (like gentamicin), in a 65-year-old man who weighs 70 kg. His serum creatinine rises from 1.0 to 1.8 mg/dL, so Cockcroft–Gault puts his creatinine clearance at 72.9, then 40.5 mL/min. Only the renal 90% of clearance falls with it: clearance drops 38%, from 3.23 to 2.02 L/h, and the half-life lengthens from 3.9 to 6.2 h. Each dose now lingers, so the trough rises from 2.2 to 4.7 mg/L and the peak from 8.4 to 11.0 mg/L.",
     tryThis:"Set the renal fraction fe to 0, as for a drug the liver clears: the two curves become one, whatever the creatinine.",
     view:{duration:72,mec:1,mtc:12},
     base:{route:"inf",tinf:0.5,dosing:"repeated",D:120,tau:8,nDoses:9,thalf:2.5,V:18,pm:"clinical",fe:0.9,age:65,scr:1.0},
     cur:{route:"inf",tinf:0.5,dosing:"repeated",D:120,tau:8,nDoses:9,thalf:2.5,V:18,pm:"clinical",fe:0.9,age:65,scr:1.8}},
    {id:"vd", tag:"V", title:"Volume of distribution", sum:"Dilution, half-life and why AUC can stay put.", baseLabel:"V = 20 L",
     text:"Clearance is held constant while V triples from 20 to 60 L. The same dose spreads through three times the space, so the starting concentration (D/V) is a third as high. Since CL = kₑ·V, a larger V at the same clearance means slower elimination: the half-life triples and total exposure (AUC) doesn't change.",
     tryThis:"Drag the half-life back to 3 h with V still at 60 L. Clearance triples and the AUC collapses.",
     view:{duration:72,mec:2,mtc:25},
     base:{route:"iv",D:600,V:20,thalf:3}, cur:{route:"iv",D:600,V:60,thalf:9}},
    {id:"weight", tag:"mg/kg", title:"Dosing by weight", sum:"The same dose in a smaller body, and why mg/kg evens it out.", baseLabel:"50 kg",
     text:"The same 500 mg dose in a 50 kg and a 100 kg adult. In this model the volume of distribution and the clearance both grow in proportion to body weight (25 vs 50 L, 4.3 vs 8.7 L/h), so the half-life is the same 4 h, but the heavier adult's concentration is half as high at every moment: Cmax 6.5 instead of 13.0 mg/L, and AUC 51.9 instead of 103.9 mg·h/L. The lighter adult gets 10 mg/kg and the heavier one 5 mg/kg; at 10 mg/kg each, the two curves would be identical. The lighter adult's peak goes above the MTC line for 1.8 h.",
     tryThis:"Set the body weight to 70 kg: the curve lands between the two, since 500 mg is then 7.1 mg/kg.",
     view:{duration:24,mec:2,mtc:12},
     base:{wt:50}, cur:{wt:100}},
    {id:"linear", tag:"D", title:"Double the dose", sum:"Linearity: twice the levels, the same half-life.", baseLabel:"250 mg",
     text:"The same drug at 250 mg and at 500 mg. Every concentration on the curve doubles: Cmax goes from 4.6 to 9.3 mg/L and AUC from 37.1 to 74.2 mg·h/L. The peak still comes at 1.9 h and the half-life stays 4 h, because in a first-order (linear) model the body clears the same fraction of the drug each hour, however much there is. Time above a level doesn't double, though: the curve stays between the 2 and 12 mg/L lines for 11.5 h instead of 7.3 h, about one half-life longer.",
     tryThis:"Try 1,000 mg: the peak doubles again and crosses the MTC line, but the curve keeps exactly the same shape.",
     view:{duration:24,mec:2,mtc:12},
     base:{D:250}, cur:{D:500}},
    {id:"flipflop", tag:"kₐ < kₑ", title:"Flip-flop kinetics", sum:"When slow absorption sets the tail, not elimination.", baseLabel:"fast absorption",
     text:"The same 500 mg oral dose of a drug with a 2 h elimination half-life, absorbed fast (kₐ = 1.5 h⁻¹) or slowly (kₐ = 0.1 h⁻¹, an absorption half-life of 6.9 h). Fast absorption gives an early peak (8.3 mg/L at 1.3 h) and a tail that halves every 2 h. Slow absorption flips this: the drug leaves about as fast as it arrives, so the curve peaks late and low (2.2 mg/L at 5.0 h) and its tail falls at absorption's pace. Measured between 12 and 24 h, its half-life is 7.2 h, not 2. Total exposure is the same, an AUC of 37.1 mg·h/L, because F·D / CL doesn't depend on kₐ.",
     tryThis:"On this log scale both tails are straight lines, and the slow one is far shallower. Raise kₐ and watch the tail swing back to the 2 h slope.",
     view:{duration:36,mec:0.5,mtc:20,scale:"log"},
     base:{D:500,thalf:2,ka:1.5}, cur:{D:500,thalf:2,ka:0.1}},
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
     base:{dosing:"repeated",D:600,thalf:8,ka:1,tau:24,nDoses:5}, cur:{dosing:"repeated",D:300,thalf:8,ka:1,tau:12,nDoses:10}},
    {id:"spacing", tag:"t", title:"Evenly spaced vs bunched doses", sum:"When you take a dose matters, not just how much.", baseLabel:"every 6 h",
     text:"The same four 250 mg doses a day, two ways. Spread evenly every 6 hours, the level stays inside the 2–12 mg/L window 99% of the time and peaks at 7.7 mg/L. Bunched into the first 6 hours of the day, it peaks at 13.9 mg/L, spends 4.9 h above the MTC line, and falls to 0.85 mg/L before the next day's first dose, 10.3 h below the MEC in all. Total exposure (AUC) is identical, 296.8 mg·h/L: the same amount with a different shape.",
     tryThis:"Drag the bunched doses at 4 h and 6 h on the timeline to 12 h and 18 h and watch the overnight dip shrink.",
     view:{duration:48,mec:2,mtc:12},
     base:sched({},everyDay([0,6,12,18])), cur:sched({},everyDay([0,2,4,6]))},
    // PK/PD: the same 500 mg IV bolus (V 35 L, t½ 4 h), read through different concentration–effect curves
    {id:"potency", tag:"EC50", title:"Potency (EC50)", sum:"Same levels, less effect: needing more drug, not a weaker drug.", baseLabel:"EC50 2 mg/L",
     text:"The concentration curves are identical; only the drug's EC50, the concentration that gives half the maximum effect, changes from 2 to 8 mg/L. The same levels now produce less effect: the peak falls from 88% to 64% and the time at or above the 50% target from 11.3 h to 3.3 h. That's lower potency, not lower efficacy: the maximum is still 100%.",
     tryThis:"Raise the dose to 2,000 mg. Four times the dose makes four times the concentration, and the effect curve lands exactly on the baseline's.",
     view:{duration:24,mec:2,mtc:30,pd:true,etgt:50},
     base:{route:"iv",ec50:2}, cur:{route:"iv",ec50:8}},
    {id:"efficacy", tag:"Emax", title:"Efficacy (Emax)", sum:"A ceiling no dose can break through.", baseLabel:"full agonist (Emax 100%)",
     text:"Same concentrations and the same EC50 (2 mg/L), but the drug is a partial agonist whose maximum effect is 60%. The full agonist peaks at 88% and stays at or above the 70% target for 6.5 h. The partial agonist peaks at 53% and never reaches the target, because 70% is above its ceiling.",
     tryThis:"Push the dose to 2,000 mg: the partial agonist creeps up to 58% and still never reaches 70%. Only a more efficacious drug can.",
     view:{duration:24,mec:2,mtc:30,pd:true,etgt:70},
     base:{route:"iv",ec50:2}, cur:{route:"iv",ec50:2,emax:60}},
    {id:"hill", tag:"n", title:"Hill slope", sum:"A graded response vs an on/off switch.", baseLabel:"n = 1",
     text:"Both curves pass 50% at the same moment, 7.3 h, when the concentration falls through EC50 (4 mg/L). The Hill slope decides how sharply the effect turns on and off around it. With n = 1 the response is graded: it peaks at 78% and never reaches the 80% target. With n = 4 it's switch-like: 99% at the peak, at or above 80% for 5.3 h, then falling from 90% to 10% in 6.3 h, a drop that would take 25 h with n = 1.",
     tryThis:"Set the target back to 50%: both curves stay above it for exactly the same 7.3 h.",
     view:{duration:24,mec:2,mtc:30,pd:true,etgt:80},
     base:{route:"iv",ec50:4,hill:1}, cur:{route:"iv",ec50:4,hill:4}},
    {id:"pdose", tag:"D → t", title:"Dose vs duration of effect", sum:"Doubling the dose buys one half-life.", baseLabel:"500 mg",
     text:"Doubling a 500 mg IV bolus doubles every concentration, but the peak effect only rises from 78% to 88%: the drug is already near the top of its sigmoid. What the extra dose buys is time. The level needs one more half-life to fall back to EC50 (4 mg/L, which gives the 50% target), so the effect stays at or above target for 11.3 h instead of 7.3 h: exactly 4 h, one half-life, longer.",
     tryThis:"Double it again to 2,000 mg: another 4 h above target, and the peak effect only reaches 93%.",
     view:{duration:24,mec:2,mtc:30,pd:true,etgt:50},
     base:{route:"iv",D:500}, cur:{route:"iv",D:1000}}
  ];

  // One-click comparisons: A is the lesson's baseline scenario, B its live scenario.
  const TEMPLATES = [
    {id:"split", lesson:"split", title:"Once vs twice daily", nameA:"600 mg once daily", nameB:"300 mg twice daily",
     look:"Same daily dose. B's peaks are lower and its troughs higher, while AUC barely moves."},
    {id:"load", lesson:"load", title:"Loading dose", nameA:"No loading dose", nameB:"2× loading dose",
     look:"B is inside the window almost from the start; both settle at the same steady state."},
    {id:"cl", lesson:"cl", title:"Normal vs 50% clearance", nameA:"Organ function 100%", nameB:"Organ function 50%",
     look:"Same regimen. B's half-life doubles, its troughs climb and its peaks cross the toxic line."},
    {id:"crcl", lesson:"crcl", title:"CrCl 73 vs 41 mL/min", nameA:"SCr 1.0 mg/dL", nameB:"SCr 1.8 mg/dL",
     look:"A drug 90% cleared by the kidneys. B's clearance is 38% lower, its half-life 6.2 h instead of 3.9 h, and its trough more than twice A's."},
    {id:"weight", lesson:"weight", title:"50 kg vs 100 kg, same dose", nameA:"50 kg", nameB:"100 kg",
     look:"The same 500 mg. B's volume and clearance are twice A's: half the peak and half the AUC, at the same half-life."},
    {id:"route", lesson:"route", title:"IV bolus vs oral", nameA:"IV bolus", nameB:"Oral, F 0.7",
     look:"B peaks later and lower, and its AUC is smaller by the bioavailability factor."},
    {id:"inf", lesson:"inf", title:"Bolus vs infusion", nameA:"IV bolus", nameB:"3 h infusion",
     look:"Same dose and the same AUC, but B's peak stays under the toxic line."},
    {id:"infdur", lesson:"infdur", title:"Short vs long infusion", nameA:"1 g over 30 min", nameB:"1 g over 4 h",
     look:"Same dose and the same AUC. B rises more slowly and has a lower modeled peak that arrives later."},
    {id:"ldinf", lesson:"ldinf", title:"Infusion ± loading bolus", nameA:"Infusion alone", nameB:"Bolus + infusion",
     look:"B sits at 10 mg/L from the first minute; A takes about 13 h to get within 10% of it."},
    {id:"cvi", lesson:"cvi", title:"Continuous vs intermittent infusion", nameA:"Continuous 60 mg/h", nameB:"360 mg over 1 h q6h",
     look:"Same 2,880 mg and the same average level: A holds 9.9 mg/L while B swings between about 6 and 14.6 mg/L."},
    {id:"miss", lesson:"miss", title:"On time vs missed dose", nameA:"Every dose taken", nameB:"Dose 6 missed",
     look:"B dips below the effective level after the gap, then climbs back over the next few doses."},
    {id:"potency", lesson:"potency", title:"Potent vs less potent", nameA:"EC50 2 mg/L", nameB:"EC50 8 mg/L",
     look:"Identical concentrations. B's effect peaks at 64% instead of 88% and stays above 50% for 3.3 h instead of 11.3 h."},
    {id:"efficacy", lesson:"efficacy", title:"Full vs partial agonist", nameA:"Emax 100%", nameB:"Emax 60%",
     look:"B tops out at 53% and never reaches the 70% target; A stays above it for 6.5 h."},
    {id:"hill", lesson:"hill", title:"Graded vs steep response", nameA:"Hill n = 1", nameB:"Hill n = 4",
     look:"Both cross 50% at 7.3 h, but B switches from nearly full effect to almost none within a few hours."},
    {id:"pdose", lesson:"pdose", title:"Dose vs double dose (effect)", nameA:"500 mg", nameB:"1,000 mg",
     look:"B's peak effect is only 10 points higher, but it stays above target exactly one half-life (4 h) longer."},
    {id:"spacing", lesson:"spacing", title:"Evenly spaced vs bunched doses", nameA:"Every 6 h", nameB:"Four doses by 6 am",
     look:"Same daily amount and the same AUC. B peaks higher and dips lower before the next day's doses."}
  ];

  /* ---------- lesson structure: predict, explain, try, challenge ---------- */
  // Each lesson has an objective, a question to answer before reading the explanation, a challenge the page
  // checks live, and why the idea matters. Predictions and challenges are judged by the model, never by hand:
  // `decide` returns the right choice from the lesson's computed numbers, and the tests check it against
  // `answer`; `goal` says whether the live scenario meets the challenge, and `solution` is a change that does.
  const LESSON_GROUPS=[{id:"pk",title:"PK fundamentals"},{id:"rep",title:"Repeated dosing and steady state"},
    {id:"custom",title:"Custom regimens"},{id:"inf",title:"Infusion and route"},{id:"pd",title:"PK/PD concepts"}];
  const r0=v=> String(Math.round(v)), r1=v=> String(Math.round(v*10)/10), r2=v=> String(Math.round(v*100)/100);
  const HLS=["Higher","Lower","About the same"];
  // The half-life the tail of a curve shows between 12 and 24 h (what a log-linear fit of late samples gives).
  const tailHalf=p=> 12*Math.LN2/Math.log(conc(p,12)/conc(p,24));
  const onlyChanged=(p, keys)=> ["route","dosing","D","F","ka","thalf","V","wt","clFn"].every(k=> keys.includes(k) || p[k]===DEFAULTS[k]);
  const givenOf=p=> p.dosing==="custom" ? p.events.filter(e=>e.status==="given") : [];
  const LESSON_GUIDE={
    route:{group:"pk", objective:"Explain why an oral dose peaks later and lower than the same IV bolus, and why its AUC is smaller.",
      predict:{q:"Compared with the IV bolus, the oral dose's total exposure (AUC) will be…", choices:HLS, answer:1,
        why:"Only the fraction F = 0.7 of the oral dose reaches the blood, so exposure falls by that fraction. Absorption speed changes the shape, not the total.",
        decide:m=> higherLowerSame(m.cur.aucInf,m.base.aucInf), show:m=>`AUC ${r1(m.base.aucInf)} → ${r1(m.cur.aucInf)} mg·h/L`},
      challenge:{text:"Raise the oral dose's AUC to at least 90% of the IV bolus's.", goal:m=> m.now.aucInf>=0.9*m.base.aucInf, solution:{F:0.95}},
      matters:"Bioavailability is why oral and IV doses of the same drug can differ, and why switching routes changes exposure even at the same dose."},
    vd:{group:"pk", objective:"Separate what volume of distribution changes (the starting level and half-life) from what it doesn't (AUC, when clearance is fixed).",
      predict:{q:"Tripling V while clearance stays the same changes total exposure (AUC)…", choices:["Up","Down","Not at all"], answer:2,
        why:"AUC = F·D / CL. With clearance unchanged, the lower starting level is exactly offset by a longer half-life.",
        decide:m=> higherLowerSame(m.cur.aucInf,m.base.aucInf), show:m=>`AUC ${r1(m.base.aucInf)} → ${r1(m.cur.aucInf)} mg·h/L`},
      challenge:{text:"Keep V at 60 L and bring the starting concentration back up to 30 mg/L.", goal:m=> m.now.p.V===60 && m.now.cmax>=29.5, solution:{D:1800}},
      matters:"Volume sets how a dose dilutes and how fast levels fall. That's why a loading dose is sized on volume and a maintenance dose on clearance."},
    cl:{group:"pk", objective:"Predict how halving clearance changes half-life, accumulation and total exposure.",
      predict:{q:"With organ function at 50%, the exposure (AUC) from each dose becomes…", choices:["About the same","About 1.5×","About 2×"], answer:2,
        why:"AUC = F·D / CL, so halving clearance doubles the exposure from every dose.",
        decide:m=>{ const r=m.cur.aucInf/m.base.aucInf; return r<1.2 ? 0 : r<1.75 ? 1 : 2; },
        show:m=>`AUC per dose ${r1(m.base.aucInf)} → ${r1(m.cur.aucInf)} mg·h/L (${r2(m.cur.aucInf/m.base.aucInf)}×)`},
      challenge:{text:"Keep organ function at 50% and bring average steady-state exposure back to the baseline's (within 5%) by changing the dose or the interval.",
        goal:m=> m.now.p.clFn===50 && m.now.avgSS!==null && Math.abs(m.now.avgSS/m.base.avgSS-1)<=0.05, solution:{D:200}},
      matters:"Reduced kidney or liver function lowers clearance for many drugs. This is the mechanism behind adjusting a regimen for organ function."},
    crcl:{group:"pk", objective:"Estimate creatinine clearance by Cockcroft–Gault and predict what a fall in it does to a renally cleared drug.",
      predict:{q:"Serum creatinine rises from 1.0 to 1.8 mg/dL. The trough before each dose becomes…", choices:["About the same","Higher, but under 2×","More than 2×"], answer:2,
        why:"CrCl falls from 73 to 41 mL/min. With 90% of clearance renal, clearance falls 38% and the half-life lengthens from 3.9 to 6.2 h, so much more of each dose is left when the next one starts.",
        decide:m=>{ const r=m.cur.trough/m.base.trough; return r<1.1 ? 0 : r<2 ? 1 : 2; },
        show:m=>`Trough ${r1(m.base.trough)} → ${r1(m.cur.trough)} mg/L (${r1(m.cur.trough/m.base.trough)}×)`},
      challenge:{text:"Keep the creatinine at 1.8 mg/dL and the dose at 120 mg, and bring the trough back to the baseline's 2.2 mg/L or lower by changing only the dosing interval.",
        goal:m=> m.now.p.pm==="clinical" && m.now.p.scr===1.8 && m.now.p.fe===0.9 && m.now.p.D===120 && m.now.p.dosing==="repeated" && m.now.trough<=m.base.trough+0.005,
        solution:{tau:14}},
      matters:"Many drugs leave the body mainly through the kidneys, so their clearance falls with kidney function. Dosing references adjust for it with creatinine clearance estimated from serum creatinine, age, weight and sex."},
    accum:{group:"rep", objective:"Explain why repeated doses build up and where the peaks level off.",
      predict:{q:"Dosing every half-life, where does the peak settle compared with a single dose?", choices:["About the same","About twice as high","It keeps climbing without limit"], answer:1,
        why:"Half of each dose is still there when the next arrives, so levels rise until the amount eliminated per interval matches the dose.",
        decide:m=>{ const r=m.cur.peakSS/m.base.cmax; return r<1.3 ? 0 : r<3 ? 1 : 2; },
        show:m=>`Single-dose peak ${r1(m.base.cmax)} → settled peak ${r1(m.cur.peakSS)} mg/L (${r1(m.cur.peakSS/m.base.cmax)}×)`},
      challenge:{text:"Change only the dosing interval so the steady-state trough is at least 10 mg/L.",
        goal:m=> m.now.p.D===300 && m.now.trough!==null && m.now.trough>=10, solution:{tau:6, nDoses:16}},
      matters:"Accumulation is why the first dose rarely shows the levels a regimen eventually reaches, and why levels keep changing for several half-lives after dosing starts."},
    load:{group:"rep", objective:"Distinguish what a loading dose changes (how soon levels arrive) from what it doesn't (where they settle).",
      predict:{q:"Does the loading dose change where the troughs finally settle?", choices:["Higher","Lower","Same place, reached sooner"], answer:2,
        why:"The extra drug from the first dose is eliminated over time. The plateau depends only on the maintenance dose, the interval and clearance.",
        decide:m=> higherLowerSame(m.cur.trough,m.base.trough), show:m=>`Final trough ${r2(m.base.trough)} → ${r2(m.cur.trough)} mg/L`},
      challenge:{text:"Raise the steady-state trough to at least 10 mg/L. The loading dose alone won't do it.",
        goal:m=> m.now.trough!==null && m.now.trough>=10, solution:{D:400}},
      matters:"For drugs with long half-lives, a loading dose shortens the wait for target levels, while the maintenance dose determines where they settle."},
    weight:{group:"pk", objective:"Show how body size changes the levels from a fixed dose, and why dosing per kilogram evens them out in this model.",
      predict:{q:"Giving a 100 kg adult the same 500 mg as a 50 kg adult makes the total exposure (AUC)…", choices:HLS, answer:1,
        why:"Here volume and clearance both double with the weight, so the same milligrams are spread through twice the volume and cleared twice as fast: half the AUC, at the same half-life.",
        decide:m=> higherLowerSame(m.cur.aucInf,m.base.aucInf),
        show:m=>`AUC ${r1(m.base.aucInf)} → ${r1(m.cur.aucInf)} mg·h/L · ${r1(m.base.p.D/m.base.p.wt)} → ${r1(m.cur.p.D/m.cur.p.wt)} mg/kg`},
      challenge:{text:"Change only the dose so the 100 kg adult's AUC matches the 50 kg adult's (within 2%).",
        goal:m=> m.now.p.wt===100 && onlyChanged(m.now.p,["D","wt"]) && Math.abs(m.now.aucInf/m.base.aucInf-1)<=0.02, solution:{D:1000}},
      matters:"Doses are often given per kilogram where body size varies widely, as in children. In this model volume and clearance grow in proportion to weight, so a mg/kg dose gives the same levels at any weight; in people they don't always scale so simply (with obesity, for example), so a weight-based dose is an approximation."},
    linear:{group:"pk", objective:"Show that in a linear model the dose scales every concentration and the AUC, but not the half-life or the timing.",
      predict:{q:"Doubling the dose from 250 to 500 mg makes the half-life…", choices:["Longer","Shorter","About the same"], answer:2,
        why:"First-order elimination removes a fixed fraction per hour whatever the amount, so the half-life doesn't depend on the dose. Every concentration doubles instead.",
        decide:m=> higherLowerSame(derived(m.cur.p).thalfEff, derived(m.base.p).thalfEff),
        show:m=>`t½ ${r1(derived(m.base.p).thalfEff)} → ${r1(derived(m.cur.p).thalfEff)} h · Cmax ${r1(m.base.cmax)} → ${r1(m.cur.cmax)} mg/L`},
      challenge:{text:"Change only the dose so the peak is 1.5× the 250 mg dose's peak (within 2%).",
        goal:m=> onlyChanged(m.now.p,["D"]) && Math.abs(m.now.cmax/m.base.cmax-1.5)<=0.03, solution:{D:375}},
      matters:"Linearity is what lets a dose be scaled: in this model twice the dose means twice the exposure. Some drugs, phenytoin being the classic example, saturate their elimination and break the rule; DoseCurve models linear kinetics only."},
    flipflop:{group:"pk", objective:"Recognize flip-flop kinetics: when absorption is slower than elimination, the tail of an oral curve reflects absorption.",
      predict:{q:"With the slow absorption, the half-life you'd read off the curve's tail (12–24 h) is…", choices:["Longer than 2 h","Shorter than 2 h","About 2 h"], answer:0,
        why:"Once kₐ is smaller than kₑ, the drug is eliminated about as fast as it's absorbed, so the fall is paced by the slower process: absorption.",
        decide:m=> higherLowerSame(tailHalf(m.cur.p), tailHalf(m.base.p)),
        show:m=>`Tail half-life ${r1(tailHalf(m.base.p))} → ${r1(tailHalf(m.cur.p))} h; the elimination t½ stays 2 h`},
      challenge:{text:"Change only kₐ until the tail's half-life is back within 10% of the drug's own 2 h.",
        goal:m=> m.now.p.thalf===2 && m.now.p.D===500 && onlyChanged(m.now.p,["ka","thalf","D"]) && Math.abs(tailHalf(m.now.p)/2-1)<=0.1, solution:{ka:1.5}},
      matters:"Extended-release products rely on it: slow absorption stretches the curve. It also means a half-life estimated from the tail of oral data can belong to absorption rather than elimination; IV data show elimination alone."},
    half:{group:"rep", objective:"Relate half-life to dosing frequency, swing and accumulation.",
      predict:{q:"Given every 8 h, how much does the 12 h drug accumulate compared with the 2 h drug?", choices:["Much more","Less","About the same"], answer:0,
        why:"With an interval shorter than its half-life, most of each 12 h dose is still there when the next arrives.",
        decide:m=> higherLowerSame(m.cur.rac,m.base.rac), show:m=>`Accumulation ${r2(m.base.rac)}× → ${r2(m.cur.rac)}×`},
      challenge:{text:"Change only the interval so the 12 h drug's peak-to-trough swing is below 1.25×.",
        goal:m=> m.now.p.thalf===12 && m.now.p.D===250 && m.now.swing!==null && m.now.swing<1.25, solution:{tau:6, nDoses:16}},
      matters:"Half-life largely decides how often a drug is given and how much its levels fluctuate between doses."},
    split:{group:"rep", objective:"Show that splitting the same daily dose keeps average exposure but narrows the swing.",
      predict:{q:"Splitting 600 mg once daily into 300 mg every 12 h makes the steady-state trough…", choices:HLS, answer:0,
        why:"Smaller, more frequent doses leave less time to decay between them: lower peaks and higher troughs from the same daily amount.",
        decide:m=> higherLowerSame(m.cur.trough,m.base.trough), show:m=>`Trough ${r2(m.base.trough)} → ${r2(m.cur.trough)} mg/L`},
      challenge:{text:"Keep 600 mg a day but raise the steady-state trough to at least 5.5 mg/L.",
        goal:m=> m.now.trough!==null && Math.abs(m.now.p.D*24/m.now.p.tau-600)<1e-9 && m.now.trough>=5.5, solution:{D:200, tau:8, nDoses:15}},
      matters:"Dosing frequency trades convenience against how evenly levels are held through the day."},
    er:{group:"rep", objective:"Explain how slower absorption flattens the peak–trough swing without changing exposure.",
      predict:{q:"Slowing absorption (kₐ 2 → 0.3 h⁻¹) makes the steady-state swing between peak and trough…", choices:["Larger","Smaller","Unchanged"], answer:1,
        why:"Slow absorption keeps drug arriving through the interval, which lowers the peak and props up the trough. The same amount is still absorbed.",
        decide:m=> higherLowerSame(m.cur.swing,m.base.swing), show:m=>`Peak ÷ trough ${r2(m.base.swing)}× → ${r2(m.cur.swing)}×`},
      challenge:{text:"Keep kₐ at 0.3 and raise the steady-state trough to at least 6 mg/L while the peak stays under the 10 mg/L line.",
        goal:m=> m.now.p.ka===0.3 && m.now.trough!==null && m.now.trough>=6 && m.now.peakSS<10, solution:{D:325}},
      matters:"This is the idea behind extended-release formulations: the same exposure, delivered more evenly."},
    miss:{group:"rep", objective:"See how a missed dose creates a dip, and how long regular dosing takes to recover.",
      predict:{q:"Just before dose 7, compared with taking every dose, the level will be…", choices:HLS, answer:1,
        why:"With nothing coming in over two intervals, elimination keeps going and the level falls further than a normal trough.",
        decide:m=> higherLowerSame(m.cur.at(6*m.cur.p.tau-1e-6), m.base.at(6*m.base.p.tau-1e-6)),
        show:m=>`Just before dose 7: ${r2(m.base.at(6*m.base.p.tau-1e-6))} → ${r2(m.cur.at(6*m.cur.p.tau-1e-6))} mg/L`},
      challenge:{text:"Keep dose 6 missed but change the interval so the level just before dose 7 stays above 5 mg/L.",
        goal:m=> m.now.p.dosing==="repeated" && m.now.p.missed===6 && m.now.p.nDoses>6 && m.now.at(6*m.now.p.tau-1e-6)>5, solution:{tau:6}},
      matters:"Missed doses are common. How deep the dip goes depends on the half-life relative to the dosing interval."},
    spacing:{group:"custom", objective:"Show that when doses are given matters as much as how much is given.",
      predict:{q:"Bunching the day's four doses into the morning changes the peak…", choices:HLS, answer:0,
        why:"Doses 2 hours apart pile on top of each other before much is eliminated, then nothing arrives for 18 hours.",
        decide:m=> higherLowerSame(m.cur.cmax,m.base.cmax), show:m=>`Peak ${r1(m.base.cmax)} → ${r1(m.cur.cmax)} mg/L`},
      challenge:{text:"Keep eight 250 mg oral doses over the two days but get the time in window to 95% or more.",
        goal:m=>{ const ev=givenOf(m.now.p); return ev.length===8 && ev.every(e=>e.mg===250 && e.route==="oral") && m.now.tin>=95; },
        solution:{events:everyDay([0,6,12,18])}},
      matters:"Real schedules drift from the ideal. Spreading doses through the day keeps levels steadier than taking them close together."},
    inf:{group:"inf", objective:"Explain how infusing a dose over time lowers and delays the peak without changing total exposure.",
      predict:{q:"Giving the same 1 g over 3 hours instead of all at once changes total exposure (AUC)…", choices:["Up","Down","Not at all"], answer:2,
        why:"The same amount enters the body and meets the same clearance; only the rate of entry changes.",
        decide:m=> higherLowerSame(m.cur.aucInf,m.base.aucInf), show:m=>`AUC ${r1(m.base.aucInf)} → ${r1(m.cur.aucInf)} mg·h/L`},
      challenge:{text:"Keep the full 1 g and make the peak arrive at 6 h or later.",
        goal:m=> m.now.p.route==="inf" && m.now.p.dosing==="single" && m.now.p.D===1000 && m.now.tmax>=6, solution:{tinf:6}},
      matters:"Infusion time is a lever on the peak: the same dose can be given with a lower peak, at the cost of a slower rise."},
    infdur:{group:"inf", objective:"Compare short and long infusions of the same dose: peak, time of peak, rise and total exposure.",
      predict:{q:"Compared with the 30-minute infusion, the 4-hour infusion's peak comes…", choices:["Later","Earlier","At the same time"], answer:0,
        why:"An infusion's level climbs for as long as it runs, so the peak arrives when it ends.",
        decide:m=> higherLowerSame(m.cur.tmax,m.base.tmax), show:m=>`Peak at ${r1(m.base.tmax)} h → ${r1(m.cur.tmax)} h`},
      challenge:{text:"Keep the full 1 g and find an infusion time that keeps the peak under 15 mg/L.",
        goal:m=> m.now.p.route==="inf" && m.now.p.dosing==="single" && m.now.p.D===1000 && m.now.cmax<15, solution:{tinf:6}},
      matters:"The rate a drug is infused at shapes how fast levels rise and how high they peak, even when the total dose is fixed."},
    ldinf:{group:"inf", objective:"Explain how a loading bolus lets an infusion reach its plateau straight away.",
      predict:{q:"With the loading bolus, how soon does the level reach the 8 mg/L effective line?", choices:["Immediately","After about 4 h","After about 9 h, as with the infusion alone"], answer:0,
        why:"The bolus fills the volume of distribution to the plateau at once, and the infusion then replaces what is cleared.",
        decide:m=>{ const t=m.cur.reach(8); return t===null || t>6 ? 2 : t>0.5 ? 1 : 0; },
        show:m=>`Infusion alone: ${r1(m.base.reach(8))} h · with the bolus: ${r1(m.cur.reach(8))} h`},
      challenge:{text:"Reach 8 mg/L within 1 hour using a loading bolus smaller than 350 mg.",
        goal:m=>{ const bolus=givenOf(m.now.p).filter(e=>e.route==="iv").reduce((s,e)=>s+e.mg,0), t=m.now.reach(8);
          return bolus>0 && bolus<350 && t!==null && t<=1; },
        solution:{events:[{t:0,mg:280,route:"iv",type:"loading"},{t:0,mg:1456}]}},
      matters:"Pairing a loading bolus with an infusion is a common way to reach steady levels quickly when the half-life would otherwise make that slow."},
    cvi:{group:"inf", objective:"Compare a continuous infusion with intermittent infusions of the same total amount.",
      predict:{q:"Compared with the continuous infusion, the intermittent schedule's total exposure (AUC) is…", choices:HLS, answer:2,
        why:"Both deliver 2,880 mg against the same clearance; only the pattern differs.",
        decide:m=> higherLowerSame(m.cur.aucInf,m.base.aucInf), show:m=>`AUC ${r1(m.base.aucInf)} → ${r1(m.cur.aucInf)} mg·h/L`},
      challenge:{text:"Keep eight 360 mg infusions but bring the peak under 13 mg/L.",
        goal:m=>{ const ev=givenOf(m.now.p); return ev.length===8 && ev.every(e=>e.mg===360 && e.route==="inf") && m.now.cmax<13; },
        solution:{events:every6h.map(e=>Object.assign({dur:3},e))}},
      matters:"Continuous and intermittent infusions deliver the same exposure with very different peaks and troughs."},
    potency:{group:"pd", objective:"Tell potency (EC50) apart from efficacy (Emax).",
      predict:{q:"With EC50 four times higher, the same concentrations give a peak effect that is…", choices:HLS, answer:1,
        why:"A higher EC50 means every level of effect needs more drug, so the same concentrations sit lower on the curve.",
        decide:m=> higherLowerSame(m.cur.epeak,m.base.epeak), show:m=>`Peak effect ${r0(m.base.epeak)}% → ${r0(m.cur.epeak)}%`},
      challenge:{text:"Keep EC50 at 8 mg/L and get back to 11.3 h at or above the 50% target.",
        goal:m=> m.now.p.ec50===8 && m.now.effAbove(50)>=11.3, solution:{D:2000}},
      matters:"A less potent drug isn't a weaker one: it needs higher concentrations for the same effect, which a larger dose can provide."},
    efficacy:{group:"pd", objective:"Show that efficacy (Emax) sets a ceiling no dose can exceed.",
      predict:{q:"Can a larger dose push the partial agonist (Emax 60%) above the 70% target?", choices:["Yes, with enough drug","No: 70% is above its ceiling"], answer:1,
        why:"Effect can approach E₀ + Emax but never pass it, whatever the concentration.",
        decide:m=> m.cur.top>=m.view.etgt ? 0 : 1, show:m=>`Ceiling ${r0(m.cur.top)}% · target ${m.view.etgt}%`},
      challenge:{text:"Keep Emax at 60% and find a dose that gives a peak effect of at least 55%.",
        goal:m=> m.now.p.emax===60 && m.now.epeak>=55, solution:{D:800}},
      matters:"When a drug's maximum effect is below what's needed, raising the dose doesn't close the gap; only a more efficacious drug can."},
    hill:{group:"pd", objective:"Describe how the Hill slope turns a graded response into a switch-like one.",
      predict:{q:"Which curve stays at or above 50% effect for longer?", choices:["n = 4","n = 1","Both the same"], answer:2,
        why:"Whatever the slope, the effect is exactly 50% when the concentration equals EC50, so both cross 50% at the same moment.",
        decide:m=> higherLowerSame(m.cur.effAbove(50),m.base.effAbove(50)), show:m=>`At or above 50%: ${r1(m.base.effAbove(50))} h and ${r1(m.cur.effAbove(50))} h`},
      challenge:{text:"Keep n = 4 and hold the effect at or above 80% for at least 8 hours.",
        goal:m=> m.now.p.hill===4 && m.now.effAbove(80)>=8, solution:{D:800}},
      matters:"With a steep concentration–effect curve, small changes in level can switch an effect on or off."},
    pdose:{group:"pd", objective:"Explain why doubling a dose adds duration of effect more than peak effect.",
      predict:{q:"Doubling the dose raises the peak effect by about…", choices:["Twice as much (+78 points)","About 10 points","Nothing"], answer:1,
        why:"Near the top of the sigmoid, doubling the concentration moves the effect only a little further up the curve.",
        decide:m=>{ const d=m.cur.epeak-m.base.epeak; return d>40 ? 0 : d>2 ? 1 : 2; }, show:m=>`Peak effect ${r0(m.base.epeak)}% → ${r0(m.cur.epeak)}%`},
      challenge:{text:"Keep the effect at or above 50% for 15 hours or more.", goal:m=> m.now.effAbove(50)>=15, solution:{D:2000}},
      matters:"Near the top of the concentration–effect curve, extra dose mostly buys time, not intensity: each doubling adds about one half-life."}
  };
  LESSONS.forEach(L=> Object.assign(L, LESSON_GUIDE[L.id]));
  // Grouped order: "Next lesson" and the numbering follow it.
  LESSONS.sort((a,b)=> LESSON_GROUPS.findIndex(g=>g.id===a.group)-LESSON_GROUPS.findIndex(g=>g.id===b.group));

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
  // A custom schedule is added as "ev:0@500L;12@250;24@250m" (L = loading, m = missed). A dose's route is
  // written only where it differs from the scenario's, and an infusion's duration only where it differs
  // from T·inf ("0@350b;0@1456i24"), so a schedule that needs neither is written exactly as in v2.
  const needsRoute=(p,e)=> e.route!==p.route || (e.route==="inf" && e.dur!==p.tinf);
  const usesV3=p=> p.dosing==="custom" && p.events.some(e=>needsRoute(p,e));
  function encodeScenario(p){
    const parts=PK_KEYS.filter(k=>k!=="events" && p[k]!==DEFAULTS[k]).map(k=>k+":"+p[k]);
    if(p.dosing==="custom" && p.events.length)
      parts.push("ev:"+p.events.map(e=>`${e.t}@${e.mg}${needsRoute(p,e) ? routeCode(e) : ""}${flags(e)}`).join(";"));
    return parts.join(",");
  }
  // Tokens that don't parse are skipped. The rest are validated by normalizeScenario, which gives a dose
  // without a route code the scenario's route (and an infusion without a duration its T·inf).
  function decodeEvents(raw){
    const out=[];
    String(raw).split(";").slice(0,200).forEach(tok=>{
      const m=/^(\d+(?:\.\d+)?)@(\d+(?:\.\d+)?)(?:([ob])|i(\d+(?:\.\d+)?))?(L?)(m?)$/.exec(tok);
      if(!m) return;
      const e={t:parseFloat(m[1]), mg:parseFloat(m[2]), type:m[5]?"loading":"maintenance", status:m[6]?"missed":"given"};
      if(m[3]) e.route=m[3]==="b" ? "iv" : "oral";
      if(m[4]!==undefined){ e.route="inf"; e.dur=parseFloat(m[4]); }
      out.push(e);
    });
    return out;
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
      if(typeof DEFAULTS[k]==="string"){ if(CHOICES[k].includes(raw)) p[k]=raw; return; }
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
    if(v.pd) out.push("pd:1");
    if(v.etgt!==undefined && v.etgt!==VIEW_DEFAULTS.etgt) out.push("etgt:"+v.etgt);
    return out.join(",");
  }
  function decodeView(str){
    const v=Object.assign({},VIEW_DEFAULTS);
    String(str||"").split(",").forEach(pair=>{
      const [k,raw]=pair.split(":");
      if(VIEW_RANGES[k]){ const n=parseFloat(raw); if(isFinite(n)) v[k]=clamp(n,VIEW_RANGES[k]); }
      else if(k==="scale" && (raw==="lin"||raw==="log")) v.scale=raw;
      else if(k==="zoom" && (raw==="full"||raw==="last")) v.zoom=raw;
      else if(k==="pd") v.pd=raw==="1";
    });
    return v;
  }

  // Link state ↔ URL hash, e.g. "v=1&s=D:400,clFn:50&w=duration:48".
  // Simulator links carry s (scenario), base (baseline), bl (baseline label) and l (lesson id);
  // compare links carry m=cmp, a, b, na/nb (names), lk (Vary only key) and ed (side being edited).
  function encodeLink(st){
    const scen=st.mode==="cmp" ? [st.a,st.b] : [st.s,st.base].filter(Boolean);
    const view=st.view||VIEW_DEFAULTS;
    const usesV5=view.duration>168 || scen.some(p=>V5_KEYS.some(k=>p[k]!==DEFAULTS[k]) || Object.keys(V4_MAX).some(k=>p[k]>V4_MAX[k]));
    const usesV4=view.pd || view.etgt!==VIEW_DEFAULTS.etgt || scen.some(p=>PD_KEYS.some(k=>p[k]!==DEFAULTS[k]));
    const parts=["v="+(usesV5 ? 5 : usesV4 ? 4 : scen.some(usesV3) ? 3 : scen.some(p=>p.dosing==="custom") ? 2 : 1)];
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
    const w=encodeView(view);
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
    // A scenario link without a version is read as version 1 (the first links had none to give).
    if(!q.v && !("s" in q) && q.m!=="cmp") return null;
    // Links pasted through chat apps sometimes arrive with ':' and ',' percent-encoded.
    const sc=s=>decodeScenario(safe(s||""));
    const name=s=>s ? cleanName(safe(s),40) : "";
    const st={version:q.v ? parseInt(q.v,10)||VERSION : 1, mode:q.m==="cmp"?"cmp":"sim", view:decodeView(safe(q.w||""))};
    // a newer version is still read best-effort, but flagged so the page can say settings may be missing
    st.newer=st.version>VERSION;
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
  // schema versions (v1–v3) and clamping, and anything a link can carry (custom schedules, A/B names, the
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

  /* ================= PRACTICE PROBLEMS ================= */
  // Generated calculation problems in four topics. A generator draws its numbers from `d(min, max, step)`, so a
  // seed reproduces a problem, and returns the question, the answer (with its unit and decimals), a worked
  // solution, the scenario and view that show it on the chart (`at`: where to put the time cursor) and `check`,
  // which works the answer out again from that scenario with the simulation itself. The tests hold every
  // generator to its check, over many seeds.
  const PRACTICE_TOPICS=[{id:"single",title:"Single dose"},{id:"rep",title:"Repeated dosing"},
    {id:"inf",title:"Infusions"},{id:"pd",title:"Concentration–effect"}];
  // mulberry32: a small seedable generator of numbers in [0, 1)
  function seededRandom(seed){
    let a=seed>>>0;
    return ()=>{
      a=(a+0x6D2B79F5)>>>0;
      let t=a;
      t=Math.imul(t^(t>>>15), t|1);
      t^=t+Math.imul(t^(t>>>7), t|61);
      return ((t^(t>>>14))>>>0)/4294967296;
    };
  }
  const drawFrom=rnd=> (a,b,st)=> +(Math.round((a+(b-a)*rnd())/st)*st).toFixed(4);
  const nf=(v,dp)=> String(+v.toFixed(dp));          // a number to dp decimals, without trailing zeros
  const sig4=v=> +v.toPrecision(4);                  // a quoted measurement: 4 significant figures
  const evenUp=h=> Math.min(168, Math.max(6, 2*Math.ceil(h/2)));   // a time window in whole even hours
  const step=s=>`<span class="step">${s}</span>`;
  const LN2="0.693";
  // Mean concentration over one dose interval at steady state (Simpson's rule on the exact steady-state curve).
  function ssMean(p){
    const N=400, h=p.tau/N;
    let s=0;
    for(let i=0;i<=N;i++) s+=ssConc(p, i===N ? p.tau-1e-9 : i*h)*(i===0||i===N ? 1 : i%2 ? 4 : 2);
    return s*h/3/p.tau;
  }
  // Total exposure out to 40 half-lives (Simpson's rule on the simulated curve; what's left beyond is < 10⁻¹²).
  function areaUnder(p){
    const T=40*Math.LN2/keOf(p), N=20000, h=T/N, ev=doseEvents(p);
    let s=0;
    for(let i=0;i<=N;i++) s+=conc(p,i*h,ev)*(i===0||i===N ? 1 : i%2 ? 4 : 2);
    return s*h/3;
  }
  // Steady-state concentration per mg/h of constant infusion, from an infusion run for 30 half-lives.
  function cssPerRate(p){
    const T=30*Math.LN2/keOf(p), q=scenario(Object.assign({},p,{route:"inf", dosing:"single", tinf:T, D:T}));
    return conc(q,T);
  }
  // Where a rising function first reaches a value (bisection; f must increase on [lo, hi]).
  function solveUp(f, target, lo, hi){
    for(let i=0;i<200;i++){ const m=(lo+hi)/2; if(f(m)<target) lo=m; else hi=m; }
    return (lo+hi)/2;
  }
  // Doses for a regimen to run 10 half-lives, when it is within 0.1% of steady state; with a final interval that
  // starts after those 10 half-lives when the interval's average is asked about. It has to fit 20 doses and 168 h.
  const ssDoses=(th,tau,whole)=> Math.ceil(10*th/tau)+(whole ? 1 : 0);
  const ssFits=(th,tau,whole)=> ssDoses(th,tau,whole)<=20 && ssDoses(th,tau,whole)*tau<=168;
  const mostDoses=tau=> Math.min(20, Math.floor(168/tau));   // as close to steady state as the chart can show
  // Keep drawing until the numbers fit the model's ranges.
  const until=(make, ok)=>{ let x; for(let i=0;i<60;i++){ x=make(); if(ok(x)) return x; } return x; };

  const PRACTICE=[
    /* ----- single dose ----- */
    {id:"ke", topic:"single", gen(d){
      const th=d(1,12,0.5), k=Math.LN2/th;
      return {type:"Elimination rate constant", unit:"h⁻¹", dp:3, ans:k,
        q:`A drug has an elimination half-life of <b>${th} h</b>. What is its first-order elimination rate constant kₑ?`,
        sol:[step(`kₑ and t½ are linked by <b>kₑ = ln2 / t½</b>.`), step(`kₑ = ${LN2} / ${th} = <b>${nf(k,3)} h⁻¹</b>`),
          step(`So each hour the body removes ${nf(100*(1-Math.exp(-k)),1)}% of the drug present at the start of that hour.`)],
        viz:{route:"iv", D:500, V:35, thalf:th}, view:{duration:evenUp(th*5)}, at:th,
        check:p=> Math.log(conc(p,0)/conc(p,1))};
    }},
    {id:"c0", topic:"single", gen(d){
      const D=d(100,1000,50), V=d(10,60,5);
      return {type:"IV bolus · starting concentration", unit:"mg/L", dp:2, ans:D/V,
        q:`A <b>${D} mg</b> IV bolus is given, and the drug's volume of distribution is <b>${V} L</b>. What is the concentration straight after the dose (C₀)?`,
        sol:[step(`An IV bolus spreads through the volume of distribution at once: <b>C₀ = D / V</b>.`), step(`C₀ = ${D} / ${V} = <b>${nf(D/V,2)} mg/L</b>`)],
        viz:{route:"iv", D, V, thalf:4}, view:{duration:24}, at:0, check:p=> conc(p,0)};
    }},
    {id:"ct", topic:"single", gen(d){
      const D=d(200,800,50), V=d(15,50,5), th=d(2,10,1), t=d(2,12,1), k=Math.LN2/th, C0=D/V, C=C0*Math.exp(-k*t);
      return {type:"IV bolus · concentration at a time", unit:"mg/L", dp:2, ans:C,
        q:`After a <b>${D} mg</b> IV bolus (V = <b>${V} L</b>, t½ = <b>${th} h</b>), what is the concentration at <b>t = ${t} h</b>?`,
        sol:[step(`C₀ = D / V = ${D} / ${V} = <b>${nf(C0,2)} mg/L</b>`), step(`kₑ = ${LN2} / ${th} = <b>${nf(k,3)} h⁻¹</b>`),
          step(`C(t) = C₀·e^(−kₑt) = ${nf(C0,2)}·e^(−${nf(k,3)} × ${t}) = <b>${nf(C,2)} mg/L</b>`),
          step(`Check: ${t} h is ${nf(t/th,2)} half-lives, so about ${nf(100*Math.pow(0.5,t/th),0)}% of C₀ is left.`)],
        viz:{route:"iv", D, V, thalf:th}, view:{duration:evenUp(Math.max(t+4, th*4))}, at:t, check:p=> conc(p,t)};
    }},
    {id:"remain", topic:"single", gen(d){
      const th=d(2,12,1), t=d(1,3*th,1), f=100*Math.pow(0.5,t/th);
      return {type:"Fraction remaining", unit:"%", dp:1, ans:f,
        q:`A drug has a half-life of <b>${th} h</b>. What percentage of an IV bolus dose is still in the body <b>${t} h</b> after it's given?`,
        sol:[step(`Each half-life halves what is left: <b>fraction remaining = (½)^(t / t½)</b>.`),
          step(`t / t½ = ${t} / ${th} = <b>${nf(t/th,2)}</b> half-lives`), step(`(½)^${nf(t/th,2)} = <b>${nf(f,1)}%</b> of the dose`)],
        viz:{route:"iv", D:500, V:35, thalf:th}, view:{duration:evenUp(Math.max(t+4, th*4))}, at:t,
        check:p=> 100*conc(p,t)/conc(p,0)};
    }},
    {id:"thalf2", topic:"single", gen(d){
      const C1=d(8,40,2), t1=d(1,3,1), n=d(1,3,1), th=d(2,8,1), t2=t1+n*th, C2=C1/Math.pow(2,n), V=10;
      return {type:"Half-life from two levels", unit:"h", dp:2, ans:th,
        q:`After an IV bolus, the concentration is <b>${nf(C1,2)} mg/L</b> at <b>t = ${t1} h</b> and <b>${nf(C2,2)} mg/L</b> at <b>t = ${t2} h</b>. What is the elimination half-life?`,
        sol:[step(`<b>t½ = (t₂ − t₁)·ln2 / ln(C₁ / C₂)</b>`),
          step(`t½ = (${t2} − ${t1})·${LN2} / ln(${nf(C1,2)} / ${nf(C2,2)}) = <b>${th} h</b>`),
          step(`Check: the level halved ${n===1?"once":n+" times"} in ${t2-t1} h, so each halving took ${th} h. On the log scale the fall is a straight line.`)],
        viz:{route:"iv", D:Math.round(C1*V*Math.exp(Math.LN2/th*t1)), V, thalf:th}, view:{duration:evenUp(t2+2*th), scale:"log"}, at:t2,
        check:p=> (t2-t1)*Math.LN2/Math.log(conc(p,t1)/conc(p,t2))};
    }},
    {id:"auc", topic:"single", gen(d){
      const D=d(200,800,50), F=d(0.5,1,0.05), th=d(2,10,1), V=d(15,50,5), CL=Math.LN2/th*V, auc=F*D/CL;
      return {type:"Exposure (AUC)", unit:"mg·h/L", dp:1, ans:auc,
        q:`An oral dose of <b>${D} mg</b> with bioavailability <b>F = ${F}</b> is given (t½ = <b>${th} h</b>, V = <b>${V} L</b>). What is the total exposure, AUC from zero to infinity?`,
        sol:[step(`<b>AUC = F·D / CL</b>. How fast the drug is absorbed changes the curve's shape, not its area.`),
          step(`CL = kₑ·V = (${LN2} / ${th})·${V} = <b>${nf(CL,2)} L/h</b>`), step(`AUC = ${F} × ${D} / ${nf(CL,2)} = <b>${nf(auc,1)} mg·h/L</b>`)],
        viz:{route:"oral", D, F, ka:1.2, thalf:th, V}, view:{duration:evenUp(th*6)},
        check:p=> areaUnder(p)};
    }},
    {id:"cl", topic:"single", gen(d){
      const D=d(100,1000,50), th=d(2,12,1), V=d(10,60,5), auc=sig4(D/(Math.LN2/th*V)), CL=D/auc;
      return {type:"Clearance from AUC", unit:"L/h", dp:2, ans:CL,
        q:`A <b>${D} mg</b> IV bolus gives a total exposure of <b>AUC = ${auc} mg·h/L</b>. What is the drug's clearance?`,
        sol:[step(`All of an IV dose is eventually cleared, so <b>CL = D / AUC</b> (for an oral dose, F·D / AUC).`),
          step(`CL = ${D} / ${auc} = <b>${nf(CL,2)} L/h</b>`),
          step(`Clearance is the volume of plasma cleared of drug each hour. It sets total exposure; the half-life depends on V too.`)],
        viz:{route:"iv", D, V, thalf:th}, view:{duration:evenUp(th*6)},
        check:p=> p.D/areaUnder(p)};
    }},
    {id:"bioF", topic:"single", gen(d){
      const F=d(0.3,0.95,0.05), th=d(2,12,1), V=d(15,50,5), Div=d(100,500,50), Dpo=d(200,800,50), CL=Math.LN2/th*V;
      const aIv=sig4(Div/CL), aPo=sig4(F*Dpo/CL), ans=(aPo/Dpo)/(aIv/Div);
      return {type:"Bioavailability from AUCs", unit:"(fraction)", dp:2, ans,
        q:`The same drug is given two ways. A <b>${Div} mg</b> IV bolus gives <b>AUC = ${aIv} mg·h/L</b>; a <b>${Dpo} mg</b> oral dose gives <b>AUC = ${aPo} mg·h/L</b>. What is the oral bioavailability F?`,
        sol:[step(`Compare exposure per mg: <b>F = (AUC_oral / D_oral) / (AUC_IV / D_IV)</b>.`),
          step(`Oral: ${aPo} / ${Dpo} = ${nf(aPo/Dpo,4)} · IV: ${aIv} / ${Div} = ${nf(aIv/Div,4)} (mg·h/L per mg)`),
          step(`F = ${nf(aPo/Dpo,4)} / ${nf(aIv/Div,4)} = <b>${nf(ans,2)}</b>, so ${nf(100*ans,0)}% of the oral dose reaches the circulation.`)],
        viz:{route:"oral", D:Dpo, F, ka:1, thalf:th, V}, view:{duration:evenUp(th*6)},
        check:p=>{
          const iv=scenario(Object.assign({},p,{route:"iv", D:Div}));
          return (areaUnder(p)/p.D)/(areaUnder(iv)/Div);
        }};
    }},
    {id:"tmax", topic:"single", gen(d){
      const ka=d(0.6,3,0.1), th=d(2,12,1), k=Math.LN2/th, tm=Math.log(ka/k)/(ka-k);
      return {type:"Oral dose · time of the peak", unit:"h", dp:2, ans:tm,
        q:`An oral dose has an absorption rate constant <b>kₐ = ${ka} h⁻¹</b> and an elimination half-life of <b>${th} h</b>. When does the concentration peak (tmax)?`,
        sol:[step(`The peak is where absorption and elimination balance: <b>tmax = ln(kₐ / kₑ) / (kₐ − kₑ)</b>.`),
          step(`kₑ = ${LN2} / ${th} = <b>${nf(k,3)} h⁻¹</b>`),
          step(`tmax = ln(${ka} / ${nf(k,3)}) / (${ka} − ${nf(k,3)}) = <b>${nf(tm,2)} h</b>`),
          step(`The dose isn't in the formula: tmax depends only on the two rate constants.`)],
        viz:{route:"oral", D:500, F:0.9, ka, thalf:th, V:35}, view:{duration:evenUp(Math.max(24, th*4))}, at:tm,
        check:p=>{   // the peak of the simulated curve, by ternary search
          let lo=0, hi=24;
          for(let i=0;i<200;i++){ const a=lo+(hi-lo)/3, b=hi-(hi-lo)/3; if(conc(p,a)<conc(p,b)) lo=a; else hi=b; }
          return (lo+hi)/2;
        }};
    }},
    {id:"tbelow", topic:"single", gen(d){
      const D=d(200,1000,50), V=d(10,50,5), th=d(2,12,1), C0=D/V, Ct=+(C0*d(0.1,0.5,0.05)).toFixed(2), k=Math.LN2/th, t=Math.log(C0/Ct)/k;
      return {type:"IV bolus · time to fall to a level", unit:"h", dp:1, ans:t,
        q:`After a <b>${D} mg</b> IV bolus (V = <b>${V} L</b>, t½ = <b>${th} h</b>), how long until the concentration falls to <b>${Ct} mg/L</b>?`,
        sol:[step(`C₀ = D / V = ${D} / ${V} = <b>${nf(C0,2)} mg/L</b>`),
          step(`Solve C₀·e^(−kₑt) = C for t: <b>t = ln(C₀ / C) / kₑ</b>`),
          step(`kₑ = ${LN2} / ${th} = ${nf(k,4)} h⁻¹, so t = ln(${nf(C0,2)} / ${Ct}) / ${nf(k,4)} = <b>${nf(t,1)} h</b>`),
          step(`Check: that is ${nf(t/th,2)} half-lives, and (½)^${nf(t/th,2)} = ${nf(Ct/C0,3)} of C₀.`)],
        viz:{route:"iv", D, V, thalf:th}, view:{duration:evenUp(Math.max(t+4, th*4))}, at:t,
        check:p=> solveUp(x=> -conc(p,x), -Ct, 0, 400)};
    }},
    {id:"thalfcl", topic:"single", gen(d){
      const {CL,V,th}=until(()=>{ const CL=d(1,12,0.5), V=d(10,80,5); return {CL, V, th:Math.LN2*V/CL}; }, x=> x.th>=1 && x.th<=20);
      return {type:"Half-life from clearance and volume", unit:"h", dp:2, ans:th,
        q:`A drug has a clearance of <b>${CL} L/h</b> and a volume of distribution of <b>${V} L</b>. What is its elimination half-life?`,
        sol:[step(`kₑ = CL / V, and t½ = ln2 / kₑ, so <b>t½ = 0.693·V / CL</b>.`),
          step(`t½ = ${LN2} × ${V} / ${CL} = <b>${nf(th,2)} h</b>`),
          step(`A larger volume or a smaller clearance both lengthen the half-life; neither alone decides it.`)],
        viz:{route:"iv", D:500, V, thalf:+th.toFixed(4)}, view:{duration:evenUp(th*5)}, at:th,
        check:p=> solveUp(x=> -conc(p,x), -conc(p,0)/2, 0, 400)};
    }},
    /* ----- repeated dosing ----- */
    {id:"t90", topic:"rep", gen(d){
      const th=d(2,12,1), t=Math.log2(10)*th, tau=Math.max(2,Math.min(24,th)), n=Math.min(20, Math.ceil(2*t/tau)+1);
      return {type:"Time to steady state", unit:"h", dp:1, ans:t,
        q:`A drug with a half-life of <b>${th} h</b> is started on a regular dosing schedule. About how long until concentrations reach <b>90%</b> of steady state?`,
        sol:[step(`After n half-lives the approach to steady state is 1 − (½)ⁿ complete, so 90% takes <b>n = log₂10 ≈ 3.32</b> half-lives.`),
          step(`t₉₀ = 3.32 × ${th} = <b>${nf(t,1)} h</b>. The dose and interval don't change it; only the half-life does.`)],
        viz:{route:"iv", dosing:"repeated", D:300, V:30, thalf:th, tau, nDoses:n}, view:{duration:evenUp(n*tau)}, at:t,
        check:p=>{ const css=cssPerRate(p), q=scenario(Object.assign({},p,{route:"inf", dosing:"single", tinf:168, D:168}));
          return solveUp(x=> conc(q,x)/css, 0.9, 0, 168); }};
    }},
    {id:"rac", topic:"rep", gen(d){
      const th=d(2,24,1), tau=d(4,Math.max(4,Math.min(24,2*th)),2), k=Math.LN2/th, x=Math.exp(-k*tau), r=1/(1-x), n=Math.min(20, Math.floor(168/tau), Math.max(4, Math.ceil(5*th/tau)+1));
      return {type:"Accumulation ratio", unit:"×", dp:2, ans:r,
        q:`An IV bolus is repeated every <b>${tau} h</b> for a drug with a half-life of <b>${th} h</b>. At steady state, how many times higher is the peak than the first dose's peak (the accumulation ratio)?`,
        sol:[step(`Each dose adds to what's left of the earlier ones: <b>R = 1 / (1 − e^(−kₑτ))</b>.`),
          step(`kₑ = ${LN2} / ${th} = <b>${nf(k,4)} h⁻¹</b>; e^(−kₑτ) = e^(−${nf(k,4)} × ${tau}) = <b>${nf(x,3)}</b>`),
          step(`R = 1 / (1 − ${nf(x,3)}) = <b>${nf(r,2)}</b>. The shorter the interval compared with the half-life, the more the drug builds up.`)],
        viz:{route:"iv", dosing:"repeated", D:300, V:30, thalf:th, tau, nDoses:n}, view:{duration:evenUp(n*tau)},
        check:p=> ssConc(p,0)/conc(p,0)};
    }},
    {id:"cavg", topic:"rep", gen(d){
      const D=d(100,600,50), F=d(0.5,1,0.05), th=d(4,14,1), V=d(20,60,5), tau=until(()=>d(6,24,6), t=> ssFits(th,t,true));
      const CL=Math.LN2/th*V, c=F*D/(CL*tau), n=mostDoses(tau);
      return {type:"Average steady-state concentration", unit:"mg/L", dp:2, ans:c,
        q:`An oral dose of <b>${D} mg</b> (F = <b>${F}</b>) is taken every <b>${tau} h</b>. The drug has t½ = <b>${th} h</b> and V = <b>${V} L</b>. What is the average concentration at steady state?`,
        sol:[step(`At steady state, what's absorbed each interval is cleared each interval: <b>Css,avg = F·D / (CL·τ)</b>.`),
          step(`CL = (${LN2} / ${th})·${V} = <b>${nf(CL,2)} L/h</b>`),
          step(`Css,avg = ${F} × ${D} / (${nf(CL,2)} × ${tau}) = <b>${nf(c,2)} mg/L</b>. Only the dose rate D/τ matters, not how it's split.`)],
        viz:{route:"oral", dosing:"repeated", D, F, ka:1, thalf:th, V, tau, nDoses:n}, view:{duration:evenUp(n*tau), zoom:"last"},
        check:p=> ssMean(p)};
    }},
    {id:"mdose", topic:"rep", gen(d){
      const x=until(()=>{ const c=d(2,15,1), F=d(0.5,1,0.05), th=d(4,14,1), V=d(20,60,5), tau=d(6,24,6), CL=Math.LN2/th*V;
        return {c,F,th,V,tau,CL,D:c*CL*tau/F}; }, x=> x.D>=50 && x.D<=2000 && ssFits(x.th,x.tau,true));
      const {c,F,th,V,tau,CL,D}=x, n=mostDoses(tau);
      return {type:"Dose for an average level", unit:"mg", dp:0, ans:D,
        q:`A drug has F = <b>${F}</b>, t½ = <b>${th} h</b> and V = <b>${V} L</b>. Which oral dose, taken every <b>${tau} h</b>, gives an average steady-state concentration of <b>${c} mg/L</b>?`,
        sol:[step(`Rearrange Css,avg = F·D / (CL·τ): <b>D = Css,avg·CL·τ / F</b>.`),
          step(`CL = (${LN2} / ${th})·${V} = <b>${nf(CL,2)} L/h</b>`),
          step(`D = ${c} × ${nf(CL,2)} × ${tau} / ${F} = <b>${nf(D,0)} mg</b>`)],
        viz:{route:"oral", dosing:"repeated", D:Math.round(D), F, ka:1, thalf:th, V, tau, nDoses:n}, view:{duration:evenUp(n*tau), zoom:"last"},
        check:p=> c*p.D/ssMean(p)};
    }},
    {id:"trough", topic:"rep", gen(d){
      const D=d(100,1000,50), V=d(10,60,5), th=d(2,12,1), tau=d(2*Math.ceil(th/4),Math.min(24,3*th),2), k=Math.LN2/th, x=Math.exp(-k*tau), cmin=D/V*x/(1-x);
      const n=mostDoses(tau);
      return {type:"Steady-state trough", unit:"mg/L", dp:2, ans:cmin,
        q:`An IV bolus of <b>${D} mg</b> is given every <b>${tau} h</b> (V = <b>${V} L</b>, t½ = <b>${th} h</b>). What is the steady-state trough, just before a dose?`,
        sol:[step(`At steady state the trough is what's left of every earlier dose: <b>Cmin,ss = (D/V)·e^(−kₑτ) / (1 − e^(−kₑτ))</b>.`),
          step(`D/V = <b>${nf(D/V,2)} mg/L</b>; kₑ = ${LN2} / ${th} = ${nf(k,4)} h⁻¹; e^(−kₑτ) = <b>${nf(x,3)}</b>`),
          step(`Cmin,ss = ${nf(D/V,2)} × ${nf(x,3)} / (1 − ${nf(x,3)}) = <b>${nf(cmin,2)} mg/L</b>, and the peak is D/V higher: ${nf(cmin+D/V,2)} mg/L.`)],
        viz:{route:"iv", dosing:"repeated", D, V, thalf:th, tau, nDoses:n}, view:{duration:evenUp(n*tau), zoom:"last"}, at:n*tau,
        check:p=> ssConc(p, p.tau-1e-9)};
    }},
    {id:"taumax", topic:"rep", gen(d){
      const x=until(()=>{ const th=d(2,12,1), lo=d(2,10,1), ratio=d(2,6,0.5), k=Math.LN2/th, tau=Math.log(ratio)/k;
        return {th, lo, hi:+(lo*ratio).toFixed(1), k, tau}; }, x=> x.tau>=2 && x.tau<=24 && 20*Math.floor(x.tau)>=10*x.th);
      const {th, lo, hi, k}=x, tau=Math.log(hi/lo)/k, tv=Math.floor(tau), V=30, n=mostDoses(tv);
      return {type:"Longest interval for a window", unit:"h", dp:1, ans:tau,
        q:`A drug given as a repeated IV bolus has a half-life of <b>${th} h</b>. Its level should stay between <b>${lo} mg/L</b> and <b>${hi} mg/L</b>. What is the longest dosing interval whose steady-state swing fits that window?`,
        sol:[step(`At steady state an IV bolus peaks at e^(kₑτ) times its trough, so the swing fits when e^(kₑτ) ≤ upper / lower: <b>τ ≤ ln(upper / lower) / kₑ</b>.`),
          step(`kₑ = ${LN2} / ${th} = ${nf(k,4)} h⁻¹; upper / lower = ${hi} / ${lo} = ${nf(hi/lo,3)}`),
          step(`τ = ln(${nf(hi/lo,3)}) / ${nf(k,4)} = <b>${nf(tau,1)} h</b>. The dose then decides where the swing sits in the window.`)],
        viz:{route:"iv", dosing:"repeated", D:+(V*hi*(1-Math.exp(-k*tv))).toFixed(1), V, thalf:th, tau:tv, nDoses:n},
        view:{duration:evenUp(n*tv), zoom:"last", mec:lo, mtc:hi},
        check:p=> solveUp(t=>{ const s=ssPeakTrough(scenario(Object.assign({},p,{tau:t}))); return s.peak/s.trough; }, hi/lo, 0.5, 48)};
    }},
    /* ----- infusions ----- */
    {id:"rate", topic:"inf", gen(d){
      const th=d(2,9,1), dur=evenUp(10*th), {V,c}=until(()=>({V:d(10,40,5), c:d(2,10,1)}), x=> x.c*Math.LN2/th*x.V*dur<=2000);
      const CL=Math.LN2/th*V, R0=c*CL;
      return {type:"Infusion rate for a steady state", unit:"mg/h", dp:1, ans:R0,
        q:`A drug has t½ = <b>${th} h</b> and V = <b>${V} L</b>. What constant IV infusion rate gives a steady-state concentration of <b>${c} mg/L</b>?`,
        sol:[step(`At steady state, rate in equals rate out: <b>R₀ = Css·CL</b>.`),
          step(`CL = kₑ·V = (${LN2} / ${th})·${V} = <b>${nf(CL,2)} L/h</b>`),
          step(`R₀ = ${c} × ${nf(CL,2)} = <b>${nf(R0,1)} mg/h</b>. Getting there takes 4–5 half-lives, whatever the rate.`)],
        viz:{route:"inf", D:+(R0*dur).toFixed(1), tinf:dur, V, thalf:th}, view:{duration:evenUp(dur+2*th)}, at:dur,
        check:p=> c/cssPerRate(p)};
    }},
    {id:"infpct", topic:"inf", gen(d){
      const th=d(2,12,1), t=d(1,4*th,1), f=100*(1-Math.pow(0.5,t/th)), dur=evenUp(Math.max(t+2, 5*th));
      return {type:"Infusion · approach to steady state", unit:"%", dp:1, ans:f,
        q:`A constant IV infusion is started for a drug with a half-life of <b>${th} h</b>. After <b>${t} h</b>, what percentage of the steady-state concentration has been reached?`,
        sol:[step(`The level climbs toward steady state as <b>1 − (½)^(t / t½)</b>, the mirror image of elimination.`),
          step(`t / t½ = ${t} / ${th} = <b>${nf(t/th,2)}</b> half-lives`),
          step(`1 − (½)^${nf(t/th,2)} = <b>${nf(f,1)}%</b> of steady state`)],
        viz:{route:"inf", D:1000, tinf:dur, V:30, thalf:th}, view:{duration:evenUp(dur+2*th)}, at:t,
        check:p=> 100*conc(p,t)/(cssPerRate(p)*p.D/p.tinf)};
    }},
    {id:"infend", topic:"inf", gen(d){
      const D=d(200,1500,100), T=d(1,8,1), V=d(15,50,5), th=d(2,12,1), R0=D/T, k=Math.LN2/th, CL=k*V, c=R0/CL*(1-Math.exp(-k*T));
      return {type:"Infusion · level at the end", unit:"mg/L", dp:2, ans:c,
        q:`<b>${D} mg</b> is infused at a constant rate over <b>${T} h</b> (V = <b>${V} L</b>, t½ = <b>${th} h</b>). What is the concentration when the infusion ends?`,
        sol:[step(`R₀ = D / T = ${D} / ${T} = <b>${nf(R0,1)} mg/h</b>; kₑ = ${LN2} / ${th} = ${nf(k,3)} h⁻¹; CL = kₑ·V = <b>${nf(CL,2)} L/h</b>`),
          step(`During an infusion <b>C(t) = (R₀ / CL)·(1 − e^(−kₑt))</b>`),
          step(`C(${T}) = (${nf(R0,1)} / ${nf(CL,2)})·(1 − e^(−${nf(k,3)} × ${T})) = <b>${nf(c,2)} mg/L</b>`)],
        viz:{route:"inf", D, tinf:T, V, thalf:th}, view:{duration:evenUp(T+4*th)}, at:T, check:p=> conc(p,p.tinf)};
    }},
    {id:"ldinf", topic:"inf", gen(d){
      const c=d(2,10,1), V=d(15,50,5), th=d(4,12,1), CL=Math.LN2/th*V, R0=c*CL, LD=c*V, dur=evenUp(3*th);
      return {type:"Loading dose with an infusion", unit:"mg", dp:0, ans:LD,
        q:`An infusion of <b>${nf(R0,1)} mg/h</b> settles at <b>${c} mg/L</b> (V = <b>${V} L</b>, t½ = <b>${th} h</b>). Which IV bolus, given as the infusion starts, puts the concentration at ${c} mg/L straight away?`,
        sol:[step(`A bolus fills the volume of distribution: <b>LD = C·V</b>.`), step(`LD = ${c} × ${V} = <b>${nf(LD,0)} mg</b>`),
          step(`From then on the infusion replaces exactly what's cleared, so the level stays flat. Clearance sets the rate, not the loading dose.`)],
        viz:{route:"iv", dosing:"custom", V, thalf:th, events:[
          {id:"e1", t:0, mg:LD, type:"loading", status:"given", route:"iv"},
          {id:"e2", t:0, mg:+(R0*dur).toFixed(1), type:"maintenance", status:"given", route:"inf", dur}]},
        view:{duration:evenUp(dur+2*th)}, at:dur/2,
        check:p=> LD*c/conc(p,dur/2)};
    }},
    {id:"clinf", topic:"inf", gen(d){
      const R0=d(10,100,5), th=d(2,9,1), V=d(10,40,5), CL=Math.LN2/th*V, css=sig4(R0/CL), ans=R0/css, dur=evenUp(10*th);
      return {type:"Clearance from a steady-state infusion", unit:"L/h", dp:2, ans,
        q:`A constant IV infusion of <b>${R0} mg/h</b> has settled at a steady-state concentration of <b>${css} mg/L</b>. What is the drug's clearance?`,
        sol:[step(`At steady state the drug leaves as fast as it goes in: R₀ = CL·Css, so <b>CL = R₀ / Css</b>.`),
          step(`CL = ${R0} / ${css} = <b>${nf(ans,2)} L/h</b>`),
          step(`That is how clearance is measured: one steady level and the known rate, with no need to know the volume or the half-life.`)],
        viz:{route:"inf", dosing:"custom", V, thalf:th, events:[{id:"e1", t:0, mg:+(R0*dur).toFixed(1), type:"maintenance", status:"given", route:"inf", dur}]},
        view:{duration:evenUp(dur+2*th)}, at:dur,
        check:p=> 1/cssPerRate(p)};   // the model's clearance, from the level a never-ending infusion settles at
    }},
    /* ----- concentration–effect ----- */
    {id:"effc", topic:"pd", gen(d){
      const ec50=d(1,10,0.5), emax=d(60,100,10), hill=d(1,3,0.5), C=d(1,20,1), E=emax/(1+Math.pow(ec50/C,hill));
      return {type:"Effect at a concentration", unit:"%", dp:1, ans:E,
        q:`A drug's effect follows the Emax model with <b>E₀ = 0</b>, <b>Emax = ${emax}%</b>, <b>EC50 = ${ec50} mg/L</b> and Hill slope <b>n = ${hill}</b>. What effect does a concentration of <b>${C} mg/L</b> give?`,
        sol:[step(`<b>E = E₀ + Emax·Cⁿ / (EC50ⁿ + Cⁿ)</b>`),
          step(`Cⁿ = ${C}^${hill} = ${nf(Math.pow(C,hill),3)}; EC50ⁿ = ${ec50}^${hill} = ${nf(Math.pow(ec50,hill),3)}`),
          step(`E = ${emax} × ${nf(Math.pow(C,hill),3)} / (${nf(Math.pow(ec50,hill),3)} + ${nf(Math.pow(C,hill),3)}) = <b>${nf(E,1)}%</b>`),
          step(`At C = EC50 the effect is always half of Emax, whatever the slope.`)],
        viz:{route:"iv", D:70*C, V:35, thalf:4, e0:0, emax, ec50, hill}, view:{duration:24, pd:true}, at:4,
        check:p=> effectOf(p, conc(p,4))};
    }},
    {id:"cfore", topic:"pd", gen(d){
      const x=until(()=>{ const ec50=d(1,10,0.5), emax=d(60,100,10), hill=d(1,3,0.5), E=d(10,emax-10,5);
        return {ec50,emax,hill,E,C:ec50*Math.pow(E/(emax-E),1/hill)}; }, x=> x.C>=0.5 && x.C<=25);
      const {ec50,emax,hill,E,C}=x;
      return {type:"Concentration for an effect", unit:"mg/L", dp:2, ans:C,
        q:`A drug's effect follows the Emax model with <b>E₀ = 0</b>, <b>Emax = ${emax}%</b>, <b>EC50 = ${ec50} mg/L</b> and Hill slope <b>n = ${hill}</b>. Which concentration gives an effect of <b>${E}%</b>?`,
        sol:[step(`Solve the Emax model for C: <b>C = EC50·(E / (Emax − E))^(1/n)</b>.`),
          step(`E / (Emax − E) = ${E} / ${emax-E} = ${nf(E/(emax-E),4)}`),
          step(`C = ${ec50} × ${nf(E/(emax-E),4)}^(1/${hill}) = <b>${nf(C,2)} mg/L</b>`)],
        viz:{route:"iv", D:+(70*C).toFixed(1), V:35, thalf:4, e0:0, emax, ec50, hill}, view:{duration:24, pd:true, etgt:E}, at:4,
        check:p=> Math.exp(solveUp(lc=> effectOf(p, Math.exp(lc)), E, Math.log(1e-6), Math.log(1e4)))};
    }},
    {id:"effdur", topic:"pd", gen(d){
      const x=until(()=>{ const D=d(300,1500,100), V=d(20,50,5), th=d(2,8,1), ec50=d(1,6,0.5), E=d(20,80,10);
        return {D, V, th, ec50, E, C0:D/V, Ce:ec50*E/(100-E)}; }, x=> x.C0>=1.5*x.Ce);
      const {D, V, th, ec50, E, C0, Ce}=x, k=Math.LN2/th, t=Math.log(C0/Ce)/k, dur=evenUp(t+2*th);
      return {type:"Duration of effect", unit:"h", dp:1, ans:t,
        q:`After a <b>${D} mg</b> IV bolus (V = <b>${V} L</b>, t½ = <b>${th} h</b>), the effect follows the Emax model (E₀ = 0, Emax = 100%, EC50 = <b>${ec50} mg/L</b>, n = 1). For how long does the effect stay at or above <b>${E}%</b>?`,
        sol:[step(`The concentration that gives ${E}%: C = EC50·E / (Emax − E) = ${ec50} × ${E} / ${100-E} = <b>${nf(Ce,3)} mg/L</b>`),
          step(`It starts at C₀ = D / V = ${D} / ${V} = <b>${nf(C0,2)} mg/L</b>`),
          step(`It falls to ${nf(Ce,3)} mg/L after t = ln(C₀ / C) / kₑ = ln(${nf(C0,2)} / ${nf(Ce,3)}) / ${nf(k,4)} = <b>${nf(t,1)} h</b>`),
          step(`Doubling the dose adds one half-life to this time; it doesn't double it.`)],
        viz:{route:"iv", D, V, thalf:th, e0:0, emax:100, ec50, hill:1}, view:{duration:dur, pd:true, etgt:E}, at:t,
        check:p=> effectStats(p, dur, E).tAbove};
    }},
    {id:"efft", topic:"pd", gen(d){
      const D=d(200,1000,100), V=d(20,50,5), th=d(2,8,1), t=d(1,12,1), ec50=d(1,8,0.5), hill=d(1,2,0.5);
      const k=Math.LN2/th, C=D/V*Math.exp(-k*t), E=100/(1+Math.pow(ec50/C,hill));
      return {type:"Effect over time", unit:"%", dp:1, ans:E,
        q:`After a <b>${D} mg</b> IV bolus (V = <b>${V} L</b>, t½ = <b>${th} h</b>), the effect follows the Emax model (E₀ = 0, Emax = 100%, EC50 = <b>${ec50} mg/L</b>, n = <b>${hill}</b>). What is the effect at <b>t = ${t} h</b>?`,
        sol:[step(`First the concentration: C(${t}) = (${D} / ${V})·e^(−${nf(k,3)} × ${t}) = <b>${nf(C,3)} mg/L</b>`),
          step(`Then the effect: E = 100·Cⁿ / (EC50ⁿ + Cⁿ) = 100 × ${nf(Math.pow(C,hill),3)} / (${nf(Math.pow(ec50,hill),3)} + ${nf(Math.pow(C,hill),3)}) = <b>${nf(E,1)}%</b>`),
          step(`The effect falls more slowly than the concentration while C is well above EC50, then faster.`)],
        viz:{route:"iv", D, V, thalf:th, e0:0, emax:100, ec50, hill}, view:{duration:evenUp(Math.max(t+4, th*4)), pd:true}, at:t,
        check:p=> effectOf(p, conc(p,t))};
    }}
  ];
  // A problem: from one topic (or any), of one kind (or any), from a seed (or a random one).
  function makeProblem(o){
    o=o||{};
    const pool=PRACTICE.filter(g=> (!o.topic || g.topic===o.topic) && (!o.id || g.id===o.id) && g.id!==o.not);
    if(!pool.length) return null;
    const seed=o.seed===undefined ? Math.floor(Math.random()*4294967296) : o.seed>>>0;
    const rnd=seededRandom(seed), g=pool[Math.floor(rnd()*pool.length)], pr=g.gen(drawFrom(rnd));
    pr.q=pr.q.replace(/<b>([^<]*)<\/b>/g, (m,x)=> `<b>${x.replace(/ /g,"\u00a0")}</b>`);   // a value never wraps away from its unit
    pr.id=g.id; pr.topic=g.topic; pr.seed=seed;
    pr.view=Object.assign({}, VIEW_DEFAULTS, pr.view);
    return pr;
  }
  const practiceScenario=pr=> normalizeScenario(scenario(pr.viz));
  // A worksheet: `count` problems from one topic (or all), each kind at most once until every kind in the pool
  // has been used, in a shuffled order. The seed rebuilds the same sheet.
  const WORKSHEET_SIZES=[5,10,15];
  function makeWorksheet(o){
    o=o||{};
    const topic=PRACTICE_TOPICS.some(t=>t.id===o.topic) ? o.topic : "";
    const count=WORKSHEET_SIZES.includes(o.count) ? o.count : 10;
    const seed=o.seed===undefined ? Math.floor(Math.random()*4294967296) : o.seed>>>0;
    const rnd=seededRandom(seed), pool=PRACTICE.filter(g=> !topic || g.topic===topic).map(g=>g.id);
    const kinds=[];
    while(kinds.length<count){
      const round=pool.slice();
      for(let i=round.length-1;i>0;i--){ const j=Math.floor(rnd()*(i+1)); [round[i],round[j]]=[round[j],round[i]]; }
      if(kinds.length && round[0]===kinds[kinds.length-1]) round.push(round.shift());   // never the same kind twice running
      kinds.push(...round);
    }
    const problems=kinds.slice(0,count).map(id=> makeProblem({id, seed:Math.floor(rnd()*4294967296)}));
    return {topic, count, seed, problems};
  }
  // An answer within 2% (or half a unit in the last decimal shown) counts: working with ln2 = 0.693 or
  // rounded intermediate values still lands inside it.
  const practiceCorrect=(pr,v)=> typeof v==="number" && isFinite(v) && Math.abs(v-pr.ans)<=Math.max(Math.abs(pr.ans)*0.02, Math.pow(10,-pr.dp)/2);

  /* ================= PROGRESS ================= */
  // What a learner has done, kept in their own browser only: per lesson, whether the prediction was answered right
  // and whether the challenge was met; per practice topic, answers checked and answers right; and how many
  // fit-the-data and hit-the-window tasks were completed. parseProgress keeps only that shape (known lessons and
  // topics, true flags, whole counts), so a damaged or edited copy can't put anything else into the page.
  const PROGRESS_FORMAT="dosecurve-progress", PROGRESS_VERSION=1, PROGRESS_TASKS=["fit","window"];
  const emptyProgress=()=>({format:PROGRESS_FORMAT, version:PROGRESS_VERSION, lessons:{}, practice:{}, tasks:{fit:0, window:0}});
  const tally=v=> Number.isInteger(v) && v>=0 ? Math.min(v, 1e6) : 0;
  const isObj=v=> !!v && typeof v==="object" && !Array.isArray(v);
  function parseProgress(x){
    let o=x;
    if(typeof x==="string"){ try{ o=JSON.parse(x); }catch(e){ return emptyProgress(); } }
    const p=emptyProgress();
    if(!isObj(o) || o.format!==PROGRESS_FORMAT) return p;
    const lessons=isObj(o.lessons) ? o.lessons : {}, practice=isObj(o.practice) ? o.practice : {}, tasks=isObj(o.tasks) ? o.tasks : {};
    LESSONS.forEach(L=>{
      const r=lessons[L.id];
      if(!isObj(r)) return;
      const e={};
      if(r.predicted===true) e.predicted=true;
      if(r.challenge===true) e.challenge=true;
      if(e.predicted || e.challenge) p.lessons[L.id]=e;
    });
    PRACTICE_TOPICS.forEach(t=>{
      const r=practice[t.id];
      if(!isObj(r)) return;
      const tried=tally(r.tried), right=Math.min(tally(r.right), tried);
      if(tried) p.practice[t.id]={tried, right};
    });
    PROGRESS_TASKS.forEach(k=> p.tasks[k]=tally(tasks[k]));
    return p;
  }
  // Each update returns a new record and leaves the one passed in as it was.
  function recordLesson(prog, id, what){
    const p=parseProgress(prog);
    if(!LESSONS.some(L=>L.id===id) || !["predicted","challenge"].includes(what)) return p;
    p.lessons[id]=Object.assign({}, p.lessons[id], {[what]:true});
    return p;
  }
  function recordPractice(prog, topic, right){
    const p=parseProgress(prog);
    if(!PRACTICE_TOPICS.some(t=>t.id===topic)) return p;
    const r=p.practice[topic] || {tried:0, right:0};
    p.practice[topic]={tried:Math.min(r.tried+1, 1e6), right:Math.min(r.right+(right ? 1 : 0), 1e6)};
    return p;
  }
  function recordTask(prog, kind){
    const p=parseProgress(prog);
    if(PROGRESS_TASKS.includes(kind)) p.tasks[kind]=Math.min(p.tasks[kind]+1, 1e6);
    return p;
  }
  function progressSummary(prog){
    const p=parseProgress(prog), ls=Object.values(p.lessons), pr=Object.values(p.practice);
    return {lessons:LESSONS.length, predicted:ls.filter(e=>e.predicted).length, challenges:ls.filter(e=>e.challenge).length,
      tried:pr.reduce((s,r)=>s+r.tried,0), right:pr.reduce((s,r)=>s+r.right,0), fit:p.tasks.fit, window:p.tasks.window};
  }

  /* ================= GLOSSARY ================= */
  // The terms the app uses, each with its symbol and unit, the relation DoseCurve computes it by, and the lesson
  // that shows it (lesson ids are checked by the tests).
  const GLOSSARY=[
    {term:"Concentration", sym:"C", unit:"mg/L", lesson:"route",
     def:"How much drug is in each litre of plasma. DoseCurve uses mg/L, which is the same as µg/mL."},
    {term:"Peak concentration", sym:"Cmax", unit:"mg/L", lesson:"route",
     def:"The highest concentration after a dose. An IV bolus peaks at once, an oral dose later and lower, and an infusion when it stops."},
    {term:"Time of the peak", sym:"tmax", unit:"h", lesson:"route",
     def:"When the peak comes. For an oral dose tmax = ln(kₐ / kₑ) / (kₐ − kₑ), so it depends on the two rate constants, not on the dose."},
    {term:"Trough", sym:"Cmin", unit:"mg/L", lesson:"accum",
     def:"The lowest concentration in a dosing interval, just before the next dose."},
    {term:"Area under the curve", sym:"AUC", unit:"mg·h/L", lesson:"route",
     def:"Total exposure: the area under the concentration–time curve. For one dose AUC∞ = F·D / CL, however fast the drug is absorbed."},
    {term:"Bioavailability", sym:"F", unit:"fraction", lesson:"route",
     def:"The fraction of an oral dose that reaches the circulation, from 0 to 1. An IV dose has F = 1."},
    {term:"Absorption rate constant", sym:"kₐ", unit:"h⁻¹", lesson:"route",
     def:"How fast an oral dose moves into the blood. A larger kₐ gives an earlier, higher peak; the AUC stays the same."},
    {term:"Elimination rate constant", sym:"kₑ", unit:"h⁻¹", lesson:"half",
     def:"The fraction of the drug in the body removed per hour in first-order elimination: kₑ = ln2 / t½ = CL / V."},
    {term:"Half-life", sym:"t½", unit:"h", lesson:"half",
     def:"The time for the concentration to halve once absorption is over: t½ = 0.693 / kₑ = 0.693·V / CL, so it depends on both volume and clearance."},
    {term:"Volume of distribution", sym:"V", unit:"L", lesson:"vd",
     def:"The apparent volume the drug spreads into: for an IV bolus, the dose divided by the starting concentration (V = D / C₀). In DoseCurve it scales with body weight."},
    {term:"Clearance", sym:"CL", unit:"L/h", lesson:"cl",
     def:"The volume of plasma cleared of drug each hour: CL = kₑ·V. It sets total exposure (AUC = F·D / CL). In DoseCurve, organ function scales it."},
    {term:"IV bolus", sym:"", unit:"", lesson:"inf",
     def:"A dose injected into a vein all at once: the concentration starts at D / V and falls from there."},
    {term:"IV infusion", sym:"R₀", unit:"mg/h", lesson:"infdur",
     def:"A dose run into a vein at a constant rate R₀ = D / T. The level climbs toward R₀ / CL and falls once the infusion stops."},
    {term:"Loading dose", sym:"LD", unit:"mg", lesson:"load",
     def:"A larger first dose, or a bolus given with an infusion, that reaches the target level at once instead of after 4–5 half-lives: LD = C_target·V."},
    {term:"Maintenance dose", sym:"D", unit:"mg", lesson:"accum",
     def:"The dose repeated every interval. At steady state it replaces what is cleared, so the average level is F·D / (CL·τ)."},
    {term:"Dosing interval", sym:"τ", unit:"h", lesson:"split",
     def:"The time between the doses of a regular regimen."},
    {term:"Steady state", sym:"SS", unit:"", lesson:"accum",
     def:"When what each interval adds matches what is cleared, so peaks and troughs stop rising. About 90% of the way after 3.3 half-lives and about 97% after 5, whatever the dose."},
    {term:"Accumulation ratio", sym:"R", unit:"×", lesson:"accum",
     def:"How many times higher levels settle than after the first dose: R = 1 / (1 − e^(−kₑτ)). The shorter the interval next to the half-life, the larger it is."},
    {term:"Swing", sym:"peak / trough", unit:"×", lesson:"split",
     def:"How far the level falls between doses. For a repeated IV bolus at steady state, peak / trough = e^(kₑτ): the interval sets it, the dose doesn't."},
    {term:"Superposition", sym:"", unit:"", lesson:"spacing",
     def:"In a linear model each dose adds its own curve, so the concentration is the sum of what is left of every dose given."},
    {term:"Minimum effective concentration", sym:"MEC", unit:"mg/L", lesson:"er",
     def:"The lower edge of the window on DoseCurve's charts: below it, the modeled level is taken as too low to act."},
    {term:"Minimum toxic concentration", sym:"MTC", unit:"mg/L", lesson:"er",
     def:"The upper edge of the window on DoseCurve's charts: above it, the modeled level is taken as too high."},
    {term:"Therapeutic window", sym:"", unit:"", lesson:"er",
     def:"The range between MEC and MTC. DoseCurve reports the share of the time window the curve spends inside it."},
    {term:"Missed dose", sym:"", unit:"", lesson:"miss",
     def:"A scheduled dose that isn't given: its curve is simply left out of the sum, and the level recovers over the following doses."},
    {term:"Baseline effect", sym:"E₀", unit:"%", lesson:"potency",
     def:"The effect with no drug present, as a percentage of the largest possible response."},
    {term:"Maximum effect", sym:"Emax", unit:"%", lesson:"efficacy",
     def:"The largest effect the drug can add on top of the baseline: a ceiling no concentration can pass."},
    {term:"Potency", sym:"EC50", unit:"mg/L", lesson:"potency",
     def:"The concentration that gives half of the maximum effect. A lower EC50 means less drug is needed for the same effect."},
    {term:"Hill slope", sym:"n", unit:"", lesson:"hill",
     def:"How steeply the effect rises around EC50. A large n makes the response close to on/off; n = 1 is a gradual curve."},
    {term:"Emax model", sym:"E", unit:"%", lesson:"pdose",
     def:"E = E₀ + Emax·Cⁿ / (EC50ⁿ + Cⁿ). DoseCurve links the effect directly to the plasma concentration, with no delay."},
    {term:"One-compartment model", sym:"", unit:"", lesson:"vd",
     def:"The idealized body DoseCurve simulates: the drug spreads at once through one well-mixed volume and is eliminated in proportion to its concentration (first-order, linear)."},
    {term:"Creatinine clearance", sym:"CrCl", unit:"mL/min", lesson:"crcl",
     def:"An estimate of how fast the kidneys filter blood, worked out from serum creatinine. The clearance of drugs the kidneys remove falls with it."},
    {term:"Cockcroft–Gault equation", sym:"CrCl", unit:"mL/min", lesson:"crcl",
     def:"CrCl = (140 − age) × weight / (72 × serum creatinine), × 0.85 for women (Cockcroft and Gault, 1976). Drug labels and dosing references have long stated renal adjustments this way, in mL/min; the eGFR laboratories report is scaled to 1.73 m² of body surface, so the two numbers aren't interchangeable."},
    {term:"Fraction excreted unchanged", sym:"fe", unit:"", lesson:"crcl",
     def:"The share of clearance the kidneys account for by removing the drug unchanged. DoseCurve scales only that part with creatinine clearance: CL = CL_ref × [(1 − fe) + fe × CrCl / 120]."},
    {term:"Ideal body weight", sym:"IBW", unit:"kg", lesson:"crcl",
     def:"Devine's estimate: 50 kg for men or 45.5 kg for women, plus 2.3 kg for each inch of height over 5 feet. Some references use it in Cockcroft–Gault for people well above it."},
    {term:"Adjusted body weight", sym:"AdjBW", unit:"kg", lesson:"crcl",
     def:"IBW + 0.4 × (actual weight − IBW): a weight between ideal and actual that some references use in Cockcroft–Gault for people well above their ideal weight."},
    {term:"Salt factor", sym:"S", unit:"", lesson:"crcl",
     def:"How much active drug each unit of a dosed salt delivers: 0.92 for phenytoin sodium, and 8.12 mEq of lithium per 300 mg of lithium carbonate. DoseCurve multiplies every dose by S."},
  ];

  /* ================= HIT THE WINDOW ================= */
  // Regimen design: for a made-up drug, choose a dose and an interval so that at steady state the trough stays at
  // or above the lower limit and the peak at or below the upper one. Each task is built around a regimen on the
  // sliders' own steps (dose in 25 mg, interval in whole hours), with some room either side, so it can always be
  // met; a few other regimens meet it too.
  const WINDOW_KINDS=[{id:"iv", title:"IV bolus"}, {id:"oral", title:"Oral dose"}];
  // Steady-state peak and trough of a regular regimen (the peak searched over the interval, then refined).
  function ssPeakTrough(p){
    const tau=p.tau, N=240;
    let best=0, sBest=0;
    for(let i=0;i<=N;i++){ const s=Math.min(tau*i/N, tau-1e-9), c=ssConc(p,s); if(c>best){ best=c; sBest=s; } }
    let lo=Math.max(0,sBest-tau/N), hi=Math.min(tau-1e-9,sBest+tau/N);
    for(let i=0;i<60;i++){ const a=lo+(hi-lo)/3, b=hi-(hi-lo)/3; if(ssConc(p,a)<ssConc(p,b)) lo=a; else hi=b; }
    return {peak:Math.max(best, ssConc(p,(lo+hi)/2)), trough:ssConc(p, tau-1e-9)};
  }
  const TAUS=[6,8,12,24];
  function makeWindowTask(o){
    o=o||{};
    const kind=WINDOW_KINDS.find(k=>k.id===o.kind) || WINDOW_KINDS[0];
    const seed=o.seed===undefined ? Math.floor(Math.random()*4294967296) : o.seed>>>0;
    const rnd=seededRandom(seed), d=drawFrom(rnd);
    const drug={route:kind.id, dosing:"repeated", thalf:d(4,16,0.5), V:d(20,80,1)};
    if(kind.id==="oral"){ drug.F=d(0.6,1,0.05); drug.ka=d(0.6,2,0.05); }
    // a regimen that works, with the window set around its steady state
    const x=until(()=>{
      const tau=TAUS[Math.floor(rnd()*TAUS.length)], D=d(100,1200,25);
      const p=scenario(Object.assign({},drug,{tau, D, nDoses:2})), {peak, trough}=ssPeakTrough(p);
      const lo=+(trough*d(0.7,0.9,0.05)).toFixed(1), hi=+(peak*d(1.1,1.35,0.05)).toFixed(1);
      return {tau, D, peak, trough, lo, hi};
    }, x=> x.lo>=0.5 && x.hi<=200 && x.hi/x.lo<=12 && x.peak/x.trough<=6);
    const task={kind:kind.id, seed, drug, window:{lo:x.lo, hi:x.hi}, solution:{D:x.D, tau:x.tau}};
    // start away from any answer: a regimen that misses the window
    const cands=[{D:1500,tau:6},{D:100,tau:24},{D:1000,tau:24},{D:200,tau:6},{D:500,tau:12}];
    task.start=cands.find(c=> !windowStatus(task, windowScenario(task,c)).good) || cands[0];
    return task;
  }
  const windowScenario=(t, over)=> normalizeScenario(scenario(Object.assign({}, t.drug, {D:t.solution.D, tau:t.solution.tau},
    {nDoses:Math.min(20, Math.floor(168/((over&&over.tau)||t.solution.tau)))}, over||{})));
  // Met when the steady-state trough is at or above the lower limit and the peak at or below the upper one. The
  // drug's own settings and the physiology have to stay as given; so does a regular regimen.
  function windowStatus(t, p){
    const keys=["route","thalf","V"].concat(t.kind==="oral" ? ["F","ka"] : []);
    if(p.dosing!=="repeated" || keys.some(k=> p[k]!==t.drug[k]) || p.wt!==DEFAULTS.wt || p.clFn!==DEFAULTS.clFn)
      return {mismatch:"setup", good:false};
    const {peak, trough}=ssPeakTrough(p), lowOk=trough>=t.window.lo, highOk=peak<=t.window.hi;
    return {peak, trough, lowOk, highOk, good:lowOk && highOk, mismatch:null};
  }

  /* ================= SHOW THE MATH ================= */
  // Each readout worked out with the scenario's own numbers: `steps` are formulas ({m}) and plain notes ({t}).
  // `value` is computed from the formula shown, independently of the simulation, and the tests hold it to
  // what the simulation gives. Readouts that can only be found by sampling the curve say so instead.
  const READOUT_KEYS={single:["cmax","tmax","thalf","cl","v","auc","mgkg","ttr"],
    repeated:["peak","trough","rac","thalf","cl","t90","mgkg","ttr"],
    custom:["peakWin","tpeakWin","given","total","thalf","cl","aucWin","ttr"]};
  function metricMath(p, key, view){
    const k=keOf(p), V=vOf(p), CL=k*V, th=Math.LN2/k, oral=p.route==="oral", F=oral ? p.F : 1;
    // units, and the salt factor: the amount of active drug is S·D (S = 1 for most drugs, and then not shown)
    const U=unitsOf(p), cu=U.conc, Sf=saltOf(p), D=p.D*Sf, Dtxt=Sf===1 ? `${p.D}` : `${nf(Sf,5)} × ${p.D}`, Sd=Sf===1 ? "D" : "S·D";
    const n1=v=>nf(v,1), n2=v=>nf(v,2), n3=v=>nf(v,3), nk=v=>nf(v,4), m=s=>({m:s}), t=s=>({t:s});
    const ws=view.ws || windowStats(p, view.duration, view.mec, view.mtc);
    const tmOral=()=> Math.abs(p.ka-k)<1e-6 ? 1/k : Math.log(p.ka/k)/(p.ka-k);
    switch(key){
      case "thalf": if(p.pm==="clinical"){ const pt=patientOf(p);
        return {title:"Effective half-life", value:th, steps:[
          t(`Clearance keeps its non-renal part (1 − fe) and scales its renal part fe by creatinine clearance, against a reference CrCl of ${CRCL_REF} mL/min:`),
          m(`factor = (1 − fe) + fe × CrCl / ${CRCL_REF} = (1 − ${nf(p.fe,2)}) + ${nf(p.fe,2)} × ${n1(pt.crcl)} / ${CRCL_REF} = ${n3(pt.factor)}`),
          m(`kₑ = (0.693 / ${nf(p.thalf,2)}) × ${n3(pt.factor)} = ${nk(k)} h⁻¹`), m(`t½ eff = 0.693 / kₑ = 0.693 / ${nk(k)} = ${n1(th)} h`)]}; }
        return {title:"Effective half-life", value:th, steps: p.clFn===100
        ? [t(`At 100% organ function the half-life is the drug's own, so the elimination rate constant is`), m(`kₑ = 0.693 / t½ = 0.693 / ${n2(th)} = ${nk(k)} h⁻¹`)]
        : [t(`Organ function scales clearance: at ${p.clFn}%, the drug is eliminated at ${p.clFn}% of its usual rate.`),
           m(`kₑ = (0.693 / ${nf(p.thalf,2)}) × ${nf(p.clFn/100,2)} = ${nk(k)} h⁻¹`), m(`t½ eff = 0.693 / kₑ = 0.693 / ${nk(k)} = ${n1(th)} h`)]};
      case "cl": return {title:"Clearance", value:CL, steps:[m(`CL = kₑ·V = ${nk(k)} × ${n1(V)} = ${n2(CL)} L/h`),
        t(`Clearance is the volume of plasma cleared of drug each hour. It sets total exposure; the half-life depends on V too.`)]};
      case "v": return {title:"Volume of distribution", value:V, steps:[m(`V = V(70 kg) × weight / 70 = ${nf(p.V,1)} × ${p.wt} / 70 = ${n1(V)} L`),
        t(`The volume scales with body weight. It sets how high an IV bolus starts (D / V) and, with the half-life, the clearance (CL = kₑ·V).`)]};
      case "auc": return {title:"Total exposure (AUC∞)", value:F*D/CL, steps:[
        m(oral ? `AUC∞ = F·${Sd} / CL = ${F} × ${Dtxt} / ${n2(CL)} = ${n1(F*D/CL)} ${U.auc}` : `AUC∞ = ${Sd} / CL = ${Dtxt} / ${n2(CL)} = ${n1(D/CL)} ${U.auc}`),
        t(oral ? `How fast the drug is absorbed changes the curve's shape, not its area.` : `It's the whole area under the curve, out to infinity.`)]};
      case "mgkg": return {title:"Dose per kilogram", value:p.D/p.wt, steps:[m(`D / weight = ${p.D} / ${p.wt} = ${n1(p.D/p.wt)} ${U.perKg}`)]};
      case "tmax":
        if(p.route==="iv") return {title:"Time of the peak (tmax)", value:0, steps:[t(`An IV bolus is highest the moment it's given, at t = 0.`)]};
        if(p.route==="inf") return {title:"Time of the peak (tmax)", value:p.tinf, steps:[t(`An infusion is highest when it stops: tmax = T = ${nf(p.tinf,2)} h.`)]};
        return {title:"Time of the peak (tmax)", value:tmOral(), steps: Math.abs(p.ka-k)<1e-6
          ? [m(`With kₐ = kₑ: tmax = 1 / kₑ = 1 / ${nk(k)} = ${n2(tmOral())} h`)]
          : [t(`The peak is where absorption in balances elimination out:`), m(`tmax = ln(kₐ / kₑ) / (kₐ − kₑ) = ln(${p.ka} / ${nk(k)}) / (${p.ka} − ${nk(k)}) = ${n2(tmOral())} h`),
             t(`Only the two rate constants set it; the dose doesn't.`)]};
      case "cmax": {
        const title="Peak concentration (Cmax)";
        if(p.route==="iv") return {title, value:D/V, steps:[t(`An IV bolus is highest the moment it's given:`), m(`Cmax = ${Sd} / V = ${Dtxt} / ${n1(V)} = ${n2(D/V)} ${cu}`)]};
        if(p.route==="inf"){
          const T=p.tinf, R=D/T, c=R/CL*(1-Math.exp(-k*T));
          return {title, value:c, steps:[t(`An infusion is highest when it stops, at T = ${nf(T,2)} h. It runs at R₀ = ${Sd} / T = ${Dtxt} / ${nf(T,2)} = ${n2(R)} ${U.amount}/h.`),
            m(`Cmax = (R₀ / CL)·(1 − e^(−kₑT)) = (${n2(R)} / ${n2(CL)}) × (1 − e^(−${nk(k)} × ${nf(T,2)})) = ${n2(c)} ${cu}`)]};
        }
        const tm=tmOral(), ka=p.ka;
        const c=Math.abs(ka-k)<1e-6 ? F*D*k*tm*Math.exp(-k*tm)/V : F*D*ka/(V*(ka-k))*(Math.exp(-k*tm)-Math.exp(-ka*tm));
        return {title, value:c, steps:[t(`The peak comes at tmax = ${n2(tm)} h (see Tmax). The oral curve is`),
          m(`C(t) = F·${Sd}·kₐ / (V·(kₐ − kₑ)) · (e^(−kₑt) − e^(−kₐt))`),
          m(`Cmax = ${F} × ${Dtxt} × ${ka} / (${n1(V)} × (${ka} − ${nk(k)})) × (e^(−${nk(k)} × ${n2(tm)}) − e^(−${ka} × ${n2(tm)})) = ${n2(c)} ${cu}`)]};
      }
      case "rac": { const x=Math.exp(-k*p.tau), r=1/(1-x);
        return {title:"Accumulation ratio", value:r, steps:[m(`R = 1 / (1 − e^(−kₑτ)) = 1 / (1 − e^(−${nk(k)} × ${p.tau})) = 1 / (1 − ${n3(x)}) = ${n2(r)}`),
          t(`Peaks and troughs settle this many times higher than after the first dose.`)]}; }
      case "t90": return {title:"Time to 90% of steady state", value:3.32*th, steps:[
        m(`90% of steady state takes log₂10 ≈ 3.32 half-lives: 3.32 × ${n1(th)} = ${n1(3.32*th)} h`), t(`Neither the dose nor the interval changes it.`)]};
      case "peak": case "trough": {
        const n=p.nDoses, x=Math.exp(-k*p.tau), simple=p.route==="iv" && p.loadMult===1 && !missedOf(p);
        const trough=key==="trough", title=trough ? "Trough after the last dose" : "Peak after the last dose";
        const ss=trough ? ssConc(p, p.tau-1e-9) : null;
        const steps=[t(`Each of the ${n} doses (every τ = ${p.tau} h) still adds what's left of it: the curve is their sum (superposition).`)];
        let value;
        if(simple){
          value=(D/V)*(trough ? x : 1)*(1-Math.pow(x,n))/(1-x);
          steps.push(m(`e^(−kₑτ) = e^(−${nk(k)} × ${p.tau}) = ${n3(x)}`),
            m(trough ? `Trough = (${Sd}/V)·e^(−kₑτ)·(1 − e^(−n·kₑτ)) / (1 − e^(−kₑτ)) = ${n2(D/V)} × ${n3(x)} × (1 − ${n3(x)}^${n}) / (1 − ${n3(x)}) = ${n2(value)} ${cu}`
                     : `Peak = (${Sd}/V)·(1 − e^(−n·kₑτ)) / (1 − e^(−kₑτ)) = ${n2(D/V)} × (1 − ${n3(x)}^${n}) / (1 − ${n3(x)}) = ${n2(value)} ${cu}`));
        } else {
          const ev=doseEvents(p), t0=(n-1)*p.tau;
          if(trough) value=conc(p, n*p.tau, ev);
          else { value=0; for(let i=0;i<=400;i++){ const c=conc(p, t0+p.tau*i/400, ev); if(c>value) value=c; } }
          steps.push(t(`${p.route==="iv" ? "With a loading or missed dose" : oral ? "For oral doses" : "For infusions"} the sum has no short closed form, so it's added up dose by dose${trough ? "" : " and the last interval searched for its highest point"}: ${n2(value)} ${cu}.`));
        }
        if(trough) steps.push(t(`Given forever, the trough would settle at ${n2(ss)} ${cu}; this regimen has reached ${nf(Math.min(100,100*value/ss),0)}% of it.`));
        return {title, value, steps};
      }
      case "ttr": return {title:"Time in window", value:100*ws.tIn/ws.T, steps:[
        m(`${n1(ws.tIn)} h of ${nf(ws.T,2)} h between MEC (${nf(view.mec,2)}) and MTC (${nf(view.mtc,2)} ${cu}) = ${nf(100*ws.tIn/ws.T,0)}%`),
        t(`It's measured by sampling the curve 600 times across the window: once doses overlap, the crossing times have no simple formula.`)]};
      case "peakWin": case "tpeakWin": return {title:key==="peakWin" ? "Peak in the window" : "Time of the peak", value:key==="peakWin" ? ws.cmax : ws.tmax, steps:[
        m(`Highest point in 0–${nf(ws.T,2)} h: ${n2(ws.cmax)} ${cu} at ${n1(ws.tmax)} h`),
        t(`Doses at their own times, amounts and routes have no single formula: the curves of all the doses are added up and the total searched for its highest point.`)]};
      case "given": { const g=p.events.filter(e=>e.status==="given").length;
        return {title:"Doses given", value:g, steps:[t(`${g} of the ${p.events.length} doses in the schedule are marked given. A missed dose adds nothing to the curve.`)]}; }
      case "total": { const g=p.events.filter(e=>e.status==="given"), tot=g.reduce((s,e)=>s+e.mg,0), shown=g.slice(0,8).map(e=>nf(e.mg,1));
        return {title:"Total given", value:tot, steps:[m(`${shown.join(" + ")}${g.length>8 ? ` + … (${g.length} doses)` : ""} = ${nf(tot,1)} ${U.dose}`)]}; }
      case "aucWin": { const g=p.events.filter(e=>e.status==="given"), inf=Sf*g.reduce((s,e)=>s+(e.route==="oral" ? p.F : 1)*e.mg,0)/CL;
        return {title:`Exposure in the window (AUC 0–${nf(ws.T,2)} h)`, value:ws.auc, steps:[
          m(`Area under the curve from 0 to ${nf(ws.T,2)} h = ${n1(ws.auc)} ${U.auc}`),
          t(`It's added up in 600 slices (trapezoids). Out to infinity it would be Σ(F·${Sf===1 ? "" : "S·"}dose) / CL = ${n1(inf)} ${U.auc}, with F for oral doses and 1 for IV doses.`)]}; }
    }
    return null;
  }

  /* ================= FIT THE DATA ================= */
  // A dose was given and the concentration measured several times, with a little measurement noise. The
  // student moves the half-life and volume until the model runs through the points. The data come from settings
  // on the sliders' own steps, so an exact match is always within reach, and from half-lives of 6–16 h, where one
  // 0.5 h step is small next to the tolerance. For an oral dose F and kₐ are given: with points like these, kₐ is
  // barely pinned down by the data, and leaving it free makes the fit a search in three tangled directions.
  const FIT_KINDS=[{id:"iv", title:"IV bolus", free:["thalf","V"]}, {id:"oral", title:"Oral dose", free:["thalf","V"]}];
  const FIT_NOISE=0.05;   // measurement scatter: log-normal, about ±5%
  const gaussian=rnd=>{ const u=1-rnd(), v=rnd(); return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v); };
  const toStep=(v,st)=> +(Math.round(v/st)*st).toFixed(4);
  function makeFit(o){
    o=o||{};
    const kind=FIT_KINDS.find(k=>k.id===o.kind) || FIT_KINDS[0];
    const seed=o.seed===undefined ? Math.floor(Math.random()*4294967296) : o.seed>>>0;
    const rnd=seededRandom(seed), d=drawFrom(rnd);
    const thalf=d(6,16,0.5), V=d(15,80,1), D=d(200,1000,100), k=Math.LN2/thalf;
    const truth={route:kind.id, dosing:"single", D, thalf, V};
    let times;
    if(kind.id==="oral"){
      truth.F=d(0.6,1,0.05);
      truth.ka=until(()=>d(0.3,2.5,0.05), ka=> ka>=3*k);   // absorption clearly faster than elimination
      const tm=Math.log(truth.ka/k)/(truth.ka-k);
      times=[0.35*tm, 0.75*tm, 1.3*tm, tm+0.6*thalf, tm+1.3*thalf, tm+2.2*thalf, tm+3.2*thalf];
    } else times=[0.1,0.35,0.7,1.2,1.8,2.6,3.5].map(f=>f*thalf);
    times=[...new Set(times.map(t=> Math.max(0.25, toStep(t,0.25))))].sort((a,b)=>a-b);
    const p=scenario(truth);
    const obs=times.map(t=>({t, c:sig3(conc(p,t)*Math.exp(FIT_NOISE*gaussian(rnd)))}));
    // the sliders start well away from the answer
    const start={thalf:thalf>=11 ? 4 : 16, V:V>=45 ? 20 : 70};
    return {kind:kind.id, seed, truth, obs, start, free:kind.free.slice(),
      view:Object.assign({}, VIEW_DEFAULTS, {duration:evenUp(times[times.length-1]+thalf)})};
  }
  const sig3=v=> +v.toPrecision(3);
  // Links to one practice problem (#p=kind.seed) or one fit-the-data set (#fit=iv.seed): the seed rebuilds
  // exactly the same numbers, so a class can work the same problem. Scenario links (#v=…) are separate.
  const encodeTaskLink=t=> t.type==="fit" ? `fit=${t.kind}.${t.seed>>>0}` : t.type==="window" ? `win=${t.kind}.${t.seed>>>0}`
    : t.type==="worksheet" ? `ws=${t.topic||"all"}.${t.count}.${t.seed>>>0}` : `p=${t.id}.${t.seed>>>0}`;
  function decodeTaskLink(hash){
    const h=String(hash||"").trim(), w=/^#?ws=([a-z]{1,12})\.(\d{1,2})\.(\d{1,10})$/.exec(h);
    if(w){
      const topic=w[1]==="all" ? "" : w[1], count=Number(w[2]), seed=Number(w[3]);
      if((topic && !PRACTICE_TOPICS.some(t=>t.id===topic)) || !WORKSHEET_SIZES.includes(count) || seed>4294967295) return null;
      return {type:"worksheet", topic, count, seed};
    }
    const m=/^#?(p|fit|win)=([a-z0-9]{1,12})\.(\d{1,10})$/i.exec(h);
    if(!m) return null;
    const seed=Number(m[3]);
    if(!Number.isInteger(seed) || seed>4294967295) return null;
    if(m[1]==="p") return PRACTICE.some(g=>g.id===m[2]) ? {type:"problem", id:m[2], seed} : null;
    if(m[1]==="win") return WINDOW_KINDS.some(k=>k.id===m[2]) ? {type:"window", kind:m[2], seed} : null;
    return FIT_KINDS.some(k=>k.id===m[2]) ? {type:"fit", kind:m[2], seed} : null;
  }
  // How far the model is from the measurements: the root-mean-square of the log ratios, in %.
  function fitError(p, obs){
    const ev=doseEvents(p);
    const s=obs.reduce((a,o)=>{ const c=Math.max(conc(p,o.t,ev),1e-12), r=Math.log(c/o.c); return a+r*r; },0);
    return 100*Math.sqrt(s/obs.length);
  }
  // The scenario the data were made from, and the one the student starts with.
  const fitScenario=(f, over)=> normalizeScenario(scenario(Object.assign({}, f.truth, over||{})));
  // A fit counts when it's within 4 percentage points of the error the data's own settings give (that error is
  // the measurement scatter). The dose, route, F, kₐ and physiology have to stay as the data were collected.
  function fitStatus(f, p){
    const floor=fitError(fitScenario(f), f.obs), target=floor+4, err=fitError(p, f.obs);
    const fixed=["route","dosing","D"].concat(f.kind==="oral" ? ["F","ka"] : []);
    let mismatch=null;
    if(fixed.some(k=> p[k]!==f.truth[k]) || p.wt!==DEFAULTS.wt || p.clFn!==DEFAULTS.clFn) mismatch="setup";
    return {err, floor, target, good:!mismatch && err<=target, mismatch};
  }
  // Estimates straight from the data, the way they're made by hand: the log-linear fall gives kₑ (from its
  // slope) and, for an IV bolus, C₀ (where it meets t = 0) and so V = D / C₀. For an oral dose the last three
  // points give kₑ, the area under the points (plus the tail, C_last / kₑ) gives CL = F·D / AUC, and V = CL / kₑ.
  function fitEstimate(f){
    const line=pts=>{   // least-squares line through (t, ln c)
      const n=pts.length, mt=pts.reduce((a,o)=>a+o.t,0)/n, ml=pts.reduce((a,o)=>a+Math.log(o.c),0)/n;
      let sxy=0, sxx=0; pts.forEach(o=>{ sxy+=(o.t-mt)*(Math.log(o.c)-ml); sxx+=(o.t-mt)*(o.t-mt); });
      const b=sxy/sxx; return {k:-b, lnC0:ml-b*mt};
    };
    const D=f.truth.D;
    if(f.kind==="iv"){
      const {k,lnC0}=line(f.obs), C0=Math.exp(lnC0);
      return {k, thalf:Math.LN2/k, C0, V:D/C0};
    }
    const {k}=line(f.obs.slice(-3)), pts=[{t:0,c:0}].concat(f.obs);
    let auc=0; for(let i=1;i<pts.length;i++) auc+=(pts[i].t-pts[i-1].t)*(pts[i].c+pts[i-1].c)/2;
    const last=f.obs[f.obs.length-1], aucInf=auc+last.c/k, CL=f.truth.F*D/aucInf;
    return {k, thalf:Math.LN2/k, auc:aucInf, CL, V:CL/k};
  }

  return {VERSION, PK_KEYS, DEFAULTS, CHOICES, RANGES, VIEW_DEFAULTS, VIEW_RANGES, LOCKS, EVENT_LIMITS, scenario,
    cloneScenario, cloneEvents, normalizeEvents, EVENT_ROUTES, routeOf, nextEventTime, duplicateEventTime, MOVE_STEP, snapTime, moveEvent, eventsKey, doseSchedule, inspectAt, extrema, sameSetting, isRelevant, eventsFromBasic, doseTotals,
    keOf, vOf, missedOf, disposition, bolusResp, oralResp, infResp, aucPerMg, singleConc, doseEvents, conc, derived, windowStats, ssConc, ssProfile, infusionOverlap, compareRows, diff,
    PD_KEYS, effectOf, concForEffect, effectStats,
    DRUGS, LESSONS, TEMPLATES, LESSON_GROUPS, lessonStats, lessonCheck, lessonScenario, challengeMet,
    DEFAULT_NAMES, newComparison, cmpApply, cmpCopy, cmpSwap, cmpSetLock, cmpReset, lockHolds, normalizeScenario,
    encodeScenario, decodeScenario, encodeView, decodeView, encodeLink, decodeLink, cleanName,
    LIBRARY_FORMAT, LIBRARY_VERSION, LIBRARY_LIMITS, emptyLibrary, libraryItem, validItem, parseLibrary, mergeLibrary, exportLibrary,
    PRACTICE_TOPICS, PRACTICE, seededRandom, makeProblem, practiceScenario, practiceCorrect, WORKSHEET_SIZES, makeWorksheet,
    FIT_KINDS, FIT_NOISE, makeFit, fitError, fitScenario, fitStatus, fitEstimate, encodeTaskLink, decodeTaskLink,
    READOUT_KEYS, metricMath, WINDOW_KINDS, makeWindowTask, windowScenario, windowStatus, ssPeakTrough, GLOSSARY,
    PROGRESS_FORMAT, emptyProgress, parseProgress, recordLesson, recordPractice, recordTask, progressSummary,
    crclCG, cmToIn, ibwDevine, adjBW, CRCL_REF, renalFactor, patientOf, clFactor, UNITS, unitsOf, convertUnits, saltOf,
    SOURCES, UNVERIFIED, drugScenario};
});
