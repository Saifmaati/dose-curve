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
    {id:"gent", drug:"gent", title:"Gentamicin with reduced kidney function", tag:"Aminoglycoside · peak and trough",
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

    {id:"gent-ext", drug:"gent", title:"Gentamicin once daily (extended interval)", tag:"Aminoglycoside · Hartford approach",
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

    {id:"vanc", drug:"vanc", title:"Vancomycin to an AUC target", tag:"Glycopeptide · AUC24",
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

    {id:"vanc-lv", drug:"vanc", title:"Vancomycin: the AUC from two levels", tag:"Glycopeptide · two-level AUC",
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

    {id:"phe", drug:"phe", title:"Phenytoin: a low level and low albumin", tag:"Saturable kinetics · albumin",
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

    {id:"dig", drug:"dig", title:"Digoxin in an older adult", tag:"Narrow window · ng/mL",
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

    {id:"theo", drug:"theo", title:"Theophylline in a smoker", tag:"Narrow window · clearance factor",
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

    {id:"li", drug:"li", title:"Lithium with lower kidney function", tag:"Renal elimination · mEq/L",
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
  function caseScenario(c, reg, drugId){
    const d=drugOf(drugId||c.drug), base=PK.drugScenario(d), pt=c.patient;
    const over={pm:"clinical", age:pt.age, sex:pt.sex, ht:pt.ht, wt:pt.wt, scr:pt.scr, alb:pt.alb||4, wtm:"actual",
      dosing:"repeated", loadMult:1, missed:1};
    if(reg){ over.D=reg.D; over.tau=reg.tau; if(base.route==="inf") over.tinf=tinfFor(c, reg.D); }
    const p=Object.assign({}, base, over);
    if(c.clMult) p.thalf=base.thalf/c.clMult;   // a clearance factor: the same volume, a shorter half-life
    if(c.id==="phe") p.vmax=pheVmax(c)/(pt.wt*PK.clFactor(p));   // her Vmax, net of the model's renal factor
    // enough doses to show the approach to steady state inside two weeks
    p.nDoses=Math.max(2, Math.min(20, Math.floor(336/p.tau)));
    return PK.normalizeScenario(PK.scenario(p));
  }
  // The same patient with two compartments: half the volume central, the same clearance (k10 doubles).
  const twoCmtOf=p=> PK.normalizeScenario(Object.assign({}, p, {cmt:2, V:p.V/2, thalf:p.thalf/2, k12:0.545, k21:0.545}));
  // Levels drawn at steady state on a case's current regimen, as a laboratory reports them (to 0.1 mg/L): a peak
  // `after` hours after the infusion ends, and a trough just before the next dose.
  function levelsOf(c){
    const p=caseScenario(c, c.current), T=p.tinf, r1=v=> Math.round(v*10)/10;
    return {p, D:c.current.D, tau:c.current.tau, T, after:c.sample.after, peak:r1(PK.ssConc(p, T+c.sample.after)), trough:r1(PK.ssConc(p, p.tau-1e-9))};
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
    choice:"Compare how many half-lives the extra hours are for each drug: the one with more of them falls further."
  };
  function metricsOf(c, p){
    const ss=PK.ssProfile(p), m={peak:ss.ssPeak, trough:ss.ssTrough, none:!!(ss.mm && ss.mm.none)};
    if(p.kin==="mm"){ m.css=ss.mm.css; m.avg=ss.mm.avg; m.auc24=m.none ? null : 24*ss.mm.avg; }
    else m.auc24=PK.derived(p).auc*24/p.tau;
    if(c.target.kind==="at" && !m.none) m.atLevel=PK.ssConc(p, Math.min(c.target.at, p.tau-1e-9));
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
        : `Clearance = CL<sub>ref</sub> × [(1 − fe) + fe × CrCl / 120] = ${nf(LN2/drugOf(c.drug).s.thalf*PK.vOf(p)*(c.clMult||1),2)} × [(1 − ${p.fe}) + ${p.fe} × ${nf(pt.crcl,1)} / 120] = <b>${nf(x.CL,2)} L/h</b>; V = ${nf(x.V,1)} L; k = ${nf(x.k,4)} h⁻¹; t½ = ${nf(x.th,1)} h.`];
    const pl=c.plan(x), ref=reference(c), g=gradeCase(c, ref), u=PK.unitsOf(p);
    steps.push(...pl.steps);
    const m=g.metrics;
    steps.push(`Check ${nf(ref.D,1)} ${u.dose} every ${ref.tau} h in the model: ${c.target.kind==="auc" ? `AUC24 ${nf(m.auc24,0)} mg·h/L` : c.target.kind==="css" ? `predicted steady state ${nf(m.css,1)} ${u.conc}` : c.target.kind==="at" ? `12-hour level ${nf(m.atLevel,2)} ${u.conc}, peak ${nf(m.peak,2)}` : `peak ${nf(m.peak,2)} ${u.conc}, trough ${nf(m.trough,2)} ${u.conc}`} — ${g.ok ? "on target" : "off target: " + g.hintText}`);
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

  /* ================= THE CASES TAB (browser only) ================= */
  // host: {esc, fmt, toast, copyHash(hash), openScenario(p, view, drugId)} from the page.
  let host=null, rootEl=null, current=null;
  const who=c=>{ const pt=c.patient, cr=PK.crclCG(pt.age, pt.wt, pt.scr, pt.sex);
    return `A ${pt.age}-year-old ${pt.sex==="F" ? "woman" : "man"}, ${pt.ht} cm, ${pt.wt} kg, serum creatinine ${pt.scr} mg/dL (Cockcroft–Gault CrCl ${nf(cr,0)} mL/min)${pt.alb ? `, albumin ${pt.alb} g/dL` : ""}.`; };
  const targetText=c=>{ const t=c.target, u=c.drug ? PK.unitsOf({unit:drugOf(c.drug).units}).conc : "";
    if(t.kind==="auc") return `AUC24 ${t.auc[0]}–${t.auc[1]} mg·h/L at steady state`;
    if(t.kind==="css") return `Predicted steady-state level ${t.css[0]}–${t.css[1]} ${u}`;
    if(t.kind==="hartford") return `7 mg/kg, at the interval the Hartford bands give for this CrCl`;
    if(t.kind==="at") return `The ${t.at}-hour level at steady state ${t.range[0]}–${t.range[1]} ${u}, peak below ${t.peakMax} ${u}`;
    if(t.kind==="choice") return `A reasoning question, checked against the model`;
    const parts=[];
    if(t.peak && t.peak[0]) parts.push(`peak ${t.peak[0]}–${t.peak[1]} ${u}`); else if(t.peak) parts.push(`peak at or below ${t.peak[1]} ${u}`);
    if(t.troughMax!=null) parts.push(`trough at or below ${t.troughMax} ${u}`);
    if(t.troughMin!=null) parts.push(`trough at or above ${t.troughMin} ${u}`);
    return `At steady state: ${parts.join(", ")}`;
  };
  function mount(el, h){
    host=h; rootEl=el;
    el.innerHTML=`<div class="cs-intro"><h2 class="cs-h">Clinical cases</h2>
      <p>Each case gives a patient and a drug. Propose a regimen and the model grades it at steady state, with a hint when it misses and the same regimen rounded to the forms available. The walkthrough works the textbook route with the patient's own numbers.</p>
      <p class="cs-disc">Educational model, not for clinical dosing. The cases teach the reasoning; they are not prescribing instructions.</p></div>
      <div class="cs-list">${CASES.map(c=>`<button class="cs-card" data-id="${c.id}"><span class="cs-tag">${h.esc(c.tag)}</span><span class="cs-title">${h.esc(c.title)}</span><span class="cs-who">${h.esc(who(c))}</span></button>`).join("")}</div>
      <article class="cs-case" id="csCase" hidden tabindex="-1"></article>`;
    el.querySelector(".cs-list").addEventListener("click",e=>{ const b=e.target.closest(".cs-card"); if(b) open({id:b.dataset.id, reg:null}); });
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
    else {
      if(c.target.kind==="css") rows.push(["Predicted Css", `${f(m.css,1+cd)} ${u.conc}`]);
      if(c.target.kind==="at") rows.push([`${c.target.at}-hour level`, `${f(m.atLevel,2)} ${u.conc}`]);
      rows.push(["Peak", `${f(m.peak,1+cd)} ${u.conc}`], ["Trough", `${f(m.trough,1+cd)} ${u.conc}`]);
      if(c.target.kind==="auc" || c.target.kind==="hartford") rows.push(["AUC24", `${f(m.auc24,0)} ${u.auc}`]);
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
    let html=`<p class="${g.ok ? "cs-ok" : "cs-no"}">${g.ok ? "✓ On target" : "✗ Off target"} · ${host.esc(regText(c, reg))}</p>`+
      (g.ok ? "" : `<p class="cs-hint">${host.esc(g.hintText)}</p>`)+`<table class="cs-tbl"><tbody>${metricsHtml(c, g, reg)}</tbody></table>`;
    if(r.changed) html+=`<p class="${r.ok ? "cs-ok" : "cs-no"}">Rounded to what the forms give: ${host.esc(regText(c, r.reg))} · ${r.ok ? "✓ on target" : "✗ off target"}</p>`+
      (r.ok ? "" : `<p class="cs-hint">${host.esc(r.hintText)}</p>`)+`<table class="cs-tbl"><tbody>${metricsHtml(c, r, r.reg)}</tbody></table>`;
    if(c.id==="gent-ext" && g.p){   // the comparison the case asks for
      const conv={D:roundDose(c, 1.7*c.patient.wt), tau:8}, gc=gradeCase(c, conv);
      html+=`<p class="cs-sub">For comparison, the conventional ${host.esc(regText(c, conv))}:</p><table class="cs-tbl"><tbody>${metricsHtml(c, gc, conv)}</tbody></table>`;
    }
    out.innerHTML=html;
    current.last=reg;
  }
  function open(link){
    const c=caseById(link && link.id);
    if(!c || !rootEl) return;
    current={c, last:null};
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
    box.innerHTML=`<p><button class="abtn" id="csBack">← All cases</button></p>
      <p class="cs-tag">${h.esc(c.tag)}</p><h2 class="cs-h">${h.esc(c.title)}</h2>
      <p class="cs-disc">Educational model, not for clinical dosing.</p>
      <dl class="cs-facts"><dt>Patient</dt><dd>${h.esc(who(c))}</dd>
        ${c.drug ? `<dt>Drug</dt><dd>${h.esc(drugOf(c.drug).name)} (${h.esc(drugOf(c.drug).strengths.form)})</dd>` : ""}
        <dt>Setting</dt><dd>${h.esc(c.indication)}</dd>
        ${c.current ? (L=>`<dt>Levels</dt><dd>On ${nf(L.D,0)} mg every ${L.tau} h (each infused over ${nf(L.T,2)} h), at steady state: <b>${nf(L.peak,1)} mg/L</b> at ${nf(L.T+L.after,2)} h after an infusion started, and <b>${nf(L.trough,1)} mg/L</b> just before the next dose.</dd>`)(levelsOf(c)) : ""}
        <dt>Target</dt><dd>${h.esc(targetText(c))}. <span class="cs-why">${h.esc(t.why)}</span></dd></dl>
      <p class="cs-task"><b>Task.</b> ${h.esc(c.task)}</p>
      <form id="csForm" novalidate>${form}<div class="cs-actions"><button class="abtn" type="submit">Check regimen</button>
        ${c.drug ? `<button class="abtn" type="button" id="csSim">Open in simulator</button>` : ""}
        <button class="abtn" type="button" id="csLink">Copy link</button><button class="abtn" type="button" id="csPrint">Print</button></div></form>
      <div id="csResult" class="cs-result" aria-live="polite"></div>
      <details class="cs-more"><summary>Walkthrough</summary><ol>${walkthrough(c).map(s=>`<li>${s}</li>`).join("")}</ol></details>
      <details class="cs-more"><summary>What a pharmacist also weighs</summary><p>${h.esc(c.also)}</p></details>
      <div class="cs-refs"><p class="cs-sub">Sources</p><ol>${refs}</ol></div>`;
    rootEl.querySelector(".cs-intro").hidden=true; rootEl.querySelector(".cs-list").hidden=true; box.hidden=false;
    box.querySelector("#csBack").addEventListener("click",()=>{ box.hidden=true; rootEl.querySelector(".cs-intro").hidden=false; rootEl.querySelector(".cs-list").hidden=false;
      const card=rootEl.querySelector(`.cs-card[data-id="${c.id}"]`); if(card) card.focus(); });
    box.querySelector("#csForm").addEventListener("submit",e=>{ e.preventDefault(); renderResult(c, regFromForm(c, box), box); });
    box.querySelector("#csLink").addEventListener("click",()=> h.copyHash(encodeCaseLink(c.id, regFromForm(c, box))));
    box.querySelector("#csPrint").addEventListener("click",()=> h.print());
    const sim=box.querySelector("#csSim");
    if(sim) sim.addEventListener("click",()=>{
      const reg=regFromForm(c, box) || c.start, p=caseScenario(c, reg), d=drugOf(c.drug);
      const win=t.kind==="pt" ? {mec:t.troughMin!=null ? t.troughMin : t.peak[0], mtc:t.peak[1]} : t.kind==="at" ? {mec:t.range[0], mtc:t.range[1]}
        : t.kind==="css" ? {mec:t.css[0], mtc:t.css[1]} : {mec:d.s.mec, mtc:d.s.mtc};
      h.openScenario(p, Object.assign({duration:Math.min(336, p.nDoses*p.tau)}, win), c.drug);
    });
    if(link.reg) renderResult(c, link.reg, box);
    box.focus({preventScroll:true});
    box.scrollIntoView({block:"start"});
  }

  return {CASES, caseById, caseScenario, context, achievable, roundDose, gradeCase, gradeRounded, reference, walkthrough,
    lateDose, missedDose, pheVmax, levelsOf, twoLevel, twoCmtOf, HINTS, encodeCaseLink, decodeCaseLink, tinfFor, metricsOf, mount, open};
});
