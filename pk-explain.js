/* DoseCurve: what changed, explained (2.5)
   The sentences under "What changed" (and A vs B in Compare): for two scenarios, what moved and why, with the model's
   numbers. Moved out of the page's script unchanged, so the first view loads less; the page loads this file just
   after its first paint (it registers itself as PK.explainModule), and a link that opens with a baseline waits for
   it. In Node the engine requires it on first use of PK.explain. Educational model, not for clinical dosing. */
(function(root, factory){
  if(typeof module==="object" && module.exports) module.exports=factory(require("./pk-engine.js"));
  else if(root && root.PK) root.PK.explainModule=factory(root.PK);
})(typeof self!=="undefined" ? self : this, function(PK){
  "use strict";
  const {missedOf, conc, derived}=PK;

  // a, b: the two scenarios; da, db and wa, wb: their readouts and window statistics (PK.compareRows); diffs: the
  // settings that differ; ref: what the first is called. h: the page's view and formatting: {fmt, trim, cap, U, cdp,
  // inShown, moved, ROUTE_NAME, IDR_NAME, WTM_NAME, mode, state}. Returns the sentences, as HTML.
  function explain(a,b,da,db,wa,wb,diffs,ref,h){
    const {fmt, trim, cap, U, cdp, inShown, moved, ROUTE_NAME, IDR_NAME, WTM_NAME, mode, state}=h;
    const pctTxt=(x,y)=>{
      const d=PK.diff("pct",x,y);
      if(d.dir===0) return "no change";
      return d.value===Infinity ? "new" : (d.dir>0?"▲ ":"▼ ")+fmt(d.value,0)+"%";
    };
    const C_auc=(x,y)=> derived(inShown(y)).auc/derived(inShown(x)).auc;
    const out=[], mmA=a.kin==="mm", mmB=b.kin==="mm", perDay=(v,p)=>`${fmt(24*v,0)} ${PK.unitsOf(p).amount}/day`;
    if(!diffs.length){
      return [mode==="cmp"
        ? "B is identical to A. Change B’s settings, or pick a setting under “Vary only” to change one thing at a time."
        : "This matches the baseline. Change any setting to see what moves and why."];
    }
    if(a.route!==b.route){
      const txt={
        oral:"<b>Oral dosing</b> adds an absorption phase: the peak comes later and lower, and only the fraction F reaches circulation, so exposure scales with F.",
        iv:"An <b>IV bolus</b> puts the whole dose into plasma at t = 0: the earliest, highest peak, with no absorption delay and F = 1.",
        inf:"An <b>IV infusion</b> delivers the dose at a steady rate, so concentration climbs gradually and peaks when the infusion ends: a lower peak than a bolus of the same size, with the same AUC."};
      out.push(`Route ${ROUTE_NAME[a.route]} → ${ROUTE_NAME[b.route]}. ${txt[b.route]}`);
    }
    if(a.dosing!==b.dosing){
      const tb=PK.doseTotals(b,state.duration);
      out.push(b.dosing==="custom"
        ? `<b>Custom schedule</b>: doses follow their own times and amounts instead of a fixed interval (${tb.n} given, ${fmt(tb.mg,0)} ${U().dose} within the window).`
        : b.dosing==="repeated"
        ? "<b>Repeated dosing</b>: each dose adds to what's left of the earlier ones, so levels build up until the amount eliminated per interval matches the dose."
        : "<b>Single dose</b>: no accumulation. The curve rises once and decays back toward zero.");
    }
    const sameRate=a.dosing==="repeated" && b.dosing==="repeated" && a.tau!==b.tau && Math.abs(a.D/a.tau-b.D/b.tau)/(a.D/a.tau)<0.01;
    if(a.dosing==="custom" && b.dosing==="custom" && !PK.sameSetting("events",a,b)){
      const ta=PK.doseTotals(a,state.duration), tb=PK.doseTotals(b,state.duration);
      const [ra,rb]=mode==="cmp" ? ["A","B"] : ["the baseline","the current schedule"];
      out.push(ta.n===tb.n && Math.abs(ta.mg-tb.mg)<1e-9
        ? `<b>Same doses, different timing</b>: both schedules give ${tb.n} dose${tb.n===1?"":"s"} (${fmt(tb.mg,0)} ${U().dose}) within the window, so exposure differs only through when they are given.`
        : `<b>Different schedules</b>: within the window, ${ra} gives ${ta.n} dose${ta.n===1?"":"s"} (${fmt(ta.mg,0)} ${U().dose}) and ${rb} gives ${tb.n} (${fmt(tb.mg,0)} ${U().dose}). Exposure follows the total amount given and how the doses are spread over time.`);
    }
    if(a.D!==b.D && mmA && mmB && a.dosing==="repeated" && b.dosing==="repeated"){
      const ca=PK.mmCss(a), cb=PK.mmCss(b), dp=Math.abs(b.D/a.D-1)*100;
      if(cb.css===null) out.push(`Dose ${a.D} → ${b.D} ${U().dose}: <b>no steady state</b>. The input rate, ${perDay(cb.R,b)}, now exceeds Vmax (${perDay(cb.Vmax,b)}), so the level keeps climbing for as long as dosing continues.`);
      else if(ca.css!==null){
        const lp=Math.abs(cb.css/ca.css-1)*100, up=b.D>a.D;
        out.push(`Dose ${up?"rose":"fell"} ${fmt(dp,0)}% but the predicted steady-state level ${up?"rose":"fell"} <b>${fmt(lp,0)}%</b> (${fmt(ca.css,cdp(1))} → ${fmt(cb.css,cdp(1))} ${PK.unitsOf(b).conc}), because the input rate is ${up?"now":"still"} ${fmt(100*cb.ratio,0)}% of Vmax and each extra milligram has less enzyme capacity left to clear it. Reaching 90% of it takes ${fmt(cb.css===null?0:PK.mmT90(b)/24,1)} days instead of ${fmt(PK.mmT90(a)/24,1)}.`);
      } else out.push(`Dose ${a.D} → ${b.D} ${U().dose}: the input rate falls below Vmax (${fmt(100*cb.ratio,0)}% of it), so a steady state exists again, predicted at ${fmt(cb.css,cdp(1))} ${PK.unitsOf(b).conc}.`);
    } else if(a.D!==b.D && (mmA || mmB) && PK.isRelevant("D",a) && PK.isRelevant("D",b)){
      out.push(`Dose ${a.D} → ${b.D} ${U().dose} (<b>${fmt(b.D/a.D,2)}×</b>). With saturable elimination, levels and exposure change more than in proportion to the dose: total exposure here goes ${fmt(C_auc(a,b),2)}×.`);
    } else if(a.D!==b.D && !sameRate && PK.isRelevant("D",a) && PK.isRelevant("D",b)){
      out.push(`Dose ${a.D} → ${b.D} ${U().dose} (<b>${fmt(b.D/a.D,2)}×</b>). In linear PK every concentration (peak, trough and AUC) scales by the same factor; the shape and timing don't change.`);
    }
    if(a.route==="oral" && b.route==="oral"){
      if(a.F!==b.F) out.push(`Bioavailability ${trim(a.F)} → ${trim(b.F)}. Only that fraction of the oral dose reaches circulation, so exposure changes by <b>${pctTxt(a.F,b.F)}</b> with the same shape.`);
      if(a.ka!==b.ka) out.push(b.ka>a.ka
        ? `Faster absorption (kₐ ${trim(a.ka)} → ${trim(b.ka)} h⁻¹): an earlier, higher peak. ${PK.hdOn(a) || PK.hdOn(b) ? "The same amount is still absorbed, but with dialysis the total AUC can still move, because what each session removes follows the level while it runs." : "AUC doesn't change because the same amount is still absorbed."}`
        : `Slower absorption (kₐ ${trim(a.ka)} → ${trim(b.ka)} h⁻¹): a later, flatter peak, which is the extended-release idea. ${PK.hdOn(a) || PK.hdOn(b) ? "The same amount is still absorbed, but with dialysis the total AUC can still move, because what each session removes follows the level while it runs." : "AUC doesn't change because the same amount is still absorbed."}`);
    }
    if(a.route==="inf" && b.route==="inf" && a.tinf!==b.tinf){
      out.push(b.tinf>a.tinf
        ? `Longer infusion (${trim(a.tinf)} → ${trim(b.tinf)} h): the same amount goes in more slowly, so the peak is lower and later, with the same AUC.`
        : `Shorter infusion (${trim(a.tinf)} → ${trim(b.tinf)} h): the same amount goes in faster, so the peak is higher and earlier, with the same AUC.`);
    }

    // saturable elimination
    if(mmA!==mmB) out.push(mmB
      ? `<b>Saturable elimination</b>: the body now removes at most Vmax, ${perDay(PK.vmaxOf(b),b)}, and works at half that speed at Km, ${trim(b.km)} ${PK.unitsOf(b).conc}. Levels no longer scale with the dose.`
      : `<b>First-order elimination</b>: a fixed fraction of the drug leaves each hour again, so levels scale with the dose.`);
    if(mmA && mmB){
      if(a.vmax!==b.vmax) out.push(`Vmax ${trim(a.vmax)} → ${trim(b.vmax)} ${PK.unitsOf(b).amount}/kg/day: ${b.vmax<a.vmax ? "less" : "more"} enzyme capacity, so the same input sits ${b.vmax<a.vmax ? "closer to" : "further from"} saturation.`);
      if(a.km!==b.km) out.push(`Km ${trim(a.km)} → ${trim(b.km)} ${PK.unitsOf(b).conc}: elimination reaches half of Vmax at a ${b.km>a.km ? "higher" : "lower"} level, so ${b.km>a.km ? "it stays closer to first-order over a wider range" : "it saturates at lower levels"}.`);
    }

    // compartments
    if((a.cmt===2)!==(b.cmt===2) && !mmA && !mmB){
      // the total AUC follows the clearance alone; a window that ends early counts the two shapes' area differently
      const sameCL=Math.abs(db.CL/da.CL-1)<1e-6, dW=wa.auc>0 ? wb.auc/wa.auc-1 : 0, dInf=da.auc>0 ? db.auc/da.auc-1 : 0;
      // with dialysis the total also depends on what each session removes, which follows the central level as it runs
      const auc=(PK.hdOn(a) || PK.hdOn(b)) ? `With dialysis the total AUC also depends on how much each session removes, which follows the central level while it runs: here the AUC to infinity is ${Math.abs(dInf)<0.005 ? "about the same" : `${fmt(Math.abs(dInf)*100,0)}% ${dInf>0 ? "higher" : "lower"}`} with ${b.cmt===2 ? "two compartments" : "one compartment"}.`
        : !sameCL ? "The total AUC still follows the clearance alone (F·D / CL): the compartments change the curve's shape, not its area."
        : Math.abs(dW)<0.01 ? "The clearance is the same, so the AUC is too, while early levels and peaks differ."
        : `The clearance is the same, so the total AUC (to infinity) is too. Within this ${state.duration} h window it is ${fmt(Math.abs(dW)*100,0)}% ${dW<0 ? "lower, because the slower terminal phase carries part of the area past the window" : "higher, because less of the area falls after the window"}.`;
      out.push(b.cmt===2
        ? `<b>Two compartments</b>: the drug goes first into a central ${fmt(PK.vOf(b),0)} L and moves into a peripheral volume and back, so the level falls fast at first, then slowly (terminal half-life ${fmt(db.thalfEff,1)} h). ${auc}`
        : `<b>One compartment</b>: the drug spreads through its whole volume at once, so there is no separate distribution phase. ${auc}`);
    }
    else if(a.cmt===2 && b.cmt===2 && (a.k12!==b.k12 || a.k21!==b.k21)){
      // the ratio k12/k21 sets how much drug the peripheral compartment holds; with the ratio kept, the sum sets the speed
      const ra=a.k12/a.k21, rb=b.k12/b.k21, head=`Exchange k12 ${trim(a.k12)} → ${trim(b.k12)}, k21 ${trim(a.k21)} → ${trim(b.k21)} h⁻¹: `;
      out.push(head+(Math.abs(rb/ra-1)<1e-9
        ? (b.k12>a.k12
          ? `the drug moves between the compartments faster both ways, so the model behaves more like one compartment of the steady-state volume, ${fmt(db.Vss,0)} L.`
          : `the drug moves between the compartments more slowly both ways, so the distribution phase stands out more (steady-state volume still ${fmt(db.Vss,0)} L).`)
        : `${rb>ra ? "more" : "less"} of the drug sits in the peripheral compartment once the two balance. The steady-state volume goes ${fmt(da.Vss,0)} → ${fmt(db.Vss,0)} L and the terminal half-life ${fmt(da.thalfEff,1)} → ${fmt(db.thalfEff,1)} h.`));
    }

    // units and salt factor: what a dose delivers and how levels are measured
    if(a.unit!==b.unit) out.push(`${mode==="cmp" ? "B" : "The current scenario"} is measured in ${PK.unitsOf(b).conc} and ${ref} in ${PK.unitsOf(a).conc}. Both curves are drawn and compared in ${U().conc}, so each concentration here is converted.`);
    else if(a.S!==b.S) out.push(`Salt factor S ${trim(+a.S.toPrecision(5))} → ${trim(+b.S.toPrecision(5))}: each ${PK.unitsOf(b).dose} of dose delivers <b>${fmt(b.S/a.S,2)}×</b> as much active drug, so every concentration and the AUC scale by that factor.`);

    // the clinical patient: creatinine clearance and the renal fraction of clearance
    const dCL=moved(da.CL,db.CL), dV=moved(da.V,db.V), dT=moved(da.thalfEff,db.thalfEff);
    const clinA=a.pm==="clinical", clinB=b.pm==="clinical", kidA=a.pm==="child", kidB=b.pm==="child";
    // a child: size and renal maturation (Rhodin et al. 2009)
    if(kidA!==kidB && !clinA){
      const c=PK.childOf(kidB ? b : a);
      out.push(kidB ? `<b>Child model</b>: clearance follows size and renal maturation. At ${fmt(c.pma,0)} weeks' postmenstrual age the kidneys filter at ${fmt(100*c.mf,0)}% of the adult rate per 70 kg, and size scales clearance by (weight / 70)^0.75, so this drug's clearance is ${fmt(100*c.rel,0)}% of a 70 kg adult's.`
        : `<b>${b.pm==="clinical" ? "Clinical" : "Simple"} patient model</b>: clearance no longer follows a child's size and maturation.`);
    } else if(kidA && kidB){
      const ca=PK.childOf(a), cb=PK.childOf(b);
      if(moved(ca.rel,cb.rel)){
        const why=[];
        if(moved(ca.pma,cb.pma)) why.push(`postmenstrual age ${fmt(ca.pma,0)} → ${fmt(cb.pma,0)} weeks, so renal maturation ${fmt(100*ca.mf,0)}% → ${fmt(100*cb.mf,0)}%`);
        if(a.wt!==b.wt) why.push(`weight ${trim(a.wt)} → ${trim(b.wt)} kg, so the size factor (weight / 70)^0.75 ${fmt(ca.size,3)} → ${fmt(cb.size,3)}`);
        if(a.fe!==b.fe) why.push(`the renal fraction ${fmt(100*a.fe,0)}% → ${fmt(100*b.fe,0)}%`);
        out.push(`Clearance ${cb.rel>ca.rel ? "rose" : "fell"} from ${fmt(100*ca.rel,0)}% to ${fmt(100*cb.rel,0)}% of a 70 kg adult's (${why.join("; ")}).`);
      }
    }
    let clinSaid=false;
    if(clinA!==clinB){
      const pc=PK.patientOf(clinB ? b : a);
      out.push(clinB
        ? `<b>Clinical patient model</b>: clearance now follows creatinine clearance. Cockcroft–Gault gives ${fmt(pc.crcl,0)} mL/min, so this drug (fe ${trim(b.fe)}) keeps ${fmt(100*pc.factor,0)}% of its reference clearance.`
        : b.pm==="simple" ? `<b>Simple patient model</b>: clearance follows the organ-function setting (${b.clFn}%) instead of creatinine clearance.`
        : `<b>Child model</b>: clearance follows size and renal maturation instead of creatinine clearance.`);
    } else if(clinA && clinB){
      const pa=PK.patientOf(a), pb=PK.patientOf(b), dCr=moved(pa.crcl,pb.crcl);
      if(dCr || a.fe!==b.fe){
        const why=[];
        if(a.age!==b.age) why.push(`age ${a.age} → ${b.age} years`);
        if(a.scr!==b.scr) why.push(`SCr ${trim(a.scr)} → ${trim(b.scr)} mg/dL`);
        if(a.sex!==b.sex) why.push(b.sex==="F" ? "female, × 0.85" : "male");
        if(a.wtm!==b.wtm) why.push(`${WTM_NAME[a.wtm]} → ${WTM_NAME[b.wtm]}`);
        else if(moved(pa.wtUsed,pb.wtUsed)) why.push(`weight used ${fmt(pa.wtUsed,1)} → ${fmt(pb.wtUsed,1)} kg`);
        const pc=v=>`${fmt(100*v,0)}%`;
        let txt=dCr ? `CrCl ${pb.crcl<pa.crcl?"fell":"rose"} from ${fmt(pa.crcl,0)} to ${fmt(pb.crcl,0)} mL/min${why.length?` (${why.join(", ")})`:""}` : "";
        if(a.fe!==b.fe) txt+=(txt ? ", and " : "")+`the renal fraction changed from ${pc(a.fe)} to ${pc(b.fe)}`;
        txt=cap(txt);
        // the clearance change is the renal factor's alone only when the drug and the weight are the same
        const onlyRenal=a.thalf===b.thalf && a.V===b.V && a.wt===b.wt;
        if(!onlyRenal) txt+=`: clearance now keeps ${fmt(100*pb.factor,0)}% of the drug's reference value (it was ${fmt(100*pa.factor,0)}%)`;
        else if(!dCL) txt+=`, but this drug's clearance doesn't move with it${b.fe===0 ? " (fe = 0: none of it goes through the kidneys)" : ""}`;
        else {
          txt+=`, so the clearance of ${a.fe===b.fe ? `a drug that is ${pc(b.fe)} renally excreted` : "the drug"} ${db.CL<da.CL?"fell":"rose"} <b>${fmt(Math.abs(db.CL/da.CL-1)*100,0)}%</b>`;
          if(dT) txt+=`; the half-life ${db.thalfEff>da.thalfEff?"rose":"fell"} from ${fmt(da.thalfEff,1)} h to ${fmt(db.thalfEff,1)} h`;
          if(a.dosing==="repeated" && b.dosing==="repeated" && !PK.hdOn(a) && !PK.hdOn(b)){
            const ta=PK.ssProfile(inShown(a)).ssTrough, tb=PK.ssProfile(inShown(b)).ssTrough;
            if(moved(ta,tb)) txt+=`; the steady-state trough ${tb>ta?"rose":"fell"} from ${fmt(ta,cdp(1))} to ${fmt(tb,cdp(1))} ${U().conc}`;
          }
        }
        out.push(txt+".");
        clinSaid=onlyRenal && !dV;   // then the clearance sentence below would only repeat this
      }
    }

    // physiology and drug properties, explained through what they do to CL, V and t½ (first-order drugs only:
    // a saturable drug's clearance and half-life depend on the level, which the sentences above cover)
    if((dCL||dV||dT) && !clinSaid && !mmA && !mmB){
      const causes=[];
      if(a.clFn!==b.clFn && !clinA && !clinB) causes.push(`organ function ${a.clFn} → ${b.clFn}%`);
      if(a.wt!==b.wt) causes.push(`weight ${a.wt} → ${b.wt} kg`);
      const parts=[];
      if(dCL) parts.push(`Clearance ${fmt(da.CL,2)} → ${fmt(db.CL,2)} L/h (<b>${pctTxt(da.CL,db.CL)}</b>), and since AUC = F·D / CL, total exposure moves the opposite way.`);
      if(dV) parts.push(`Volume ${fmt(da.V,0)} → ${fmt(db.V,0)} L, so the same dose starts ${db.V>da.V?"more dilute (lower D/V)":"more concentrated (higher D/V)"}.`);
      if(dT) parts.push(`Effective half-life ${fmt(da.thalfEff,1)} → ${fmt(db.thalfEff,1)} h: drug ${db.thalfEff>da.thalfEff
        ? "lingers longer, carries over more between doses and takes longer to reach steady state"
        : "clears faster, carries over less between doses and reaches steady state sooner"}.`);
      out.push((causes.length?`<b>${cap(causes.join(", "))}.</b> `:"")+parts.join(" "));
      if(dV && !dCL && !PK.hdOn(a) && !PK.hdOn(b)) out.push("Clearance is unchanged, so total exposure (AUC) is too: a bigger volume lowers the peak but stretches the half-life by the same factor.");
      if(dV && dCL && !dT) out.push("This model holds the half-life fixed, so clearance moves with volume (CL = kₑ·V).");
    }

    if(a.dosing==="repeated" && b.dosing==="repeated"){
      if(a.tau!==b.tau){
        out.push((sameRate?`Dose ${a.D} → ${b.D} ${U().dose} and interval ${a.tau} → ${b.tau} h. `:`Interval ${a.tau} → ${b.tau} h. `)+(sameRate
          ? `The dose per hour (D/τ) is unchanged, so average exposure is the same. Only the swing changes: ${b.tau<a.tau?"smaller, more frequent doses give lower peaks and higher troughs":"larger, less frequent doses give higher peaks and lower troughs"}.`
          : b.tau>a.tau
            ? "More time to decay between doses: lower troughs, a bigger peak-to-trough swing, less accumulation and less drug per day."
            : "Less time to decay between doses: higher troughs, a smaller swing, more accumulation and more drug per day."));
      }
      const spanA=a.nDoses*a.tau, spanB=b.nDoses*b.tau;
      if(a.nDoses!==b.nDoses && spanA!==spanB) out.push(`Number of doses ${a.nDoses} → ${b.nDoses}: the regimen now covers ${spanB} h instead of ${spanA} h, so it ${spanB>spanA?"gets closer to":"stops further from"} steady state.`);
      if(a.loadMult!==b.loadMult) out.push(b.loadMult>a.loadMult
        ? `Loading dose ${a.loadMult>1?a.loadMult+"×":"off"} → ${b.loadMult}×: a larger first dose gets levels into range sooner. Where they settle is still set by the maintenance dose and clearance.`
        : `Loading dose ${a.loadMult}× → ${b.loadMult>1?b.loadMult+"×":"off"}: levels start lower and build up over several doses toward the same steady state.`);
      const ma=missedOf(a), mb=missedOf(b);
      if(ma!==mb){
        if(mb){
          const tq=mb*b.tau-1e-9;
          out.push(`Dose ${mb} missed: with nothing coming in, concentration keeps falling through the gap. Just before the next dose it reaches <b>${fmt(conc(inShown(b),tq),cdp(2))} ${U().conc}</b>, versus ${fmt(conc(inShown(a),tq),cdp(2))} ${U().conc} in ${ref}, and it takes a few intervals of regular dosing to climb back.`);
        } else out.push(`Missed dose ${ma} restored: the regimen is uninterrupted again.`);
      }
    }

    // the drug's response to concentration (pharmacodynamics)
    if(a.ec50!==b.ec50 && a.unit===b.unit) out.push(`EC50 ${trim(a.ec50)} → ${trim(b.ec50)} ${U().conc}: ${b.ec50>a.ec50
      ? `every effect now needs <b>${fmt(b.ec50/a.ec50,2)}×</b> the concentration, so the same levels do less. That's lower potency; the maximum possible effect is unchanged.`
      : `every effect now needs only <b>${fmt(b.ec50/a.ec50,2)}×</b> the concentration, so the same levels do more. That's higher potency; the maximum possible effect is unchanged.`}`);
    if(a.emax!==b.emax) out.push(`Emax ${trim(a.emax)} → ${trim(b.emax)}%: the ceiling on the response ${b.emax<a.emax
      ? `drops (lower efficacy). No concentration can take the effect past ${trim(b.e0+b.emax)}%, so a higher dose can't make up for it.`
      : `rises (higher efficacy), so high concentrations can do more.`}`);
    if(a.hill!==b.hill) out.push(`Hill slope ${trim(a.hill)} → ${trim(b.hill)}: the effect turns on and off ${b.hill>a.hill?"more sharply, closer to a switch,":"more gradually"} as the concentration passes EC50.`);
    if(a.e0!==b.e0) out.push(`Baseline effect ${trim(a.e0)} → ${trim(b.e0)}%: the response with no drug on board.`);
    if(!PK.sameSetting("lv",a,b) && PK.isRelevant("lv",a) && PK.isRelevant("lv",b)) out.push(`Measured levels: ${a.lv.length} → ${b.lv.length}. The curves are the patient model's; the Bayesian estimate under the clinical patient is refit to the levels.`);
    // the liver model
    if(PK.hepOn(a) && PK.hepOn(b)){
      const wa=PK.wellStirred(a), wb=PK.wellStirred(b), pc=(x,y)=> `${y>x?"+":"−"}${fmt(Math.abs(100*(y/x-1)),0)}%`;
      if(a.clint!==b.clint || a.qh!==b.qh || a.fub!==b.fub){
        const what=[a.clint!==b.clint ? `intrinsic clearance ${trim(a.clint)} → ${trim(b.clint)} L/h` : "", a.qh!==b.qh ? `liver blood flow ${trim(a.qh)} → ${trim(b.qh)} L/h` : "", a.fub!==b.fub ? `unbound fraction ${trim(a.fub)} → ${trim(b.fub)}` : ""].filter(Boolean).join(", ");
        out.push(`Liver model: ${what}. The extraction ratio goes from ${fmt(wa.E,3)} to <b>${fmt(wb.E,3)}</b> and hepatic clearance from ${fmt(wa.CL,2)} to <b>${fmt(wb.CL,2)} L/h</b> (${pc(wa.CL,wb.CL)}). ${wa.E>0.7 && wb.E>0.7 ? "With extraction this high, clearance is limited by blood flow." : wa.E<0.3 && wb.E<0.3 ? "With extraction this low, clearance follows fu·CLint, the liver's capacity." : ""}`.trim());
        if(PK.isRelevant("fabs",a) && PK.isRelevant("fabs",b)) out.push(`By mouth, the fraction escaping the first pass goes from ${fmt(wa.FH,3)} to <b>${fmt(wb.FH,3)}</b>, so F goes from ${fmt(PK.fOf(a),3)} to <b>${fmt(PK.fOf(b),3)}</b>.`);
      }
      if(a.fabs!==b.fabs && PK.isRelevant("fabs",b)) out.push(`Fraction absorbed ${trim(a.fabs)} → ${trim(b.fabs)}: every oral level scales by ${fmt(b.fabs/a.fabs,2)}×.`);
    } else if(PK.hepOn(a)!==PK.hepOn(b)) out.push(`Clearance now comes from ${PK.hepOn(b) ? "the liver model (blood flow, unbound fraction and intrinsic clearance)" : "the half-life, not the liver model"}.`);
    if(a.teq!==b.teq && PK.isRelevant("teq",a) && PK.isRelevant("teq",b)) out.push(`Effect-site equilibration half-life ${a.teq>0?trim(a.teq)+" h":"none"} → ${b.teq>0?trim(b.teq)+" h":"none"}: the effect ${b.teq>a.teq
      ? "lags the plasma level more. It builds later, a plasma peak reaches it later and blunted, and as the level falls the effect stays above what that level alone would give."
      : "follows the plasma level more closely: it builds sooner, a plasma peak reaches it sooner and less blunted, and it falls with the level."}`);
    if(PK.hdOn(a)!==PK.hdOn(b)) out.push(PK.hdOn(b) ? `Hemodialysis: a ${trim(b.hddur)}-hour session every ${trim(b.hdevery)} h from ${trim(b.hdstart)} h adds a dialysis clearance of ${trim(b.hdcl)} L/h while it runs, so the level drops faster during each session.` : "Hemodialysis is off: the clearance no longer rises during sessions.");
    else if(PK.hdOn(b) && PK.hdModule){
      const fa=PK.hd.sessionFraction(a), fb=PK.hd.sessionFraction(b);
      if(a.hdcl!==b.hdcl || a.hddur!==b.hddur) out.push(`Dialysis ${a.hdcl!==b.hdcl ? `clearance ${trim(a.hdcl)} → ${trim(b.hdcl)} L/h` : ""}${a.hdcl!==b.hdcl && a.hddur!==b.hddur ? ", " : ""}${a.hddur!==b.hddur ? `sessions ${trim(a.hddur)} → ${trim(b.hddur)} h` : ""}: each session lowers the level by ${fmt(100*fa.fall,0)}% → <b>${fmt(100*fb.fall,0)}%</b>.`);
      if(a.hdstart!==b.hdstart || a.hdevery!==b.hdevery) out.push(`The sessions now start at ${trim(b.hdstart)} h and repeat every ${trim(b.hdevery)} h (were ${trim(a.hdstart)} and ${trim(a.hdevery)} h): when they fall against the doses decides which levels they lower.`);
    }
    if(a.idr!==b.idr) out.push(`How the effect is produced: ${IDR_NAME[a.idr].toLowerCase()} → <b>${IDR_NAME[b.idr].toLowerCase()}</b>. ${b.idr>0 ? "The response now follows the turnover of what the drug acts on, so it lags the level." : "The effect now follows the level directly."}`);
    else if(b.idr>0){
      if(a.tout!==b.tout) out.push(`Response turnover half-life ${trim(a.tout)} → ${trim(b.tout)} h: the response ${b.tout>a.tout ? "changes more slowly. It reaches its largest change later, and less of it if the level falls first, and takes longer to come back." : "follows the level more closely: it changes sooner and comes back sooner."}`);
      if(a.imax!==b.imax && PK.isRelevant("imax",b)) out.push(`Maximum inhibition ${fmt(100*a.imax,0)}% → ${fmt(100*b.imax,0)}%: at high levels the drug can block ${b.imax>a.imax ? "more" : "less"} of the process.`);
      if(a.smax!==b.smax && PK.isRelevant("smax",b)) out.push(`Maximum stimulation ${trim(a.smax)} → ${trim(b.smax)}: at high levels the process can run at up to ${trim(+(1+b.smax).toFixed(2))}× its baseline rate.`);
    }
    if(diffs.length && diffs.every(k=>PK.PD_KEYS.includes(k))) out.push("The concentration curves are identical: only how the body responds to them changed.");

    const T=state.duration;
    let net=`<b>Net effect</b> over 0–${T} h: AUC ${pctTxt(wa.auc,wb.auc)}, peak ${pctTxt(wa.cmax,wb.cmax)}, time in window ${fmt(100*wa.tIn/T,0)}% → ${fmt(100*wb.tIn/T,0)}% of the window.`;
    if(state.pd && a.idr>0 && b.idr>0 && PK.idrModule){
      const ra=PK.idr.stats(a,T), rb=PK.idr.stats(b,T);
      net+=` Largest change in response ${fmt(ra.change,0)} → ${fmt(rb.change,0)} points of baseline, at ${fmt(ra.tExt,1)} → ${fmt(rb.tExt,1)} h.`;
    } else if(state.pd && !(a.idr>0) && !(b.idr>0)){
      const ea=PK.effectStats(a,T,state.etgt), eb=PK.effectStats(b,T,state.etgt);
      net+=` Peak effect ${fmt(ea.peak,0)}% → ${fmt(eb.peak,0)}%, at or above the ${state.etgt}% target for ${fmt(ea.tAbove,1)} → ${fmt(eb.tAbove,1)} h.`;
    }
    out.push(net);
    return out;
  }
  return {explain};
});
