/* DoseCurve clinical cases
   Worked cases that bring the clinical patient model, the drug library and the grader together. Nothing here
   stores an answer the model could compute: every target check, hint, walkthrough number and reference regimen
   is worked out from the patient and the drug when the case is opened. Educational model, not for clinical dosing.
   The page loads this file when the Cases tab is first opened (window.DCCases); the tests load it with require(). */
(function(root, factory){
  const PK=root && root.PK ? root.PK : (typeof require==="function" ? require("./pk-engine.js") : null);
  const api=factory(PK);
  if(typeof module==="object" && module.exports) module.exports=api;
  else root.DCCases=api;
})(typeof self!=="undefined" ? self : this, function(PK){
  "use strict";

  const LN2=Math.LN2;
  const nf=(v,dp)=> String(+v.toFixed(dp));
  const signed=(v,dp)=> (v<0 ? "−" : "+")+nf(Math.abs(v),dp);
  const drugOf=id=> PK.DRUGS.find(d=>d.id===id);

  /* ================= CASES ================= */
  // A case: the patient (no names), the drug from the library, the indication, the target, the regimen choices,
  // the regimen it opens with, the task, a plan (the textbook route to a regimen, computed from the patient),
  // regimens that deliberately miss (with the hint they should get), what a pharmacist also weighs, and sources.
  // target.kind: "pt" (peak and trough limits), "auc" (AUC24 range), "css" (predicted saturable steady state),
  // "at" (the level `at` hours after a dose, plus a peak limit), "hartford" (dose per kg and interval band),
  // "choice" (a reasoning question answered from the model).
  const CASES=[
    {id:"gent", drug:"gent", title:"Gentamicin with reduced kidney function", tag:"Aminoglycoside, peak and trough",
     patient:{age:72, sex:"M", ht:178, wt:70, scr:1.6},
     indication:"A serious Gram-negative infection. Gentamicin is given as a 30-minute infusion.",
     target:{kind:"pt", peak:[5,12], troughMax:2,
       why:"The label asks for dosing that avoids prolonged peaks above 12 mcg/mL and troughs above 2 mcg/mL. A peak of at least 5 mg/L is a teaching target (unverified)."},
     choices:{step:10, min:40, max:600, taus:[8,12,24,36,48], tinf:0.5},
     start:{D:100, tau:8},
     task:"The team starts a usual 100 mg (about 1.5 mg/kg) every 8 h. Check it, then choose a dose and interval that keep the steady-state peak between 5 and 12 mg/L and the trough at or below 2 mg/L.",
     plan(x){ // interval long enough for the trough to fall from a peak of 8 to 1 mg/L; dose for that peak
       const T=0.5, tau=x.upTau(T+Math.log(8/1)/x.k), D=8*x.CL*T*(1-Math.exp(-x.k*tau))/(1-Math.exp(-x.k*T));
       return {reg:{D, tau}, steps:[
         `An infusion's steady-state peak and trough are C<sub>peak</sub> = (R₀ / CL)·(1 − e^(−kT)) / (1 − e^(−kτ)) and C<sub>trough</sub> = C<sub>peak</sub>·e^(−k(τ − T)), with T = 0.5 h.`,
         `For the trough to fall from a peak of 8 to 1 mg/L: τ = T + ln(8 / 1) / k = 0.5 + ${nf(Math.log(8),3)} / ${nf(x.k,4)} = ${nf(T+Math.log(8)/x.k,1)} h, so every <b>${tau} h</b>.`,
         `Dose for a peak of 8 mg/L: D = C<sub>peak</sub>·CL·T·(1 − e^(−kτ)) / (1 − e^(−kT)) = 8 × ${nf(x.CL,3)} × 0.5 × ${nf(1-Math.exp(-x.k*tau),3)} / ${nf(1-Math.exp(-x.k*T),4)} = <b>${nf(D,0)} mg</b>.`]};
     },
     wrong:[{reg:{D:100, tau:8}, hint:"lengthen"}, {reg:{D:120, tau:8}, hint:"reduceBoth"}, {reg:{D:60, tau:24}, hint:"increase"}],
     also:"How sick the patient is and where the infection is, whether the creatinine is stable enough for Cockcroft–Gault to mean anything, other nephrotoxic drugs, hearing and balance, fluid status (gentamicin distributes in extracellular fluid), and when to draw levels to check the model against the patient.",
     refs:["gent","cg"]},

    {id:"gent-lv", drug:"gent", title:"Gentamicin after burns: individualizing from two levels", tag:"Aminoglycoside, Sawchuk–Zaske",
     patient:{age:28, sex:"M", ht:178, wt:75, scr:0.8}, clMult:1.8, vMult:1.4,   // the case's premise: 1.8× the predicted clearance, 1.4× the volume
     current:{D:130, tau:8}, sample:{after:0.5, second:6},   // a level 30 min after the infusion ends, and one 6 h after it started
     indication:"A serious Gram-negative infection after extensive burns. He has had 130 mg (about 5 mg/kg a day) every 8 h as 30-minute infusions, long enough to be at steady state, and two levels were drawn in one interval (see Levels). In this case (its premise, not a general figure) he clears gentamicin 1.8 times faster than his creatinine suggests, and it spreads through a volume 1.4 times the usual estimate.",
     target:{kind:"pt", peak:[5,12], troughMax:2,
       why:"The label asks for dosing that avoids prolonged peaks above 12 mcg/mL and troughs above 2 mcg/mL. A peak of at least 5 mg/L is a teaching target (unverified). In burn patients on 5 mg/kg/day, Zaske et al. (1976) found peaks below 4 mg/L and unusually short half-lives, shortened the interval, and individualized each regimen from measured levels."},
     choices:{step:10, min:40, max:600, taus:[4,6,8,12,24], tinf:0.5},
     start:{D:130, tau:8},
     task:"From the two levels, work out his own elimination rate and volume (the Sawchuk–Zaske approach), then choose a dose and interval that give a steady-state peak of 5–12 mg/L and a trough at or below 2 mg/L. Compare his half-life with the one Cockcroft–Gault predicts.",
     plan(x){ const L=levelsOf(this), T=L.T, t1=T+L.after, t2=L.second, k=Math.log(L.peak/L.trough)/(t2-t1);
       const Cmax=L.peak*Math.exp(k*L.after), Cmin=L.trough*Math.exp(-k*(L.tau-t2)), V=(L.D/T)*(1-Math.exp(-k*T))/(k*(Cmax-Cmin*Math.exp(-k*T)));
       const tauIdeal=T+Math.log(8/1)/k, tau=x.upTau(tauIdeal), D=8*k*V*T*(1-Math.exp(-k*tau))/(1-Math.exp(-k*T));
       return {reg:{D, tau}, steps:[
         `The levels: ${nf(L.peak,2)} mg/L at ${nf(t1,2)} h (30 minutes after the infusion ended) and ${nf(L.trough,2)} mg/L at ${nf(t2,2)} h after it started. Both come from the decline, ${nf(t2-t1,2)} h apart.`,
         `His elimination rate: k = ln(${nf(L.peak,2)} / ${nf(L.trough,2)}) / ${nf(t2-t1,2)} = <b>${nf(k,4)} h⁻¹</b>, a half-life of <b>${nf(LN2/k,2)} h</b>, against the ${nf(LN2*(x.V/this.vMult)/(x.CL/this.clMult),2)} h Cockcroft–Gault predicts.`,
         `Back to the end of the infusion: C<sub>max</sub> = ${nf(L.peak,2)} × e^(${nf(k,4)} × ${L.after}) = ${nf(Cmax,2)} mg/L; forward to the end of the interval: C<sub>min</sub> = ${nf(L.trough,2)} × e^(−${nf(k,4)} × ${nf(L.tau-t2,2)}) = ${nf(Cmin,2)} mg/L.`,
         `His volume, from the infusion equation at steady state (Sawchuk–Zaske): V = (D/T)·(1 − e^(−kT)) / (k·[C<sub>max</sub> − C<sub>min</sub>·e^(−kT)]) = (${L.D} / ${T})·${nf(1-Math.exp(-k*T),4)} / (${nf(k,4)} × [${nf(Cmax,2)} − ${nf(Cmin,2)} × ${nf(Math.exp(-k*T),4)}]) = <b>${nf(V,1)} L</b>, against the ${nf(x.V/this.vMult,1)} L population estimate.`,
         `For a peak of 8 and a trough of 1 mg/L: τ = T + ln(8 / 1) / k = ${T} + ${nf(Math.log(8),3)} / ${nf(k,4)} = ${nf(tauIdeal,2)} h, so every <b>${tau} h</b>; dose D = C<sub>peak</sub>·k·V·T·(1 − e^(−kτ)) / (1 − e^(−kT)) = <b>${nf(D,0)} mg</b>, or ${nf(x.round(D),0)} mg rounded.`]};
     },
     wrong:[{reg:{D:130, tau:8}, hint:"increase"}, {reg:{D:360, tau:6}, hint:"reducePeak"}],
     also:"Burn care changes gentamicin handling as the wounds, fluids and kidney function change, so levels are repeated. Other points: the infection, other nephrotoxic drugs, hearing and balance, and whether the levels were drawn at the charted times.",
     refs:["zaske1976","sawchukZaske","gent","cg"]},

    {id:"lev-renal", drug:"lev", title:"Levetiracetam with reduced kidney function", tag:"Antiseizure, label renal table",
     patient:{age:74, sex:"F", ht:160, wt:58, scr:1.4},
     indication:"Partial-onset seizures. She takes 1,500 mg twice daily, the usual maintenance dose, and her kidney function has declined.",
     target:{kind:"table", bsa:true, rows:[{gt:80, tau:12, lo:500, hi:1500}, {ge:50, tau:12, lo:500, hi:1000}, {ge:30, tau:12, lo:250, hi:750}, {ge:0, tau:12, lo:250, hi:500}],
       why:"The label's Table 1 sets the dose by creatinine clearance normalized to 1.73 m² (Cockcroft–Gault, divided by body surface area and multiplied by 1.73): above 80, 500 to 1,500 mg; 50 to 80, 500 to 1,000 mg; 30 to 50, 250 to 750 mg; below 30, 250 to 500 mg; every 12 hours throughout. The label doesn't name a surface-area formula; this case uses Mosteller's."},
     choices:{strengthsOnly:true, taus:[12,24]},
     start:{D:1500, tau:12},
     task:"Normalize her creatinine clearance to 1.73 m², find her group in the label's table, and choose a twice-daily dose in its range. Then check in the model how that dose compares with the exposure of a patient with normal kidneys.",
     plan(x){ const cr=x.crcl, bsa=mosteller(x.p.ht, x.p.wt), crN=cr*1.73/bsa, row=tableRow(this.target, crN), D=1000*x.factor, Dr=x.round(D);
       const ref=1000*24/12/(x.CL/x.factor), her=m=> m.auc24;
       return {reg:{D:Dr, tau:12}, steps:[
         `Body surface area (Mosteller): √(${x.p.ht} × ${x.p.wt} / 3600) = ${nf(bsa,2)} m². Normalized: ${nf(cr,1)} × 1.73 / ${nf(bsa,2)} = <b>${nf(crN,1)} mL/min/1.73 m²</b>, the label's group for ${row.gt!==undefined ? `above ${row.gt}` : row.ge===50 ? "50 to 80" : row.ge===30 ? "30 to 50" : "below 30"}: <b>${row.lo} to ${row.hi} mg every 12 hours</b>.`,
         `Where in that range: with 66% of levetiracetam cleared unchanged by the kidneys, her clearance is (1 − 0.66) + 0.66 × ${nf(cr,1)} / 120 = ${nf(x.factor,2)} of the reference. The dose that matches the exposure of 1,000 mg twice daily with normal kidneys is 1,000 × ${nf(x.factor,2)} = ${nf(D,0)} mg, or <b>${nf(Dr,0)} mg every 12 hours</b> with the tablets.`,
         `On her 1,500 mg twice daily the model gives an AUC24 of ${nf(her(metricsOf(this, caseScenario(this, this.start))),0)} mg·h/L, against ${nf(ref,0)} for a woman of her size with normal kidneys on 1,000 mg twice daily; ${nf(Dr,0)} mg brings her to ${nf(her(metricsOf(this, caseScenario(this, {D:Dr, tau:12}))),0)}.`]};
     },
     wrong:[{reg:{D:1500, tau:12}, hint:"tableDose"}, {reg:{D:500, tau:24}, hint:"tableInterval"}],
     also:"Seizure control and side effects (drowsiness, behavioral changes) at the new dose, whether her kidney function is stable, dialysis (the label adds a supplemental dose after it), and the tablet sizes she can split: the tablets are scored.",
     refs:["keppra","cg"]},

    {id:"mero-renal", drug:"mero", title:"Meropenem with reduced kidney function", tag:"Carbapenem, label renal table",
     patient:{age:68, sex:"M", ht:175, wt:80, scr:2.0},
     indication:"An intra-abdominal infection. He has been started on the usual 1 g every 8 hours, infused over 30 minutes, and his kidney function is reduced.",
     target:{kind:"table", dose:1000, mic:2, rows:[{gt:50, tau:8, frac:1}, {ge:26, tau:12, frac:1}, {ge:10, tau:12, frac:0.5}, {ge:0, tau:24, frac:0.5}],
       why:"The label's Table 1 sets the dose and interval by Cockcroft–Gault creatinine clearance: above 50 mL/min, the recommended dose every 8 hours; 26 to 50, the recommended dose every 12 hours; 10 to 25, half of it every 12 hours; below 10, half every 24 hours. It ties efficacy to the time the unbound level stays above the MIC (2 mg/L here, an illustrative MIC)."},
     choices:{step:250, min:250, max:2000, taus:[6,8,12,24], tinf:0.5},
     start:{D:1000, tau:8},
     task:"Work out his creatinine clearance, find his row in the label's renal table, and choose the dose and interval it gives. Then compare the time above the MIC and the AUC with the regimen he started on.",
     plan(x){ const row=tableRow(this.target, x.crcl), D=this.target.dose*row.frac, cur=metricsOf(this, caseScenario(this, this.start)), nxt=metricsOf(this, caseScenario(this, {D, tau:row.tau}));
       const k0=LN2/drugOf("mero").s.thalf;
       return {reg:{D, tau:row.tau}, steps:[
         `His creatinine clearance, ${nf(x.crcl,0)} mL/min, falls in the label's row for ${row.gt!==undefined ? `more than ${row.gt}` : `${row.ge} to ${row===this.target.rows[1] ? 50 : row===this.target.rows[2] ? 25 : 9}`} mL/min: <b>${row.frac===1 ? "the recommended dose" : "half the recommended dose"} every ${row.tau} hours</b>, so ${nf(D,0)} mg every ${row.tau} h.`,
         `Why the interval stretches: with 70% of meropenem cleared unchanged by the kidneys, his clearance factor is (1 − 0.7) + 0.7 × ${nf(x.crcl,0)} / 120 = ${nf(x.factor,2)}, so his half-life is ${nf(x.th,1)} h instead of ${nf(LN2/k0,1)} h.`,
         `On the 1 g every 8 hours he started on, the model keeps him above the MIC for ${nf(cur.aboveMic,0)}% of each interval with an AUC24 of ${nf(cur.auc24,0)} mg·h/L. On 1 g every 12 hours it is ${nf(nxt.aboveMic,0)}% with an AUC24 of ${nf(nxt.auc24,0)}: less drug a day, still above the MIC for most of each interval, because each dose lingers longer.`,
         `The same man with normal kidneys (the model's reference clearance, ${nf(x.CL/x.factor,2)} L/h) would have an AUC24 of ${nf(3*this.target.dose/(x.CL/x.factor),0)} mg·h/L on 1 g every 8 hours. The label's adjustment keeps him near that, at ${nf(nxt.auc24,0)}, where the unadjusted regimen nearly doubles it, at ${nf(cur.auc24,0)}.`]};
     },
     wrong:[{reg:{D:1000, tau:8}, hint:"tableInterval"}, {reg:{D:500, tau:12}, hint:"tableDose"}],
     also:"The infection and its site, the organism's actual MIC, whether kidney function is changing, dialysis (the table doesn't cover it), seizure risk, and interacting drugs such as valproic acid, whose levels meropenem can lower.",
     refs:["meropenem","cg"]},

    {id:"ptz-renal", drug:"pip", title:"Piperacillin-tazobactam with reduced kidney function", tag:"Penicillin, label renal table, fT>MIC",
     patient:{age:72, sex:"F", ht:160, wt:62, scr:1.6},
     indication:"A complicated intra-abdominal infection, with Pseudomonas aeruginosa among the organisms considered: the MIC is taken as 16 mg/L, the FDA susceptible breakpoint. She was started on the usual 3.375 g every 6 hours, infused over 30 minutes, and her kidney function is reduced.",
     target:{kind:"table", mic:16, unbound:true, rows:[{gt:40, tau:6, D:3000}, {ge:20, tau:6, D:2000}, {ge:0, tau:8, D:2000}],
       why:"The label's Table 1 (all indications except nosocomial pneumonia) sets the dose by Cockcroft–Gault creatinine clearance: above 40 mL/min, 3.375 g every 6 hours; 20 to 40, 2.25 g every 6 hours; below 20, 2.25 g every 8 hours. Doses here are the piperacillin in each, 3,000 or 2,000 mg. The label names time above the MIC as the index most predictive of efficacy; the model reads it on the unbound level (fu 0.7, from the label's 30% binding)."},
     choices:{step:1000, min:2000, max:4000, taus:[6,8,12], tinf:0.5},
     start:{D:3000, tau:6},
     task:"Work out her creatinine clearance, find her row in the label's renal table, and choose the piperacillin dose and interval it gives. Then compare fT>MIC with the same regimen infused over 3 hours.",
     plan(x){ const row=tableRow(this.target, x.crcl), D=row.D, ft=(reg, tinf)=> PK.micStats(Object.assign(caseScenario(this, reg), tinf ? {tinf} : {}), this.target.mic, 24);
       const cur=ft(this.start), nxt=ft({D, tau:row.tau}), ext=ft({D, tau:row.tau}, 3), lod=ft({D:3000, tau:8}, 4), k0=LN2/drugOf("pip").s.thalf;
       const norm=PK.micStats(PK.normalizeScenario(PK.scenario(PK.drugScenario(drugOf("pip")))), this.target.mic, 24), mg=v=> v.toLocaleString("en-US");
       return {reg:{D, tau:row.tau}, steps:[
         `Her creatinine clearance, ${nf(x.crcl,0)} mL/min, falls in the label's row for ${row.gt!==undefined ? `more than ${row.gt}` : row.ge===20 ? "20 to 40" : "less than 20"} mL/min: <b>${row.D===3000 ? "3.375 g" : "2.25 g"} every ${row.tau} hours</b>, so ${mg(D)} mg of piperacillin every ${row.tau} h.`,
         `Why less drug is needed: with 68% of piperacillin excreted unchanged by the kidneys, her clearance factor is (1 − 0.68) + 0.68 × ${nf(x.crcl,0)} / 120 = ${nf(x.factor,2)}, so her half-life is ${nf(x.th,2)} h instead of ${nf(LN2/k0,2)} h.`,
         `The unbound level (fu 0.7) is above the 16 mg/L MIC while the total level is above 16 / 0.7 = ${nf(16/0.7,1)} mg/L. On the 3,000 mg every 6 hours she started on, that is ${nf(cur.ft,0)}% of each interval, with an AUC24 of ${nf(cur.auc24,0)} mg·h/L, ${nf(cur.auc24/norm.auc24,1)} times the ${nf(norm.auc24,0)} of the same regimen with normal kidneys. On ${mg(D)} mg every ${row.tau} hours it is ${nf(nxt.ft,0)}%, with an AUC24 of ${nf(nxt.auc24,0)}. With normal kidneys, 3,000 mg every 6 hours over 30 minutes gives ${nf(norm.ft,0)}%: her slower clearance keeps each dose above the MIC for longer.`,
         `The same ${mg(D)} mg every ${row.tau} hours infused over 3 hours gives ${nf(ext.ft,0)}% with the same AUC24. For comparison, the extended-infusion scheme of Lodise et al. (3.375 g over 4 hours every 8 hours) gives ${nf(lod.ft,0)}% in her, with an AUC24 of ${nf(lod.auc24,0)} mg·h/L. The label's table is written for 30-minute infusions.`]};
     },
     wrong:[{reg:{D:3000, tau:6}, hint:"tableDose"}, {reg:{D:2000, tau:8}, hint:"tableInterval"}],
     also:"The infection's source and severity, the organism's measured MIC, whether her kidney function is changing, dialysis (hemodialysis removes 30% to 40% of a dose and has its own row in the label), the sodium each dose carries (65 mg per gram of piperacillin), and her other drugs: kidney injury has been reported more often when piperacillin-tazobactam is given with vancomycin.",
     refs:["zosyn","fdaPtz","lodise2007","cg"]},

    {id:"gent-hd", drug:"gent", title:"Gentamicin on hemodialysis", tag:"Aminoglycoside, dose after each session",
     patient:{age:64, sex:"M", ht:175, wt:80, scr:7.5},
     hd:{every:48, dur:8, fall:0.5},
     indication:"End-stage kidney disease, on hemodialysis for 8 hours every 48 hours, with a gram-negative infection. He has had a first dose; the next is due at the end of tonight's session.",
     target:{kind:"perkg", lo:1, hi:1.7,
       why:"The label: an eight-hour hemodialysis may reduce serum concentrations of gentamicin by approximately 50%, and the dose at the end of each dialysis period is 1 to 1.7 mg/kg, depending on the severity of infection."},
     choices:{step:10, min:40, max:300, taus:[48], tinf:0.5},
     start:{D:200, tau:48},
     task:"Choose the dose to give at the end of each session. Then compare it with the amount a session removes, and look at the levels before and after each session.",
     plan(x){ const r=x.round(1.5*this.patient.wt), p=caseScenario(this, {D:r, tau:48}), m=metricsOf(this, p), s=m.sessions[m.sessions.length-1], th=LN2/PK.keOf(p);
       return {reg:{D:r, tau:48}, steps:[
         `Between sessions he clears gentamicin only through his own kidneys: with a creatinine clearance of ${nf(x.crcl,1)} mL/min, ${nf(100*x.factor,1)}% of the reference clearance, ${nf(PK.derived(p).CL,2)} L/h, a half-life of ${nf(th,0)} h.`,
         `The label says an eight-hour session may lower the level by about 50%. In the model that takes a dialysis clearance of ${nf(p.hdcl,2)} L/h on top of his own, while the session runs.`,
         `The label's dose at the end of each session is 1 to 1.7 mg/kg: ${nf(this.patient.wt,0)} to ${nf(1.7*this.patient.wt,0)} mg for ${this.patient.wt} kg. 1.5 mg/kg is <b>${nf(r,0)} mg</b> (rounded to 10 mg), after each session.`,
         `On it, each dose peaks at ${m.peaks.map(v=>nf(v,1)).join(", then ")} mg/L. Before the third session the level is ${nf(s.pre,2)} mg/L, and the session takes it to ${nf(s.post,2)} mg/L, removing ${nf(s.removed,0)} mg.`,
         `Replacing only what the session removed, about ${nf(s.supplement,0)} mg, would bring the level back to ${nf(s.pre,2)} mg/L, not to a peak. After a session ${nf(100*s.post/m.peaks[m.peaks.length-1],0)}% of the peak before it is left, so the dose at the end of each session is a full dose that rebuilds the peak, not a top-up.`]};
     },
     wrong:[{reg:{D:200, tau:48}, hint:"perkgHigh"}, {reg:{D:60, tau:48}, hint:"perkgLow"}],
     also:"His residual kidney function, the dialysis method (the label notes that the amount removed varies with it), when levels are drawn (gentamicin returning from the tissues after a session raises the level again; this model has no rebound), the severity of the infection, and hearing and balance, which aminoglycosides can damage, more so with renal impairment.",
     refs:["gent","cg"]},

    {id:"gent-ext", drug:"gent", title:"Gentamicin once daily (extended interval)", tag:"Aminoglycoside, Hartford approach",
     patient:{age:45, sex:"F", ht:165, wt:65, scr:0.8},
     indication:"A Gram-negative infection, with the same drug given two ways: once daily at a high dose, or conventionally every 8 h.",
     target:{kind:"hartford", perKg:7, bands:[[60,24],[40,36],[20,48]],
       why:"The Hartford program (Nicolau et al., 1995) gave a fixed 7 mg/kg and set the interval from estimated creatinine clearance: at least 60 mL/min every 24 h, 40 to 59 every 36 h, 20 to 39 every 48 h, then adjusted it with one measured level and a nomogram."},
     choices:{step:10, min:40, max:900, taus:[8,12,24,36,48], tinf:0.5},
     start:{D:110, tau:8},
     task:"Choose the regimen the Hartford program would start for this patient, then compare its peak, trough and drug-free hours with the conventional 110 mg (1.7 mg/kg) every 8 h it opens with.",
     plan(x){ const band=this.target.bands.find(b=>x.crcl>=b[0]), D=7*x.p.wt;
       return {reg:{D, tau:band ? band[1] : 48}, steps:[
         `Dose: 7 mg/kg × ${x.p.wt} kg = <b>${nf(D,0)} mg</b>.`,
         `Interval from CrCl ${nf(x.crcl,0)} mL/min: ${band ? `≥ ${band[0]} mL/min → every <b>${band[1]} h</b>` : "below 20 mL/min, outside the program's bands"}.`,
         `The high peak comes with a long drug-free stretch before the next dose; the conventional regimen keeps a low level throughout.`]};
     },
     wrong:[{reg:{D:110, tau:8}, hint:"hartfordDose"}, {reg:{D:460, tau:36}, hint:"hartfordInterval"}],
     also:"Who the approach wasn't studied in (for example burns, pregnancy, endocarditis, CrCl below 20 mL/min), dosing weight in obesity, when the single level is drawn for the nomogram, and whether the infection calls for a synergy regimen instead.",
     refs:["nicolau","gent","cg"]},

    {id:"vanc", drug:"vanc", title:"Vancomycin to an AUC target", tag:"Glycopeptide, AUC24",
     patient:{age:58, sex:"M", ht:178, wt:85, scr:1.2},
     indication:"A serious MRSA infection. The target is an AUC24 of 400–600 mg·h/L, assuming an MIC of 1 mg/L (so AUC24/MIC equals AUC24).",
     target:{kind:"auc", auc:[400,600],
       why:"The 2020 consensus guideline suggests an AUC between 400 and 600 mg·h/L for serious MRSA infections, instead of trough-only monitoring."},
     choices:{step:250, min:250, max:3000, taus:[8,12,24], tinf:"label"},
     start:{D:1000, tau:8},
     task:"The regimen opens at 1 g every 8 h. Check its AUC24, then choose a dose and interval that put the steady-state AUC24 inside 400–600 mg·h/L.",
     plan(x){ const daily=500*x.CL, tau=12, D=daily*tau/24;
       return {reg:{D, tau}, steps:[
         `At steady state the AUC over 24 h is the daily dose divided by clearance: AUC24 = daily dose / CL.`,
         `For the middle of the range, 500 mg·h/L: daily dose = 500 × ${nf(x.CL,2)} L/h = ${nf(daily,0)} mg, or ${nf(D,0)} mg every ${tau} h; rounded to 250 mg, <b>${nf(Math.round(D/250)*250,0)} mg every ${tau} h</b>.`,
         `Each dose is infused at no more than 10 mg/min (label), so 1 g takes 100 minutes.`,
         (()=>{ const one=caseScenario(this, {D:Math.round(D/250)*250, tau}), two=twoCmtOf(one), a=PK.ssProfile(one), b=PK.ssProfile(two);
           const auc=q=>PK.derived(q).auc*24/q.tau;
           return `The one-compartment model is a teaching simplification: vancomycin distributes in two phases. With a two-compartment version of this patient (the same clearance and total volume, half of it central, k12 = k21 = 0.545 h⁻¹, a teaching assumption), the same regimen peaks at ${nf(b.ssPeak,1)} instead of ${nf(a.ssPeak,1)} mg/L, but the AUC24 is still ${nf(auc(two),0)} mg·h/L (one compartment: ${nf(auc(one),0)}). That is why AUC-guided dosing holds up when the model is simplified.`; })()]};
     },
     wrong:[{reg:{D:1000, tau:8}, hint:"aucHigh"}, {reg:{D:500, tau:12}, hint:"aucLow"}],
     also:"This one-compartment model is a teaching simplification: vancomycin distributes in two phases, and practice estimates the AUC from two levels or with Bayesian software. Kidney function trends, other nephrotoxins, the infection site, and whether a loading dose is needed all shape the choice.",
     refs:["rybak","idsaVanc","vanc","cg"]},

    {id:"vanc-lv", drug:"vanc", title:"Vancomycin: the AUC from two levels", tag:"Glycopeptide, two-level AUC",
     patient:{age:52, sex:"M", ht:175, wt:95, scr:0.9},
     current:{D:1000, tau:12}, sample:{after:1},   // the levels: a peak 1 h after the infusion ends, and a trough
     indication:"A serious MRSA infection. He has had 1 g every 12 h long enough to be at steady state, and two levels were drawn in one interval: one an hour after the infusion ended, after distribution, and one just before the next dose (see Levels).",
     target:{kind:"auc", auc:[400,600],
       why:"The 2020 consensus guideline suggests an AUC between 400 and 600 mg·h/L for serious MRSA infections. One approach it describes estimates the AUC from two levels near steady state, a post-distribution peak 1–2 hours after the infusion and a trough, with first-order equations; Bayesian software is its preferred approach."},
     choices:{step:250, min:250, max:3000, taus:[8,12,24], tinf:"label"},
     start:{D:1000, tau:12},
     task:"Estimate his AUC24 from the two levels with first-order equations: the elimination rate from the fall between them, the level at the end of the infusion, then the area over one interval. Then choose a regimen that brings the steady-state AUC24 into 400–600 mg·h/L.",
     plan(x){ const L=levelsOf(this), e=twoLevel(L), target=500, daily=L.D*(24/L.tau)*target/e.auc24, tau=12, D=daily*tau/24, exact=PK.derived(L.p).auc*24/L.tau;
       const q=twoCmtOf(L.p), trueTwo=PK.derived(q).auc*24/L.tau, at=a=>twoLevel({peak:PK.ssConc(q, L.T+a), trough:PK.ssConc(q, L.tau-1e-9), T:L.T, after:a, tau:L.tau}).auc24;
       return {reg:{D, tau}, steps:[
         `The levels: ${nf(L.peak,1)} mg/L at ${nf(L.T+L.after,2)} h (an hour after the ${nf(L.T,2)} h infusion ended) and ${nf(L.trough,1)} mg/L at ${L.tau} h, just before the next dose. They are ${nf(e.dt,2)} h apart.`,
         `Elimination rate: k = ln(${nf(L.peak,1)} / ${nf(L.trough,1)}) / ${nf(e.dt,2)} = <b>${nf(e.k,4)} h⁻¹</b>, a half-life of ${nf(LN2/e.k,1)} h.`,
         `Back to the end of the infusion: C<sub>max</sub> = ${nf(L.peak,1)} × e^(${nf(e.k,4)} × ${L.after}) = ${nf(e.Cmax,1)} mg/L. At steady state the level when the infusion starts is the trough, ${nf(L.trough,1)} mg/L.`,
         `Area over one interval: the infusion as a straight line, T·(C<sub>min</sub> + C<sub>max</sub>) / 2 = ${nf(L.T,2)} × (${nf(L.trough,1)} + ${nf(e.Cmax,1)}) / 2 = ${nf(e.aInf,1)}, plus the decline, (C<sub>max</sub> − C<sub>min</sub>) / k = ${nf(e.aDecl,1)}: ${nf(e.aInf+e.aDecl,1)} mg·h/L. AUC24 = ${nf(e.aInf+e.aDecl,1)} × 24 / ${L.tau} = <b>${nf(e.auc24,0)} mg·h/L</b>, ${e.auc24<400 ? "below" : e.auc24>600 ? "above" : "inside"} the target.`,
         `The AUC rises in proportion to the daily dose: for 500 mg·h/L, ${nf(L.D*24/L.tau,0)} × 500 / ${nf(e.auc24,0)} = ${nf(daily,0)} mg a day, or ${nf(D,0)} mg every ${tau} h; rounded to 250 mg, <b>${nf(Math.round(D/250)*250,0)} mg every ${tau} h</b>.`,
         `The model's own AUC24 on 1 g every 12 h is ${nf(exact,0)} mg·h/L (daily dose / CL), so the estimate from the two levels is within ${nf(Math.abs(100*(e.auc24/exact-1)),1)}%: the straight-line infusion phase and the levels' rounding account for the difference.`,
         `Why the peak is drawn after distribution: in a two-compartment version of him (the same clearance, a teaching assumption), a peak drawn as the infusion ends would put the AUC24 at ${nf(at(0),0)} instead of ${nf(trueTwo,0)} mg·h/L (${signed(100*(at(0)/trueTwo-1),1)}%), while one drawn an hour later gives ${nf(at(1),0)} (${signed(100*(at(1)/trueTwo-1),1)}%).`]};
     },
     wrong:[{reg:{D:1000, tau:12}, hint:"aucLow"}, {reg:{D:2000, tau:12}, hint:"aucHigh"}],
     also:"Bayesian software (the guideline's preferred approach, which can work from one or two levels before steady state), whether the levels were drawn at the charted times and truly at steady state, the infusion's actual start and stop times, kidney function trends, and other nephrotoxic drugs.",
     refs:["rybakCid","rybak","idsaVanc","vanc","cg"]},

    {id:"vanc-bayes", drug:"vanc", title:"Vancomycin: two levels an hour apart", tag:"Glycopeptide, Bayesian estimate",
     patient:{age:66, sex:"M", ht:175, wt:82, scr:1.4}, clMult:0.7, vMult:1.1,   // the premise: 0.7× the predicted clearance, 1.1× the volume
     current:{D:750, tau:12}, bayes:{dose:8, times:[2.25, 3.25], errors:[0.05, -0.05]},   // an hour after the infusion ends, and an hour later
     indication:"A serious MRSA infection. He has had 750 mg every 12 hours (each infused over 1.25 hours) since admission, the regimen the patient model suggests for his creatinine. After the eighth dose two levels were drawn, meant as a peak and a trough, but the second was drawn only an hour after the first (see Levels).",
     target:{kind:"auc", auc:[400,600],
       why:"The 2020 consensus guideline suggests an AUC between 400 and 600 mg·h/L for serious MRSA infections. One approach it describes estimates the AUC from two levels with first-order equations; Bayesian software is its preferred approach."},
     choices:{step:250, min:250, max:3000, taus:[8,12,24], tinf:"label"},
     start:{D:750, tau:12},
     task:"Estimate his AUC24 two ways: with the two-level (first-order) equations, and with a Bayesian estimate (Open in simulator brings his levels; the estimate is under the clinical patient). Then choose a regimen that puts the steady-state AUC24 in 400–600 mg·h/L.",
     plan(x){ const b=bayesOf(this), e=b.est, sz=b.sz, tau=12, D=500*e.CL*tau/24, Dr=x.round(D), [l1,l2]=b.lv;
       const drop=100*(1-Math.exp(-(b.trueCL/b.trueV)*(l2.dt-l1.dt)));
       return {reg:{D, tau}, steps:[
         `On 750 mg every 12 h that predicts an AUC24 of ${nf(1500/b.pr.CL,0)} mg·h/L (daily dose / CL), inside the target.`,
         `The levels: ${nf(l1.c,1)} mg/L at ${nf(l1.dt,2)} h after the eighth dose started and ${nf(l2.c,1)} mg/L at ${nf(l2.dt,2)} h, an hour apart.`,
         `Two-level equations: k = ln(${nf(l1.c,1)} / ${nf(l2.c,1)}) / 1 = <b>${nf(sz.k,4)} h⁻¹</b> (a half-life of ${nf(LN2/sz.k,1)} h); the trough extrapolated to 12 h is ${nf(sz.Cmin,1)} mg/L, and the AUC24 comes to <b>${nf(sz.auc24,0)} mg·h/L</b>: on target, no change.`,
         `But an hour is too short: over one hour his level really falls about ${nf(drop,0)}%, and each level carries a few percent of assay error (in this case, its premise: +5% and −5%). The slope between them is as much error as fall, and the extrapolated trough inherits it.`,
         `Bayesian estimate from the same two levels, weighed against the patient model (CVs 30% and 20%): clearance <b>${nf(e.CL,2)} L/h</b> (95% ${nf(e.ci.CL[0],2)}–${nf(e.ci.CL[1],2)}), volume ${nf(e.V,1)} L. The levels are too close together to pin down the slope, so the prior holds it steady, while their height (both well above the prediction) moves clearance down. On 750 mg every 12 h that is an AUC24 of <b>${nf(1500/e.CL,0)} mg·h/L</b>, above the target.`,
         `For 500 mg·h/L: D = 500 × ${nf(e.CL,2)} × 12 / 24 = ${nf(D,0)} mg every 12 h; rounded to 250 mg, <b>${nf(Dr,0)} mg every 12 h</b>.`,
         `In this case's premise he clears ${nf(b.trueCL,2)} L/h, so 750 mg every 12 h really gives an AUC24 of ${nf(1500/b.trueCL,0)} mg·h/L: the two-level conclusion would have left him above the target, while the Bayesian estimate is within ${nf(Math.abs(100*(e.CL/b.trueCL-1)),0)}% of his clearance.`]};
     },
     wrong:[{reg:{D:750, tau:12}, hint:"aucHigh"}, {reg:{D:250, tau:12}, hint:"aucLow"}],
     also:"When the levels were really drawn (a charted time can differ from the real one), whether the infusion ran on schedule, kidney function trends, other nephrotoxic drugs, and repeating a level after the change. Bayesian programs used in practice have population models built for the drug; the CVs here are teaching assumptions.",
     refs:["sheiner1979","rybakCid","vanc","cg"]},

    {id:"gent-bayes", drug:"gent", title:"Gentamicin: when the second level comes back higher", tag:"Aminoglycoside, Bayesian estimate",
     patient:{age:58, sex:"F", ht:163, wt:70, scr:1.2}, clMult:0.6, vMult:1.2,   // the premise: 0.6× the predicted clearance, 1.2× the volume
     current:{D:120, tau:8}, bayes:{dose:4, times:[1, 2], errors:[-0.05, 0.05]},   // 30 minutes after the infusion ends, and an hour later
     indication:"A serious Gram-negative infection. She has had 120 mg every 8 hours as 30-minute infusions. After the fourth dose two levels were drawn an hour apart, the first 30 minutes after the infusion ended (see Levels).",
     target:{kind:"pt", peak:[5,12], troughMax:2,
       why:"The label asks for dosing that avoids prolonged peaks above 12 mcg/mL and troughs above 2 mcg/mL. A peak of at least 5 mg/L is a teaching target (unverified)."},
     choices:{step:10, min:40, max:600, taus:[8,12,24,36,48], tinf:0.5},
     start:{D:120, tau:8},
     task:"Try the two-level (Sawchuk–Zaske) equations on her levels, then estimate her elimination rate and volume with the Bayesian estimate (Open in simulator brings her levels). Choose a dose and interval that give a steady-state peak of 5–12 mg/L and a trough at or below 2 mg/L.",
     plan(x){ const b=bayesOf(this), e=b.est, T=0.5, k=e.CL/e.V, tauIdeal=T+Math.log(8/1)/k, tau=x.upTau(tauIdeal), D=8*k*e.V*T*(1-Math.exp(-k*tau))/(1-Math.exp(-k*T)), [l1,l2]=b.lv;
       return {reg:{D, tau}, steps:[
         `The levels: ${nf(l1.c,1)} mg/L at ${nf(l1.dt,2)} h after the fourth dose started and <b>${nf(l2.c,1)} mg/L</b> at ${nf(l2.dt,2)} h. The second is higher than the first.`,
         `Two-level equations: k = ln(${nf(l1.c,1)} / ${nf(l2.c,1)}) / 1 = ${signed(b.sz.k,4)} h⁻¹, a negative elimination rate. The method has nothing to work with: over one hour her level really falls only about ${nf(100*(1-Math.exp(-b.trueCL/b.trueV)),0)}%, less than the assay error in the two levels (in this case, its premise: −5% and +5%).`,
         `Bayesian estimate from the same levels, weighed against the patient model: clearance ${nf(e.CL,2)} L/h, volume ${nf(e.V,1)} L, so k = ${nf(k,4)} h⁻¹ and a half-life of <b>${nf(LN2/k,1)} h</b> (95% ${nf(e.ci.thalf[0],1)}–${nf(e.ci.thalf[1],1)} h). The levels' height says she clears it more slowly than predicted; the prior supplies the slope they can't.`,
         `For a peak of 8 and a trough of 1 mg/L: τ = T + ln(8 / 1) / k = ${T} + ${nf(Math.log(8),3)} / ${nf(k,4)} = ${nf(tauIdeal,1)} h, so every <b>${tau} h</b>; D = C<sub>peak</sub>·k·V·T·(1 − e^(−kτ)) / (1 − e^(−kT)) = <b>${nf(D,0)} mg</b>, or ${nf(x.round(D),0)} mg rounded.`,
         `In this case's premise her half-life is ${nf(LN2*b.trueV/b.trueCL,1)} h: on 120 mg every 8 hours her trough would climb to ${nf(PK.ssProfile(b.truth).ssTrough,1)} mg/L.`]};
     },
     wrong:[{reg:{D:120, tau:8}, hint:"reduceBoth"}, {reg:{D:100, tau:12}, hint:"lengthen"}, {reg:{D:80, tau:24}, hint:"increase"}],
     also:"Levels drawn close together can't show a slope, which is why two-level methods space them several hours apart; Bayesian programs used in practice have population models built for the drug. Also: kidney function trends, hearing and balance, other nephrotoxic drugs, and repeating a level after the change.",
     refs:["sheiner1979","gent","cg"]},

    {id:"phe", drug:"phe", title:"Phenytoin: a low level and low albumin", tag:"Saturable kinetics, albumin",
     patient:{age:60, sex:"F", ht:163, wt:60, scr:0.8, alb:2.5},
     measured:{C:8, D:300},
     indication:"Seizure prophylaxis. She takes 300 mg of phenytoin sodium a day, and a steady-state total level comes back at 8 mg/L with albumin at 2.5 g/dL.",
     target:{kind:"css", css:[10,20],
       why:"The label gives a clinically effective total level of 10 to 20 mcg/mL. The model's levels assume normal albumin binding, so they are compared with the albumin-adjusted level."},
     choices:{step:10, min:100, max:600, taus:[24]},
     start:{D:400, tau:24},
     task:"The measured level of 8 mg/L looks low, and the team proposes 400 mg a day. Adjust the level for albumin, estimate her Vmax from it (with Km at 4 mg/L), then choose a daily dose whose predicted level falls in 10–20 mg/L.",
     plan(x){ const m=this.measured, st=PK.sheinerTozer(m.C, x.p.alb, false), R=0.92*m.D, Vm=R*(x.p.km+st.value)/st.value, R15=Vm*15/(x.p.km+15);
       return {reg:{D:R15/0.92, tau:24}, steps:[
         `Adjust the level for albumin (Sheiner–Tozer): ${m.C} / (0.2 × ${x.p.alb} + 0.1) = <b>${nf(st.value,1)} mg/L</b>. On normal binding it is already in range.`,
         `Her Vmax from that level: R = 0.92 × ${m.D} = ${nf(R,0)} mg/day, and at steady state Vmax = R·(Km + C) / C = ${nf(R,0)} × (4 + ${nf(st.value,1)}) / ${nf(st.value,1)} = <b>${nf(Vm,0)} mg/day</b> (${nf(Vm/x.p.wt,2)} mg/kg/day).`,
         `The daily input for a level of 15 mg/L: R = Vmax·C / (Km + C) = ${nf(Vm,0)} × 15 / 19 = ${nf(R15,0)} mg of phenytoin, or ${nf(R15/0.92,0)} mg of phenytoin sodium. With 30 and 100 mg capsules that rounds to <b>${nf(x.round(R15/0.92),0)} mg a day</b>.`,
         `400 mg a day would be an input of ${nf(0.92*400,0)} mg/day, ${Vm>0.92*400 ? "just under" : "above"} her Vmax of ${nf(Vm,0)}: ${Vm>0.92*400 ? "a very high level" : "no steady state at all"}.`]};
     },
     wrong:[{reg:{D:400, tau:24}, hint:"none"}, {reg:{D:330, tau:24}, hint:"cssHigh"}],
     also:"Whether an unbound (free) level can be measured instead of adjusting a total one, kidney function (the adjustment changes in end-stage kidney disease), interacting drugs, adherence, and waiting long enough after any change before checking again: near saturation the time to steady state stretches out.",
     refs:["dilantin","sheinerTozer"]},

    {id:"dig", drug:"dig", title:"Digoxin in an older adult", tag:"Narrow window, ng/mL",
     patient:{age:82, sex:"F", ht:157, wt:55, scr:1.3},
     indication:"Rate control in atrial fibrillation, starting digoxin tablets once a day.",
     target:{kind:"pt", troughMin:0.5, peak:[0,2],
       why:"The label associates levels below 0.5 ng/mL with diminished efficacy and levels above 2 ng/mL with more toxicity, and notes more adverse reactions as levels rise above 1.2 ng/mL."},
     choices:{step:62.5, min:62.5, max:500, taus:[24,48]},
     start:{D:250, tau:24},
     task:"The regimen opens at 250 mcg daily. Check it, then choose a daily dose so the steady-state trough stays at or above 0.5 ng/mL and the peak at or below 2 ng/mL.",
     plan(x){ const D=1*x.CL*24/x.p.F, LD=1*x.V/x.p.F;
       return {reg:{D, tau:24}, steps:[
         `Aim for an average of about 1 ng/mL: D = C<sub>avg</sub>·CL·τ / F = 1 × ${nf(x.CL,2)} × 24 / ${x.p.F} = ${nf(D,0)} mcg a day, which rounds to <b>${nf(x.round(D),1)} mcg</b> with the 62.5, 125 and 250 mcg tablets.`,
         `Half-life ${nf(x.th,0)} h, so steady state (90%) takes about ${nf(3.32*x.th/24,1)} days without a loading dose.`,
         `A loading dose to reach 1 ng/mL at once: LD = C × V / F = 1 × ${nf(x.V,0)} / ${x.p.F} = ${nf(LD,0)} mcg, usually split into several doses.`]};
     },
     wrong:[{reg:{D:250, tau:24}, hint:"reduce"}, {reg:{D:62.5, tau:48}, hint:"increaseLow"}],
     also:"Potassium and magnesium, thyroid function, interacting drugs (many raise digoxin levels), symptoms of toxicity, and drawing levels at least 6 hours after a dose, once the tissue distribution phase this model leaves out is over.",
     refs:["lanoxin","cg"]},

    {id:"theo", drug:"theo", title:"Theophylline in a smoker", tag:"Narrow window, clearance factor",
     patient:{age:35, sex:"M", ht:178, wt:70, scr:0.9}, clMult:1.5,
     indication:"Asthma, extended-release theophylline tablets. He smokes, which the label says raises clearance by about 50% in young adults.",
     target:{kind:"pt", peak:[10,20], troughMin:5,
       why:"The label gives bronchodilation over 5–20 mcg/mL, improvement usually with peaks above 10, and more adverse reactions above 20."},
     choices:{strengthsOnly:true, taus:[8,12,24]},
     start:{D:300, tau:12},
     task:"The regimen opens at 300 mg every 12 h, a common non-smoker start. Check it, then choose a dose and interval that keep the steady-state peak in 10–20 mg/L and the trough at or above 5 mg/L.",
     plan(x){ const D=12*x.CL*12/x.p.F;
       return {reg:{D, tau:12}, steps:[
         `Smoking raises clearance by about half: CL = 1.5 × the non-smoker's = <b>${nf(x.CL,2)} L/h</b>, and the half-life shortens to ${nf(x.th,1)} h.`,
         `For an average of 12 mg/L every 12 h: D = C<sub>avg</sub>·CL·τ / F = 12 × ${nf(x.CL,2)} × 12 = ${nf(D,0)} mg, which the 300 and 450 mg tablets round to <b>${nf(x.round(D),0)} mg</b>.`,
         `The extended-release tablet's slow absorption keeps the swing between peak and trough small.`]};
     },
     wrong:[{reg:{D:300, tau:12}, hint:"increaseLow"}, {reg:{D:900, tau:24}, hint:"shorten"}],
     also:"What happens if he stops smoking (clearance falls and levels climb over the following week or so), interacting drugs, illness with fever, liver function, and checking a level once he's at steady state.",
     refs:["theo"]},

    {id:"li", drug:"li", title:"Lithium with lower kidney function", tag:"Renal elimination, mEq/L",
     patient:{age:68, sex:"M", ht:175, wt:80, scr:1.3},
     indication:"Bipolar I disorder, lithium carbonate. Levels are drawn 12 hours after the last dose.",
     target:{kind:"at", at:12, range:[0.8,1.2], peakMax:1.5,
       why:"The label's acute goal is 0.8–1.2 mEq/L, with levels drawn 12 hours after the last dose, and it puts toxic concentrations from 1.5 mEq/L."},
     choices:{step:150, min:150, max:1800, taus:[8,12,24]},
     start:{D:900, tau:12},
     task:"The regimen opens at 900 mg every 12 h. Check it, then choose a dose and interval so the 12-hour level at steady state is 0.8–1.2 mEq/L and the peak stays below 1.5 mEq/L. Then look at what one missed dose does.",
     plan(x){ // every 12 h the 12-hour level is the trough, which sits below the average: aim the average at 1.1
       const daily=1.1*x.CL*24/(x.p.S), D=daily/2;
       return {reg:{D, tau:12}, steps:[
         `Lithium is cleared by the kidneys (fe = 1), so its clearance follows CrCl: ${nf(x.CL,3)} L/h and a half-life of ${nf(x.th,0)} h.`,
         `Dosed every 12 h, the 12-hour level is the trough, a little under the average. Aiming the average at 1.1 mEq/L: daily dose = C<sub>avg</sub>·CL·24 / S = 1.1 × ${nf(x.CL,3)} × 24 / ${nf(x.p.S,5)} = ${nf(daily,0)} mg, or ${nf(D,0)} mg every 12 h, which 150 mg steps round to <b>${nf(x.round(D),0)} mg every 12 h</b>.`,
         `With a ${nf(x.th,0)} h half-life, 90% of steady state takes about ${nf(3.32*x.th/24,1)} days, which is why levels are checked only after several days.`]};
     },
     wrong:[{reg:{D:900, tau:12}, hint:"reduce"}, {reg:{D:150, tau:24}, hint:"increaseLow"}],
     also:"Sodium and fluid intake, diuretics, ACE inhibitors and NSAIDs (they raise levels), thyroid and kidney monitoring, early signs of toxicity, and what to do after a missed dose: take it if remembered soon, never double up.",
     refs:["lithium","cg"]},

    {id:"late", drug:null, title:"A late dose: which drug minds?", tag:"Half-life reasoning",
     patient:{age:40, sex:"M", ht:175, wt:70, scr:0.8},
     indication:"Two people on steady regimens each take one dose 6 hours late: amoxicillin 500 mg every 8 h, and digoxin 250 mcg once a day.",
     target:{kind:"choice", late:6, drugs:["amox","dig"],
       why:"How much the level falls in the extra hours depends on the half-life: each half-life halves it."},
     choices:{options:[["amox","Amoxicillin"],["dig","Digoxin"]]},
     task:"Before the late dose, whose level falls further below its usual trough, in proportion? Reason from the half-lives, then check.",
     also:"Whether the drug works through time above a threshold or through total exposure, what the patient information leaflet says about missed doses, and whether a late dose would crowd the next one.",
     refs:["amox","lanoxin"]}
  ];
  const caseById=id=> CASES.find(c=>c.id===id)||null;

  /* ================= THE MODEL FOR A CASE ================= */
  // The case patient in the clinical model, with the case drug, at a regimen {D, tau} (and an infusion time).
  function tinfFor(c, D){
    const t=c.choices.tinf;
    return t==="label" ? Math.max(1, D/600) : t || 1;   // vancomycin: no faster than 10 mg/min
  }
  function caseScenario(c, reg, drugId, prior){
    const d=drugOf(drugId||c.drug), base=PK.drugScenario(d), pt=c.patient;
    const over={pm:"clinical", age:pt.age, sex:pt.sex, ht:pt.ht, wt:pt.wt, scr:pt.scr, alb:pt.alb||4, wtm:"actual",
      dosing:"repeated", loadMult:1, missed:1};
    if(reg){ over.D=reg.D; over.tau=reg.tau; if(base.route==="inf") over.tinf=tinfFor(c, reg.D); }
    const p=Object.assign({}, base, over);
    // the case's premise (what the levels reveal); `prior` leaves it out: the patient as the model predicts him
    if(c.clMult && !prior) p.thalf=base.thalf/c.clMult;   // a clearance factor: the same volume, a shorter half-life
    if(c.vMult && !prior){ p.V=base.V*c.vMult; p.thalf*=c.vMult; }   // a volume factor: the same clearance, a longer half-life
    if(c.id==="phe") p.vmax=pheVmax(c)/(pt.wt*PK.clFactor(p));   // her Vmax, net of the model's renal factor
    if(c.over) Object.assign(p, c.over);   // a community case's own values in place of the library's (shown as the author's)
    // enough doses to show the approach to steady state inside two weeks
    p.nDoses=Math.max(2, Math.min(20, Math.floor(336/p.tau)));
    if(c.hd) return PK.normalizeScenario(PK.scenario(hdScenario(c, p)));
    return PK.normalizeScenario(PK.scenario(p));
  }
  // A dialysis case: a dose at the end of each session (as an infusion), three sessions apart, and the dialysis
  // clearance that makes one session lower the level by the fraction the label states.
  function hdScenario(c, p){
    const h=c.hd, q=Object.assign({}, p, {dosing:"custom", hd:1, hdstart:h.every-h.dur, hddur:h.dur, hdevery:h.every});
    q.events=[0,1,2].map(i=>({t:i*h.every, mg:p.D, route:"inf", dur:p.tinf, type:"maintenance", status:"given"}));
    const r=PK.normalizeScenario(PK.scenario(q));
    q.hdcl=+((-Math.log(1-h.fall)/h.dur-PK.keOf(r))*PK.vOf(r)).toFixed(3);
    return q;
  }
  // The same patient with two compartments: half the volume central, the same clearance (k10 doubles).
  const twoCmtOf=p=> PK.normalizeScenario(Object.assign({}, p, {cmt:2, V:p.V/2, thalf:p.thalf/2, k12:0.545, k21:0.545}));
  // Levels drawn at steady state on a case's current regimen, as a laboratory reports them (to 0.1 mg/L): a peak
  // `after` hours after the infusion ends, and a trough just before the next dose.
  // `second` (hours after the start) replaces the trough with a mid-interval level. Levels below 1 mg/L are
  // reported to two significant figures.
  function levelsOf(c){
    const p=caseScenario(c, c.current), T=p.tinf, rep=v=> v>=1 ? Math.round(v*10)/10 : +v.toPrecision(2), second=c.sample.second;
    return {p, D:c.current.D, tau:c.current.tau, T, after:c.sample.after, second, peak:rep(PK.ssConc(p, T+c.sample.after)),
      trough:rep(PK.ssConc(p, second===undefined ? p.tau-1e-9 : second))};
  }
  // The window a case opens the simulator with (and whose lower bound sets the Bayesian estimate's additive error).
  function caseWindow(c){
    const t=c.target, d=drugOf(c.drug);
    // a case read on the unbound level against an MIC opens with that MIC, so the simulator's readouts are the case's
    if(t.kind==="ftmic") return {mec:t.mic, mtc:d.s.mtc, mic:t.mic};
    return t.kind==="table" ? Object.assign({mec:t.mic, mtc:d.s.mtc}, t.unbound ? {mic:t.mic} : {}) : t.kind==="pt" ? {mec:t.troughMin!=null ? t.troughMin : t.peak[0], mtc:t.peak[1]} : t.kind==="at" ? {mec:t.range[0], mtc:t.range[1]}
      : t.kind==="css" ? {mec:t.css[0], mtc:t.css[1]} : {mec:d.s.mec, mtc:d.s.mtc};
  }
  // Bayesian cases: levels drawn on the current regimen from the patient as he really is (the premise), each with the
  // case's stated assay error, reported as a laboratory would; the prior is the patient the model predicts. The estimate
  // uses pk-bayes.js (the page loads it with the cases).
  function bayesOf(c){
    const b=c.bayes, truth=caseScenario(c, c.current), ev=PK.doseEvents(truth), rep=v=> v>=1 ? Math.round(v*10)/10 : +v.toPrecision(2);
    const lv=b.times.map((dt,i)=>({n:b.dose, dt, c:rep(PK.conc(truth, ev[b.dose-1].t+dt, ev)*(1+b.errors[i]))}));
    const prior=Object.assign(caseScenario(c, c.current, null, true), {lv}), opts={mec:caseWindow(c).mec};
    const est=PK.bayes.estimate(prior, lv, opts), pr=PK.bayes.priorOf(prior, opts);
    // the two-level (Sawchuk–Zaske) equations at steady state, from the same two levels: k from their fall, the level
    // back at the end of the infusion and forward to the end of the interval, V from the infusion equation
    const T=truth.tinf, [a,z]=lv, k=Math.log(a.c/z.c)/(z.dt-a.dt), tau=c.current.tau, D=c.current.D;
    const Cmax=a.c*Math.exp(k*(a.dt-T)), Cmin=z.c*Math.exp(-k*(tau-z.dt)), V=(D/T)*(1-Math.exp(-k*T))/(k*(Cmax-Cmin*Math.exp(-k*T)));
    const sz=k>0 ? {k, Cmax, Cmin, V, CL:k*V, auc24:(T*(Cmin+Cmax)/2+(Cmax-Cmin)/k)*24/tau} : {k, broken:true};
    return {truth, prior, lv, est, pr, sz, opts, T,
      trueCL:PK.derived(truth).CL, trueV:PK.vOf(truth)};
  }
  // First-order two-level AUC: k from the fall between the levels, the level back at the end of the infusion, then
  // the infusion phase as a trapezoid and the decline as (Cmax − Cmin) / k (Cmin is the trough at steady state).
  const twoLevel=L=> PK.twoLevelAUC(L.peak, L.trough, L.T, L.after, L.tau);
  // Phenytoin: this patient's Vmax (mg/day) from her albumin-adjusted steady-state level, with Km fixed.
  function pheVmax(c){
    const m=c.measured, st=PK.sheinerTozer(m.C, c.patient.alb, false), R=0.92*m.D, km=drugOf("phe").s.km;
    return R*(km+st.value)/st.value;
  }
  // The case patient's numbers for the walkthrough: CrCl, clearance, volume, rate constant, half-life.
  function context(c){
    const p=caseScenario(c, c.start), pt=PK.patientOf(p), k=PK.keOf(p), V=PK.vOf(p);
    return {p, crcl:pt.crcl, factor:pt.factor, k, V, CL:k*V, th:LN2/k, pt,
      upTau:t=> c.choices.taus.find(x=>x>=t) || c.choices.taus[c.choices.taus.length-1], round:D=>roundDose(c,D)};
  }

  /* ================= PRACTICAL STRENGTHS ================= */
  // Doses the forms can make: sums of the strengths (up to 12 units), or a rounding step for IV doses.
  function achievable(c){
    const d=drugOf(c.drug), mg=d && d.strengths.mg;
    if(!mg) return null;
    const out=new Set([0]);
    for(let n=0;n<12;n++) [...out].forEach(v=> mg.forEach(m=>{ const s=+(v+m).toFixed(4); if(s<=4000) out.add(s); }));
    out.delete(0);
    return [...out].sort((a,b)=>a-b);
  }
  function roundDose(c, D){
    const list=achievable(c);
    if(list) return list.reduce((best,v)=> Math.abs(v-D)<Math.abs(best-D)-1e-9 ? v : best, list[0]);
    const st=drugOf(c.drug).strengths.round || c.choices.step || 1;
    return Math.max(st, Math.round(D/st)*st);
  }

  /* ================= GRADING ================= */
  // Steady-state numbers for a regimen, then the target checked and a hint chosen by rule.
  const HINTS={
    lengthen:"Trough above target and peak in range: lengthen the interval before reducing the dose.",
    reduceBoth:"Peak and trough both above target: reduce the dose, and lengthen the interval if the trough stays high.",
    reduce:"Levels above the target: reduce the dose.",
    reducePeak:"Peak above target with the trough in range: reduce the dose, or give it more slowly.",
    increase:"Peak below target with the trough in range: increase the dose and keep the interval.",
    increaseLow:"Levels below the target: increase the dose, or shorten the interval.",
    shorten:"Trough below target with the peak in range: shorten the interval.",
    wider:"The swing is too wide for the window: give smaller doses more often.",
    bunched:"Trough above target with a low peak: the drug has no time to clear. Give a larger dose less often.",
    aucLow:"AUC24 below target: increase the daily dose (a larger dose, or the same dose more often).",
    aucHigh:"AUC24 above target: reduce the daily dose.",
    none:"No steady state: the daily input exceeds this patient's Vmax, so the level would keep climbing. Reduce the dose.",
    cssLow:"Predicted level below the range: increase the daily dose in a small step. Near saturation each step moves the level more.",
    cssHigh:"Predicted level above the range: reduce the daily dose in a small step.",
    hartfordDose:"The Hartford program starts at 7 mg/kg: set the dose to 7 mg/kg of body weight.",
    hartfordInterval:"The interval comes from creatinine clearance in the Hartford bands: at least 60 mL/min every 24 h, 40–59 every 36 h, 20–39 every 48 h.",
    choice:"Compare how many half-lives the extra hours are for each drug: the one with more of them falls further.",
    tableInterval:"The interval doesn't match the label's row for this creatinine clearance: find the row, then use its interval.",
    tableDose:"The interval matches the row, but the dose doesn't: use the dose (or the range of doses) the row gives.",
    perkgLow:"Below the label's dose for the end of each dialysis session: work out mg/kg from the body weight.",
    perkgHigh:"Above the label's dose for the end of each dialysis session: work out mg/kg from the body weight.",
    ftLow:"The unbound level is above the MIC for less of each interval than the target: shorten the interval, or raise the dose."
  };
  // The label table's row for a creatinine clearance (rows in order: gt, then ge thresholds).
  const tableRow=(t, crcl)=> t.rows.find(r=> r.gt!==undefined ? crcl>r.gt : crcl>=r.ge) || t.rows[t.rows.length-1];
  // Body surface area (Mosteller), for a table set by creatinine clearance per 1.73 m²
  const mosteller=(ht, wt)=> Math.sqrt(ht*wt/3600);
  const tableCrcl=(t, p)=>{ const cr=PK.patientOf(p).crcl; return t.bsa ? cr*1.73/mosteller(p.ht, p.wt) : cr; };
  function metricsOf(c, p){
    if(c.hd){
      // each session's levels and the peak after each dose, read off the curve with the sessions in it
      const rows=PK.hd.sessionTable(p, 3*c.hd.every), peaks=p.events.map(e=> PK.conc(p, e.t+e.dur));
      return {sessions:rows, peaks, peak:Math.max(...peaks), pre:rows[rows.length-1].pre, post:rows[rows.length-1].post, perKg:p.events[0].mg/p.wt};
    }
    const ss=PK.ssProfile(p), m={peak:ss.ssPeak, trough:ss.ssTrough, none:!!(ss.mm && ss.mm.none)};
    if(p.kin==="mm"){ m.css=ss.mm.css; m.avg=ss.mm.avg; m.auc24=m.none ? null : 24*ss.mm.avg; }
    else m.auc24=PK.derived(p).auc*24/p.tau;
    if(c.target.kind==="at" && !m.none) m.atLevel=PK.ssConc(p, Math.min(c.target.at, p.tau-1e-9));
    // the share of a steady-state interval above the MIC (sampled finely; shown to the nearest percent)
    // (with `unbound`, the unbound level's share, read exactly by micStats; the meropenem case keeps its total level)
    if(c.target.unbound || c.target.kind==="ftmic") m.aboveMic=PK.micStats(p, c.target.mic, 24).ft;
    else if(c.target.mic!=null && !m.none){ let n=0; const N=4000; for(let i=0;i<N;i++) if(PK.ssConc(p, p.tau*(i+0.5)/N)>=c.target.mic) n++; m.aboveMic=100*n/N; }
    // hours each interval spends below 1 mg/L at steady state (the drug-free stretch of extended-interval dosing)
    if(!m.none && p.unit==="mg"){ let below=0; const N=240; for(let i=0;i<N;i++){ if(PK.ssConc(p, p.tau*(i+0.5)/N)<1) below+=p.tau/N; } m.below1=below; }
    return m;
  }
  function gradeCase(c, reg){
    const t=c.target;
    if(t.kind==="choice"){
      const r=lateDose(c), best=r.reduce((a,b)=> a.frac<b.frac ? a : b);   // the larger relative fall
      const ok=reg && reg.choice===best.drug;
      return {ok, hint:ok ? null : "choice", hintText:ok ? "" : HINTS.choice, late:r, answer:best.drug};
    }
    const p=caseScenario(c, reg), m=metricsOf(c, p);
    let ok=false, hint=null;
    if(t.kind==="auc"){
      ok=m.auc24>=t.auc[0] && m.auc24<=t.auc[1];
      hint=ok ? null : m.auc24<t.auc[0] ? "aucLow" : "aucHigh";
    } else if(t.kind==="css"){
      ok=!m.none && m.css>=t.css[0] && m.css<=t.css[1];
      hint=ok ? null : m.none ? "none" : m.css<t.css[0] ? "cssLow" : "cssHigh";
    } else if(t.kind==="hartford"){
      const perKg=reg.D/p.wt, band=t.bands.find(b=>PK.patientOf(p).crcl>=b[0]);
      const doseOk=Math.abs(perKg-t.perKg)<=0.35+1e-9, tauOk=!!band && reg.tau===band[1];
      ok=doseOk && tauOk; hint=ok ? null : !doseOk ? "hartfordDose" : "hartfordInterval";
    } else if(t.kind==="perkg"){
      const pk=reg.D/c.patient.wt;
      ok=pk>=t.lo-1e-9 && pk<=t.hi+1e-9; hint=ok ? null : pk<t.lo ? "perkgLow" : "perkgHigh";
    } else if(t.kind==="ftmic"){
      ok=m.aboveMic>=t.ft-1e-9; hint=ok ? null : "ftLow";
    } else if(t.kind==="table"){
      const row=tableRow(t, tableCrcl(t, p)), tauOk=reg.tau===row.tau, doseOk=row.lo!=null ? reg.D>=row.lo-1e-9 && reg.D<=row.hi+1e-9 : Math.abs(reg.D-(row.D!=null ? row.D : t.dose*row.frac))<1e-9;
      ok=tauOk && doseOk; hint=ok ? null : !tauOk ? "tableInterval" : "tableDose";
    } else if(t.kind==="at"){
      const lo=m.atLevel<t.range[0], hi=m.atLevel>t.range[1], pkHi=m.peak>=t.peakMax;
      ok=!lo && !hi && !pkHi;
      hint=ok ? null : (hi || pkHi) ? "reduce" : "increaseLow";
    } else {   // "pt": peak within [lo, hi], trough within [troughMin, troughMax]
      const pkLo=t.peak && m.peak<t.peak[0], pkHi=t.peak && m.peak>t.peak[1];
      const trHi=t.troughMax!=null && m.trough>t.troughMax, trLo=t.troughMin!=null && m.trough<t.troughMin;
      ok=!pkLo && !pkHi && !trHi && !trLo;
      if(!ok) hint= trHi && pkHi ? "reduceBoth" : trHi && pkLo ? "bunched" : trHi ? "lengthen"
        : trLo && pkHi ? "wider" : trLo && pkLo ? "increaseLow" : trLo ? (t.troughMax==null && !t.peak[0] ? "increaseLow" : "shorten")
        : pkHi ? (t.troughMax==null ? "reduce" : "reducePeak") : "increase";
    }
    return {ok, hint, hintText:hint ? HINTS[hint] : "", metrics:m, p};
  }
  // The same regimen rounded to what the forms can give, graded again.
  function gradeRounded(c, reg){
    const D=roundDose(c, reg.D);
    return Object.assign(gradeCase(c, Object.assign({}, reg, {D})), {reg:Object.assign({}, reg, {D}), changed:Math.abs(D-reg.D)>1e-9});
  }
  // The walkthrough's plan, rounded; tests check it passes its own grader.
  function reference(c){
    if(c.target.kind==="choice") return {choice:gradeCase(c,null).answer};
    const pl=c.plan(context(c));
    return {D:roundDose(c, pl.reg.D), tau:pl.reg.tau};
  }

  // The late-dose question: each drug at its label regimen, at steady state, with one dose `late` hours late.
  function lateDose(c){
    const late=c.target.late;
    return c.target.drugs.map(id=>{
      const d=drugOf(id), p=PK.normalizeScenario(PK.scenario(Object.assign(PK.drugScenario(d), {dosing:"repeated", loadMult:1, missed:1}))), u=PK.unitsOf(p);
      const trough=PK.ssConc(p, p.tau-1e-9), k=PK.keOf(p), lateLevel=trough*Math.exp(-k*late);
      return {drug:id, name:d.name, th:LN2/k, trough, lateLevel, frac:lateLevel/trough, halfLives:late*k/LN2, unit:u.conc, mec:d.s.mec};
    });
  }

  // Walkthrough: CrCl, clearance, the plan's steps, and a check of the rounded plan. Missed dose for lithium.
  function walkthrough(c){
    if(c.target.kind==="choice"){
      const r=lateDose(c);
      return r.map(x=>`${x.name}: half-life ${nf(x.th,1)} h, so ${c.target.late} extra hours are ${nf(x.halfLives,2)} half-lives, and the level before the late dose falls to ${nf(100*x.frac,1)}% of its usual trough (${nf(x.trough,3)} → ${nf(x.lateLevel,3)} ${x.unit}).`)
        .concat([`The drug with the short half-life drops far more, in proportion. Whether that matters depends on how the drug works: amoxicillin's usual trough is already low, while digoxin's level barely moves.`]);
    }
    const x=context(c), p=x.p, pt=x.pt, f=p.sex==="F";
    const steps=[
      `CrCl (Cockcroft–Gault) = (140 − ${p.age}) × ${p.wt} / (72 × ${p.scr})${f ? " × 0.85" : ""} = <b>${nf(pt.crcl,1)} mL/min</b>.`,
      p.kin==="mm" ? `Saturable elimination: Km ${nf(p.km,1)} mg/L and this patient's Vmax (below).`
        : c.current && (c.clMult || c.vMult) ? (()=>{ const V0=x.V/(c.vMult||1), CL0=x.CL/(c.clMult||1);
            return `Before any levels, Cockcroft–Gault predicts a clearance of CL<sub>ref</sub> × [(1 − fe) + fe × CrCl / 120] = ${nf(LN2/drugOf(c.drug).s.thalf*V0,2)} × [(1 − ${p.fe}) + ${p.fe} × ${nf(pt.crcl,1)} / 120] = <b>${nf(CL0,2)} L/h</b>, a half-life of ${nf(LN2*V0/CL0,1)} h with V = ${nf(V0,1)} L.`; })()
        : `Clearance = CL<sub>ref</sub> × [(1 − fe) + fe × CrCl / 120] = ${nf(LN2/p.thalf*PK.vOf(p),2)} × [(1 − ${p.fe}) + ${p.fe} × ${nf(pt.crcl,1)} / 120] = <b>${nf(x.CL,2)} L/h</b>; V = ${nf(x.V,1)} L; k = ${nf(x.k,4)} h⁻¹; t½ = ${nf(x.th,1)} h.`];
    const pl=c.plan(x), ref=reference(c), g=gradeCase(c, ref), u=PK.unitsOf(p);
    steps.push(...pl.steps);
    const m=g.metrics;
    steps.push(`Check ${nf(ref.D,1)} ${u.dose} every ${ref.tau} h in the model: ${c.target.kind==="table" ? `${m.aboveMic!=null ? `${nf(m.aboveMic,0)}% of each interval above the MIC, ` : ""}AUC24 ${nf(m.auc24,0)} mg·h/L` : c.target.kind==="auc" ? `AUC24 ${nf(m.auc24,0)} mg·h/L` : c.target.kind==="ftmic" ? `fT>MIC ${nf(m.aboveMic,1)}% of each interval, AUC24 ${nf(m.auc24,0)} mg·h/L` : c.target.kind==="perkg" ? `${nf(m.perKg,2)} mg/kg after each session; peaks ${m.peaks.map(v=>nf(v,1)).join(", ")} ${u.conc}` : c.target.kind==="css" ? `predicted steady state ${nf(m.css,1)} ${u.conc}` : c.target.kind==="at" ? `12-hour level ${nf(m.atLevel,2)} ${u.conc}, peak ${nf(m.peak,2)}` : `peak ${nf(m.peak,2)} ${u.conc}, trough ${nf(m.trough,2)} ${u.conc}`} — ${g.ok ? "on target" : "off target: " + g.hintText}`);
    if(c.id==="li"){ const md=missedDose(c, ref); steps.push(`If one dose is missed at steady state, the level before the next dose falls to ${nf(md.low,2)} mEq/L (from ${nf(md.usual,2)}), and regular dosing brings the troughs back within 5% of steady state after ${nf(md.recover/24,1)} days.`); }
    return steps;
  }
  // Lithium: the effect of missing one dose once steady state has been reached. In linear kinetics a missed dose
  // takes away exactly its own curve (superposition), so each later trough is lower by that dose's contribution.
  function missedDose(c, reg){
    const p=caseScenario(c, reg), usual=PK.ssConc(p, p.tau-1e-9), C1=j=> PK.singleConc(p, j*p.tau, p.D);
    let j=1; while(C1(j)>0.05*usual && j<200) j++;
    return {usual, low:usual-C1(1), recover:j*p.tau};
  }

  /* ================= LINKS ================= */
  // "#case=gent" opens a case; "&d=130&t=24" (or "&c=dig") carries a proposed regimen.
  function encodeCaseLink(id, reg){
    let h="case="+id;
    if(reg && reg.choice) h+="&c="+reg.choice;
    else if(reg && isFinite(reg.D)) h+=`&d=${+reg.D.toFixed(2)}&t=${reg.tau}`;
    return h;
  }
  function decodeCaseLink(hash){
    const q={};
    String(hash||"").replace(/^#/,"").split("&").forEach(kv=>{ const i=kv.indexOf("="); if(i>0) q[kv.slice(0,i)]=kv.slice(i+1); });
    const c=caseById(q.case);
    if(!c) return null;
    const out={id:c.id, reg:null};
    if(c.target.kind==="choice"){ if(c.choices.options.some(o=>o[0]===q.c)) out.reg={choice:q.c}; }
    else if(q.d!==undefined){
      const D=parseFloat(q.d), tau=parseInt(q.t,10);
      if(isFinite(D) && D>0 && D<=10000 && c.choices.taus.includes(tau)) out.reg={D, tau};
    }
    return out;
  }


  /* ================= COMMUNITY CASES (written by instructors) ================= */
  // An instructor writes a case as a spec: the patient, a first-order drug from the library (with any values the
  // author changes, shown as the author's), the regimen choices, a target (peak and trough, or AUC24), the task,
  // and optional notes and references (shown as author-provided). The spec travels in the link, compressed where
  // the browser can, versioned; it is checked on the way in and the case is only offered when some regimen on its
  // grid meets the target. Community cases say they are unreviewed.
  const COMMUNITY_VERSION=1;
  const TEXT_LIMITS={title:80, setting:500, task:600, also:600, ref:200, refs:5};
  const AUTHOR_TAUS=[4,6,8,12,24,36,48];
  const AUTHOR_DRUG_IDS=()=> PK.DRUGS.filter(d=>d.kinetics!=="michaelis-menten").map(d=>d.id);   // levels scale with the dose
  const R=PK.RANGES, num=(v,lo,hi)=> typeof v==="number" && isFinite(v) && v>=lo && v<=hi;
  const str=(v,max)=> typeof v==="string" ? v.replace(/[\u0000-\u001f\u007f]/g," ").trim().slice(0,max) : "";
  // A checked spec, or the reasons it isn't one.
  function checkSpec(o){
    const err=[], ok=o && typeof o==="object";
    if(!ok) return {errors:["not a case"]};
    const title=str(o.title, TEXT_LIMITS.title), task=str(o.task, TEXT_LIMITS.task);
    if(!title) err.push("a title"); if(!task) err.push("a task");
    const drug=AUTHOR_DRUG_IDS().includes(o.drug) ? o.drug : null;
    if(!drug) err.push("a first-order drug from the library");
    const pt=o.patient||{}, patient={age:Math.round(pt.age), sex:pt.sex==="F" ? "F" : "M", ht:Math.round(pt.ht), wt:pt.wt, scr:pt.scr};
    if(!num(patient.age, R.age[0], R.age[1])) err.push(`an age of ${R.age[0]}–${R.age[1]} years`);
    if(!num(patient.ht, R.ht[0], R.ht[1])) err.push(`a height of ${R.ht[0]}–${R.ht[1]} cm`);
    if(!num(patient.wt, R.wt[0], R.wt[1])) err.push(`a weight of ${R.wt[0]}–${R.wt[1]} kg`);
    if(!num(patient.scr, R.scr[0], R.scr[1])) err.push(`a serum creatinine of ${R.scr[0]}–${R.scr[1]} mg/dL`);
    const over={};
    ["thalf","V","F"].forEach(k=>{ const v=o.over && o.over[k]; if(v!=null){ if(num(v, R[k][0], R[k][1])) over[k]=v; else err.push(`${k} within ${R[k][0]}–${R[k][1]}`); } });
    const d=drug && drugOf(drug), inf=d && d.s.route==="inf";
    if(over.F!=null && d && d.s.route!=="oral") err.push("F only for an oral drug");
    const ch=o.choices||{}, taus=[...new Set((ch.taus||[]).filter(t=>AUTHOR_TAUS.includes(t)))].sort((a,b)=>a-b);
    if(!taus.length) err.push("at least one dosing interval");
    const choices={taus, step:ch.step, min:ch.min, max:ch.max};
    if(!num(choices.step, 0.01, 1000)) err.push("a dose step"); if(!num(choices.min, 0.01, 10000)) err.push("a lowest dose");
    if(!num(choices.max, choices.min||0, 10000)) err.push("a highest dose above the lowest");
    if(inf){ choices.tinf=ch.tinf; if(!num(ch.tinf, 0.25, Math.min(24, taus[0]||24))) err.push("an infusion time shorter than the interval"); }
    const t=o.target||{}; let target=null;
    if(t.kind==="auc"){ if(Array.isArray(t.auc) && num(t.auc[0],1,100000) && num(t.auc[1],t.auc[0],100000) && t.auc[1]>t.auc[0]) target={kind:"auc", auc:[t.auc[0], t.auc[1]]}; else err.push("an AUC24 range"); }
    else if(t.kind==="pt"){
      const pk=t.peak, tmax=t.troughMax, tmin=t.troughMin;
      if(Array.isArray(pk) && num(pk[0],0,100000) && num(pk[1],pk[0],100000) && pk[1]>pk[0]){
        target={kind:"pt", peak:[pk[0], pk[1]]};
        if(tmax!=null){ if(num(tmax,0,pk[1])) target.troughMax=tmax; else err.push("a trough limit below the peak's top"); }
        if(tmin!=null){ if(num(tmin,0,target.troughMax!=null ? target.troughMax : pk[1])) target.troughMin=tmin; else err.push("a trough floor below its limit"); }
      } else err.push("a peak range");
    } else if(t.kind==="ftmic"){
      // the author's own MIC and the least share of each interval the unbound level must stay above it
      if(num(t.mic, 0.001, 10000) && num(t.ft, 1, 100)) target={kind:"ftmic", mic:t.mic, ft:t.ft}; else err.push("an MIC and a time above it of 1–100%");
    } else err.push("a target (peak and trough, AUC24, or fT>MIC)");
    const st=o.start||{}, start={D:st.D, tau:st.tau};
    if(!num(start.D, choices.min||0, choices.max||0) || !taus.includes(start.tau)) err.push("a starting regimen within the choices");
    const refs=(Array.isArray(o.refs) ? o.refs : []).map(r=>str(r, TEXT_LIMITS.ref)).filter(Boolean).slice(0, TEXT_LIMITS.refs);
    if(err.length) return {errors:err};
    const spec={v:COMMUNITY_VERSION, title, drug, patient, setting:str(o.setting, TEXT_LIMITS.setting), task, also:str(o.also, TEXT_LIMITS.also), refs, target, choices, start};
    if(Object.keys(over).length) spec.over=over;
    return {spec};
  }
  // The case object the grader, walkthrough and page use for a spec.
  function communityCase(spec){
    const c={id:"community", community:true, spec, drug:spec.drug, title:spec.title, tag:"Community case, unreviewed",
      patient:Object.assign({}, spec.patient), over:spec.over, indication:spec.setting || "Written by an instructor.",
      target:Object.assign({why:"Set by the case's author."}, spec.target), choices:Object.assign({}, spec.choices), start:Object.assign({}, spec.start),
      // the library's own sources for the drug and for Cockcroft–Gault, which the model uses; the author's are listed apart
      task:spec.task, also:spec.also || "The author added no notes.", refs:[spec.drug, "cg"].filter(k=>PK.SOURCES[k]), authorRefs:spec.refs, wrong:[],
      plan(){ const sol=solveCase(this), r=sol.best;
        return {reg:{D:r.D, tau:r.tau}, steps:[
          `The grid of regimens the case allows: ${sol.total} (doses ${sol.doses} × intervals ${this.choices.taus.join(", ")} h); ${sol.count} of them meet the target in this model.`,
          `One of them, ${this.target.kind==="ftmic" ? "with the smallest daily dose" : "nearest the middle of the target"}: <b>${nf(r.D,1)} ${PK.unitsOf({unit:drugOf(this.drug).units}).dose} every ${r.tau} h</b>.`]};
      }};
    return c;
  }
  // Every regimen on the case's grid, checked against its target. First-order levels scale with the dose, so each
  // interval is simulated once at a unit dose and every dose on it is checked by scaling; the chosen regimen is then
  // graded in full.
  function solveCase(c){
    const t=c.target, ch=c.choices, list=achievable(c), doses=(list ? list.filter(D=>D>=ch.min-1e-9 && D<=ch.max+1e-9)
      : Array.from({length:Math.min(4000, Math.floor((ch.max-ch.min)/ch.step+1e-9)+1)}, (_,i)=> +(ch.min+i*ch.step).toFixed(6)));
    let count=0, best=null;
    if(t.kind==="ftmic"){
      // fT>MIC at dose D is the unit dose's against MIC / D, and it rises with the dose: bisect the grid for the first that meets it
      ch.taus.forEach(tau=>{
        const p1=caseScenario(c, {D:1, tau}), meets=D=> PK.micStats(p1, t.mic/D, 24).ft>=t.ft-1e-9;
        let lo=0, hi=doses.length;
        while(lo<hi){ const mid=(lo+hi)>>1; if(meets(doses[mid])) hi=mid; else lo=mid+1; }
        count+=doses.length-lo;
        if(lo<doses.length){ const D=doses[lo], score=D*24/tau;   // the smallest daily dose that meets it
          if(!best || score<best.score-1e-9 || (Math.abs(score-best.score)<=1e-9 && tau===c.start.tau)) best={D, tau, score}; }
      });
      if(best) best.grade=gradeCase(c, {D:best.D, tau:best.tau});
      return {count, total:doses.length*ch.taus.length, doses:doses.length, best, solvable:!!(best && best.grade.ok)};
    }
    ch.taus.forEach(tau=>{
      const m=metricsOf(c, caseScenario(c, {D:1, tau}));
      doses.forEach(D=>{
        let ok, score;
        if(t.kind==="auc"){ const a=m.auc24*D; ok=a>=t.auc[0] && a<=t.auc[1]; score=Math.abs(a/((t.auc[0]+t.auc[1])/2)-1); }
        else { const pk=m.peak*D, tr=m.trough*D; ok=pk>=t.peak[0] && pk<=t.peak[1] && (t.troughMax==null || tr<=t.troughMax) && (t.troughMin==null || tr>=t.troughMin); score=Math.abs(pk/((t.peak[0]+t.peak[1])/2)-1); }
        if(ok){ count++; if(!best || score<best.score-1e-12 || (Math.abs(score-best.score)<=1e-12 && tau===c.start.tau)) best={D, tau, score}; }
      });
    });
    if(best) best.grade=gradeCase(c, {D:best.D, tau:best.tau});
    return {count, total:doses.length*ch.taus.length, doses:doses.length, best, solvable:!!(best && best.grade.ok)};
  }

  /* ---------- packing a spec into a link ---------- */
  // "z." + deflate-raw + base64url where CompressionStream exists, else "j." + base64url of the JSON; both decode everywhere
  // DecompressionStream exists (every current browser and Node 18+).
  const MAX_TOKEN=16000, MAX_JSON=65536;
  const b64u={enc:bytes=>{ let s=""; bytes.forEach(b=>{ s+=String.fromCharCode(b); }); return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,""); },
    dec:str=>{ const b=atob(str.replace(/-/g,"+").replace(/_/g,"/")); return Uint8Array.from(b, ch=>ch.charCodeAt(0)); }};
  const utf8=new TextEncoder(), fromUtf8=new TextDecoder();
  async function packJSON(obj, plain){
    const bytes=utf8.encode(JSON.stringify(obj));
    if(!plain && typeof CompressionStream==="function"){
      const z=new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate-raw"))).arrayBuffer());
      return "z."+b64u.enc(z);
    }
    return "j."+b64u.enc(bytes);
  }
  async function unpackJSON(tok){
    try{
      if(typeof tok!=="string" || tok.length>MAX_TOKEN || !/^[zj]\.[A-Za-z0-9_-]+$/.test(tok)) return null;
      let bytes=b64u.dec(tok.slice(2));
      if(tok[0]==="z"){
        if(typeof DecompressionStream!=="function") return null;
        const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw")), reader=stream.getReader(), parts=[]; let n=0;
        for(;;){ const {done, value}=await reader.read(); if(done) break; n+=value.length; if(n>MAX_JSON){ reader.cancel(); return null; } parts.push(value); }
        bytes=new Uint8Array(n); let o=0; parts.forEach(p=>{ bytes.set(p,o); o+=p.length; });
      }
      if(bytes.length>MAX_JSON) return null;
      return JSON.parse(fromUtf8.decode(bytes));
    }catch(e){ return null; }
  }
  // "case=c1.<token>" (+ &d= &t= for a proposed regimen, as for the built-in cases)
  async function encodeCommunityLink(spec, reg, plain){
    let h="case=c"+COMMUNITY_VERSION+"."+await packJSON(spec, plain);
    if(reg && isFinite(reg.D)) h+=`&d=${+reg.D.toFixed(2)}&t=${reg.tau}`;
    return h;
  }
  // Any case link: the built-in ones exactly as decodeCaseLink reads them, and community ones (checked, and only if
  // solvable). {id, reg} for a built-in case, {id:"community", case, reg} for a community one, or null.
  async function decodeAnyCaseLink(hash){
    const q={};
    String(hash||"").replace(/^#/,"").split("&").forEach(kv=>{ const i=kv.indexOf("="); if(i>0) q[kv.slice(0,i)]=kv.slice(i+1); });
    const m=/^c(\d+)\.(.+)$/.exec(q.case||"");
    if(!m) return decodeCaseLink(hash);
    if(+m[1]!==COMMUNITY_VERSION) return null;
    const got=checkSpec(await unpackJSON(m[2]));
    if(!got.spec) return null;
    const c=communityCase(got.spec);
    if(!solveCase(c).solvable) return null;
    const out={id:"community", case:c, reg:null};
    if(q.d!==undefined){ const D=parseFloat(q.d), tau=parseInt(q.t,10); if(isFinite(D) && D>0 && D<=10000 && c.choices.taus.includes(tau)) out.reg={D, tau}; }
    return out;
  }

  /* ================= ASSIGNMENTS AND COMPLETION CODES ================= */
  // An assignment (bundle) is an ordered list of up to 12 items: built-in cases, community cases (their specs) and
  // worksheets (topic, count, seed, pool version). It travels in "#bundle=b1.<token>". Progress stays in the browser.
  // A completion code is an HMAC-SHA256, keyed by a class key the teacher gives out, over the assignment, a
  // teacher-chosen identifier (not a name), the items finished, the score and the date. Nothing is sent anywhere.
  // Anyone who knows the key can make a code, so it records completion in the app, not proof.
  const BUNDLE_VERSION=1, BUNDLE_MAX=12;
  function checkBundle(o){
    if(!o || typeof o!=="object" || !Array.isArray(o.items)) return null;
    const title=str(o.title, TEXT_LIMITS.title) || "Assignment", items=[];
    for(const it of o.items.slice(0, BUNDLE_MAX)){
      if(it && it.kind==="case" && caseById(it.id)) items.push({kind:"case", id:it.id});
      else if(it && it.kind==="case" && it.spec){ const g=checkSpec(it.spec); if(g.spec && solveCase(communityCase(g.spec)).solvable) items.push({kind:"case", spec:g.spec}); else return null; }
      else if(it && it.kind==="ws"){ const t=PK.decodeTaskLink(`ws=${it.topic||"all"}.${it.count}.${it.seed}.${it.v||1}`); if(t) items.push({kind:"ws", topic:t.topic, count:t.count, seed:t.seed, v:t.v}); else return null; }
      else return null;
    }
    return items.length ? {v:BUNDLE_VERSION, title, items} : null;
  }
  async function encodeBundleLink(b, plain){ const ok=checkBundle(b); return ok ? "bundle=b"+BUNDLE_VERSION+"."+await packJSON(ok, plain) : null; }
  async function decodeBundleLink(hash){
    const m=/^#?bundle=b(\d+)\.([zj]\.[A-Za-z0-9_-]+)$/.exec(String(hash||""));
    if(!m || +m[1]!==BUNDLE_VERSION) return null;
    return checkBundle(await unpackJSON(m[2]));
  }
  // Short, stable names for items, used in the payload a code covers.
  const itemId=(it,i)=> it.kind==="case" ? (it.id || `community${i+1}`) : `ws:${it.topic||"all"}.${it.count}.${it.seed}.${it.v}`;
  const IDENT=/^[A-Za-z0-9_-]{1,24}$/;
  const hex=bytes=> Array.from(bytes, b=>b.toString(16).padStart(2,"0")).join("");
  async function sha256Hex(text){ return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", utf8.encode(text)))); }
  const B32="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";   // no I, O, 0, 1
  function base32(bytes, n){ let bits=0, val=0, out=""; for(const b of bytes){ val=(val<<8)|b; bits+=8; while(bits>=5 && out.length<n){ out+=B32[(val>>>(bits-5))&31]; bits-=5; } } return out; }
  // The readable payload: what the code vouches for.
  function completionPayload(o){
    return ["DoseCurve completion v1", `assignment ${o.bundle}`, `id ${o.identifier}`, `items ${o.items.join(" ")}`, `score ${o.score}/${o.total}`, `date ${o.date}`].join("\n");
  }
  async function completionCode(key, payload){
    const k=await crypto.subtle.importKey("raw", utf8.encode(String(key)), {name:"HMAC", hash:"SHA-256"}, false, ["sign"]);
    const sig=new Uint8Array(await crypto.subtle.sign("HMAC", k, utf8.encode(payload)));
    return base32(sig, 16).replace(/(.{4})(?!$)/g,"$1-");
  }
  async function verifyCode(key, payload, code){
    const want=String(code||"").toUpperCase().replace(/[^A-Z0-9]/g,"");
    return want.length===16 && (await completionCode(key, String(payload||"").replace(/\r\n?/g,"\n").trim())).replace(/-/g,"")===want;
  }

  /* ================= THE CASES TAB (browser only) ================= */
  // host: {esc, fmt, toast, copyHash(hash), openScenario(p, view, drugId)} from the page.
  let host=null, rootEl=null, current=null;
  const who=c=>{ const pt=c.patient, cr=PK.crclCG(pt.age, pt.wt, pt.scr, pt.sex);
    return `A ${pt.age}-year-old ${pt.sex==="F" ? "woman" : "man"}, ${pt.ht} cm, ${pt.wt} kg, serum creatinine ${pt.scr} mg/dL (Cockcroft–Gault CrCl ${nf(cr,0)} mL/min)${pt.alb ? `, albumin ${pt.alb} g/dL` : ""}.`; };
  const targetText=c=>{ const t=c.target, u=c.drug ? PK.unitsOf({unit:drugOf(c.drug).units}).conc : "";
    if(t.kind==="auc") return `AUC24 ${t.auc[0]}–${t.auc[1]} mg·h/L at steady state`;
    if(t.kind==="css") return `Predicted steady-state level ${t.css[0]}–${t.css[1]} ${u}`;
    if(t.kind==="hartford") return `7 mg/kg, at the interval the Hartford bands give for this CrCl`;
    if(t.kind==="table") return `The dose and interval the label's renal table gives for this creatinine clearance`;
    if(t.kind==="perkg") return `${t.lo} to ${t.hi} mg/kg at the end of each dialysis session (the label's range)`;
    if(t.kind==="ftmic") return `The unbound level above an MIC of ${t.mic} ${u} for at least ${t.ft}% of each interval at steady state (fT>MIC; unbound fraction ${PK.drugScenario(drugOf(c.drug)).fu} from the library)`;
    if(t.kind==="at") return `The ${t.at}-hour level at steady state ${t.range[0]}–${t.range[1]} ${u}, peak below ${t.peakMax} ${u}`;
    if(t.kind==="choice") return `A reasoning question, checked against the model`;
    const parts=[];
    if(t.peak && t.peak[0]) parts.push(`peak ${t.peak[0]}–${t.peak[1]} ${u}`); else if(t.peak) parts.push(`peak at or below ${t.peak[1]} ${u}`);
    if(t.troughMax!=null) parts.push(`trough at or below ${t.troughMax} ${u}`);
    if(t.troughMin!=null) parts.push(`trough at or above ${t.troughMin} ${u}`);
    return `At steady state: ${parts.join(", ")}`;
  };
  // The case of the day: the same for everyone on a given (UTC) day, and every case in turn over CASES.length days
  const caseOfDay=(date=new Date())=> CASES[Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())/864e5) % CASES.length];
  function mount(el, h){
    host=h; rootEl=el;
    const today=caseOfDay(), order=[today, ...CASES.filter(c=>c!==today)];
    el.innerHTML=`<div class="cs-intro"><h2 class="cs-h">Clinical cases</h2>
      <p>Each case gives a patient and a drug. Propose a regimen and the model grades it at steady state, with a hint when it misses and the same regimen rounded to the forms available. The walkthrough works the textbook route with the patient's own numbers.</p>
      <p class="cs-disc">Educational model, not for clinical dosing. The cases teach the reasoning; they are not prescribing instructions.</p></div>
      <div class="cs-list">${order.map(c=>`<button class="cs-card${c===today ? " today" : ""}" data-id="${c.id}">${c===today ? `<span class="cs-today">Case of the day</span>` : ""}<span class="cs-tag">${h.esc(c.tag)}</span><span class="cs-title">${h.esc(c.title)}</span><span class="cs-who">${h.esc(who(c))}</span></button>`).join("")}</div>
      <div class="cs-tools"><p class="cs-sub">For instructors</p>
        <p>Write your own case and share it as a link, put cases and worksheets together as an assignment, and check the completion codes students bring back. Everything stays in the link and in each browser: nothing is sent anywhere.</p>
        <div class="cs-actions"><button class="abtn" type="button" id="csAuthorBtn">Write a case</button><button class="abtn" type="button" id="csBundleBtn">Make an assignment</button><button class="abtn" type="button" id="csVerifyBtn">Verify a completion code</button></div></div>
      <section class="cs-panel" id="csPanel" hidden tabindex="-1"></section>
      <article class="cs-case" id="csCase" hidden tabindex="-1"></article>`;
    el.querySelector(".cs-list").addEventListener("click",e=>{ const b=e.target.closest(".cs-card"); if(b) open({id:b.dataset.id, reg:null}); });
    el.querySelector("#csAuthorBtn").addEventListener("click",()=> renderAuthor());
    el.querySelector("#csBundleBtn").addEventListener("click",()=> renderBundleMaker());
    el.querySelector("#csVerifyBtn").addEventListener("click",()=> renderVerify());
  }

  /* ---------- the tab's views ---------- */
  // One view at a time: the list (with the intro and the instructor tools), a case, or an instructor panel.
  function showOnly(el){
    ["cs-intro","cs-list","cs-tools"].forEach(cl=>{ rootEl.querySelector("."+cl).hidden=!!el; });
    ["#csPanel","#csCase"].forEach(id=>{ const x=rootEl.querySelector(id); x.hidden=x!==el; });
  }
  const showList=()=> showOnly(null);
  function panel(html){
    const el=rootEl.querySelector("#csPanel");
    el.innerHTML=`<p><button class="abtn" type="button" data-back>All cases</button></p>`+html;
    el.querySelector("[data-back]").addEventListener("click",()=>{ showList(); rootEl.querySelector("#csAuthorBtn").focus(); });
    showOnly(el); el.focus({preventScroll:true}); el.scrollIntoView({block:"start"});
    return el;
  }
  // Browser storage for drafts and assignment progress: a convenience that may be unavailable.
  const store={get:k=>{ try{ return JSON.parse(localStorage.getItem(k)); }catch(e){ return null; } }, set:(k,v)=>{ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){ /* not kept */ } }};
  let lastSpec=null;

  /* ---------- write a case ---------- */
  const TEMPLATE={title:"", drug:"gent", patient:{age:70, sex:"F", ht:160, wt:60, scr:1.5}, setting:"", task:"Choose a dose and interval that meet the target at steady state.",
    also:"", refs:[], target:{kind:"pt", peak:[5,10], troughMax:1}, choices:{taus:[8,12,24,36], step:10, min:40, max:400, tinf:0.5}, start:{D:80, tau:8}};
  function renderAuthor(){
    const h=host, sp=Object.assign({}, TEMPLATE, store.get("dosecurve-author-draft")||{}), t=sp.target||{}, ch=sp.choices||{}, pt=sp.patient||{}, ov=sp.over||{};
    const v=x=> x==null ? "" : String(x), sel=(a,b)=> a===b ? " selected" : "";
    const el=panel(`<h2 class="cs-h">Write a case</h2>
      <p class="cs-intro-p">A case is a patient, a drug from the library and a target. Students propose a regimen and the model grades it. Before the link is made, every regimen your choices allow is checked, and the link is offered only if at least one meets the target. It opens as a community case, marked unreviewed. Don't include a patient's name or other identifiers.</p>
      <p class="cs-disc">Educational model, not for clinical dosing.</p>
      <form id="auForm" class="cs-author" novalidate>
        <label class="wide">Title<input id="auTitle" maxlength="${TEXT_LIMITS.title}" value="${h.esc(v(sp.title))}"></label>
        <label>Drug<select id="auDrug">${AUTHOR_DRUG_IDS().map(id=>`<option value="${id}"${sel(id, sp.drug)}>${h.esc(drugOf(id).name)}</option>`).join("")}</select></label>
        <fieldset><legend>Patient</legend>
          <label>Age (years)<input id="auAge" type="number" min="18" max="100" step="1" value="${v(pt.age)}"></label>
          <label>Sex<select id="auSex"><option value="F"${sel("F",pt.sex)}>Female</option><option value="M"${sel("M",pt.sex)}>Male</option></select></label>
          <label>Height (cm)<input id="auHt" type="number" min="120" max="220" step="1" value="${v(pt.ht)}"></label>
          <label>Weight (kg)<input id="auWt" type="number" min="40" max="200" step="0.5" value="${v(pt.wt)}"></label>
          <label>Serum creatinine (mg/dL)<input id="auScr" type="number" min="0.2" max="15" step="0.1" value="${v(pt.scr)}"></label></fieldset>
        <fieldset><legend>Your own values (optional; blank uses the library's)</legend>
          <label>Half-life (h)<input id="auThalf" type="number" min="0.5" max="72" step="0.1" value="${v(ov.thalf)}"></label>
          <label>Volume per 70 kg (L)<input id="auV" type="number" min="5" max="600" step="0.5" value="${v(ov.V)}"></label>
          <label>Bioavailability (oral)<input id="auF" type="number" min="0.1" max="1" step="0.01" value="${v(ov.F)}"></label></fieldset>
        <label class="wide">Setting<textarea id="auSetting" rows="2" maxlength="${TEXT_LIMITS.setting}">${h.esc(v(sp.setting))}</textarea></label>
        <label class="wide">Task<textarea id="auTask" rows="2" maxlength="${TEXT_LIMITS.task}">${h.esc(v(sp.task))}</textarea></label>
        <fieldset><legend>Regimens students can choose</legend>
          <div class="au-taus">${AUTHOR_TAUS.map(x=>`<label class="au-chk"><input type="checkbox" value="${x}"${(ch.taus||[]).includes(x) ? " checked" : ""}> every ${x} h</label>`).join("")}</div>
          <label>Lowest dose<input id="auMin" type="number" min="0.01" step="any" value="${v(ch.min)}"></label>
          <label>Highest dose<input id="auMax" type="number" min="0.01" step="any" value="${v(ch.max)}"></label>
          <label>Dose step<input id="auStep" type="number" min="0.01" step="any" value="${v(ch.step)}"></label>
          <label id="auTinfL">Infusion time (h)<input id="auTinf" type="number" min="0.25" max="24" step="0.25" value="${v(ch.tinf)}"></label>
          <label>Opening dose<input id="auD" type="number" min="0.01" step="any" value="${v((sp.start||{}).D)}"></label>
          <label>Opening interval<select id="auTau">${AUTHOR_TAUS.map(x=>`<option value="${x}"${sel(x,(sp.start||{}).tau)}>${x} h</option>`).join("")}</select></label></fieldset>
        <fieldset><legend>Target at steady state</legend>
          <label>Kind<select id="auKind"><option value="pt"${sel("pt",t.kind)}>Peak and trough</option><option value="auc"${sel("auc",t.kind)}>AUC24</option><option value="ftmic"${sel("ftmic",t.kind)}>Time above the MIC (fT&gt;MIC)</option></select></label>
          <label class="au-pt">Peak from<input id="auPkLo" type="number" min="0" step="any" value="${v((t.peak||[])[0])}"></label>
          <label class="au-pt">Peak to<input id="auPkHi" type="number" min="0" step="any" value="${v((t.peak||[])[1])}"></label>
          <label class="au-pt">Trough at most (optional)<input id="auTrMax" type="number" min="0" step="any" value="${v(t.troughMax)}"></label>
          <label class="au-pt">Trough at least (optional)<input id="auTrMin" type="number" min="0" step="any" value="${v(t.troughMin)}"></label>
          <label class="au-auc">AUC24 from<input id="auAucLo" type="number" min="0" step="any" value="${v((t.auc||[])[0])}"></label>
          <label class="au-auc">AUC24 to<input id="auAucHi" type="number" min="0" step="any" value="${v((t.auc||[])[1])}"></label>
          <label class="au-ft">MIC<input id="auMic" type="number" min="0" step="any" value="${v(t.mic)}"></label>
          <label class="au-ft">Above it for at least (% of each interval)<input id="auFt" type="number" min="1" max="100" step="any" value="${v(t.ft)}"></label></fieldset>
        <label class="wide">What a pharmacist also weighs (optional)<textarea id="auAlso" rows="2" maxlength="${TEXT_LIMITS.also}">${h.esc(v(sp.also))}</textarea></label>
        <label class="wide">References, one per line (optional, up to ${TEXT_LIMITS.refs}; shown as author-provided)<textarea id="auRefs" rows="2">${h.esc((sp.refs||[]).join("\n"))}</textarea></label>
        <div class="cs-actions"><button class="abtn" type="submit">Check and make the link</button></div>
      </form>
      <div id="auOut" class="cs-result" aria-live="polite"></div>`);
    const f=el.querySelector("#auForm"), $=id=>el.querySelector("#"+id), nv=id=>{ const x=$(id).value.trim(); return x==="" ? null : parseFloat(x); };
    const sync=()=>{ const inf=drugOf($("auDrug").value).s.route==="inf", kind=$("auKind").value;
      $("auTinfL").hidden=!inf; el.querySelectorAll(".au-pt").forEach(x=>x.hidden=kind!=="pt"); el.querySelectorAll(".au-auc").forEach(x=>x.hidden=kind!=="auc");
      el.querySelectorAll(".au-ft").forEach(x=>x.hidden=kind!=="ftmic");
      $("auF").closest("label").hidden=drugOf($("auDrug").value).s.route!=="oral"; };
    ["auDrug","auKind"].forEach(id=> $(id).addEventListener("change", sync)); sync();
    const read=()=>{
      const drug=$("auDrug").value, inf=drugOf(drug).s.route==="inf", oral=drugOf(drug).s.route==="oral", kind=$("auKind").value, over={};
      [["thalf","auThalf"],["V","auV"]].concat(oral ? [["F","auF"]] : []).forEach(([k,id])=>{ const x=nv(id); if(x!=null) over[k]=x; });
      const target=kind==="auc" ? {kind, auc:[nv("auAucLo"), nv("auAucHi")]} : kind==="ftmic" ? {kind, mic:nv("auMic"), ft:nv("auFt")} : {kind, peak:[nv("auPkLo"), nv("auPkHi")]};
      if(kind==="pt"){ const a=nv("auTrMax"), b=nv("auTrMin"); if(a!=null) target.troughMax=a; if(b!=null) target.troughMin=b; }
      const choices={taus:[...el.querySelectorAll(".au-taus input:checked")].map(x=>+x.value), min:nv("auMin"), max:nv("auMax"), step:nv("auStep")};
      if(inf) choices.tinf=nv("auTinf");
      return {title:$("auTitle").value, drug, patient:{age:nv("auAge"), sex:$("auSex").value, ht:nv("auHt"), wt:nv("auWt"), scr:nv("auScr")}, over:Object.keys(over).length ? over : undefined,
        setting:$("auSetting").value, task:$("auTask").value, also:$("auAlso").value, refs:$("auRefs").value.split("\n").map(x=>x.trim()).filter(Boolean),
        target, choices, start:{D:nv("auD"), tau:+$("auTau").value}};
    };
    f.addEventListener("submit",e=>{
      e.preventDefault();
      const raw=read(); store.set("dosecurve-author-draft", raw);
      const got=checkSpec(raw), out=$("auOut");
      if(!got.spec){ out.innerHTML=`<p class="cs-no">The case needs ${h.esc(got.errors.join("; "))}.</p>`; return; }
      const c=communityCase(got.spec), sol=solveCase(c), u=PK.unitsOf({unit:drugOf(c.drug).units});
      if(!sol.solvable){ out.innerHTML=`<p class="cs-no">✗ None of the ${sol.total} regimens your choices allow meets the target in the model. Widen the dose range, add intervals, or relax the target.</p>`; return; }
      lastSpec=got.spec;
      const g=sol.best.grade, m=g.metrics;
      out.innerHTML=`<p class="cs-ok">✓ ${sol.count} of the ${sol.total} regimens your choices allow meet the target; for example ${nf(sol.best.D,1)} ${u.dose} every ${sol.best.tau} h (${c.target.kind==="auc" ? `AUC24 ${nf(m.auc24,0)} ${u.auc}` : `peak ${nf(m.peak,2)}, trough ${nf(m.trough,2)} ${u.conc}`}).</p>`+
        `<p class="cs-sub">Link, ready to share</p><input class="cs-linkbox" id="auLink" readonly aria-label="The case's link">`+
        `<div class="cs-actions"><button class="abtn" type="button" id="auCopy">Copy link</button><button class="abtn" type="button" id="auOpen">Open the case</button><button class="abtn" type="button" id="auBundle">Put it in an assignment</button></div>`;
      encodeCommunityLink(got.spec).then(hash=>{ $("auLink").value=location.href.split("#")[0]+"#"+hash;
        $("auCopy").addEventListener("click",()=> h.copyHash(hash)); });
      $("auOpen").addEventListener("click",()=> open({id:"community", case:c, reg:null}));
      $("auBundle").addEventListener("click",()=> renderBundleMaker(true));
    });
  }

  /* ---------- make an assignment ---------- */
  function renderBundleMaker(withSpec){
    const h=host, items=[];
    if(withSpec && lastSpec) items.push({kind:"case", spec:lastSpec});
    const el=panel(`<h2 class="cs-h">Make an assignment</h2>
      <p class="cs-intro-p">Put up to ${BUNDLE_MAX} cases and worksheets in order and share one link. Students open it, work through the items (worksheet answers are checked as they go), and can make a completion code at the end. Choose a class key and tell it to your class separately: it is not in the link, and you need it to verify their codes.</p>
      <label class="cs-field">Title<input id="bmTitle" maxlength="${TEXT_LIMITS.title}" value="Assignment"></label>
      <fieldset class="cs-field"><legend>Add a case</legend><select id="bmCase" aria-label="Case to add">${CASES.map(c=>`<option value="${c.id}">${h.esc(c.title)}</option>`).join("")}${lastSpec ? `<option value="community">Your case: ${h.esc(lastSpec.title)}</option>` : ""}</select>
        <button class="abtn" type="button" id="bmAddCase">Add</button></fieldset>
      <fieldset class="cs-field"><legend>Add a worksheet</legend><select id="bmTopic" aria-label="Worksheet topic"><option value="">All topics</option>${PK.PRACTICE_TOPICS.map(t=>`<option value="${t.id}">${h.esc(t.title)}</option>`).join("")}</select>
        <select id="bmCount" aria-label="Number of problems">${PK.WORKSHEET_SIZES.map(n=>`<option value="${n}"${n===5 ? " selected" : ""}>${n} problems</option>`).join("")}</select>
        <button class="abtn" type="button" id="bmAddWs">Add</button></fieldset>
      <ol class="cs-items" id="bmItems"></ol>
      <div class="cs-actions"><button class="abtn" type="button" id="bmMake">Make the link</button></div>
      <div id="bmOut" class="cs-result" aria-live="polite"></div>`);
    const $=id=>el.querySelector("#"+id);
    const label=it=> it.kind==="case" ? `Case: ${it.id ? caseById(it.id).title : it.spec.title + " (community)"}` : `Worksheet: ${it.topic ? PK.PRACTICE_TOPICS.find(t=>t.id===it.topic).title : "all topics"}, ${it.count} problems`;
    const draw=()=>{ $("bmItems").innerHTML=items.map((it,i)=>`<li>${h.esc(label(it))} <button class="bz-del" type="button" data-rm="${i}" aria-label="Remove item ${i+1}">✕</button></li>`).join("") || `<li class="cs-empty">No items yet.</li>`; };
    $("bmItems").addEventListener("click",e=>{ const b=e.target.closest("[data-rm]"); if(b){ items.splice(+b.dataset.rm,1); draw(); } });
    $("bmAddCase").addEventListener("click",()=>{ if(items.length>=BUNDLE_MAX) return; const v=$("bmCase").value; items.push(v==="community" ? {kind:"case", spec:lastSpec} : {kind:"case", id:v}); draw(); });
    $("bmAddWs").addEventListener("click",()=>{ if(items.length>=BUNDLE_MAX) return; items.push({kind:"ws", topic:$("bmTopic").value, count:+$("bmCount").value, seed:1+Math.floor(Math.random()*999999), v:PK.WS_VERSION}); draw(); });
    $("bmMake").addEventListener("click",()=>{
      encodeBundleLink({title:$("bmTitle").value, items}).then(hash=>{
        if(!hash){ $("bmOut").innerHTML=`<p class="cs-no">Add at least one item first.</p>`; return; }
        $("bmOut").innerHTML=`<p class="cs-ok">✓ ${items.length} item${items.length>1 ? "s" : ""}.</p><input class="cs-linkbox" readonly aria-label="The assignment's link" value="${h.esc(location.href.split("#")[0]+"#"+hash)}">`+
          `<div class="cs-actions"><button class="abtn" type="button" id="bmCopy">Copy link</button><button class="abtn" type="button" id="bmOpen">Open it</button></div>`;
        $("bmCopy").addEventListener("click",()=> h.copyHash(hash));
        $("bmOpen").addEventListener("click",()=> decodeBundleLink(hash).then(b=>openBundle(b, hash.slice(7))));
      });
    });
    draw();
  }

  /* ---------- work through an assignment ---------- */
  function progressKey(token){ return "dosecurve-assignment-"+token.slice(-24); }
  function markDone(from, i, val){ const k=progressKey(from.token), pr=store.get(k)||{}; pr[i]=Object.assign(pr[i]||{}, val); store.set(k, pr); }
  function openBundle(b, token){
    if(!b){ panel(`<p class="cs-no">This assignment link couldn't be read. Ask for the link again.</p>`); return; }
    token=token || (location.hash.match(/bundle=b\d+\.(.+)$/)||[])[1] || "local";
    const h=host, pr=store.get(progressKey(token))||{}, from=i=>({bundle:b, token, index:i});
    const status=(it,i)=>{ const p=pr[i]||{};
      if(it.kind==="case") return p.ok ? "✓ on target" : "not yet";
      const n=Object.values(p.answers||{}).filter(a=>a.ok).length; return `${n} of ${it.count} right`; };
    const el=panel(`<p class="cs-tag">Assignment</p><h2 class="cs-h">${h.esc(b.title)}</h2>
      <p class="cs-disc">Educational model, not for clinical dosing.</p>
      <ol class="cs-items">${b.items.map((it,i)=>`<li><span>${h.esc(it.kind==="case" ? (it.id ? caseById(it.id).title : it.spec.title+" (community case)") : `Worksheet: ${it.topic ? PK.PRACTICE_TOPICS.find(t=>t.id===it.topic).title : "all topics"}, ${it.count} problems`)}</span>
        <span class="cs-status">${status(it,i)}</span> <button class="abtn" type="button" data-open="${i}">Open</button></li>`).join("")}</ol>
      <div id="bdWs"></div>
      <section class="cs-code"><p class="cs-sub">Completion code</p>
        <p>When you've finished, enter the identifier your teacher gave you (not your name) and the class key, and show the code and the lines above it to your teacher. The code is made in this browser; nothing is sent.</p>
        <div class="cs-form"><label>Identifier<input id="bdId" maxlength="24" autocomplete="off" pattern="[A-Za-z0-9_-]{1,24}"></label><label>Class key<input id="bdKey" type="password" autocomplete="off"></label></div>
        <div class="cs-actions"><button class="abtn" type="button" id="bdMake">Make my completion code</button></div>
        <div id="bdOut" class="cs-result" aria-live="polite"></div></section>`);
    el.querySelector(".cs-items").addEventListener("click",e=>{
      const btn=e.target.closest("[data-open]"); if(!btn) return;
      const i=+btn.dataset.open, it=b.items[i];
      if(it.kind==="case") open(it.id ? {id:it.id, reg:null, from:from(i)} : {id:"community", case:communityCase(it.spec), reg:null, from:from(i)});
      else openWorksheetItem(el, b, token, i);
    });
    el.querySelector("#bdMake").addEventListener("click",async()=>{
      const id=el.querySelector("#bdId").value.trim(), key=el.querySelector("#bdKey").value, out=el.querySelector("#bdOut");
      if(!IDENT.test(id)){ out.innerHTML=`<p class="cs-no">The identifier is 1 to 24 letters, digits, - or _ (no spaces): the one your teacher gave you, not your name.</p>`; return; }
      if(key.length<4){ out.innerHTML=`<p class="cs-no">Enter the class key your teacher gave you (at least 4 characters).</p>`; return; }
      const p2=store.get(progressKey(token))||{}, done=[], ids=[]; let score=0, total=0;
      b.items.forEach((it,i)=>{ const q=p2[i]||{};
        if(it.kind==="case"){ total++; if(q.ok){ score++; done.push(itemId(it,i)); } }
        else { total+=it.count; const n=Object.values(q.answers||{}).filter(a=>a.ok).length; score+=n; if(n) done.push(itemId(it,i)+`(${n}/${it.count})`); }
        ids.push(itemId(it,i)); });
      const payload=completionPayload({bundle:(await sha256Hex(token)).slice(0,12), identifier:id, items:done.length ? done : ["none"], score, total, date:new Date().toISOString().slice(0,10)});
      const code=await completionCode(key, payload);
      out.innerHTML=`<pre class="cs-payload">${h.esc(payload)}</pre><p>Code: <b class="cs-codev">${code}</b></p><p class="cs-sub">Anyone who knows the class key could make a code, so it records work done in the app; it isn't proof.</p>`;
    });
  }
  function openWorksheetItem(el, b, token, i){
    const it=b.items[i], box=el.querySelector("#bdWs"), h=host;
    box.innerHTML=`<p class="cs-sub">Loading the problems…</p>`;
    h.loadPractice().then(()=>{
      const w=PK.makeWorksheet({topic:it.topic||undefined, count:it.count, seed:it.seed, v:it.v}), pr=(store.get(progressKey(token))||{})[i]||{}, ans=pr.answers||{};
      box.innerHTML=`<h3 class="cs-h3">Worksheet: ${it.count} problems</h3><ol class="cs-ws">${w.problems.map((p,j)=>`<li><div>${p.q}</div>
        <div class="cs-form"><label>Answer (${h.esc(p.unit)})<input data-j="${j}" type="number" step="any" value="${ans[j] ? ans[j].v : ""}"></label><button class="abtn" type="button" data-chk="${j}">Check</button></div>
        <p class="cs-wsr" id="wsr${i}_${j}">${ans[j] ? (ans[j].ok ? "✓ Right" : "✗ Not quite") : ""}</p></li>`).join("")}</ol>`;
      box.onclick=e=>{
        const btn=e.target.closest("[data-chk]"); if(!btn) return;
        const j=+btn.dataset.chk, v=parseFloat(box.querySelector(`input[data-j="${j}"]`).value);
        if(!isFinite(v)) return;
        const ok=PK.practiceCorrect(w.problems[j], v), cur=(store.get(progressKey(token))||{})[i]||{}, answers=Object.assign({}, cur.answers, {[j]:{v, ok}});
        markDone({token}, i, {answers});
        box.querySelector(`#wsr${i}_${j}`).textContent=ok ? "✓ Right" : "✗ Not quite";
      };
      box.scrollIntoView({block:"start"});
    }).catch(()=>{ box.innerHTML=`<p class="cs-no">The problems couldn't load. Check the connection and open the worksheet again.</p>`; });
  }

  /* ---------- verify a completion code ---------- */
  function renderVerify(){
    const h=host, el=panel(`<h2 class="cs-h">Verify a completion code</h2>
      <p class="cs-intro-p">Paste the lines a student shows you and their code, and enter your class key. The check runs in this browser.</p>
      <label class="cs-field">Class key<input id="vcKey" type="password" autocomplete="off"></label>
      <label class="cs-field">The lines above the code<textarea id="vcPayload" rows="6"></textarea></label>
      <label class="cs-field">Code<input id="vcCode" autocomplete="off" placeholder="XXXX-XXXX-XXXX-XXXX"></label>
      <div class="cs-actions"><button class="abtn" type="button" id="vcGo">Verify</button></div>
      <div id="vcOut" class="cs-result" aria-live="polite"></div>`);
    el.querySelector("#vcGo").addEventListener("click",async()=>{
      const ok=await verifyCode(el.querySelector("#vcKey").value, el.querySelector("#vcPayload").value, el.querySelector("#vcCode").value);
      el.querySelector("#vcOut").innerHTML=ok ? `<p class="cs-ok">✓ The code matches these lines and this key.</p>` : `<p class="cs-no">✗ It doesn't match: the lines, the key or the code differ.</p>`;
    });
  }

  function regFromForm(c, box){
    if(c.target.kind==="choice"){ const r=box.querySelector('input[name="csChoice"]:checked'); return r ? {choice:r.value} : null; }
    const D=parseFloat(box.querySelector("#csDose").value), tau=parseInt(box.querySelector("#csTau").value,10);
    return isFinite(D) && D>0 ? {D, tau} : null;
  }
  function metricsHtml(c, g, reg){
    const u=PK.unitsOf(g.p), m=g.metrics, f=(v,dp)=> v==null ? "—" : host.fmt(v,dp), cd=u.cdp;
    const rows=[];
    if(m.none) rows.push(["Steady state","none: input exceeds Vmax"]);
    else if(m.sessions){   // dialysis: per kg, the peaks, and the last session
      const s=m.sessions[m.sessions.length-1];
      rows.push(["Dose per kg", `${f(m.perKg,2)} mg/kg`], ["Peak after each dose", `${m.peaks.map(v=>f(v,1+cd)).join(", ")} ${u.conc}`],
        [`Session ${s.n} (${s.start}–${s.end} h)`, `${f(s.pre,2+cd)} → ${f(s.post,2+cd)} ${u.conc}, ${f(s.removed,0)} ${u.amount} removed`]);
    } else {
      if(c.target.kind==="css") rows.push(["Predicted Css", `${f(m.css,1+cd)} ${u.conc}`]);
      if(c.target.kind==="at") rows.push([`${c.target.at}-hour level`, `${f(m.atLevel,2)} ${u.conc}`]);
      rows.push(["Peak", `${f(m.peak,1+cd)} ${u.conc}`], ["Trough", `${f(m.trough,1+cd)} ${u.conc}`]);
      if(c.target.kind==="auc" || c.target.kind==="hartford" || c.target.kind==="table") rows.push(["AUC24", `${f(m.auc24,0)} ${u.auc}`]);
      if(m.aboveMic!=null) rows.push([`Time above the MIC (${c.target.mic} ${u.conc})`, `${f(m.aboveMic,0)}% of each interval`]);
      if(c.target.kind==="hartford" && m.below1!=null) rows.push(["Hours below 1 mg/L", `${f(m.below1,1)} h of ${reg.tau}`]);
    }
    return rows.map(r=>`<tr><th scope="row">${r[0]}</th><td>${r[1]}</td></tr>`).join("");
  }
  function regText(c, reg){
    const u=PK.unitsOf({unit:drugOf(c.drug).units});
    const inf=PK.drugScenario(drugOf(c.drug)).route==="inf" ? ` as a ${nf(tinfFor(c, reg.D),2)} h infusion` : "";
    return `${nf(reg.D,1)} ${u.dose} every ${reg.tau} h${inf}`;
  }
  function renderResult(c, reg, box){
    const out=box.querySelector("#csResult");
    if(!reg){ out.innerHTML=`<p>${c.target.kind==="choice" ? "Choose an answer first." : "Enter a dose first."}</p>`; return; }
    if(c.target.kind==="choice"){
      const g=gradeCase(c, reg);
      out.innerHTML=`<p class="${g.ok ? "cs-ok" : "cs-no"}">${g.ok ? "✓ Yes." : "✗ Not quite."} ${g.ok ? "" : host.esc(g.hintText)}</p>`+
        `<table class="cs-tbl"><tbody>${g.late.map(x=>`<tr><th scope="row">${x.name} (t½ ${nf(x.th,1)} h)</th><td>${nf(x.halfLives,2)} half-lives late: level falls to ${nf(100*x.frac,1)}% of its usual trough</td></tr>`).join("")}</tbody></table>`;
      return;
    }
    const g=gradeCase(c, reg), r=gradeRounded(c, reg);
    let html=`<p class="${g.ok ? "cs-ok" : "cs-no"}">${g.ok ? "✓ On target" : "✗ Off target"}: ${host.esc(regText(c, reg))}</p>`+
      (g.ok ? "" : `<p class="cs-hint">${host.esc(g.hintText)}</p>`)+`<table class="cs-tbl"><tbody>${metricsHtml(c, g, reg)}</tbody></table>`;
    if(r.changed) html+=`<p class="${r.ok ? "cs-ok" : "cs-no"}">Rounded to what the forms give: ${host.esc(regText(c, r.reg))}: ${r.ok ? "✓ on target" : "✗ off target"}</p>`+
      (r.ok ? "" : `<p class="cs-hint">${host.esc(r.hintText)}</p>`)+`<table class="cs-tbl"><tbody>${metricsHtml(c, r, r.reg)}</tbody></table>`;
    if(c.id==="gent-ext" && g.p){   // the comparison the case asks for
      const conv={D:roundDose(c, 1.7*c.patient.wt), tau:8}, gc=gradeCase(c, conv);
      html+=`<p class="cs-sub">For comparison, the conventional ${host.esc(regText(c, conv))}:</p><table class="cs-tbl"><tbody>${metricsHtml(c, gc, conv)}</tbody></table>`;
    }
    out.innerHTML=html;
    current.last=reg;
    if(current.from && g.ok) markDone(current.from, current.from.index, {ok:true});
  }
  function open(link){
    if(link && link.bundle){ openBundle(link.bundle); return; }
    const c=link && link.case ? link.case : caseById(link && link.id);
    if(!c || !rootEl) return;
    current={c, last:null, from:link.from || null};
    const box=rootEl.querySelector("#csCase"), h=host, t=c.target, ch=c.choices, u=c.drug ? PK.unitsOf({unit:drugOf(c.drug).units}) : null;
    const start=link.reg || c.start || null;
    let form;
    if(t.kind==="choice") form=`<fieldset class="cs-choice"><legend>Whose level falls further, in proportion?</legend>${ch.options.map(o=>`<label><input type="radio" name="csChoice" value="${o[0]}"${start && start.choice===o[0] ? " checked" : ""}> ${o[1]}</label>`).join("")}</fieldset>`;
    else {
      const doses=ch.strengthsOnly ? achievable(c).filter(v=>v<=1800) : null;
      form=`<div class="cs-form">`+
        (doses ? `<label>Dose (${u.dose})<select id="csDose">${doses.map(v=>`<option value="${v}"${start && Math.abs(start.D-v)<1e-9 ? " selected" : ""}>${nf(v,1)}</option>`).join("")}</select></label>`
               : `<label>Dose (${u.dose})<input id="csDose" type="number" inputmode="decimal" min="${ch.min}" max="${ch.max}" step="${ch.step}" value="${start ? +start.D.toFixed(2) : ""}"></label>`)+
        `<label>Every<select id="csTau">${ch.taus.map(x=>`<option value="${x}"${start && start.tau===x ? " selected" : ""}>${x} h</option>`).join("")}</select></label></div>`;
    }
    const refs=c.refs.map(id=>PK.SOURCES[id]).filter(Boolean).map(s=>`<li>${s.url ? `<a href="${s.url}" target="_blank" rel="noopener">${h.esc(s.cite)}</a>` : h.esc(s.cite)}</li>`).join("");
    const community=c.community, ov=community && c.over ? Object.entries(c.over) : [], lib=drugOf(c.drug) && PK.drugScenario(drugOf(c.drug));
    const ovText=ov.map(([k,v])=>`${{thalf:"half-life", V:"volume (per 70 kg)", F:"bioavailability"}[k]} ${nf(v,3)}${k==="thalf" ? " h" : k==="V" ? " L" : ""} (library ${nf(lib[k],3)}${k==="thalf" ? " h" : k==="V" ? " L" : ""})`).join("; ");
    box.innerHTML=`<p><button class="abtn" id="csBack">${current.from ? "Back to the assignment" : "All cases"}</button></p>
      <p class="cs-tag">${h.esc(c.tag)}</p><h2 class="cs-h">${h.esc(c.title)}</h2>
      ${community ? `<p class="cs-banner">Community case, unreviewed: written by an instructor and shared by link. DoseCurve checks that some regimen on its grid meets the target in the model; it hasn't reviewed the premise, the target or the text.</p>` : ""}
      <p class="cs-disc">Educational model, not for clinical dosing.</p>
      <details class="cs-more cs-dossier" open><summary>Case facts</summary><dl class="cs-facts"><dt>Patient</dt><dd>${h.esc(who(c))}</dd>
        ${c.drug ? `<dt>Drug</dt><dd>${h.esc(drugOf(c.drug).name)} (${h.esc(drugOf(c.drug).strengths.form)})${ovText ? `; the author's values: ${h.esc(ovText)}` : ""}</dd>` : ""}
        <dt>Setting</dt><dd>${h.esc(c.indication)}</dd>
        ${c.bayes ? (b=>`<dt>Levels</dt><dd class="cs-lv">On ${nf(c.current.D,0)} mg every ${c.current.tau} h (each infused over ${nf(b.T,2)} h), after dose ${c.bayes.dose}: ${b.lv.map(l=>`<b>${nf(l.c,2)} mg/L</b> at ${nf(l.dt,2)} h`).join(" and ")} after that dose started.</dd>`)(bayesOf(c))
          : c.current ? (L=>`<dt>Levels</dt><dd class="cs-lv">On ${nf(L.D,0)} mg every ${L.tau} h (each infused over ${nf(L.T,2)} h), at steady state: <b>${nf(L.peak,2)} mg/L</b> at ${nf(L.T+L.after,2)} h after an infusion started, and <b>${nf(L.trough,2)} mg/L</b> ${L.second===undefined ? "just before the next dose" : `at ${nf(L.second,2)} h after it started`}.</dd>`)(levelsOf(c)) : ""}
        <dt>Target</dt><dd>${h.esc(targetText(c))}. <span class="cs-why">${h.esc(t.why)}</span></dd></dl></details>
      <p class="cs-task"><b>Task.</b> ${h.esc(c.task)}</p>
      <form id="csForm" novalidate>${form}<div class="cs-actions"><button class="abtn" type="submit">Check regimen</button>
        ${c.drug ? `<button class="abtn" type="button" id="csSim">Open in simulator</button>` : ""}
        <button class="abtn" type="button" id="csLink">Copy link</button><button class="abtn" type="button" id="csPrint">Print</button></div></form>
      <div id="csResult" class="cs-result" aria-live="polite"></div>
      <details class="cs-more"><summary>Walkthrough</summary><ol>${walkthrough(c).map(s=>`<li>${s}</li>`).join("")}</ol></details>
      <details class="cs-more"><summary>What a pharmacist also weighs</summary><p>${h.esc(c.also)}</p></details>
      <details class="cs-more cs-refs"><summary>Sources</summary><ol>${refs}${(c.authorRefs||[]).map(r=>`<li>${h.esc(r)} <span class="cs-flag">(author-provided)</span></li>`).join("")}${community && !(c.authorRefs||[]).length ? "<li>The author gave no references.</li>" : ""}</ol></details>`;
    showOnly(box);
    box.querySelector("#csBack").addEventListener("click",()=>{
      if(current.from){ const b=current.from; openBundle(b.bundle, b.token); return; }
      showList(); const card=rootEl.querySelector(`.cs-card[data-id="${c.id}"]`); if(card) card.focus(); });
    box.querySelector("#csForm").addEventListener("submit",e=>{ e.preventDefault(); renderResult(c, regFromForm(c, box), box); });
    box.querySelector("#csLink").addEventListener("click",()=>{
      if(community) encodeCommunityLink(c.spec, regFromForm(c, box)).then(h.copyHash); else h.copyHash(encodeCaseLink(c.id, regFromForm(c, box)));
    });
    box.querySelector("#csPrint").addEventListener("click",()=> h.print());
    const sim=box.querySelector("#csSim");
    if(sim) sim.addEventListener("click",()=>{
      // a Bayesian case opens the patient as the model predicts her, on the regimen the levels were drawn on, with the levels
      const reg=regFromForm(c, box) || c.start, p=c.bayes ? bayesOf(c).prior : caseScenario(c, reg), win=caseWindow(c);
      h.openScenario(p, Object.assign({duration:c.hd ? 3*c.hd.every : Math.min(336, p.nDoses*p.tau)}, win), c.drug);
    });
    if(link.reg) renderResult(c, link.reg, box);
    box.focus({preventScroll:true});
    box.scrollIntoView({block:"start"});
  }

  return {CASES, caseById, caseScenario, context, achievable, roundDose, gradeCase, gradeRounded, reference, walkthrough,
    caseOfDay, lateDose, missedDose, pheVmax, levelsOf, twoLevel, twoCmtOf, tableRow, mosteller, bayesOf, caseWindow, HINTS, encodeCaseLink, decodeCaseLink, tinfFor, metricsOf, mount, open,
    COMMUNITY_VERSION, TEXT_LIMITS, AUTHOR_TAUS, AUTHOR_DRUG_IDS, checkSpec, communityCase, solveCase, packJSON, unpackJSON, encodeCommunityLink, decodeAnyCaseLink,
    BUNDLE_VERSION, BUNDLE_MAX, checkBundle, encodeBundleLink, decodeBundleLink, itemId, IDENT, sha256Hex, completionPayload, completionCode, verifyCode};
});
