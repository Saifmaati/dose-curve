/* DoseCurve worked readouts ("show the math")
   Each readout worked out with the scenario's own numbers: `steps` are formulas ({m}) and plain notes ({t}), and
   `value` is computed from the formula shown, independently of the simulation (the tests hold it to what the
   simulation gives). Loaded the first time a readout is opened (it sets PK.metricMath); in Node, pk-engine.js reads
   it on first use of PK.metricMath. Kept out of the engine so the first page load stays within its script budget. */
(function(root, factory){
  if(typeof module==="object" && module.exports) module.exports=factory(require("./pk-engine.js"));
  else if(root && root.PK) root.PK.metricMath=factory(root.PK);
})(typeof self!=="undefined" ? self : this, function(PK){
  "use strict";
  const {keOf, vOf, windowStats, missedOf, ssConc, doseEvents, conc, derived, unitsOf, saltOf, clFactor, patientOf, CRCL_REF,
    vmaxOf, mmCss, mmHalfAt, MM_STEP, disposition}=PK;
  const nf=(v,dp)=> String(+v.toFixed(dp));          // a number to dp decimals, without trailing zeros
  const twoCmt=p=> p.cmt===2 && p.kin!=="mm";

  function mmMath(p, key, view){
    const U=unitsOf(p), cu=U.conc, V=vOf(p), Vm=vmaxOf(p), Km=p.km, d=derived(p), m=s=>({m:s}), t=s=>({t:s});
    const n1=v=>nf(v,1), n2=v=>nf(v,2), perDay=v=>`${nf(v*24,0)} ${U.amount}/day`;
    const ws=view.ws || windowStats(p, view.duration, view.mec, view.mtc);
    const vmTxt=`Vmax = ${nf(p.vmax,2)} ${U.amount}/kg/day × ${p.wt} kg${clFactor(p)!==1 ? ` × ${nf(clFactor(p),3)}` : ""} = ${perDay(Vm)}`;
    const atTxt=p.dosing==="repeated" ? (d.mm.none ? "the final trough" : "the average steady-state level") : p.dosing==="single" ? "the peak" : "the highest level";
    const sampled=`Saturable elimination has no closed-form curve here: DoseCurve integrates dA/dt = input − Vmax·C / (Km + C) in ${MM_STEP} h steps (RK4) and reads the result.`;
    switch(key){
      case "thalf": return {title:"Half-life at this level", value:d.thalfEff, steps:[
        t(`With saturable elimination the half-life depends on the concentration. At ${atTxt}, C = ${n2(d.cAt)} ${cu}:`), m(vmTxt),
        m(`t½ = 0.693·V·(Km + C) / Vmax = 0.693 × ${n1(V)} × (${n2(Km)} + ${n2(d.cAt)}) / ${n2(Vm)} = ${n1(d.thalfEff)} h`),
        t(`At low levels (C ≪ Km) it shortens toward 0.693·V·Km / Vmax = ${n1(mmHalfAt(p,0))} h; as C climbs past Km it lengthens.`)]};
      case "cl": return {title:"Clearance at this level", value:d.CL, steps:[m(vmTxt),
        m(`CL = Vmax / (Km + C) = ${n2(Vm)} / (${n2(Km)} + ${n2(d.cAt)}) = ${n2(d.CL)} L/h, at ${atTxt}`),
        t(`Clearance falls as the level rises: the enzymes are closer to saturation.`)]};
      case "css": { const c=mmCss(p);
        if(c.css===null) return {title:"Steady state", value:null, steps:[m(`R = ${p.route==="oral" ? "F·" : ""}${saltOf(p)===1 ? "" : "S·"}D / τ = ${perDay(c.R)}; ${vmTxt}`),
          t(`No steady state: input rate exceeds Vmax. The level keeps climbing for as long as the dosing continues.`)]};
        return {title:"Predicted steady state (Css)", value:c.css, steps:[
          m(`R = ${p.route==="oral" ? "F·" : ""}${saltOf(p)===1 ? "" : "S·"}D / τ = ${perDay(c.R)} (${n2(c.R)} ${U.amount}/h)`), m(vmTxt),
          m(`Css = Km·R / (Vmax − R) = ${n2(Km)} × ${n2(c.R)} / (${n2(Vm)} − ${n2(c.R)}) = ${n2(c.css)} ${cu}`),
          t(`That is exact for a constant input. Given in doses, the level swings around it: at steady state this regimen averages ${n2(d.mm.avg)} ${cu}.`)]}; }
      case "t90": { const c=mmCss(p);
        return {title:"Time to 90% of steady state", value:d.t90, steps: c.css===null ? [t(`No steady state is reached, so there is no time to reach it.`)] : [
          m(`t90 = V·Km·(2.303·Vmax − 0.9·R) / (Vmax − R)² = ${n1(V)} × ${n2(Km)} × (2.303 × ${n2(Vm)} − 0.9 × ${n2(c.R)}) / (${n2(Vm)} − ${n2(c.R)})² = ${n1(d.t90)} h (${n1(d.t90/24)} days)`),
          t(`It comes from integrating the saturable model at a constant input. Unlike linear kinetics it depends on the dose: the closer R is to Vmax, the longer the wait.`)]}; }
      case "ratio": { const c=mmCss(p);
        return {title:"Input rate ÷ Vmax", value:100*c.ratio, steps:[m(`R / Vmax = ${perDay(c.R)} / ${perDay(Vm)} = ${nf(100*c.ratio,0)}%`),
          t(c.ratio>=1 ? `At or above 100% the enzymes can't keep up: no steady state.` : `The closer this is to 100%, the more a small dose change moves the level.`)]}; }
      case "auc": return {title:"Total exposure (AUC∞)", value:d.auc, steps:[m(`AUC∞ = ${n1(d.auc)} ${U.auc}`), t(sampled),
        t(`It isn't F·D / CL here: clearance changes with the level, so doubling the dose more than doubles the AUC.`)]};
      case "cmax": case "tmax": return {title:key==="cmax" ? "Peak concentration (Cmax)" : "Time of the peak (tmax)", value:key==="cmax" ? d.cmax : d.tmax,
        steps:[m(`Cmax = ${n2(d.cmax)} ${cu} at ${n2(d.tmax)} h`), t(sampled)]};
      case "peak": case "trough": return {title:key==="peak" ? "Peak after the last dose" : "Trough after the last dose", value:key==="peak" ? d.cmaxSS : d.cminSS,
        steps:[m(`${key==="peak" ? "Peak" : "Trough"} = ${n2(key==="peak" ? d.cmaxSS : d.cminSS)} ${cu}`), t(sampled)].concat(key==="trough" && !d.mm.none ? [t(`Given forever, the trough would settle at ${n2(d.mm.trough)} ${cu}.`)] : [])};
    }
    return null;
  }
  // Two compartments: the half-life, volume, peak and accumulation come from the two exponentials.
  function tcMath(p, key){
    const d=derived(p), [x,y]=disposition(p), V=vOf(p), U=unitsOf(p), m=s=>({m:s}), t=s=>({t:s}), n2=v=>nf(v,2), n4=v=>nf(v,4);
    const roots=[t(`Two compartments: a bolus decays as C = D·(A·e^(−αt) + B·e^(−βt)), with α + β = k10 + k12 + k21 and α·β = k10·k21.`),
      m(`k10 = ${n4(keOf(p))}, k12 = ${nf(p.k12,3)}, k21 = ${nf(p.k21,3)} h⁻¹ → α = ${n4(x.k)} h⁻¹, β = ${n4(y.k)} h⁻¹`)];
    if(key==="thalf") return {title:"Terminal half-life", value:d.thalfEff, steps:roots.concat([m(`t½ β = 0.693 / β = ${nf(d.thalfEff,1)} h (distribution: t½ α = ${n2(Math.LN2/x.k)} h)`),
      t(`The slow β phase sets how long the drug lingers and how long steady state takes.`)])};
    if(key==="v") return {title:"Volumes", value:V, steps:[m(`Central V1 = ${nf(p.V,1)} × ${p.wt} / 70 = ${nf(V,1)} L`),
      m(`At steady state the drug spreads into Vss = V1·(1 + k12 / k21) = ${nf(V,1)} × (1 + ${nf(p.k12,3)} / ${nf(p.k21,3)}) = ${nf(d.Vss,1)} L`)]};
    if(key==="rac") return {title:"Accumulation ratio", value:d.Rac, steps:roots.concat([t(`With two exponentials there's no single e^(−kτ): the ratio is the steady-state trough over the first dose's trough, ${n2(d.Rac)}.`)])};
    if(key==="t90") return {title:"Time to 90% of steady state", value:d.t90, steps:[m(`About 3.32 terminal half-lives: 3.32 × ${nf(d.thalfEff,1)} = ${nf(d.t90,1)} h`),
      t(`An approximation with two compartments: the fast α phase is over within a few hours, so the slow β phase sets the approach.`)]};
    if(key==="cmax" && p.route==="iv") return {title:"Peak concentration (Cmax)", value:d.cmax, steps:roots.concat([m(`Cmax = D·(A + B) = D / V1 = ${p.D} / ${nf(V,1)} = ${n2(d.cmax)} ${U.conc}`)])};
    if(key==="cmax" || key==="tmax" || key==="peak" || key==="trough") return null;   // the one-compartment steps would mislead: use the sampled values below
    return null;
  }
  function metricMath(p, key, view){
    if(p.kin==="mm"){ const r=mmMath(p,key,view); if(r) return r; }
    if(twoCmt(p)){
      const r=tcMath(p,key);
      if(r) return r;
      if(["cmax","tmax","peak","trough"].includes(key)){
        const d=derived(p), v=key==="cmax" ? d.cmax : key==="tmax" ? d.tmax : key==="peak" ? d.cmaxSS : d.cminSS;
        return {title:{cmax:"Peak concentration (Cmax)", tmax:"Time of the peak (tmax)", peak:"Peak after the last dose", trough:"Trough after the last dose"}[key], value:v,
          steps:[{m:`${key==="tmax" ? `tmax = ${nf(v,2)} h` : `${nf(v,2)} ${unitsOf(p).conc}`}`}, {t:`With two compartments the curve is the sum of each dose's two exponentials; DoseCurve adds them up and reads this value off it.`}]};
      }
    }
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
          const ev=doseEvents(p);
          if(trough) value=conc(p, n*p.tau, ev);
          else value=derived(p).cmaxSS;   // the last interval searched, its kinks included, then refined
          steps.push(t(`${p.route==="iv" ? "With a loading or missed dose" : oral ? "For oral doses" : "For infusions"} the sum has no short closed form, so it's added up dose by dose${trough ? "" : " and the last interval searched for its highest point"}: ${n2(value)} ${cu}.`));
        }
        if(trough) steps.push(t(`Given forever, the trough would settle at ${n2(ss)} ${cu}; this regimen has reached ${nf(Math.min(100,100*value/ss),0)}% of it.`));
        return {title, value, steps};
      }
      case "ttr": return {title:"Time in window", value:100*ws.tIn/ws.T, steps:[
        m(`${n1(ws.tIn)} h of ${nf(ws.T,2)} h between MEC (${nf(view.mec,2)}) and MTC (${nf(view.mtc,2)} ${cu}) = ${nf(100*ws.tIn/ws.T,0)}%`),
        t(`Once doses overlap, the crossing times have no simple formula: the curve is sampled 600 times across the window, and each crossing of the MEC or MTC is then pinned down by bisection.`)]};
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

  return metricMath;
});
