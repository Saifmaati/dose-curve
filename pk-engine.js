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
  // that can hold it, so links that older pages understand stay exactly as they were. 9 adds the unbound fraction
  // fu, the MIC and doses above 2,000 mg; 10 the indirect response models; 11 hemodialysis sessions.
  const VERSION=12;

  /* ================= SCENARIO MODEL ================= */
  // A scenario is a flat object of these keys. The time window, thresholds and chart settings are
  // view settings, shared by the two scenarios in a comparison.
  // dosing "custom" uses `events` instead of D/τ/n/load/missed; the other two ignore `events`.
  const PK_KEYS=["route","dosing","D","F","ka","thalf","V","tinf","tau","nDoses","loadMult","missed","wt","clFn","events",
    "e0","emax","ec50","hill", "pm","age","sex","ht","scr","alb","wtm","fe","S","unit", "kin","vmax","km", "cmt","k12","k21", "teq", "hep","qh","fub","clint","fabs", "lv", "fu", "idr","tout","imax","smax", "hd","hdcl","hdstart","hddur","hdevery"];
  // Pharmacodynamic settings: the drug's concentration–effect relationship (sigmoid Emax model), and teq, the
  // effect site's equilibration half-life (0 = the effect follows plasma directly). idr 1–4 replaces the direct effect
  // with an indirect response (pk-idr.js): the drug inhibits or stimulates the production or loss of a response whose
  // turnover half-life is tout, by at most imax (inhibition, ≤ 1) or smax (stimulation), with EC50 and the Hill slope.
  const PD_KEYS=["e0","emax","ec50","hill","teq","idr","tout","imax","smax"];
  // The patient (pm = patient mode): "simple" scales clearance by the organ-function slider (clFn); "clinical"
  // estimates creatinine clearance by Cockcroft–Gault from age, sex, weight and serum creatinine (mg/dL), and
  // scales the renally cleared fraction fe of clearance by it. ht is height in cm, alb albumin in g/dL, and wtm
  // the weight Cockcroft–Gault uses (actual, ideal or adjusted body weight). S is the salt factor: the amount
  // of active drug per unit of dose (lithium carbonate: mEq of lithium per mg). unit names the unit system.
  const DEFAULTS=Object.freeze({route:"oral",dosing:"single",D:500,F:0.9,ka:1.2,thalf:4,V:35,tinf:1,tau:8,nDoses:6,loadMult:1,missed:1,wt:70,clFn:100,
    events:Object.freeze([]), e0:0, emax:100, ec50:4, hill:1,
    pm:"simple", age:40, sex:"M", ht:175, scr:0.8, alb:4, wtm:"actual", fe:1, S:1, unit:"mg",
    kin:"linear", vmax:7, km:4, cmt:1, k12:0.5, k21:0.5, teq:0,
    hep:0, qh:90, fub:0.5, clint:20, fabs:1, lv:Object.freeze([]), fu:1, idr:0, tout:12, imax:1, smax:4,
    hd:0, hdcl:5, hdstart:20, hddur:4, hdevery:48});
  const CHOICES={route:["oral","iv","inf"],dosing:["single","repeated","custom"],loadMult:[1,1.5,2],
    pm:["simple","clinical"],sex:["M","F"],wtm:["actual","ibw","adj"],unit:["mg","mcg","meq"],kin:["linear","mm"],cmt:[1,2],hep:[0,1],idr:[0,1,2,3,4],hd:[0,1]};
  // Numeric limits, shared with the sliders. missed = 1 means no dose is missed.
  const RANGES={D:[25,4000],F:[0.1,1],ka:[0.1,3],tinf:[0.25,96],thalf:[0.5,72],V:[5,600],tau:[2,24],
    nDoses:[2,20],missed:[1,19],wt:[40,200],clFn:[25,150],e0:[0,50],emax:[5,100],ec50:[0.1,100],hill:[0.5,5],
    age:[18,100],ht:[120,220],scr:[0.2,15],alb:[1,6],fe:[0,1],S:[0.001,1],vmax:[1,20],km:[0.5,30],k12:[0.05,5],k21:[0.05,5],teq:[0,12],
    qh:[20,200],fub:[0.01,1],clint:[0.5,5000],fabs:[0.1,1],fu:[0.01,1],tout:[0.25,240],imax:[0.05,1],smax:[0.1,20],
    hdcl:[0.5,20],hdstart:[0,336],hddur:[1,8],hdevery:[12,168]};
  const INTEGER_KEYS=["nDoses","missed","age","ht"];
  // Settings a v4 page can't hold: anything clinical, or a value beyond its narrower ranges.
  const V5_KEYS=["pm","age","sex","ht","scr","alb","wtm","fe","S","unit","kin","vmax","km","cmt","k12","k21"];
  const V4_MAX={thalf:24, V:120, wt:120};
  // Settings a v5 page can't hold: the effect-site delay.
  const V6_KEYS=["teq"];
  // Settings a v6 page can't hold: clearance from the liver model.
  const V7_KEYS=["hep","qh","fub","clint","fabs"];
  // A v7 page can't hold measured levels (lv), which a v8 link carries.
  // A v8 page can't hold the unbound fraction fu (in plasma: the antimicrobial indices use it), the MIC, or a dose
  // above 2,000 mg, which it would clamp; links older than v9 are still read with that clamp.
  const V9_KEYS=["fu"];
  // A v9 page can't hold an indirect response.
  const V10_KEYS=["idr","tout","imax","smax"];
  // A v10 page can't hold hemodialysis sessions.
  const V11_KEYS=["hd","hdcl","hdstart","hddur","hdevery"];
  const V8_MAX={D:2000};
  // pd shows the effect charts; etgt is the target effect (% of the largest possible response).
  // Population mode (pop): n virtual patients (popn), CVs on clearance and volume in % (pcl, pv), the seed that
  // makes them reproducible (pseed), and an optional AUC24 target (plo–phi; 0 = none). mic is the organism's MIC in
  // the concentration unit (0 = none), shared by A and B like the window.
  const VIEW_DEFAULTS={duration:24,mec:2,mtc:12,scale:"lin",zoom:"full",pd:false,etgt:50,
    pop:false,popn:200,pcl:30,pv:20,pseed:1,plo:0,phi:0,mic:0};
  const VIEW_RANGES={duration:[6,336],mec:[0,10000],mtc:[0,10000],etgt:[1,99],mic:[0,10000],
    popn:[50,1000],pcl:[0,100],pv:[0,100],pseed:[1,4294967295],plo:[0,100000],phi:[0,100000]};
  const POP_KEYS=["popn","pcl","pv","pseed","plo","phi"];
  // Settings that "Vary only" can hold apart while every other setting is shared by A and B.
  const LOCKS=[["D","Dose"],["tau","Dosing interval"],["loadMult","Loading dose"],["missed","Missed dose"],["route","Route"],
    ["clFn","Organ function"],["thalf","Half-life"],["V","Volume"],["F","Bioavailability"],["ka","Absorption rate"],
    ["ec50","EC50"],["emax","Emax"],["hill","Hill slope"],["teq","Effect-site delay"],["tout","Response turnover"],["clint","Intrinsic clearance"],["qh","Liver blood flow"],["fub","Unbound fraction"],["scr","Serum creatinine"],["age","Age"]];

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

  /* ---------- measured levels ---------- */
  // A level is {n, dt, c}: the concentration c (in the scenario's concentration unit) measured dt hours after the
  // start of the nth dose given. Tying each level to a dose keeps it on the schedule when the regimen is edited.
  const LEVEL_LIMITS={max:8, n:[1,40], dt:[0,336], c:[0,100000]};
  const cloneLevels=list=>(list||[]).map(l=>({n:l.n, dt:l.dt, c:l.c}));
  const levelsKey=list=>(list||[]).map(l=>`${l.n}@${l.dt}=${l.c}`).join(";");
  // Valid levels only (whole dose numbers, finite values in range), sorted by dose and time, at most LEVEL_LIMITS.max.
  function normalizeLevels(list){
    const ok=(list||[]).filter(l=> l && [l.n,l.dt,l.c].every(v=>typeof v==="number" && isFinite(v)))
      .map(l=>({n:Math.round(clamp(l.n,LEVEL_LIMITS.n)), dt:clamp(l.dt,LEVEL_LIMITS.dt), c:clamp(l.c,LEVEL_LIMITS.c)}));
    return ok.sort((a,b)=> a.n-b.n || a.dt-b.dt).slice(0,LEVEL_LIMITS.max);
  }
  function decodeLevels(raw){
    return normalizeLevels(String(raw).split(";").slice(0,LEVEL_LIMITS.max*4).map(tok=>{
      const m=/^(\d{1,2})@(\d+(?:\.\d+)?)=(\d+(?:\.\d+)?)$/.exec(tok);
      return m ? {n:+m[1], dt:+m[2], c:+m[3]} : null;
    }));
  }
  const cloneScenario=p=>Object.assign({},p,{events:cloneEvents(p.events), lv:cloneLevels(p.lv)});
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
    if(hepOn(q)){ q.thalf=Math.LN2*q.V/wellStirred(q).CL; q.F=fOf(q); }   // shown as the liver model gives them
    q.events=normalizeEvents(q.events, q);
    q.lv=normalizeLevels(q.lv);
    return q;
  }
  // Whether a setting means anything for a scenario (F only orally, τ only for a regular regimen, …).
  function isRelevant(k,s){
    const oral=s.dosing==="custom" ? s.events.some(e=>e.route==="oral") : s.route==="oral";
    if(k==="F") return oral && !hepOn(s);
    if(k==="ka") return oral;
    if(k==="hep") return s.kin!=="mm" && s.pm!=="clinical";
    if(k==="qh"||k==="fub"||k==="clint") return hepOn(s);
    if(k==="fabs") return oral && hepOn(s);
    if(k==="tinf") return s.dosing!=="custom" && s.route==="inf";   // a custom infusion has its own duration
    if(k==="tau"||k==="nDoses"||k==="loadMult"||k==="missed") return s.dosing==="repeated";
    if(k==="D") return s.dosing!=="custom";
    if(k==="events") return s.dosing==="custom";
    if(k==="lv") return s.pm==="clinical" && s.kin!=="mm" && s.cmt!==2;
    if(k==="clFn") return s.pm!=="clinical" && !hepOn(s);
    if(k==="thalf") return s.kin!=="mm" && !hepOn(s);
    if(k==="vmax"||k==="km") return s.kin==="mm";
    if(k==="cmt") return s.kin!=="mm";
    if(k==="k12"||k==="k21") return s.kin!=="mm" && s.cmt===2;
    if(k==="teq") return s.kin!=="mm" && !(s.idr>0) && !hdOn(s);
    if(k==="hd") return s.kin!=="mm";
    if(k==="hdcl"||k==="hdstart"||k==="hddur"||k==="hdevery") return hdOn(s);
    if(k==="e0"||k==="emax") return !(s.idr>0);
    if(k==="tout") return s.idr>0;
    if(k==="imax") return s.idr===1 || s.idr===2;
    if(k==="smax") return s.idr===3 || s.idr===4;
    if(["age","sex","ht","scr","alb","wtm","fe"].includes(k)) return s.pm==="clinical";
    return true;
  }
  // Equality that understands schedules (plain === would compare array identity).
  const sameSetting=(k,a,b)=> k==="events" ? eventsKey(a.events)===eventsKey(b.events) : k==="lv" ? levelsKey(a.lv)===levelsKey(b.lv) : a[k]===b[k];

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
  const clFactor=p=> hepOn(p) ? 1 : p.pm==="clinical" ? patientOf(p).factor : p.clFn/100;

  /* ================= LIVER (WELL-STIRRED MODEL) ================= */
  // With hep on (first-order kinetics, simple patient), clearance comes from the liver instead of a half-life:
  // blood flow Q, the unbound fraction in blood fu and the intrinsic clearance CLint (all for 70 kg) give the
  // extraction ratio E = fu·CLint / (Q + fu·CLint), hepatic clearance CL = Q·E, and the fraction of an oral dose
  // that escapes the liver on its first pass, 1 − E. Oral F is the fraction absorbed times 1 − E. Blood and plasma
  // concentrations are taken as equal. Clearance and volume both scale with weight, so the half-life doesn't.
  const hepOn=p=> p.hep===1 && p.kin!=="mm" && p.pm!=="clinical";
  // Hemodialysis sessions (pk-hd.js) apply to first-order scenarios, with one or (since 2.7) two compartments.
  const hdOn=p=> p.hd===1 && p.kin!=="mm";   // with one or (since links v12) two compartments
  function wellStirred(p){
    const fc=p.fub*p.clint, E=fc/(p.qh+fc);
    return {E, CL:p.qh*E, FH:1-E, fcl:fc};
  }
  // Oral bioavailability: the liver model's fabs·(1 − E), or the scenario's own F.
  const fOf=p=> hepOn(p) ? p.fabs*wellStirred(p).FH : p.F;

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
  // concentration, and the EC50 (and Vmax and Km), scale by the ratio of the two units; the curves are otherwise identical.
  function convertUnits(p, unit){
    const from=unitsOf(p), to=UNITS[unit] || UNITS.mg;
    if(from.id===to.id) return cloneScenario(p);
    const r=from.toMgL/to.toMgL;
    // saturable elimination: Vmax (an amount rate) and Km (a concentration) scale with the amounts and levels
    return Object.assign(cloneScenario(p), {unit:to.id, S:(p.S==null ? 1 : p.S)*r, ec50:p.ec50*r, vmax:p.vmax*r, km:p.km*r,
      lv:(p.lv||[]).map(l=>({n:l.n, dt:l.dt, c:l.c*r}))});
  }

  /* ================= PK ENGINE ================= */
  const keOf = p=> hepOn(p) ? wellStirred(p).CL/p.V : (Math.LN2/p.thalf) * clFactor(p);
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
  // Two compartments (cmt 2): the central volume V exchanges with a peripheral one at k12 and k21, and k10 =
  // kₑ is elimination from the centre (so CL = k10·V still). A bolus then decays as A·e^(−αt) + B·e^(−βt),
  // α and β the roots of s² − (k10 + k12 + k21)s + k10·k21, A = (α − k21) / ((α − β)·V), B = (k21 − β) / ((α − β)·V).
  function disposition(p){
    const k10=keOf(p), V=vOf(p);
    if(p.cmt!==2 || p.kin==="mm") return [{c:1/V, k:k10}];
    const sum=k10+p.k12+p.k21, root=Math.sqrt(sum*sum-4*k10*p.k21), a=(sum+root)/2, b=(sum-root)/2;
    return [{c:(a-p.k21)/((a-b)*V), k:a}, {c:(p.k21-b)/((a-b)*V), k:b}];
  }
  const twoCmt=p=> p.cmt===2 && p.kin!=="mm";
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
    return fOf(p)*mg*oralResp(terms, t, p.ka);
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

  // Superposition of every dose actually given (or, for saturable elimination, the integrated curve).
  function conc(p, t, ev){
    if(p.kin==="mm") return t<0 ? 0 : mmConc(p,t);
    if(hdOn(p)){ const m=hdApi(); if(m) return m.conc(p,t); }   // until the page has loaded it, the curve without sessions
    ev=ev||doseEvents(p);
    const terms=disposition(p);
    let sum=0;
    for(const e of ev) if(t>=e.t) sum+=singleConc(p, t-e.t, e.mg, e, terms);
    return sum;
  }

  // The highest level in [t0, t1]: a grid that includes every dose and infusion end in the span (the kinks
  // where a peak can sit), then a golden-section search between the neighbours of the grid's highest point.
  function peakIn(p, t0, t1, ev, N){
    ev=ev||(p.kin==="mm" ? null : doseEvents(p)); N=N||400;
    // the span is [t0, t1): a bolus at t1 belongs to the next interval, so the grid stops just before it
    const ts=[];
    for(let i=0;i<=N;i++) ts.push(i===N ? t1-1e-9 : t0+(t1-t0)*i/N);
    (ev||doseEvents(p)).forEach(e=>{ [e.t, e.route==="inf" ? e.t+e.dur : null].forEach(t=>{ if(t!==null && t>t0 && t<t1) ts.push(t); }); });
    if(hdOn(p) && hdApi()) hdApi().sessions(p, t1).forEach(s=>{ [s.start, s.end].forEach(t=>{ if(t>t0 && t<t1) ts.push(t); }); });
    ts.sort((a,b)=>a-b);
    const at=t=>conc(p,t,ev||undefined);
    let mx=-1, i0=0;
    ts.forEach((t,i)=>{ const c=at(t); if(c>mx){ mx=c; i0=i; } });
    let tm=ts[i0], lo=ts[Math.max(0,i0-1)], hi=ts[Math.min(ts.length-1,i0+1)];
    for(let k=0;k<50;k++){
      const a=hi-(hi-lo)*0.6180339887, b=lo+(hi-lo)*0.6180339887;
      if(at(a)<at(b)) lo=a; else hi=b;
    }
    const tr=(lo+hi)/2, cr=at(tr);
    if(cr>mx){ mx=cr; tm=tr; }
    return [mx, tm];
  }

  // The readouts are pure in the scenario's settings too, and asked for again by each render: the last 64 are kept the
  // same way as the window statistics (by link, and whether the dialysis model has loaded), each caller getting a copy.
  const dMemo=new Map();
  function derived(p){
    const key=encodeScenario(p)+"|"+p.unit+"|"+(hdOn(p) && hdApi() ? 1 : 0);
    let d=dMemo.get(key);
    if(!d){ d=derivedOf(p); if(dMemo.size>=64) dMemo.delete(dMemo.keys().next().value); dMemo.set(key, d); }
    return Object.assign({}, d);
  }
  function derivedOf(p){
    if(p.kin==="mm") return mmDerived(p);
    const k=keOf(p), V=vOf(p), terms=disposition(p), perMg=aucPerMg(terms);
    // the effective half-life is the slowest (terminal) one
    const d={thalfEff:Math.LN2/Math.min(...terms.map(x=>x.k)), ke:k, CL:1/perMg, V:V, mgkg:p.D/p.wt};
    const Ffac = p.route==="oral" ? fOf(p) : 1;
    d.auc=Ffac*saltOf(p)*p.D*perMg;
    if(p.route==="iv"){ d.tmax=0; d.cmax=p.D*bolusResp(terms,0); }
    else if(p.route==="inf"){
      d.tmax=p.tinf;
      d.cmax=singleConc(p,p.tinf,p.D);
    } else if(twoCmt(p)){   // no closed form for the peak: search the first dose's curve
      let lo=0, hi=Math.max(24, 10/p.ka);
      for(let i=0;i<120;i++){ const m1=lo+(hi-lo)/3, m2=hi-(hi-lo)/3; if(singleConc(p,m1,p.D,null,terms)<singleConc(p,m2,p.D,null,terms)) lo=m1; else hi=m2; }
      d.tmax=(lo+hi)/2; d.cmax=singleConc(p,d.tmax,p.D,null,terms);
    } else {
      const ka=p.ka;
      d.tmax=Math.abs(ka-k)<1e-6 ? 1/k : Math.log(ka/k)/(ka-k);
      d.cmax=singleConc(p,d.tmax,p.D);
    }
    if(twoCmt(p)){ d.Vss=V*(1+p.k12/p.k21); d.alpha=terms[0].k; d.beta=terms[1].k; }
    if(p.dosing==="custom"){
      // a custom schedule has no single dose or regular interval: totals over every dose given
      const given=doseEvents(p);
      d.nGiven=given.length; d.nMissed=p.events.length-given.length;
      d.totalMg=given.reduce((s,e)=>s+e.mg,0);
      d.auc=given.reduce((s,e)=>s+(e.route==="oral" ? fOf(p) : 1)*e.mg,0)*saltOf(p)*perMg;   // each dose by its own route
      d.mgkg=d.totalMg/p.wt;
    }
    if(p.dosing==="repeated"){
      const ev=doseEvents(p);
      // accumulation: the trough at steady state over the first dose's; exactly 1 / (1 − e^(−kₑτ)) with one compartment
      d.Rac=twoCmt(p) ? ssConc(p,p.tau-1e-9)/singleConc(p,p.tau-1e-9,p.D,null,terms) : 1/(1-Math.exp(-k*p.tau));
      d.t90=3.32*d.thalfEff;
      const t0=(p.nDoses-1)*p.tau, t1=p.nDoses*p.tau, [mx,tmx]=peakIn(p,t0,t1,ev);
      d.cmaxSS=mx; d.tmaxSS=tmx; d.cminSS=conc(p,t1,ev);
      // fraction of steady state reached by the final trough: 1 − e^(−kₑ·nτ) with one compartment; with two, the
      // full regimen's trough (no missed or loading dose) over the steady-state one
      d.fSS=twoCmt(p) ? conc(Object.assign({}, p, {missed:0, loadMult:1}), t1-1e-9)/ssConc(p, p.tau-1e-9) : 1-Math.exp(-k*p.nDoses*p.tau);
    }
    // with dialysis: the area is summed segment by segment (pk-hd.js), and nothing settles into a steady state
    if(hdOn(p) && hdApi()){ d.auc=hdApi().course(p).aucInf; if(p.dosing==="repeated"){ d.Rac=null; d.fSS=null; d.t90=null; } }
    return d;
  }

  // Numerical exposure summary over [0, T] against a therapeutic window [mec, mtc]. The curve is sampled on an
  // even 600-step grid plus every dose time and infusion end, so an IV bolus's jump and each kink land on a
  // sample instead of inside a step: the area is summed by trapezoids up to each jump's left limit, and the time
  // in each band is read from where each straight step crosses MEC and MTC. (validation/ checks it against an
  // independent solver to 0.5%.)
  // With site "effect" (and an effect-site delay) the same statistics are taken of the effect-site level, which
  // never jumps.
  // Window statistics are pure in the scenario's settings and the window, and one render asks for the same ones several
  // times (the readouts, What changed, a lesson's checks), as does each render that follows a file arriving: the last
  // 64 are kept, keyed by the scenario's link and the window, and by whether the dialysis model has loaded (until it
  // has, the curve has no sessions). Each caller gets its own copy.
  const wsMemo=new Map();
  function windowStats(p, T, mec, mtc, site){
    const key=encodeScenario(p)+"|"+p.unit+"|"+T+"|"+mec+"|"+mtc+"|"+(site||"")+"|"+(hdOn(p) && hdApi() ? 1 : 0);
    let w=wsMemo.get(key);
    if(!w){ w=windowStatsOf(p, T, mec, mtc, site); if(wsMemo.size>=64) wsMemo.delete(wsMemo.keys().next().value); wsMemo.set(key, w); }
    return Object.assign({}, w);
  }
  function windowStatsOf(p, T, mec, mtc, site){
    const ev=doseEvents(p), N=600, pts=new Set(), jumps=new Set();
    const eff=site==="effect" && keqOf(p)>0, level=eff ? t=>ceConc(p,t,ev) : t=>conc(p,t,ev);
    for(let i=0;i<=N;i++) pts.add(T*i/N);
    let endJump=false;   // a bolus exactly at the window's end adds nothing inside it: the end takes the level just before
    // dialysis sessions start and end with a kink in the curve: grid points too
    if(hdOn(p) && hdApi()) hdApi().sessions(p, T).forEach(s=>{ [s.start, s.end].forEach(t=>{ if(t>0 && t<T) pts.add(t); }); });
    ev.forEach(e=>{
      if(!eff && e.route==="iv" && Math.abs(e.t-T)<1e-9) endJump=true;
      if(e.t>0 && e.t<T){ pts.add(e.t); if(!eff && e.route==="iv") jumps.add(e.t); }
      if(e.route==="inf" && e.t+e.dur>0 && e.t+e.dur<T) pts.add(e.t+e.dur);
    });
    const ts=[...pts].sort((a,b)=>a-b);
    // time in [lo, hi] during a smooth, monotone step from c0 at ta to c1 just before tb: each level the curve
    // crosses inside the step is located by bisection on the curve itself
    const within=(ta,c0,tb,c1,lo,hi)=>{
      if(c0===c1) return c0>=lo && c0<=hi ? tb-ta : 0;
      const up=c1>c0, at=L=>{
        if(up ? L<=c0 : L>=c0) return ta;
        if(up ? L>=c1 : L<=c1) return tb;
        let a=ta, b=tb;
        for(let k=0;k<40;k++){ const m=(a+b)/2; if((level(m)<L)===up) a=m; else b=m; }
        return (a+b)/2;
      };
      return Math.abs(at(hi)-at(lo));
    };
    let t0=ts[0], c0=level(t0), cmax=c0, tmax=t0, im=0, auc=0, tIn=0, tAbove=0;
    for(let i=1;i<ts.length;i++){
      const t=ts[i], atEnd=endJump && i===ts.length-1, cL=jumps.has(t) || atEnd ? level(t-1e-9) : level(t), cR=atEnd ? cL : level(t), dt=t-t0;
      auc+=(c0+4*level(t0+dt/2)+cL)/6*dt;   // Simpson: every step is smooth (doses and infusion ends are grid points)
      tIn+=within(t0,c0,t,cL,mec,mtc);
      tAbove+=within(t0,c0,t,cL,mtc,Infinity)-(c0===cL ? (c0===mtc ? dt : 0) : 0);
      if(cL>cmax){ cmax=cL; tmax=t; im=i; }
      if(cR>cmax+1e-12){ cmax=cR; tmax=t; im=i; }
      t0=t; c0=cR;
    }
    // a smooth peak falls between grid points: golden-section search between the neighbours of the highest one
    // (a jump or a kink there is its own maximum, which the search keeps)
    if(!jumps.has(tmax)){
      let lo=ts[Math.max(0,im-1)], hi=ts[Math.min(ts.length-1,im+1)];
      for(let k=0;k<40;k++){
        const a=hi-(hi-lo)*0.6180339887, b=lo+(hi-lo)*0.6180339887;
        if(level(a)<level(b)) lo=a; else hi=b;
      }
      const t=(lo+hi)/2, c=level(t);
      if(c>cmax){ cmax=c; tmax=t; }
    }
    tAbove=Math.max(0, Math.min(tAbove, T-tIn));
    return {cmax,tmax,auc,tIn,tBelow:Math.max(0,T-tIn-tAbove),tAbove,T};
  }

  // Concentration s hours (0 ≤ s < τ) into a dose interval once a regimen of p.D every p.tau hours has run
  // forever: the sum over every earlier dose, Σⱼ C₁(s + jτ). Each single-dose curve is a sum of exponentials
  // (once an infusion has stopped), so all but the first few terms form geometric series with exact sums.
  function ssConc(p, s){
    if(p.dosing!=="repeated" || hdOn(p)) return null;   // only a regular periodic regimen has a steady state (dialysis breaks it)
    if(p.kin==="mm"){ const m=mmSteady(p); return m.none ? null : m.at(s); }
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
    return fOf(p)*D*c;
  }

  // Peak and trough of every dose interval, plus where an uninterrupted regimen settles.
  // Remembered like the readouts (by link, and whether the dialysis model has loaded); each caller gets its own rows.
  const sMemo=new Map();
  function ssProfile(p){
    if(p.dosing!=="repeated") return null;
    const key=encodeScenario(p)+"|"+p.unit+"|"+(hdOn(p) && hdApi() ? 1 : 0);
    let S=sMemo.get(key);
    if(!S){ S=ssProfileOf(p); if(sMemo.size>=64) sMemo.delete(sMemo.keys().next().value); sMemo.set(key, S); }
    return Object.assign({}, S, {rows:S.rows.map(r=>Object.assign({}, r))}, S.mm ? {mm:Object.assign({}, S.mm)} : {});
  }
  function ssProfileOf(p){
    if(p.dosing!=="repeated") return null;
    if(p.kin==="mm") return mmProfile(p);
    if(hdOn(p)){
      // dialysis sessions don't repeat with the dosing interval, so each dose is read off the curve and there is no
      // steady state to give
      const ev=doseEvents(p), skip=missedOf(p), rows=[];
      for(let i=0;i<p.nDoses;i++) rows.push({n:i+1, peak:peakIn(p, i*p.tau, (i+1)*p.tau, ev, 60)[0], trough:conc(p, (i+1)*p.tau-1e-9, ev), missed:i+1===skip});
      return {rows, ssPeak:null, ssTrough:null, clears:false, swing:null, Rac:null, t90:null, dosesTo90:null, hd:true};
    }
    const ev=doseEvents(p), k=keOf(p), tau=p.tau, S=60, skip=missedOf(p);
    // each interval's peak: a 60-point grid with its dose and infusion ends, refined between samples
    const peakTrough=(q,a,evq)=> [peakIn(q, a, a+tau, evq, S)[0], conc(q,a+tau-1e-9,evq)];
    const rows=[];
    for(let i=0;i<p.nDoses;i++){
      const [peak,trough]=peakTrough(p,i*tau,ev);
      rows.push({n:i+1, peak, trough, missed:i+1===skip});
    }
    // steady state in closed form: sample the interval, plus the exact peak of a bolus (s = 0) or an infusion (its
    // end), and the peak refined between samples
    const cand=[0]; if(p.route==="inf") cand.push(p.tinf%tau);
    let ssPeak=ssPeakTrough(p).peak;
    for(let j=0;j<=S;j++) cand.push(tau*j/S);
    cand.forEach(s=>{ const c=ssConc(p,s); if(c>ssPeak) ssPeak=c; });
    const ssTrough=ssConc(p,tau-1e-9);
    const clears=ssTrough<0.01*ssPeak; // essentially nothing carries over from one dose to the next
    const kT=Math.min(...disposition(p).map(x=>x.k));   // the terminal rate sets how long steady state takes
    return {rows, ssPeak, ssTrough, clears, swing:clears?null:ssPeak/ssTrough,
      Rac:twoCmt(p) ? derived(p).Rac : 1/(1-Math.exp(-k*tau)), t90:3.32*Math.LN2/kT, dosesTo90:Math.ceil(Math.log(10)/(kT*tau))};
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

  /* ================= ANTIMICROBIAL PK/PD INDICES ================= */
  // Scenario p against an MIC (in its concentration unit). fT>MIC is the share of time the unbound level, fu·C, stays
  // above the MIC, with fu, the unbound fraction in plasma, taken as constant (binding that doesn't saturate).
  // Cmax/MIC and AUC24/MIC use the total level, as the vancomycin guideline's AUC24/MIC does; fu times each gives
  // the unbound version. A regular regimen is read at steady state over one interval (the closed-form ssConc, which
  // loading and missed doses don't change), with AUC24 = AUCτ × 24/τ. Any other regimen is read over the chart
  // window [0, T]: the share of the window above the MIC, its peak, and the AUC over the first 24 hours.
  function micStats(p, mic, T){
    if(!(mic>0)) return null;
    const fu=p.fu, thr=mic/fu;   // the total level at which the unbound level equals the MIC
    const pack=(o, auc24)=> Object.assign(o, {fu, mic, thr, auc24, cmaxMic:o.cmax/mic, aucMic:auc24/mic, fcmaxMic:fu*o.cmax/mic, faucMic:fu*auc24/mic});
    if(p.dosing!=="repeated" || hdOn(p) || (p.kin==="mm" && mmSteady(p).none)){
      const w=windowStats(p, T, thr, Infinity);   // time in [thr, ∞) is the time above the MIC
      return pack({ss:false, span:T, tAbove:w.tIn, ft:100*w.tIn/T, cmax:w.cmax}, windowStats(p, 24, thr, Infinity).auc);
    }
    // one steady-state interval on a fine grid plus the infusion's end (a kink); each crossing of thr is found by
    // bisection on the curve, the area by Simpson's rule on each smooth step, and the peak refined between samples
    const tau=p.tau, N=720, lvl=s=> ssConc(p, Math.min(s, tau-1e-9)), pts=new Set();
    for(let i=0;i<=N;i++) pts.add(tau*i/N);
    if(p.route==="inf"){ const e=p.tinf%tau; if(e>0) pts.add(e); }
    const ts=[...pts].sort((a,b)=>a-b), cs=ts.map(lvl);
    const cross=(a,b,up)=>{ for(let k=0;k<60;k++){ const m=(a+b)/2; if((lvl(m)>=thr)===up) b=m; else a=m; } return (a+b)/2; };
    let tAbove=0, auc=0, im=0;
    for(let i=1;i<ts.length;i++){
      const a=ts[i-1], b=ts[i], ca=cs[i-1], cb=cs[i];
      auc+=(ca+4*lvl((a+b)/2)+cb)/6*(b-a);
      if(ca>=thr && cb>=thr) tAbove+=b-a;
      else if(ca<thr && cb>=thr) tAbove+=b-cross(a,b,true);
      else if(ca>=thr && cb<thr) tAbove+=cross(a,b,false)-a;
      if(cb>cs[im]) im=i;
    }
    let cmax=cs[im];
    if(im>0 && im<ts.length-1){
      let lo=ts[im-1], hi=ts[im+1];
      for(let k=0;k<60;k++){ const a=hi-(hi-lo)*0.6180339887, b=lo+(hi-lo)*0.6180339887; if(lvl(a)<lvl(b)) lo=a; else hi=b; }
      cmax=Math.max(cmax, lvl((lo+hi)/2));
    }
    return pack({ss:true, span:tau, tAbove, ft:100*tAbove/tau, cmax, cmin:cs[cs.length-1]}, auc*24/tau);
  }

  /* ================= SATURABLE (MICHAELIS–MENTEN) ELIMINATION ================= */
  // kin "mm": the body eliminates Vmax·C / (Km + C) per hour instead of kₑ·A. vmax is per kg per day (in the
  // dose's amount unit, after S) and km is in the concentration unit; organ function (or the clinical renal
  // factor) scales Vmax. Superposition no longer holds, so the curve is integrated: RK4 on the gut amount
  // (oral doses, absorbed at kₐ) and the body amount, with every dose landing exactly at its time (a bolus
  // adds to the body, an oral dose F·S·D to the gut, an infusion a constant rate while it runs). The solution
  // is kept step by step and read between steps by cubic Hermite interpolation.
  const MM_STEP=0.05;   // h; the tests hold the error under 0.5% against a ten times finer step
  const vmaxOf=p=> p.vmax*p.wt/24*clFactor(p);   // amount per hour for this body
  // Integrates from `state` ({ag, a} at t0) over [t0, T] with the given doses ({t, mg, route, dur}), returning
  // the steps {t0, t1, g0, g1, a0, a1, f0, f1}: gut and body amounts at each end, and dA/dt there.
  function mmIntegrate(p, doses, T, state, h0){
    const V=vOf(p), Vm=vmaxOf(p), Km=p.km, ka=p.ka, S=saltOf(p), F=p.F, t0=state ? state.t : 0;
    const cuts=new Set([t0, T]);
    doses.forEach(e=>{ if(e.t>=t0 && e.t<T) cuts.add(e.t); if(e.route==="inf" && e.t+e.dur>t0 && e.t+e.dur<T) cuts.add(e.t+e.dur); });
    const bps=[...cuts].sort((a,b)=>a-b);
    let ag=state ? state.ag : 0, a=state ? state.a : 0;
    const elim=x=>{ const C=Math.max(0,x)/V; return Vm*C/(Km+C); };
    const steps=[];
    for(let i=0;i<bps.length-1;i++){
      const s0=bps[i], s1=bps[i+1];
      doses.forEach(e=>{ if(e.t===s0){ if(e.route==="iv") a+=S*e.mg; else if(e.route==="oral") ag+=F*S*e.mg; } });
      let R=0;   // infusion input, constant between cuts
      doses.forEach(e=>{ if(e.route==="inf" && e.t<=s0 && s0<e.t+e.dur) R+=S*e.mg/e.dur; });
      const n=Math.max(1,Math.ceil((s1-s0)/(h0||MM_STEP)-1e-9)), h=(s1-s0)/n;
      const da=(g,x)=> ka*g+R-elim(x);
      for(let j=0;j<n;j++){
        const ta=s0+j*h, g0=ag, a0=a, f0=da(g0,a0);
        const k1g=-ka*g0, k1a=f0;
        const k2g=-ka*(g0+h/2*k1g), k2a=da(g0+h/2*k1g, a0+h/2*k1a);
        const k3g=-ka*(g0+h/2*k2g), k3a=da(g0+h/2*k2g, a0+h/2*k2a);
        const k4g=-ka*(g0+h*k3g),   k4a=da(g0+h*k3g, a0+h*k3a);
        ag=g0+h/6*(k1g+2*k2g+2*k3g+k4g); a=a0+h/6*(k1a+2*k2a+2*k3a+k4a);
        steps.push({t0:ta, t1:j===n-1 ? s1 : ta+h, g0, g1:ag, a0, a1:a, f0, f1:da(ag,a)});
      }
    }
    return steps;
  }
  // The body amount at t from a step list (cubic Hermite inside the step that starts at or before t).
  function mmAmount(steps, t){
    let lo=0, hi=steps.length-1;
    if(t<=steps[0].t0) return steps[0].a0;
    while(lo<hi){ const mid=(lo+hi+1)>>1; if(steps[mid].t0<=t) lo=mid; else hi=mid-1; }
    const st=steps[lo], h=st.t1-st.t0, x=Math.min(1,(t-st.t0)/h), x2=x*x, x3=x2*x;
    return (2*x3-3*x2+1)*st.a0+(x3-2*x2+x)*h*st.f0+(-2*x3+3*x2)*st.a1+(x3-x2)*h*st.f1;
  }
  // Solutions are cached per scenario object, and by content for scenarios rebuilt with the same settings.
  const mmByObj=new WeakMap(), mmByKey=new Map();
  function mmSolution(p, t){
    let sol=mmByObj.get(p);
    if(!sol){
      const key=encodeScenario(p);
      sol=mmByKey.get(key);
      if(!sol){ sol={T:0, end:0, steps:null}; mmByKey.set(key,sol); if(mmByKey.size>24) mmByKey.delete(mmByKey.keys().next().value); }
      mmByObj.set(p,sol);
    }
    if(t>sol.T || !sol.steps){
      // extend from where the solution ends (at least doubling it), so reading further never starts over; a
      // dose exactly at the new end lands in the next extension
      const end=Math.max(t, sol.T*2, 48)+MM_STEP, ev=doseEvents(p);
      if(!sol.steps) sol.steps=mmIntegrate(p, ev, end);
      else { const last=sol.steps[sol.steps.length-1]; sol.steps=sol.steps.concat(mmIntegrate(p, ev, end, {t:last.t1, ag:last.g1, a:last.a1})); }
      sol.T=end-MM_STEP;
    }
    return sol;
  }
  const mmConc=(p,t)=> mmAmount(mmSolution(p,t).steps, t)/vOf(p);
  // The average input rate R of a regular regimen (amount per hour), and what saturation predicts for it.
  const mmRate=p=> (p.route==="oral" ? p.F : 1)*saltOf(p)*p.D/p.tau;
  // Css = Km·R / (Vmax − R), defined only while R < Vmax. It is exact for a constant input; with doses the
  // average level swings around it.
  function mmCss(p){
    const R=mmRate(p), Vm=vmaxOf(p);
    return {R, Vmax:Vm, ratio:R/Vm, css: R<Vm ? p.km*R/(Vm-R) : null};
  }
  // Time to reach 90% of Css from zero at a constant input R: integrating dC/dt = (R·Km − (Vmax − R)·C) /
  // (V·(Km + C)) gives t90 = V·Km·(2.303·Vmax − 0.9·R) / (Vmax − R)². It grows with the dose, unlike linear PK.
  function mmT90(p){
    const {R, Vmax, css}=mmCss(p);
    return css===null ? null : vOf(p)*p.km*(Math.LN10*Vmax-0.9*R)/((Vmax-R)*(Vmax-R));
  }
  // Half-life and clearance at a concentration C: t½ = 0.693·V·(Km + C) / Vmax, CL = Vmax / (Km + C).
  const mmHalfAt=(p,C)=> Math.LN2*vOf(p)*(p.km+C)/vmaxOf(p);
  // The regimen given forever: started at the predicted Css (and the gut at its periodic level) and run until
  // successive troughs agree, then kept as one dosing interval. {none: true} when input exceeds Vmax.
  const mmSSCache=new Map();
  function mmSteady(p){
    const key=encodeScenario(p);
    if(mmSSCache.has(key)) return mmSSCache.get(key);
    const m=mmCss(p), out=Object.assign({}, m);
    if(m.css===null){ out.none=true; }
    else {
      const tau=p.tau, V=vOf(p), oral=p.route==="oral", q=Object.assign({},p,{dosing:"repeated", loadMult:1, missed:1});
      const late=Math.ceil((p.route==="inf" ? p.tinf : 0)/tau)+1;   // earlier infusions still running at the start
      // The gut is linear, so its level just before a dose at steady state is exact. The body's pre-dose amount a
      // is periodic when one interval maps it onto itself, Φ(a) = a; Φ rises with slope below 1 whenever a steady
      // state exists, so a secant search (kept to a ≥ 0) finds it in a few one-interval integrations.
      const ag0=oral ? p.F*saltOf(p)*p.D*Math.exp(-p.ka*tau)/(1-Math.exp(-p.ka*tau)) : 0, dose=i=>({t:i*tau, mg:p.D, route:p.route, dur:p.tinf});
      const doses=[]; for(let i=-late;i<=0;i++) if(i===0 || (p.route==="inf" && i*tau+p.tinf>0)) doses.push(dose(i));
      const g=a=>{ const st=mmIntegrate(q, doses, tau, {t:0, ag:ag0, a}); return st[st.length-1].a1-a; };
      let a0=m.css*V, g0=g(a0), a1=Math.max(0, a0+g0), g1=g(a1);
      for(let it=0; it<60 && Math.abs(g1)>1e-11*Math.max(a1,1e-9); it++){
        let a2=g1!==g0 ? a1-g1*(a1-a0)/(g1-g0) : a1+g1;
        if(!(a2>=0) || !isFinite(a2)) a2=Math.max(0, a1+g1);   // a step outside the domain: one plain iteration instead
        a0=a1; g0=g1; a1=a2; g1=g(a1);
      }
      const state={t:0, ag:ag0, a:a1};
      // one interval at steady state, starting at its dose
      const one=mmIntegrate(q, doses, tau+MM_STEP, state);
      out.at=s=> mmAmount(one, Math.min(Math.max(s,0), tau))/V;
      let pk=0, pkT=0; const N=240;
      for(let i=0;i<=N;i++){ const s=tau*i/N, c=out.at(s); if(c>pk){ pk=c; pkT=s; } }
      { // refine between the grid's neighbours (golden section); an infusion's end, a kink, is checked on its own
        let lo=Math.max(0,pkT-tau/N), hi=Math.min(tau,pkT+tau/N);
        for(let k=0;k<50;k++){ const x=hi-(hi-lo)*0.6180339887, y=lo+(hi-lo)*0.6180339887; if(out.at(x)<out.at(y)) lo=x; else hi=y; }
        const c=out.at((lo+hi)/2); if(c>pk){ pk=c; pkT=(lo+hi)/2; }
      }
      if(p.route==="inf"){ const e=Math.min(p.tinf,tau), c=out.at(e); if(c>pk){ pk=c; pkT=e; } }
      out.peak=pk; out.tPeak=pkT; out.trough=out.at(tau-1e-9);
      let sum=0; for(let i=0;i<N;i++) sum+=(out.at(tau*i/N)+out.at(tau*(i+1)/N))/2*tau/N;
      out.avg=sum/tau;
    }
    mmSSCache.set(key,out); if(mmSSCache.size>24) mmSSCache.delete(mmSSCache.keys().next().value);
    return out;
  }
  function mmProfile(p){
    const ev=doseEvents(p), tau=p.tau, skip=missedOf(p), S=60, rows=[];
    for(let i=0;i<p.nDoses;i++){
      const pk=peakIn(p, i*tau, (i+1)*tau, null, S)[0];
      rows.push({n:i+1, peak:pk, trough:conc(p,(i+1)*tau-1e-9,ev), missed:i+1===skip});
    }
    const m=mmSteady(p), t90=mmT90(p);
    return {rows, ssPeak:m.none ? null : m.peak, ssTrough:m.none ? null : m.trough, clears:false,
      swing:m.none ? null : m.peak/m.trough, Rac:null, t90, dosesTo90:t90===null ? null : Math.ceil(t90/tau), mm:m};
  }
  // Exposure over all time for the doses given: the integrated area, run until the level is 0.1% of its peak,
  // plus the tail (where C ≪ Km, elimination is first-order at Vmax / (Km·V)).
  function mmAucInf(p){
    const ev=doseEvents(p);
    if(!ev.length) return 0;
    const lastT=Math.max(...ev.map(e=>e.t+(e.route==="inf" ? e.dur : 0)));
    let T=lastT+24;
    for(let k=0;k<30;k++){
      const sol=mmSolution(p,T), steps=sol.steps;
      let auc=0, cmax=0;
      for(const st of steps){ if(st.t1>T) break; const h=st.t1-st.t0;
        auc+=h*(st.a0+st.a1)/2+h*h*(st.f0-st.f1)/12;   // Hermite-exact area of each step
        cmax=Math.max(cmax,st.a1); }
      const aT=mmAmount(steps,T);
      if(aT<=1e-3*cmax) return (auc+aT*p.km*vOf(p)/vmaxOf(p))/vOf(p);   // tail: amount decays at Vmax / (Km·V)
      T*=2;
    }
    return NaN;
  }
  function mmDerived(p){
    const V=vOf(p), Vm=vmaxOf(p), d={V, mgkg:p.D/p.wt, vmaxH:Vm, km:p.km};
    const peakOf=(t0,t1)=> peakIn(p,t0,t1);
    if(p.dosing==="repeated"){
      const t0=(p.nDoses-1)*p.tau, t1=p.nDoses*p.tau, [mx,tm]=peakOf(t0,t1);
      d.cmaxSS=mx; d.tmaxSS=tm; d.cminSS=conc(p,t1);
      const m=mmSteady(p), t90=mmT90(p);
      d.mm=m; d.css=m.css; d.t90=t90; d.Rac=null;
      d.fSS=m.none ? null : d.cminSS/m.trough;
      d.cAt=m.none ? d.cminSS : m.avg;   // the level the half-life and clearance below are read at
    } else if(p.dosing==="single"){
      const horizon=Math.max(24, 3*mmHalfAt(p,0)), [mx,tm]=peakOf(0,horizon);
      d.cmax=mx; d.tmax=tm; d.cAt=mx;
    }
    if(p.dosing==="custom"){
      const given=doseEvents(p);
      d.nGiven=given.length; d.nMissed=p.events.length-given.length;
      d.totalMg=given.reduce((s,e)=>s+e.mg,0); d.mgkg=d.totalMg/p.wt;
      let mx=0; for(let i=0;i<=400;i++){ const c=conc(p, EVENT_LIMITS.t[1]*i/400); if(c>mx) mx=c; }
      d.cAt=mx;
    }
    d.thalfEff=mmHalfAt(p,d.cAt); d.CL=Vm/(p.km+d.cAt); d.ke=d.CL/V;
    // the all-time exposure needs the curve followed until it has nearly gone: worked out only when asked for
    let auc;
    Object.defineProperty(d, "auc", {enumerable:true, get:()=> auc===undefined ? (auc=mmAucInf(p)) : auc});
    return d;
  }

  // Sheiner–Tozer: a measured total phenytoin level adjusted to what it would be at normal albumin binding,
  // C_adj = C_measured / (0.2 × albumin + 0.1); with end-stage kidney disease the albumin coefficient is 0.1.
  // A tool for reading a measured level, separate from the simulation.
  function sheinerTozer(measured, alb, renal){
    const k=renal ? 0.1 : 0.2;
    return {k, factor:k*alb+0.1, value:measured/(k*alb+0.1)};
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
  // Effect-site delay. Some drugs act somewhere that takes time to equilibrate with plasma, so the effect lags
  // the level. The effect then follows a hypothetical effect compartment that holds a negligible amount of drug,
  // dCe/dt = ke0·(C − Ce), and teq = ln 2 / ke0 is its equilibration half-life. Every plasma curve here is a
  // sum of exponentials after each dose, so Ce has a closed form too: each term e^(−λt) reaches the effect site
  // as ke0·∫₀ᵗ e^(−ke0(t−s))·e^(−λs) ds. Saturable elimination has no such form and keeps the direct link.
  const keqOf=p=> p.teq>0 && p.kin!=="mm" && !hdOn(p) ? Math.LN2/p.teq : 0;
  // ke0·∫₀ᵗ e^(−ke0(t−s))·e^(−λs) ds = ke0·(e^(−λt) − e^(−ke0·t)) / (ke0 − λ), with the difference written
  // through expm1 so that close rates lose no precision (and ke0·t·e^(−ke0·t) when they are equal)
  function linkExp(k0, lam, t){
    const d=k0-lam;
    if(d===0) return k0*t*Math.exp(-k0*t);
    return k0*(d>0 ? -Math.exp(-lam*t)*Math.expm1(-d*t) : Math.exp(-k0*t)*Math.expm1(d*t))/d;
  }
  // ke0·∫₀ᵗ e^(−ke0(t−s))·s·e^(−λs) ds, for an oral dose absorbed at the disposition rate (kₐ = k), whose
  // plasma curve is kₐ·t·e^(−kₐt): a series while (ke0 − λ)·t is small, the closed form otherwise
  function linkTExp(k0, lam, t){
    const d=k0-lam, x=d*t;
    if(Math.abs(x)<0.5){
      let s=0, term=t*t;   // ∫₀ᵗ s·e^(ds) ds = Σ dⁿ·t^(n+2) / (n!·(n+2))
      for(let n=0;n<30;n++){ s+=term/(n+2); term*=x/(n+1); }
      return k0*Math.exp(-k0*t)*s;
    }
    return k0*(Math.exp(-lam*t)*(x-1)+Math.exp(-k0*t))/(d*d);
  }
  // The effect-site level per mg of dose (before F and S), t hours after one dose given by route (as singleConc).
  function ceResp(p, terms, k0, t, e){
    if(t<=0) return 0;
    const route=(e && e.route) || p.route;
    let s=0;
    if(route==="iv"){ for(const x of terms) s+=x.c*linkExp(k0,x.k,t); return s; }
    if(route==="inf"){
      // an infusion is a step up at its start and a step down at its end; a step's plasma curve is Σ (c/k)·(1 − e^(−kt))
      const Ti=(e && e.dur) || p.tinf, step=u=>{ let g=0; if(u>0) for(const x of terms) g+=x.c/x.k*(linkExp(k0,0,u)-linkExp(k0,x.k,u)); return g; };
      return (step(t)-step(t-Ti))/Ti;
    }
    const ka=p.ka;
    for(const x of terms) s+= Math.abs(ka-x.k)<SAME_RATE ? x.c*ka*linkTExp(k0,ka,t) : x.c*ka/(ka-x.k)*(linkExp(k0,x.k,t)-linkExp(k0,ka,t));
    return fOf(p)*s;
  }
  // The effect-site level at time t: plasma itself when there is no delay.
  function ceConc(p, t, ev){
    const k0=keqOf(p);
    if(!k0) return conc(p,t,ev);
    ev=ev||doseEvents(p);
    const terms=disposition(p), S=saltOf(p);
    let sum=0;
    for(const e of ev) if(t>e.t) sum+=e.mg*S*ceResp(p, terms, k0, t-e.t, e);
    return sum;
  }

  // Sigmoid Emax model, driven by plasma or, with a delay, by the effect site:
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
  // Effect over [0, T] against a target effect. Effect rises with the level driving it (plasma, or the effect
  // site), so the peak effect comes with that level's peak, and "at or above target" means "level at or above
  // ct": the window statistics measure that exactly (jumps at boluses, crossings found by bisection). onset is
  // when the target is first reached (null if never).
  function effectStats(p, T, target){
    const w=windowStats(p,T,0,Infinity,"effect"), ct=concForEffect(p,target);
    if(ct===null) return {peak:effectOf(p,w.cmax), tPeak:w.tmax, ct, tAbove:0, onset:null};
    const tAbove=windowStats(p,T,ct,Infinity,"effect").tIn, ev=doseEvents(p), N=600, level=t=>ceConc(p,t,ev);
    const ts=[...new Set(Array.from({length:N+1},(_,i)=>T*i/N).concat(ev.filter(e=>e.t>0 && e.t<T).map(e=>e.t)))].sort((a,b)=>a-b);
    let onset=level(0)>=ct ? 0 : null;
    for(let i=1;i<ts.length && onset===null;i++){
      const t=ts[i], cL=level(t-1e-9);   // just before t: a bolus at t is a jump, not a crossing
      if(cL>=ct){ let lo=ts[i-1], hi=t; for(let k=0;k<50;k++){ const m=(lo+hi)/2; if(level(m)>=ct) hi=m; else lo=m; } onset=hi; }
      else if(level(t)>=ct) onset=t;
    }
    return {peak:effectOf(p,w.cmax), tPeak:w.tmax, ct, tAbove, onset};
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
      get aucInf(){ return d().auc; }, get cl(){ return d().CL; }, get trough(){ return rep ? d().cminSS : null; }, get peakSS(){ return rep ? d().cmaxSS : null; },
      get avgSS(){ return !rep || hdOn(p) ? null : p.kin==="mm" ? (d().mm.none ? null : d().mm.avg) : d().auc/p.tau; },
      get css(){ return rep && p.kin==="mm" ? d().css : null; }, get swing(){ const s=ss(); return s ? s.swing : null; }, get rac(){ const s=ss(); return s ? s.Rac : null; },
      get top(){ return p.e0+p.emax; }, get epeak(){ return once("ep",()=>effectStats(p,T,view.etgt).peak); },
      effAbove:tg=> once("ea"+tg,()=>effectStats(p,T,tg).tAbove),
      get mic(){ return once("mic",()=>micStats(p,view.mic,T)); },
      get resp(){ return once("resp",()=> p.idr>0 && idrApi() ? idrApi().stats(p,T) : null); },
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
    if(!L.challenge) return false;   // its texts haven't loaded yet
    return !!L.challenge.goal({view, now:lessonStats(normalizeScenario(p),view), base:lessonStats(normalizeScenario(scenario(L.base)),view)});
  }

  /* ================= COMPARISON ================= */
  // Metrics for scenario a vs scenario b over the same window. kind says how the change is expressed:
  // pct = % change, ratio = % change of a ratio, pp = percentage points, abs = hours, count = doses.
  // A null value means the metric doesn't apply (shown as "—").
  // With pd (a target effect, %), the effect rows are added too, and with an MIC (in a's units), the antimicrobial
  // indices (each scenario at steady state when it is a regular regimen, else over the window).
  // Both scenarios are read in a's units (the page converts b first when they differ).
  function compareRows(a, b, T, mec, mtc, pd, mic){
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
    const R=(a.idr>0 || b.idr>0) && idrApi();
    if(pd!=null && R){
      const st=p=> p.idr>0 ? R.stats(p,T) : null, ra=st(a), rb=st(b);
      rows.push(
        {key:"rchange", name:"Largest change in response", unit:"% of baseline", a:ra && ra.change, b:rb && rb.change, kind:"pp", dp:1},
        {key:"rtime", name:"Time of largest change", unit:"h", a:ra && ra.tExt, b:rb && rb.tExt, kind:"abs", dp:1});
    } else if(pd!=null){
      const ea=effectStats(a,T,pd), eb=effectStats(b,T,pd);
      rows.push(
        {key:"epeak", name:"Peak effect", unit:"% of max", a:ea.peak, b:eb.peak, kind:"pp", dp:0},
        {key:"eabove", name:`Time at or above ${pd}% effect`, unit:"h", a:ea.tAbove, b:eb.tAbove, kind:"abs", dp:1},
        {key:"eonset", name:`Reaches ${pd}% effect at`, unit:"h", a:ea.onset, b:eb.onset, kind:"abs", dp:1});
    }
    if(mic>0){
      const ma=micStats(a,mic,T), mb=micStats(b,mic,T);
      rows.push(
        {key:"ftmic", name:"fT>MIC", unit:ma.ss && mb.ss ? "% of interval" : "%", a:ma.ft, b:mb.ft, kind:"pp", dp:1},
        {key:"cmaxmic", name:"Cmax/MIC", unit:"×", a:ma.cmaxMic, b:mb.cmaxMic, kind:"ratio", dp:1},
        {key:"aucmic", name:"AUC24/MIC", unit:"h", a:ma.aucMic, b:mb.aucMic, kind:"ratio", dp:0});
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
  // Where library values come from (SOURCES) and each drug's notes (refs) live in pk-sources.js, loaded with the
  // drug information, the antimicrobial panel and the cases (in Node, on first use of PK.SOURCES or PK.DRUGS).
  const UNVERIFIED="typical textbook value, unverified";
  // The teaching drug library. kinetics is "linear" (Phase 2 adds "michaelis-menten"); fe is the fraction
  // excreted unchanged in urine, fu the unbound fraction (for information), S the salt factor, units the unit
  // system, strengths the forms available (round: the step IV doses are rounded to). s is what loading the drug
  // sets, including the window and time span; drugScenario fills in the rest.
  const DRUGS = [
    {id:"ibu", name:"Ibuprofen", sub:"400 mg PO", kinetics:"linear", fe:0.01, fu:0.01, S:1, units:"mg",
     strengths:{form:"tablets", mg:[200,400,600,800]},
     s:{route:"oral",dosing:"single",D:400,F:0.9,ka:1.5,thalf:2,V:10,mec:10,mtc:50,duration:12}},
    {id:"amox", name:"Amoxicillin", sub:"500 mg PO q8h", kinetics:"linear", fe:0.6, fu:0.8, S:1, units:"mg",
     strengths:{form:"capsules and tablets", mg:[250,500,875]},
     s:{route:"oral",dosing:"repeated",D:500,F:0.9,ka:1.0,thalf:1,V:27,tau:8,nDoses:6,loadMult:1,mec:2,mtc:25,duration:48}},
    {id:"caf", name:"Caffeine", sub:"100 mg PO", kinetics:"linear", fe:0.01, fu:null, S:1, units:"mg",
     strengths:{form:"tablets", mg:[100,200]},
     s:{route:"oral",dosing:"single",D:100,F:1,ka:3,thalf:5,V:42,mec:1,mtc:15,duration:24}},
    {id:"theo", name:"Theophylline ER", sub:"450 mg PO q12h", kinetics:"linear", fe:0.1, fu:0.6, S:1, units:"mg",
     strengths:{form:"extended-release tablets", mg:[300,450]},
     s:{route:"oral",dosing:"repeated",D:450,F:1,ka:0.3,thalf:8,V:31.5,tau:12,nDoses:8,loadMult:1,mec:10,mtc:20,duration:96}},
    {id:"gent", name:"Gentamicin", sub:"120 mg IV inf q8h", kinetics:"linear", fe:1, fu:0.85, S:1, units:"mg", trough:2,
     pkpd:{index:"cmax", src:"moore1987", note:"in 236 patients with gram-negative infections, higher peak-to-MIC ratios went with clinical response, in a graded way; the abstract names no single cut-off"},
     strengths:{form:"injection, 40 mg/mL", round:10},
     s:{route:"inf",dosing:"repeated",D:120,tinf:0.5,thalf:2.5,V:18,tau:8,nDoses:6,loadMult:1,mec:4,mtc:12,duration:48}},
    {id:"vanc", name:"Vancomycin", sub:"1 g IV inf q12h", kinetics:"linear", fe:0.83, fu:0.45, S:1, units:"mg",
     pkpd:{index:"auc", lo:400, hi:600, src:"rybak", note:"an AUC24/MIC of 400 to 600, assuming an MIC of 1 mg/L, for serious MRSA infections"},
     strengths:{form:"injection", round:250},
     s:{route:"inf",dosing:"repeated",D:1000,tinf:1,thalf:4.8,V:28,tau:12,nDoses:6,loadMult:1,mec:10,mtc:40,duration:72,mic:1}},
    {id:"dig", name:"Digoxin", sub:"250 mcg PO daily", kinetics:"linear", fe:0.6, fu:0.75, S:1, units:"mcg",
     strengths:{form:"tablets", mg:[62.5,125,250]},
     s:{route:"oral",dosing:"repeated",D:250,F:0.7,ka:2.5,thalf:42,V:490,tau:24,nDoses:14,loadMult:1,mec:0.5,mtc:2,duration:336}},
    {id:"phe", name:"Phenytoin", sub:"300 mg PO daily", kinetics:"michaelis-menten", fe:0.05, fu:0.1, S:0.92, units:"mg",
     strengths:{form:"extended capsules (phenytoin sodium)", mg:[30,100]},
     s:{route:"oral",dosing:"repeated",D:300,F:1,ka:0.4,thalf:22,V:49,vmax:7,km:4,tau:24,nDoses:14,loadMult:1,mec:10,mtc:20,duration:336}},
    {id:"li", name:"Lithium carbonate", sub:"600 mg PO q12h", kinetics:"linear", fe:1, fu:1, S:0.027067, units:"meq",
     strengths:{form:"capsules and tablets", mg:[150,300,600]},
     s:{route:"oral",dosing:"repeated",D:600,F:1,ka:2,thalf:27,V:60,tau:12,nDoses:14,loadMult:1,mec:0.8,mtc:1.2,duration:168}},
    {id:"lev", name:"Levetiracetam", sub:"500 mg PO q12h", kinetics:"linear", fe:0.66, fu:0.9, S:1, units:"mg",
     strengths:{form:"scored tablets", mg:[250,500,750,1000]},
     s:{route:"oral",dosing:"repeated",D:500,F:1,ka:3,thalf:7,V:41,tau:12,nDoses:8,loadMult:1,mec:12,mtc:46,duration:96}},
    {id:"mero", name:"Meropenem", sub:"1 g IV inf q8h", kinetics:"linear", fe:0.7, fu:0.98, S:1, units:"mg",
     pkpd:{index:"ft", src:"meropenem", note:"the percentage of the dosing interval that unbound meropenem exceeds the MIC correlates best with efficacy in animal and in vitro models"},
     strengths:{form:"vials", mg:[500,1000]},
     s:{route:"inf",dosing:"repeated",D:1000,tinf:0.5,thalf:1,V:17,tau:8,nDoses:6,loadMult:1,mec:2,mtc:100,duration:48,mic:2}},
    // Piperacillin, the component the model follows: 3.375 g of piperacillin-tazobactam contains 3 g of piperacillin.
    {id:"pip", name:"Piperacillin-tazobactam", sub:"3.375 g IV inf q6h", kinetics:"linear", fe:0.68, fu:0.7, S:1, units:"mg",
     pkpd:{index:"ft", src:"zosyn", note:"the pharmacodynamic parameter most predictive of clinical and microbiological efficacy is time above MIC"},
     strengths:{form:"piperacillin in 2.25, 3.375 and 4.5 g containers", mg:[2000,3000,4000]},
     s:{route:"inf",dosing:"repeated",D:3000,tinf:0.5,thalf:0.84,V:15.1,tau:6,nDoses:8,loadMult:1,mec:16,mtc:250,duration:24,mic:16}}
  ];
  // The settings loading a drug sets, completed with the drug's own fe, S and units.
  // Loading a drug also sets its unbound fraction (1 where the library has none) and its MIC (0 where it has none).
  const drugScenario=d=> Object.assign({cmt:1, hep:0, mic:0}, d.s, {fe:d.fe, fu:d.fu==null ? 1 : d.fu, S:d.S, unit:d.units, kin:d.kinetics==="michaelis-menten" ? "mm" : "linear"});

  // Each lesson loads `base` as the baseline and `cur` as the live scenario (both merged over DEFAULTS).
  // The claims in each text are checked against the model in tests/pk-engine.test.js.
  // A custom schedule in a lesson is stored validated, exactly as a link would decode it.
  const sched=(p,list)=> Object.assign(p,{dosing:"custom", events:normalizeEvents(list,p)});
  const every6h=Array.from({length:8},(_,i)=>({t:i*6, mg:360}));
  const everyDay=hours=> [0,24].flatMap(day=> hours.map(h=>({t:day+h, mg:250})));   // 250 mg at these hours on two days
  const LESSONS = [
    {id:"route", tag:"F · Tmax", title:"Oral vs IV bolus", sum:"Absorption delay, Tmax, Cmax and bioavailability.", baseLabel:"IV bolus",
     view:{duration:24,mec:2,mtc:12},
     base:{route:"iv"}, cur:{route:"oral",F:0.7,ka:0.8}},
    {id:"inf", tag:"T·inf", title:"Bolus vs infusion", sum:"Controlling the peak with infusion duration.", baseLabel:"IV bolus",
     view:{duration:36,mec:8,mtc:18},
     base:{route:"iv",D:1000,thalf:6,V:49}, cur:{route:"inf",D:1000,thalf:6,V:49,tinf:3}},
    {id:"infdur", tag:"T·inf", title:"Short vs long infusion", sum:"The same dose, a different exposure shape.", baseLabel:"1 g over 30 min",
     view:{duration:36,mec:8,mtc:18},
     base:{route:"inf",D:1000,thalf:6,V:49,tinf:0.5}, cur:{route:"inf",D:1000,thalf:6,V:49,tinf:4}},
    {id:"ldinf", tag:"LD · inf", title:"Loading bolus + infusion", sum:"Reaching the plateau in minutes, not hours.", baseLabel:"infusion alone",
     view:{duration:36,mec:8,mtc:14},
     base:sched({route:"inf",tinf:24},[{t:0,mg:1456}]),
     cur:sched({route:"inf",tinf:24},[{t:0,mg:350,route:"iv",type:"loading"},{t:0,mg:1456}])},
    {id:"cvi", tag:"Css", title:"Continuous vs intermittent", sum:"The same amount as a steady drip or in pulses.", baseLabel:"continuous infusion",
     view:{duration:48,mec:4,mtc:14},
     base:sched({route:"inf",tinf:1},[{t:0,mg:2880,dur:48}]),
     cur:sched({route:"inf",tinf:1},every6h)},
    {id:"tmic", tag:"T>MIC", title:"Time above the MIC", sum:"The same dose, longer above the MIC.", baseLabel:"1 g over 30 min",
     view:{duration:48,mec:2,mtc:100},
     base:{route:"inf",dosing:"repeated",D:1000,tinf:0.5,tau:8,nDoses:6,V:17,thalf:1},
     cur:{route:"inf",dosing:"repeated",D:1000,tinf:3,tau:8,nDoses:6,V:17,thalf:1}},
    {id:"accum", tag:"Rac", title:"Repeated dosing", sum:"Accumulation, peaks and troughs, steady state.", baseLabel:"single dose",
     view:{duration:96,mec:5,mtc:20},
     base:{dosing:"single",D:300,thalf:8,ka:1}, cur:{dosing:"repeated",D:300,thalf:8,ka:1,tau:8,nDoses:12}},
    {id:"load", tag:"LD", title:"Loading dose", sum:"Reaching the target sooner vs staying there.", baseLabel:"no loading dose",
     view:{duration:120,mec:6,mtc:16},
     base:{dosing:"repeated",D:300,thalf:12,ka:1,tau:12,nDoses:10}, cur:{dosing:"repeated",D:300,thalf:12,ka:1,tau:12,nDoses:10,loadMult:2}},
    {id:"cl", tag:"CL", title:"Reduced clearance", sum:"Longer half-life, more exposure, more accumulation.", baseLabel:"organ function 100%",
     view:{duration:72,mec:3,mtc:15},
     base:{dosing:"repeated",D:400,thalf:4,tau:8,nDoses:9}, cur:{dosing:"repeated",D:400,thalf:4,tau:8,nDoses:9,clFn:50}},
    {id:"crcl", tag:"CrCl", title:"Kidney function (CrCl)", sum:"Cockcroft–Gault, the renal fraction and a longer half-life.", baseLabel:"SCr 1.0 mg/dL",
     view:{duration:72,mec:1,mtc:12},
     base:{route:"inf",tinf:0.5,dosing:"repeated",D:120,tau:8,nDoses:9,thalf:2.5,V:18,pm:"clinical",fe:0.9,age:65,scr:1.0},
     cur:{route:"inf",tinf:0.5,dosing:"repeated",D:120,tau:8,nDoses:9,thalf:2.5,V:18,pm:"clinical",fe:0.9,age:65,scr:1.8}},
    {id:"wtcrcl", tag:"IBW", title:"Which weight for CrCl", sum:"Ideal, adjusted or actual weight in Cockcroft–Gault, and the trough it predicts.", baseLabel:"ideal weight in Cockcroft–Gault",
     view:{duration:96,mec:5,mtc:40},
     base:{route:"inf",tinf:1,dosing:"repeated",D:1000,tau:12,nDoses:8,thalf:6,V:49,pm:"clinical",fe:0.9,age:50,scr:1,sex:"M",wt:130,ht:175,wtm:"ibw"},
     cur:{route:"inf",tinf:1,dosing:"repeated",D:1000,tau:12,nDoses:8,thalf:6,V:49,pm:"clinical",fe:0.9,age:50,scr:1,sex:"M",wt:130,ht:175,wtm:"actual"}},
    {id:"vd", tag:"V", title:"Volume of distribution", sum:"Dilution, half-life and why AUC can stay put.", baseLabel:"V = 20 L",
     view:{duration:72,mec:2,mtc:25},
     base:{route:"iv",D:600,V:20,thalf:3}, cur:{route:"iv",D:600,V:60,thalf:9}},
    {id:"weight", tag:"mg/kg", title:"Dosing by weight", sum:"The same dose in a smaller body, and why mg/kg evens it out.", baseLabel:"50 kg",
     view:{duration:24,mec:2,mtc:12},
     base:{wt:50}, cur:{wt:100}},
    {id:"linear", tag:"D", title:"Double the dose", sum:"Linearity: twice the levels, the same half-life.", baseLabel:"250 mg",
     view:{duration:24,mec:2,mtc:12},
     base:{D:250}, cur:{D:500}},
    {id:"flipflop", tag:"kₐ < kₑ", title:"Flip-flop kinetics", sum:"When slow absorption sets the tail, not elimination.", baseLabel:"fast absorption",
     view:{duration:36,mec:0.5,mtc:20,scale:"log"},
     base:{D:500,thalf:2,ka:1.5}, cur:{D:500,thalf:2,ka:0.1}},
    {id:"mm", tag:"Vmax · Km", title:"Saturable elimination", sum:"A third more dose, more than twice the level.", baseLabel:"300 mg/day",
     view:{duration:336,mec:10,mtc:20},
     base:{route:"oral",dosing:"repeated",F:1,ka:0.4,V:49,tau:24,nDoses:14,S:0.92,kin:"mm",vmax:7,km:4,D:300}, cur:{route:"oral",dosing:"repeated",F:1,ka:0.4,V:49,tau:24,nDoses:14,S:0.92,kin:"mm",vmax:7,km:4,D:400}},
    {id:"twocmt", tag:"α · β", title:"One or two compartments", sum:"The same clearance and the same AUC, but a different peak.", baseLabel:"one compartment",
     view:{duration:96,mec:10,mtc:40},
     base:{route:"inf",dosing:"repeated",D:1000,tinf:1,tau:12,nDoses:8,V:28,thalf:4.78}, cur:{route:"inf",dosing:"repeated",D:1000,tinf:1,tau:12,nDoses:8,V:14,thalf:2.39,cmt:2,k12:0.545,k21:0.545}},
    {id:"miss", tag:"✕", title:"Missed dose", sum:"The dip, and how long recovery takes.", baseLabel:"every dose taken",
     view:{duration:96,mec:4,mtc:16},
     base:{dosing:"repeated",D:400,thalf:6,ka:1,tau:8,nDoses:12}, cur:{dosing:"repeated",D:400,thalf:6,ka:1,tau:8,nDoses:12,missed:6}},
    {id:"er", tag:"TW", title:"Narrow window", sum:"Fitting a regimen between effective and toxic.", baseLabel:"immediate release",
     view:{duration:96,mec:5,mtc:10},
     base:{dosing:"repeated",D:300,F:0.95,ka:2,thalf:8,tau:12,nDoses:8}, cur:{dosing:"repeated",D:300,F:0.95,ka:0.3,thalf:8,tau:12,nDoses:8}},
    {id:"half", tag:"t½", title:"Short vs long half-life", sum:"Dosing frequency and accumulation trade-offs.", baseLabel:"t½ = 2 h",
     view:{duration:96,mec:2,mtc:20},
     base:{dosing:"repeated",D:250,thalf:2,tau:8,nDoses:12}, cur:{dosing:"repeated",D:250,thalf:12,tau:8,nDoses:12}},
    {id:"split", tag:"τ", title:"Once vs twice daily", sum:"Same daily dose, different swing.", baseLabel:"600 mg once daily",
     view:{duration:120,mec:4,mtc:20},
     base:{dosing:"repeated",D:600,thalf:8,ka:1,tau:24,nDoses:5}, cur:{dosing:"repeated",D:300,thalf:8,ka:1,tau:12,nDoses:10}},
    {id:"spacing", tag:"t", title:"Evenly spaced vs bunched doses", sum:"When you take a dose matters, not just how much.", baseLabel:"every 6 h",
     view:{duration:48,mec:2,mtc:12},
     base:sched({},everyDay([0,6,12,18])), cur:sched({},everyDay([0,2,4,6]))},
    // PK/PD: the same 500 mg IV bolus (V 35 L, t½ 4 h), read through different concentration–effect curves
    {id:"potency", tag:"EC50", title:"Potency (EC50)", sum:"Same levels, less effect: needing more drug, not a weaker drug.", baseLabel:"EC50 2 mg/L",
     view:{duration:24,mec:2,mtc:30,pd:true,etgt:50},
     base:{route:"iv",ec50:2}, cur:{route:"iv",ec50:8}},
    {id:"efficacy", tag:"Emax", title:"Efficacy (Emax)", sum:"A ceiling no dose can break through.", baseLabel:"full agonist (Emax 100%)",
     view:{duration:24,mec:2,mtc:30,pd:true,etgt:70},
     base:{route:"iv",ec50:2}, cur:{route:"iv",ec50:2,emax:60}},
    {id:"hill", tag:"n", title:"Hill slope", sum:"A graded response vs an on/off switch.", baseLabel:"n = 1",
     view:{duration:24,mec:2,mtc:30,pd:true,etgt:80},
     base:{route:"iv",ec50:4,hill:1}, cur:{route:"iv",ec50:4,hill:4}},
    {id:"pdose", tag:"D → t", title:"Dose vs duration of effect", sum:"Doubling the dose buys one half-life.", baseLabel:"500 mg",
     view:{duration:24,mec:2,mtc:30,pd:true,etgt:50},
     base:{route:"iv",D:500}, cur:{route:"iv",D:1000}},
    {id:"delay", tag:"t½eq", title:"Effect delay (hysteresis)", sum:"The same levels, a later and lower effect.", baseLabel:"no delay",
     view:{duration:24,mec:2,mtc:12,pd:true,etgt:50},
     base:{teq:0}, cur:{teq:2}},
    // a drug with warfarin's half-life, volume and absorption that inhibits the production of a response, as
    // warfarin inhibits the synthesis of clotting factors; the turnovers are factor VII's and factor II's (its label)
    {id:"idr", tag:"kin · kout", title:"Indirect response", sum:"When the effect waits for the body to clear what it has.", baseLabel:"turnover t½ 5 h",
     view:{duration:168,mec:1,mtc:4,pd:true},
     base:{route:"oral",dosing:"single",D:25,F:1,ka:1.2,thalf:40,V:9.8,ec50:1,idr:1,imax:1,tout:5},
     cur:{route:"oral",dosing:"single",D:25,F:1,ka:1.2,thalf:40,V:9.8,ec50:1,idr:1,imax:1,tout:60}},
    {id:"hepx", tag:"E", title:"Hepatic extraction", sum:"Induction doubles a low-extraction drug's clearance.", baseLabel:"CLint 50 L/h",
     view:{duration:24,mec:2,mtc:20},
     base:{hep:1,route:"iv",D:500,V:35,fub:0.1,clint:50}, cur:{hep:1,route:"iv",D:500,V:35,fub:0.1,clint:100}},
    {id:"hepfp", tag:"F", title:"First pass and induction", sum:"Clearance barely moves; oral exposure halves.", baseLabel:"CLint 1800 L/h",
     view:{duration:12,mec:0.1,mtc:1},
     base:{hep:1,route:"oral",D:2000,V:150,fub:0.5,clint:1800}, cur:{hep:1,route:"oral",D:2000,V:150,fub:0.5,clint:3600}},
    {id:"hepq", tag:"Q", title:"Liver blood flow", sum:"A high-extraction drug's clearance follows the flow.", baseLabel:"Q 90 L/h",
     view:{duration:12,mec:0.5,mtc:5},
     base:{hep:1,route:"iv",D:500,V:150,fub:0.5,clint:1800}, cur:{hep:1,route:"iv",D:500,V:150,fub:0.5,clint:1800,qh:45}},
    {id:"bayes", tag:"MAP", title:"One level and a prior", sum:"A single well-timed level, weighed against the patient model.", baseLabel:"patient model, no levels",
     view:{duration:108,mec:10,mtc:40},
     base:{route:"inf",dosing:"repeated",D:750,thalf:4.8,V:28,tinf:1.25,tau:12,nDoses:20,wt:82,pm:"clinical",age:66,scr:1.4,fe:0.83,fu:0.45},
     cur:{route:"inf",dosing:"repeated",D:750,thalf:4.8,V:28,tinf:1.25,tau:12,nDoses:20,wt:82,pm:"clinical",age:66,scr:1.4,fe:0.83,fu:0.45,lv:[{n:8,dt:11.9,c:24.8}]}},
    // piperacillin from its label (3 g in each 3.375 g dose), against the FDA breakpoint for P. aeruginosa
    {id:"ptz", tag:"fT>MIC", title:"Extended infusion", sum:"The same 12 g a day, longer above the MIC.", baseLabel:"3 g over 30 min",
     view:{duration:24,mec:16,mtc:250,mic:16},
     base:{route:"inf",dosing:"repeated",D:3000,tinf:0.5,thalf:0.84,V:15.1,tau:6,nDoses:8,fu:0.7},
     cur:{route:"inf",dosing:"repeated",D:3000,tinf:3,thalf:0.84,V:15.1,tau:6,nDoses:8,fu:0.7}},
    {id:"gcmax", tag:"Cmax/MIC", title:"Once daily vs divided", sum:"The same daily dose: peak vs time above the MIC.", baseLabel:"160 mg every 8 h",
     view:{duration:48,mec:1,mtc:30,mic:1},
     base:{route:"inf",dosing:"repeated",D:160,tinf:0.5,thalf:2.5,V:18,tau:8,nDoses:9,fu:0.85},
     cur:{route:"inf",dosing:"repeated",D:480,tinf:0.5,thalf:2.5,V:18,tau:24,nDoses:3,fu:0.85}},
    // the gentamicin-on-dialysis case's patient and one dose; the dialysis clearance gives the label's 50% per 8 hours
    {id:"hd", tag:"CLd", title:"Hemodialysis sessions", sum:"Clearance that comes and goes.", baseLabel:"no dialysis",
     view:{duration:144,mec:1,mtc:12},
     base:{route:"inf",dosing:"single",D:120,tinf:0.5,thalf:2.5,V:18,wt:80,pm:"clinical",age:64,sex:"M",ht:175,scr:7.5,fe:1},
     cur:{route:"inf",dosing:"single",D:120,tinf:0.5,thalf:2.5,V:18,wt:80,pm:"clinical",age:64,sex:"M",ht:175,scr:7.5,fe:1,hd:1,hdcl:1.25,hdstart:40,hddur:8,hdevery:48}},
    {id:"hdreb", tag:"HD", title:"Rebound after dialysis", sum:"Drug the dialyzer couldn't reach comes back.", baseLabel:"one compartment, same clearance and total volume",
     view:{duration:24,mec:2,mtc:20},
     base:{route:"iv",dosing:"single",D:1000,V:60,thalf:18,hd:1,hdcl:8,hdstart:6,hddur:4,hdevery:48},
     cur:{route:"iv",dosing:"single",D:1000,V:20,thalf:6,cmt:2,k12:0.8,k21:0.4,hd:1,hdcl:8,hdstart:6,hddur:4,hdevery:48}}
  ];

  // One-click comparisons: A is the lesson's baseline scenario, B its live scenario.
  const TEMPLATES = [
    {id:"split", lesson:"split", title:"Once vs twice daily", nameA:"600 mg once daily", nameB:"300 mg twice daily",
     look:"Same daily dose. B's peaks are lower and its troughs higher, while AUC barely moves."},
    {id:"load", lesson:"load", title:"Loading dose", nameA:"No loading dose", nameB:"2× loading dose",
     look:"B is inside the window almost from the start; both settle at the same steady state."},
    {id:"cl", lesson:"cl", title:"Normal vs 50% clearance", nameA:"Organ function 100%", nameB:"Organ function 50%",
     look:"Same regimen. B's half-life doubles, its troughs climb and its peaks cross the toxic line."},
    {id:"twocmt", lesson:"twocmt", title:"Vancomycin: one vs two compartments", nameA:"One compartment", nameB:"Two compartments",
     look:"The same clearance. B peaks higher at the end of each infusion (57.6 vs 40.3 mg/L at steady state) and falls in two phases, but its AUC24 is the same 492.6 mg·h/L."},
    {id:"mm", lesson:"mm", title:"Phenytoin 300 vs 400 mg/day", nameA:"300 mg/day", nameB:"400 mg/day",
     look:"A third more dose. B's predicted steady-state level is 2.3 times A's, and it takes 10.5 days instead of 3.8 to get within 10% of it."},
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
    {id:"tmic", lesson:"tmic", title:"Meropenem: 30-minute vs 3-hour infusion", nameA:"Over 30 min", nameB:"Over 3 h",
     look:"The same 1 g every 8 h. B peaks at half of A's level (24.8 vs 49.9 mg/L) but stays above the 2 mg/L MIC for 82% of each interval instead of 64%. The AUC is the same."},
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
    {id:"delay", lesson:"delay", title:"Direct vs delayed effect", nameA:"No delay", nameB:"Effect-site t½ 2 h",
     look:"Identical plasma curves. B's effect peaks 3.1 h after the plasma peak, at 61% instead of 70%, and reaches the 50% target 1.8 h later."},
    {id:"hepx", lesson:"hepx", title:"Induction: a low-extraction drug", nameA:"CLint 50 L/h", nameB:"CLint 100 L/h",
     look:"Clearance almost doubles (4.74 → 9.0 L/h), and B falls twice as fast."},
    {id:"hepfp", lesson:"hepfp", title:"Induction: first pass, by mouth", nameA:"CLint 1800 L/h", nameB:"CLint 3600 L/h",
     look:"Clearance barely moves, but B's oral AUC is half of A's (1.11 vs 2.22 mg·h/L)."},
    {id:"hepq", lesson:"hepq", title:"Liver blood flow halved (IV)", nameA:"Q 90 L/h", nameB:"Q 45 L/h",
     look:"B's clearance falls from 81.8 to 42.9 L/h, and its IV AUC almost doubles."},
    {id:"spacing", lesson:"spacing", title:"Evenly spaced vs bunched doses", nameA:"Every 6 h", nameB:"Four doses by 6 am",
     look:"Same daily amount and the same AUC. B peaks higher and dips lower before the next day's doses."},
    {id:"idr", lesson:"idr", title:"Fast vs slow response turnover", nameA:"Turnover t½ 5 h", nameB:"Turnover t½ 60 h",
     look:"The same dose of a slowly cleared drug. A falls to 37% of baseline at 24 h; B only to 67%, and not until 96 h, long after the level peaked at 3.6 h."},
    {id:"hd", lesson:"hd", title:"No dialysis vs hemodialysis", nameA:"No dialysis", nameB:"8-hour session at 40 h",
     look:"The same 120 mg in end-stage kidney disease. B's session halves the level, from 2.07 to 1.04 mg/L by 48 h; over all its sessions dialysis removes 18 mg of the 120."},
    {id:"hdreb", lesson:"hdreb", title:"Dialysis: one vs two compartments", nameA:"One compartment", nameB:"Two compartments",
     look:"The same clearance, total volume and 4-hour session. A keeps falling after the session; B rises from 5.53 to 6.33 mg/L in the 1.6 hours after it, as drug returns from the tissues."},
    {id:"ptz", lesson:"ptz", title:"Piperacillin: 30-minute vs 3-hour infusion", nameA:"Over 30 min", nameB:"Over 3 h",
     look:"The same 3 g every 6 h. B peaks at 74 mg/L instead of 164, but its unbound level stays above the 16 mg/L MIC for 69% of each interval instead of 47%. AUC24/MIC is 60 for both."},
    {id:"gcmax", lesson:"gcmax", title:"Gentamicin: divided vs once daily", nameA:"160 mg every 8 h", nameB:"480 mg every 24 h",
     look:"The same 480 mg a day. B's Cmax/MIC is 24.9 instead of 9.3, its fT>MIC 48% instead of 99.5%, and AUC24/MIC is 96 for both."}
  ];

  /* ---------- lesson structure: predict, explain, try, challenge ---------- */
  // Each lesson has an objective, a question to answer before reading the explanation, a challenge the page
  // checks live, and why the idea matters; pk-lessons.js holds them, with each lesson's explanation and tip.
  const LESSON_GROUPS=[{id:"pk",title:"PK fundamentals"},{id:"rep",title:"Repeated dosing and steady state"},
    {id:"custom",title:"Custom regimens"},{id:"inf",title:"Infusion and route"},{id:"pd",title:"PK/PD concepts"},
    {id:"liver",title:"Liver and first pass"},{id:"abx",title:"Antimicrobial PK/PD"},{id:"tdm",title:"Levels and individualization"}];

  // Each lesson's group (its texts, prediction and challenge are in pk-lessons.js).
  const LESSON_GROUP_OF={"route":"pk","vd":"pk","cl":"pk","twocmt":"pk","mm":"pk","crcl":"pk","wtcrcl":"pk","hd":"pk","hdreb":"pk","accum":"rep","load":"rep","weight":"pk","linear":"pk","flipflop":"pk","half":"rep","split":"rep","er":"rep","miss":"rep","spacing":"custom","inf":"inf","infdur":"inf","ldinf":"inf","cvi":"inf","tmic":"inf","potency":"pd","efficacy":"pd","hill":"pd","pdose":"pd","delay":"pd","idr":"pd","hepx":"liver","hepfp":"liver","hepq":"liver","ptz":"abx","gcmax":"abx","bayes":"tdm"};
  LESSONS.forEach(L=> L.group=LESSON_GROUP_OF[L.id]);
  // The texts, predictions and challenges live in pk-lessons.js: the page loads it when a lesson opens (it sets
  // PK.lessonModule), and in Node the engine reads it the first time LESSONS is used. Until then each lesson has
  // its id, title, summary, group and scenarios, which is all the lists and links need.
  let lessonMod=null, bayesMod=null, idrMod=null, srcMod=null, hdMod=null, sensMod=null, tdmMod=null, explainMod=null;
  function hdApi(){ if(!hdMod && typeof require==="function") hdMod=require("./pk-hd.js"); return hdMod; }
  // the sources: attached to the drugs when pk-sources.js loads (the page) or on first use (Node)
  function attachSources(m){ srcMod=m; DRUGS.forEach(d=>{ d.refs=m.REFS[d.id]; }); }
  const sourcesApi=()=>{ if(!srcMod && typeof require==="function") attachSources(require("./pk-sources.js")); return srcMod; };
  const idrApi=()=>{ if(!idrMod && typeof require==="function") idrMod=require("./pk-idr.js"); return idrMod; };
  function attachLessons(m){ lessonMod=m; LESSONS.forEach(L=> Object.assign(L, m[L.id])); }
  const lessonsFull=()=>{ if(!lessonMod && typeof require==="function") attachLessons(require("./pk-lessons.js")); return LESSONS; };
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
    // with the liver model the half-life and F are derived from it, so a link carries only the model's settings
    const parts=PK_KEYS.filter(k=>k!=="events" && k!=="lv" && p[k]!==DEFAULTS[k] && !(hepOn(p) && (k==="thalf"||k==="F"))).map(k=>k+":"+p[k]);
    if(p.lv && p.lv.length) parts.push("lv:"+levelsKey(p.lv));
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
  // Unknown keys and invalid values are ignored; numbers are clamped to their allowed range, and for a link older
  // than v9 to the range its page had (a dose of at most 2,000 mg), so it opens exactly as it did there.
  function decodeScenario(str, version){
    const legacy=version!==undefined && version<9;
    const p=scenario();
    String(str||"").split(",").forEach(pair=>{
      const i=pair.indexOf(":");
      if(i<1) return;
      const k=pair.slice(0,i), raw=pair.slice(i+1);
      if(k==="ev"){ p.events=decodeEvents(raw); return; }
      if(k==="lv"){ p.lv=decodeLevels(raw); return; }
      if(!PK_KEYS.includes(k) || k==="events") return;
      if(typeof DEFAULTS[k]==="string"){ if(CHOICES[k].includes(raw)) p[k]=raw; return; }
      let v=parseFloat(raw);
      if(!isFinite(v)) return;
      if(k==="loadMult"||k==="cmt"||k==="hep"||k==="idr"||k==="hd"){ if(CHOICES[k].includes(v)) p[k]=v; return; }
      if(INTEGER_KEYS.includes(k)) v=Math.round(v);
      p[k]=clamp(v, legacy && V8_MAX[k] ? [RANGES[k][0], V8_MAX[k]] : RANGES[k]);
    });
    // before links v12, dialysis did nothing with two compartments: such a link opens as it always did
    if(version!==undefined && version<12 && p.cmt===2 && p.hd===1) p.hd=0;
    return normalizeScenario(p);
  }
  function encodeView(v){
    const out=[];
    ["duration","mec","mtc"].forEach(k=>{ if(v[k]!==VIEW_DEFAULTS[k]) out.push(k+":"+v[k]); });
    if(v.mic>0) out.push("mic:"+v.mic);
    if(v.scale==="log") out.push("scale:log");
    if(v.zoom==="last") out.push("zoom:last");
    if(v.pd) out.push("pd:1");
    if(v.etgt!==undefined && v.etgt!==VIEW_DEFAULTS.etgt) out.push("etgt:"+v.etgt);
    if(v.pop) out.push("pop:1");
    POP_KEYS.forEach(k=>{ if(v[k]!==undefined && v[k]!==VIEW_DEFAULTS[k]) out.push(k+":"+v[k]); });
    return out.join(",");
  }
  function decodeView(str){
    const v=Object.assign({},VIEW_DEFAULTS);
    String(str||"").split(",").forEach(pair=>{
      const [k,raw]=pair.split(":");
      if(VIEW_RANGES[k]){ let n=parseFloat(raw); if(isFinite(n)){ if(k==="popn"||k==="pseed") n=Math.round(n); v[k]=clamp(n,VIEW_RANGES[k]); } }
      else if(k==="scale" && (raw==="lin"||raw==="log")) v.scale=raw;
      else if(k==="zoom" && (raw==="full"||raw==="last")) v.zoom=raw;
      else if(k==="pd") v.pd=raw==="1";
      else if(k==="pop") v.pop=raw==="1";
    });
    return v;
  }

  // Link state ↔ URL hash, e.g. "v=1&s=D:400,clFn:50&w=duration:48".
  // Simulator links carry s (scenario), base (baseline), bl (baseline label) and l (lesson id);
  // compare links carry m=cmp, a, b, na/nb (names), lk (Vary only key) and ed (side being edited).
  function encodeLink(st){
    const scen=st.mode==="cmp" ? [st.a,st.b] : [st.s,st.base].filter(Boolean);
    const view=st.view||VIEW_DEFAULTS;
    const usesV12=scen.some(p=>p.cmt===2 && p.hd===1);
    const usesV11=scen.some(p=>V11_KEYS.some(k=>p[k]!==DEFAULTS[k]));
    const usesV10=scen.some(p=>V10_KEYS.some(k=>p[k]!==DEFAULTS[k]));
    const usesV9=view.mic>0 || scen.some(p=>V9_KEYS.some(k=>p[k]!==DEFAULTS[k]) || Object.keys(V8_MAX).some(k=>p[k]>V8_MAX[k]));
    const usesV8=scen.some(p=>p.lv && p.lv.length>0);
    const usesV7=scen.some(p=>V7_KEYS.some(k=>p[k]!==DEFAULTS[k]));
    const usesV6=scen.some(p=>V6_KEYS.some(k=>p[k]!==DEFAULTS[k]));
    const usesV5=view.duration>168 || view.pop || POP_KEYS.some(k=>view[k]!==undefined && view[k]!==VIEW_DEFAULTS[k]) || scen.some(p=>V5_KEYS.some(k=>p[k]!==DEFAULTS[k]) || Object.keys(V4_MAX).some(k=>p[k]>V4_MAX[k]));
    const usesV4=view.pd || view.etgt!==VIEW_DEFAULTS.etgt || scen.some(p=>PD_KEYS.some(k=>p[k]!==DEFAULTS[k]));
    const parts=["v="+(usesV12 ? 12 : usesV11 ? 11 : usesV10 ? 10 : usesV9 ? 9 : usesV8 ? 8 : usesV7 ? 7 : usesV6 ? 6 : usesV5 ? 5 : usesV4 ? 4 : scen.some(usesV3) ? 3 : scen.some(p=>p.dosing==="custom") ? 2 : 1)];
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
    const name=s=>s ? cleanName(safe(s),40) : "";
    const st={version:q.v ? parseInt(q.v,10)||VERSION : 1, mode:q.m==="cmp"?"cmp":"sim", view:decodeView(safe(q.w||""))};
    const sc=s=>decodeScenario(safe(s||""), st.version);
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
    {id:"inf",title:"Infusions"},{id:"pd",title:"Concentration–effect"},{id:"nl",title:"Saturable (Michaelis–Menten)"},
    {id:"liver",title:"Liver and first pass"},{id:"abx",title:"Antimicrobial PK/PD"}];
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
  // First-order two-level AUC at steady state, as practice does it by hand: k from a peak drawn `after` hours after
  // a T-hour infusion ends and the trough at τ, the level back at the end of the infusion, then the infusion phase
  // as a trapezoid and the decline as (Cmax − Cmin) / k (Cmin is the trough at steady state).
  function twoLevelAUC(Cp, Ct, T, after, tau){
    const dt=tau-T-after, k=Math.log(Cp/Ct)/dt, Cmax=Cp*Math.exp(k*after), aInf=T*(Ct+Cmax)/2, aDecl=(Cmax-Ct)/k;
    return {dt, k, Cmax, aInf, aDecl, auc24:(aInf+aDecl)*24/tau};
  }
  const evenUp=h=> Math.min(168, Math.max(6, 2*Math.ceil(h/2)));   // a time window in whole even hours
  // Keep drawing until the numbers fit the model's ranges.
  const until=(make, ok)=>{ let x; for(let i=0;i<60;i++){ x=make(); if(ok(x)) return x; } return x; };
  const WORKSHEET_SIZES=[5,10,15];
  // Worksheet pools are versioned so a shared sheet never changes: a link without a version rebuilds from the kinds
  // version 1 had, and each later kind records the version it arrived in (`since`).
  const WS_VERSION=9;
  // The practice problems themselves live in pk-practice.js, loaded with the Practice tab (in Node, on first use).
  // Their ids stay here so a practice link can be checked before that file loads; a test keeps the two lists equal.
  const PRACTICE_IDS=["ke","c0","ct","remain","thalf2","auc","cl","bioF","tmax","tbelow","thalfcl","cl2","hdfall","t90","rac","cavg","mdose","trough","taumax","renaladj","crclwt","rate","infpct","infend","auc2","ldinf","clinf","effc","cfore","effdur","efft","effpk","idrss","mmcss","mmdose","mmt90","mmhalf","hepcl","hepf","hepiv","ftmic","cmaxmic","aucmic"];
  let practiceMod=null;
  const practiceApi=()=>{ if(!practiceMod && typeof require==="function") practiceMod=require("./pk-practice.js"); return practiceMod; };
  const practiceHelpers={drawFrom, evenUp, nf, sig4, until};

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
  // The glossary's terms live in pk-glossary.js, loaded with the Lessons tab (see GLOSSARY in the exports).
  let glossary=null;

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
  // With saturable elimination there's no single half-life or clearance, and steady state has its own rules.
  const READOUT_KEYS_MM={single:["cmax","tmax","thalf","cl","v","auc","mgkg","ttr"],
    repeated:["peak","trough","css","t90","thalf","ratio","mgkg","ttr"],
    custom:["peakWin","tpeakWin","given","total","thalf","cl","aucWin","ttr"]};
  // With dialysis, peaks are read off the curve, and the session's clearance and the fall it causes replace the
  // steady-state readouts.
  const READOUT_KEYS_HD={single:["peakWin","tpeakWin","thalf","cl","hdCl","hdFall","aucHd","ttr"],
    repeated:["peak","trough","thalf","cl","hdCl","hdFall","mgkg","ttr"],
    custom:["peakWin","tpeakWin","given","total","thalf","hdCl","hdFall","aucWin"]};
  const readoutKeys=p=> (p.kin==="mm" ? READOUT_KEYS_MM : hdOn(p) ? READOUT_KEYS_HD : READOUT_KEYS)[p.dosing];
  // The worked readouts (metricMath) live in pk-math.js, loaded the first time a readout is opened.
  let mathFn=null;

  /* ================= FIT THE DATA ================= */
  // A dose was given and the concentration measured several times, with a little measurement noise. The
  // student moves the half-life and volume until the model runs through the points. The data come from settings
  // on the sliders' own steps, so an exact match is always within reach, and from half-lives of 6–16 h, where one
  // 0.5 h step is small next to the tolerance. For an oral dose F and kₐ are given: with points like these, kₐ is
  // barely pinned down by the data, and leaving it free makes the fit a search in three tangled directions.
  const FIT_KINDS=[{id:"iv", title:"IV bolus", free:["thalf","V"]}, {id:"oral", title:"Oral dose", free:["thalf","V"]},
    {id:"iv2", title:"Two compartments", free:["thalf","V","k12","k21"]}];
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
    } else if(kind.id==="iv2"){
      // two compartments, with phases far enough apart to strip by hand: α at least 8·β, a distribution half-life
      // of at least 0.6 h (so quarter-hour samples catch it), a terminal half-life of 3–20 h, and a clear
      // distribution phase (A at least 0.8·B)
      const ok=x=>{ const q=disposition(scenario(Object.assign({route:"iv", cmt:2}, x))), a=q[0].k, b=q[1].k;
        return a>=8*b && Math.LN2/a>=0.6 && Math.LN2/b>=3 && Math.LN2/b<=20 && q[0].c>=0.8*q[1].c; };
      let set;   // about 11% of draws qualify, so 400 tries always find one
      for(let i=0;i<400;i++){ set={thalf:d(1,6,0.5), V:d(8,40,1), k12:d(0.3,1.5,0.05), k21:d(0.15,1,0.05)}; if(ok(set)) break; }
      Object.assign(truth, set, {route:"iv", cmt:2});
      const q=disposition(scenario(truth)), ta=Math.LN2/q[0].k, tb=Math.LN2/q[1].k, late=5*ta;
      times=[0.4,0.9,1.5,2.3,3.3].map(f=>f*ta).concat([0,0.5,1,1.6,2.3,3].map(f=>late+f*tb));
    } else times=[0.1,0.35,0.7,1.2,1.8,2.6,3.5].map(f=>f*thalf);
    times=[...new Set(times.map(t=> Math.max(0.25, toStep(t,0.25))))].sort((a,b)=>a-b);
    const p=scenario(truth);
    const obs=times.map(t=>({t, c:sig3(conc(p,t)*Math.exp(FIT_NOISE*gaussian(rnd)))}));
    // the sliders start well away from the answer
    const T=truth, start=kind.id==="iv2"
      ? {thalf:T.thalf>=3 ? 1 : 5, V:T.V>=24 ? 10 : 36, k12:T.k12>=1 ? 0.3 : 1.8, k21:T.k21>=0.6 ? 0.2 : 1.1}
      : {thalf:thalf>=11 ? 4 : 16, V:V>=45 ? 20 : 70};
    const tail=kind.id==="iv2" ? Math.LN2/disposition(p)[1].k : thalf;
    return {kind:kind.id, seed, truth, obs, start, free:kind.free.slice(),
      view:Object.assign({}, VIEW_DEFAULTS, {duration:evenUp(times[times.length-1]+tail)})};
  }
  const sig3=v=> +v.toPrecision(3);
  // Links to one practice problem (#p=kind.seed) or one fit-the-data set (#fit=iv.seed): the seed rebuilds
  // exactly the same numbers, so a class can work the same problem. Scenario links (#v=…) are separate.
  const encodeTaskLink=t=> t.type==="fit" ? `fit=${t.kind}.${t.seed>>>0}` : t.type==="window" ? `win=${t.kind}.${t.seed>>>0}`
    : t.type==="worksheet" ? `ws=${t.topic||"all"}.${t.count}.${t.seed>>>0}${t.v>1 ? "."+t.v : ""}` : `p=${t.id}.${t.seed>>>0}`;
  function decodeTaskLink(hash){
    const h=String(hash||"").trim(), w=/^#?ws=([a-z]{1,12})\.(\d{1,2})\.(\d{1,10})(?:\.(\d{1,2}))?$/.exec(h);
    if(w){
      const topic=w[1]==="all" ? "" : w[1], count=Number(w[2]), seed=Number(w[3]), v=w[4]===undefined ? 1 : Number(w[4]);
      if((topic && !PRACTICE_TOPICS.some(t=>t.id===topic)) || !WORKSHEET_SIZES.includes(count) || seed>4294967295 || v<1 || v>WS_VERSION) return null;
      return {type:"worksheet", topic, count, seed, v};
    }
    const m=/^#?(p|fit|win)=([a-z0-9]{1,12})\.(\d{1,10})$/i.exec(h);
    if(!m) return null;
    const seed=Number(m[3]);
    if(!Number.isInteger(seed) || seed>4294967295) return null;
    if(m[1]==="p") return PRACTICE_IDS.includes(m[2]) ? {type:"problem", id:m[2], seed} : null;
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
    if(fixed.some(k=> p[k]!==f.truth[k]) || p.wt!==DEFAULTS.wt || p.clFn!==DEFAULTS.clFn
      || p.cmt!==(f.truth.cmt||DEFAULTS.cmt) || p.kin!==DEFAULTS.kin) mismatch="setup";   // and the model the data came from
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
    if(f.kind==="iv2"){
      // the method of residuals: the last four points give the terminal line (β and B); what the early points
      // have above that line gives the distribution line (α and A); then the rate constants and V1
      const n=f.obs.length, tl=line(f.obs.slice(-4)), beta=tl.k, B=Math.exp(tl.lnC0);
      const residuals=f.obs.slice(0, n-4).map(o=>({t:o.t, c:o.c, r:o.c-B*Math.exp(-beta*o.t)})).filter(o=>o.r>0).slice(0,4);
      const dl=line(residuals.map(o=>({t:o.t, c:o.r}))), alpha=dl.k, A=Math.exp(dl.lnC0);
      const k21=(A*beta+B*alpha)/(A+B), k10=alpha*beta/k21, k12=alpha+beta-k21-k10, V1=D/(A+B);
      return {alpha, beta, A, B, k21, k10, k12, V:V1, thalf:Math.LN2/k10, residuals};
    }
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
    PD_KEYS, micStats, effectOf, concForEffect, effectStats, keqOf, ceConc, hepOn, wellStirred, fOf, LEVEL_LIMITS, normalizeLevels, levelsKey,
    get DRUGS(){ sourcesApi(); return DRUGS; }, TEMPLATES, LESSON_GROUPS, lessonStats, lessonCheck, lessonScenario, challengeMet,
    get LESSONS(){ return lessonsFull(); },
    get lessonModule(){ return lessonMod; }, set lessonModule(v){ attachLessons(v); },
    // Bayesian individualization (pk-bayes.js): loaded by the page when needed, required on first use in Node
    get bayes(){ if(!bayesMod && typeof require==="function") bayesMod=require("./pk-bayes.js"); return bayesMod; },
    get idr(){ return idrApi(); }, get hd(){ return hdApi(); },
    get sens(){ if(!sensMod && typeof require==="function") sensMod=require("./pk-sens.js"); return sensMod; }, get sensModule(){ return sensMod; }, set sensModule(v){ sensMod=v; }, get tdm(){ if(!tdmMod && typeof require==="function") tdmMod=require("./pk-tdm.js"); return tdmMod; }, get tdmModule(){ return tdmMod; }, set tdmModule(v){ tdmMod=v; }, get explain(){ if(!explainMod && typeof require==="function") explainMod=require("./pk-explain.js"); return explainMod; }, get explainModule(){ return explainMod; }, set explainModule(v){ explainMod=v; }, get hdModule(){ return hdMod; }, set hdModule(v){ hdMod=v; }, hdOn, get idrModule(){ return idrMod; }, set idrModule(v){ idrMod=v; },
    get bayesModule(){ return bayesMod; }, set bayesModule(v){ bayesMod=v; },
    lessonHelpers:{higherLowerSame, everyDay, every6h},
    DEFAULT_NAMES, newComparison, cmpApply, cmpCopy, cmpSwap, cmpSetLock, cmpReset, lockHolds, normalizeScenario,
    encodeScenario, decodeScenario, encodeView, decodeView, encodeLink, decodeLink, cleanName,
    LIBRARY_FORMAT, LIBRARY_VERSION, LIBRARY_LIMITS, emptyLibrary, libraryItem, validItem, parseLibrary, mergeLibrary, exportLibrary,
    PRACTICE_TOPICS, PRACTICE_IDS, seededRandom, WORKSHEET_SIZES, WS_VERSION, twoLevelAUC, practiceHelpers,
    get PRACTICE(){ const m=practiceApi(); return m ? m.PRACTICE : null; },
    makeProblem:o=> practiceApi().makeProblem(o), practiceScenario:pr=> practiceApi().practiceScenario(pr),
    makeWorksheet:o=> practiceApi().makeWorksheet(o), practiceCorrect:(pr,v)=> practiceApi().practiceCorrect(pr,v),
    get practiceModule(){ return practiceMod; }, set practiceModule(v){ practiceMod=v; },
    FIT_KINDS, FIT_NOISE, makeFit, fitError, fitScenario, fitStatus, fitEstimate, encodeTaskLink, decodeTaskLink,
    READOUT_KEYS, WINDOW_KINDS, makeWindowTask, windowScenario, windowStatus, ssPeakTrough,
    get GLOSSARY(){ if(!glossary && typeof require==='function') glossary=require('./pk-glossary.js'); return glossary; },
    set GLOSSARY(v){ glossary=v; },
    get metricMath(){ if(!mathFn && typeof require==='function') mathFn=require('./pk-math.js'); return mathFn; },
    set metricMath(v){ mathFn=v; },
    PROGRESS_FORMAT, emptyProgress, parseProgress, recordLesson, recordPractice, recordTask, progressSummary,
    crclCG, cmToIn, ibwDevine, adjBW, CRCL_REF, renalFactor, patientOf, clFactor, UNITS, unitsOf, convertUnits, saltOf,
    get SOURCES(){ const m=sourcesApi(); return m ? m.SOURCES : {}; }, get sourcesModule(){ return srcMod; }, set sourcesModule(m){ attachSources(m); },
    UNVERIFIED, drugScenario, MM_STEP, vmaxOf, mmIntegrate, mmAmount, mmCss, mmT90, mmHalfAt, mmSteady, readoutKeys, READOUT_KEYS_MM, READOUT_KEYS_HD, sheinerTozer};
});
