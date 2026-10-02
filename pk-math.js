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
  const {keOf, vOf, windowStats, missedOf, ssConc, doseEvents, conc, derived, unitsOf, saltOf, clFactor, patientOf, childOf, CRCL_REF,
    vmaxOf, mmCss, mmHalfAt, MM_STEP, disposition, hepOn, wellStirred, fOf, hdOn}=PK;
  const nf=(v,dp)=> String(+v.toFixed(dp));          // a number to dp decimals, without trailing zeros
  const twoCmt=p=> p.cmt===2 && p.kin!=="mm";

  function mmMath(p, key, view){
    const U=unitsOf(p), cu=U.conc, V=vOf(p), Vm=vmaxOf(p), Km=p.km, d=derived(p), m=s=>({m:s}), t=s=>({t:s});
    const n1=v=>nf(v,1), n2=v=>nf(v,2), perDay=v=>`${nf(v*24,0)} ${U.amount}/day`;
    const ws=view.ws || windowStats(p, view.duration, view.mec, view.mtc);
    const vmTxt=`Vmax = ${nf(p.vmax,2)} ${U.amount}/kg/day × ${p.wt} kg${clFactor(p)!==1 ? ` × ${nf(clFactor(p),3)}` : ""} = ${perDay(Vm)}`;
    const atTxt=p.dosing==="repeated" ? (!d.mm || d.mm.none ? "the final trough" : "the average steady-state level") : p.dosing==="single" ? "the peak" : "the highest level";
    const sampled=hdOn(p) && PK.hdModule ? `Saturable elimination has no closed-form curve here: DoseCurve integrates dA/dt = input − Vmax·C / (Km + C), minus CLd·C while a session runs, in RK4 steps of at most ${MM_STEP} h that meet every session edge, and reads the result.`
      : `Saturable elimination has no closed-form curve here: DoseCurve integrates dA/dt = input − Vmax·C / (Km + C) in ${MM_STEP} h steps (RK4) and reads the result.`;
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
      case "peakWin": case "tpeakWin": return {title:key==="peakWin" ? "Peak in the window" : "Time of the peak in the window", value:key==="peakWin" ? ws.cmax : ws.tmax,
        steps:[m(`Peak = ${n2(ws.cmax)} ${cu} at ${n2(ws.tmax)} h`), t(sampled), t(`The doses' curves aren't added up here: with saturable elimination each dose changes how fast the others clear.`)]};
      case "cmax": case "tmax": return {title:key==="cmax" ? "Peak concentration (Cmax)" : "Time of the peak (tmax)", value:key==="cmax" ? d.cmax : d.tmax,
        steps:[m(`Cmax = ${n2(d.cmax)} ${cu} at ${n2(d.tmax)} h`), t(sampled)]};
      // with dialysis (2.19): the clearance and the fall are read at a stated level, the area followed through the sessions
      case "hdCl": return {title:"Clearance during a session", value:d.CL+p.hdcl, steps:[m(vmTxt),
        m(`CL = Vmax / (Km + C) = ${n2(Vm)} / (${n2(Km)} + ${n2(d.cAt)}) = ${n2(d.CL)} L/h, at ${atTxt}`), m(`CL + CLd = ${n2(d.CL)} + ${n2(p.hdcl)} = ${n2(d.CL+p.hdcl)} L/h while a session runs`),
        t(`The body's clearance falls as the level rises and the dialyzer's doesn't, so the dialyzer's share of the elimination grows with the level.`)]};
      case "hdFall": { if(!PK.hd) return {title:"Fall over one session", value:null, steps:[t("Loading the dialysis model…")]};
        const f=PK.hd.sessionFraction(p);
        return {title:"Fall over one session", value:100*f.fall, steps:[
          t(`With no dose during the session, dA/dt = −Vmax·A / (K + A) − kd·A (K = Km·V, kd = CLd / V) integrates exactly: D = (K/c)·ln(A₀/A₁) + (Vmax/(c·kd))·ln((c + kd·A₀)/(c + kd·A₁)), c = Vmax + kd·K.`),
          m(`From C₀ = ${n2(f.at)} ${cu} (${atTxt}) over ${nf(p.hddur,2)} h: C₁ = ${n2(f.at*(1-f.fall))} ${cu}, a fall of ${nf(100*f.fall,1)}%, ${nf(100*f.byDialysis/f.fall,0)}% of it by the dialyzer`),
          t(`From far above Km it would fall ${nf(100*f.limits.high,1)}% (the dialyzer's clearance alone counts), from far below ${nf(100*f.limits.low,1)}% (first order). Each session's actual fall is in the session list.`)]}; }
      case "aucHd": { const v0=derived(Object.assign({}, p, {hd:0})).auc;
        return {title:"Total exposure (AUC∞) with dialysis", value:d.auc, steps:[t(`DoseCurve integrates dA/dt = input − Vmax·C / (Km + C), minus CLd·C during each session, in steps that meet every session edge, and follows the curve until it has nearly gone.`),
          m(`AUC∞ = ${n1(d.auc)} ${U.auc}, against ${n1(v0)} ${U.auc} with no dialysis`)]}; }
      case "peak": case "trough": return {title:key==="peak" ? "Peak after the last dose" : "Trough after the last dose", value:key==="peak" ? d.cmaxSS : d.cminSS,
        steps:[m(`${key==="peak" ? "Peak" : "Trough"} = ${n2(key==="peak" ? d.cmaxSS : d.cminSS)} ${cu}`), t(sampled)].concat(key==="trough" && d.mm && !d.mm.none ? [t(`Given forever, the trough would settle at ${n2(d.mm.trough)} ${cu}.`)] : [])};
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
    if(key==="t90"){
      // exactly, for a constant infusion into the central compartment: C/Css = 1 − Σ (cᵢ/kᵢ)·e^(−kᵢt) / Σ (cᵢ/kᵢ)
      const terms=disposition(p), wsum=terms.reduce((s,x)=>s+x.c/x.k,0), frac=t=>1-terms.reduce((s,x)=>s+x.c/x.k*Math.exp(-x.k*t),0)/wsum;
      let lo=0, hi=2*d.t90; for(let i=0;i<80;i++){ const mid=(lo+hi)/2; if(frac(mid)<0.9) lo=mid; else hi=mid; }
      return {title:"Time to 90% of steady state", value:d.t90, exactInfusion:hi, steps:[m(`About 3.32 terminal half-lives: 3.32 × ${nf(d.thalfEff,1)} = ${nf(d.t90,1)} h`),
        t(`With two compartments this errs long. A constant infusion gets to 90% of its plateau in exactly ${nf(hi,1)} h, because part of the rise comes with the fast α phase; after that, the slow β phase sets the pace.`)]};
    }
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
    const k=keOf(p), V=vOf(p), CL=k*V, th=Math.LN2/k, oral=p.route==="oral", F=oral ? fOf(p) : 1, hep=hepOn(p);
    // units, and the salt factor: the amount of active drug is S·D (S = 1 for most drugs, and then not shown)
    const U=unitsOf(p), cu=U.conc, Sf=saltOf(p), D=p.D*Sf, Dtxt=Sf===1 ? `${p.D}` : `${nf(Sf,5)} × ${p.D}`, Sd=Sf===1 ? "D" : "S·D";
    const n1=v=>nf(v,1), n2=v=>nf(v,2), n3=v=>nf(v,3), nk=v=>nf(v,4), m=s=>({m:s}), t=s=>({t:s});
    const ws=view.ws || windowStats(p, view.duration, view.mec, view.mtc);
    const tmOral=()=> Math.abs(p.ka-k)<1e-6 ? 1/k : Math.log(p.ka/k)/(p.ka-k);
    const E_TXT=E=> E>0.7 ? `E is close to 1: the liver clears nearly all the drug the blood brings, so clearance is limited by blood flow.`
      : E<0.3 ? `E is small: clearance is close to fu·CLint, the liver's capacity, and follows enzyme induction or inhibition.` : `E is intermediate: blood flow and the liver's capacity both matter.`;
    // the liver model: clearance from blood flow, the unbound fraction and intrinsic clearance (for 70 kg, scaled by weight)
    const hepSteps=()=>{ const w=wellStirred(p), sc=p.wt/70;
      return [m(`E = fu·CLint / (Q + fu·CLint) = ${nf(w.fcl,2)} / (${nf(p.qh,1)} + ${nf(w.fcl,2)}) = ${nf(w.E,3)}`),
        m(`CL = Q·E${sc===1 ? "" : " × weight / 70"} = ${nf(p.qh,1)} × ${nf(w.E,3)}${sc===1 ? "" : ` × ${p.wt} / 70`} = ${n2(CL)} L/h`)]; };
    switch(key){
      case "thalf": if(hep) return {title:"Effective half-life", value:th, steps:[
          t(`Clearance comes from the liver model (well-stirred):`), ...hepSteps(),
          m(`kₑ = CL / V = ${n2(CL)} / ${n1(V)} = ${nk(k)} h⁻¹`), m(`t½ eff = 0.693 / kₑ = ${n1(th)} h`)]};
        if(p.pm==="child"){ const c=childOf(p);
        return {title:"Effective half-life", value:th, steps:[
          t(`Size scales clearance by (weight / 70)^0.75, and its renal part fe also matures with postmenstrual age (Rhodin et al. 2009); the volume scales with weight:`),
          m(`PMA = ${nf(p.ga,0)} + ${nf(p.pnaw,0)} = ${nf(c.pma,0)} weeks; maturation = PMA^3.4 / (47.7^3.4 + PMA^3.4) = ${n3(c.mf)}`),
          m(`CL / CL(70 kg adult) = (${nf(p.wt,2)} / 70)^0.75 × [(1 − ${nf(p.fe,2)}) + ${nf(p.fe,2)} × ${n3(c.mf)}] = ${n3(c.rel)}`),
          m(`kₑ = (0.693 / ${nf(p.thalf,2)}) × ${n3(c.rel)} / (${nf(p.wt,2)} / 70) = ${nk(k)} h⁻¹`), m(`t½ eff = 0.693 / kₑ = 0.693 / ${nk(k)} = ${n1(th)} h`)]}; }
        if(p.pm==="clinical"){ const pt=patientOf(p);
        return {title:"Effective half-life", value:th, steps:[
          t(`Clearance keeps its non-renal part (1 − fe) and scales its renal part fe by creatinine clearance, against a reference CrCl of ${CRCL_REF} mL/min:`),
          m(`factor = (1 − fe) + fe × CrCl / ${CRCL_REF} = (1 − ${nf(p.fe,2)}) + ${nf(p.fe,2)} × ${n1(pt.crcl)} / ${CRCL_REF} = ${n3(pt.factor)}`),
          m(`kₑ = (0.693 / ${nf(p.thalf,2)}) × ${n3(pt.factor)} = ${nk(k)} h⁻¹`), m(`t½ eff = 0.693 / kₑ = 0.693 / ${nk(k)} = ${n1(th)} h`)]}; }
        return {title:"Effective half-life", value:th, steps: p.clFn===100
        ? [t(`At 100% organ function the half-life is the drug's own, so the elimination rate constant is`), m(`kₑ = 0.693 / t½ = 0.693 / ${n2(th)} = ${nk(k)} h⁻¹`)]
        : [t(`Organ function scales clearance: at ${p.clFn}%, the drug is eliminated at ${p.clFn}% of its usual rate.`),
           m(`kₑ = (0.693 / ${nf(p.thalf,2)}) × ${nf(p.clFn/100,2)} = ${nk(k)} h⁻¹`), m(`t½ eff = 0.693 / kₑ = 0.693 / ${nk(k)} = ${n1(th)} h`)]};
      case "cl": if(hep) return {title:"Clearance", value:CL, steps:[...hepSteps(),
        t(E_TXT(wellStirred(p).E))]};
        return {title:"Clearance", value:CL, steps:[m(`CL = kₑ·V = ${nk(k)} × ${n1(V)} = ${n2(CL)} L/h`),
        t(`Clearance is the volume of plasma cleared of drug each hour. It sets total exposure; the half-life depends on V too.`)]};
      case "v": return {title:"Volume of distribution", value:V, steps:[m(`V = V(70 kg) × weight / 70 = ${nf(p.V,1)} × ${p.wt} / 70 = ${n1(V)} L`),
        t(`The volume scales with body weight. It sets how high an IV bolus starts (D / V) and, with the half-life, the clearance (CL = kₑ·V).`)]};
      case "auc": return {title:"Total exposure (AUC∞)", value:F*D/CL, steps:[
        m(oral ? `AUC∞ = F·${Sd} / CL = ${hep ? n3(F) : F} × ${Dtxt} / ${n2(CL)} = ${n1(F*D/CL)} ${U.auc}` : `AUC∞ = ${Sd} / CL = ${Dtxt} / ${n2(CL)} = ${n1(D/CL)} ${U.auc}`),
        t(oral && hep ? `F = fabs·(1 − E) = ${nf(p.fabs,2)} × ${n3(wellStirred(p).FH)}: the liver takes its share on the first pass. By mouth the AUC is fabs·D / (fu·CLint), whatever the blood flow.`
          : oral ? `How fast the drug is absorbed changes the curve's shape, not its area.` : `It's the whole area under the curve, out to infinity.`)]};
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
      case "hdCl": { const CLd=p.hdcl, tot=CL+CLd;
        return {title:"Clearance during a session", value:tot, steps:[m(`CL during dialysis = CL + CLd = ${n2(CL)} + ${n2(CLd)} = ${n2(tot)} L/h`),
          m(`t½ during a session = 0.693 × V / ${n2(tot)} = 0.693 × ${n1(V)} / ${n2(tot)} = ${n2(Math.LN2*V/tot)} h, against ${n1(th)} h between sessions`),
          t(`The dialyzer's clearance adds to the body's own only while a session runs.`)]}; }
      case "hdFall": { const kd=p.hdcl/V, kt=k+kd, f=-Math.expm1(-kt*p.hddur);
        if(twoCmt(p) && PK.hd){ const sf=PK.hd.sessionFraction(p);
          return {title:"Fall over one session", value:100*sf.fall, steps:[
            t(`With two compartments the fall depends on how the drug is spread as the session starts. Starting from the terminal phase (distribution over), the exact two-compartment solution gives a fall of ${nf(100*sf.fall,1)}% over ${nf(p.hddur,2)} h in the central level.`),
            m(`Of the drug eliminated during it, the dialyzer removes CLd / (CL + CLd) = ${n2(p.hdcl)} / ${n2(CL+p.hdcl)} = ${nf(100*kd/kt,0)}%, and the body the rest`),
            t(`Afterwards drug moves back from the tissues and the level rebounds: the session list gives how far and when.`)]}; }
        return {title:"Fall over one session", value:100*f, steps:[m(`Fall = 1 − e^(−(kₑ + CLd/V)·T) = 1 − e^(−(${nk(k)} + ${nk(kd)}) × ${nf(p.hddur,2)}) = ${nf(100*f,1)}%`),
          m(`Of that, the dialyzer removes CLd / (CL + CLd) = ${n2(p.hdcl)} / ${n2(CL+p.hdcl)} = ${nf(100*kd/kt,0)}%, and the body the rest`),
          t(`That is with no dose given during the session. One compartment: no drug returns from the tissues afterwards (with two compartments, the level rebounds).`)]}; }
      case "aucHd": { const v=derived(p).auc;
        return {title:"Total exposure (AUC∞) with dialysis", value:v, steps:[t(`During sessions the clearance is ${n2(CL+p.hdcl)} L/h, between them ${n2(CL)} L/h, so AUC = F·${Sd} / CL no longer holds. The area is summed exactly between each dose, infusion end and session edge.`),
          m(`AUC∞ = ${n1(v)} ${U.auc}, against F·${Sd} / CL = ${n1(F*D/CL)} ${U.auc} with no dialysis`)]}; }
      case "peak": case "trough": {
        const n=p.nDoses, x=Math.exp(-k*p.tau), simple=p.route==="iv" && p.loadMult===1 && !missedOf(p) && !hdOn(p);
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
          steps.push(t(`${hdOn(p) ? "With dialysis sessions" : p.route==="iv" ? "With a loading or missed dose" : oral ? "For oral doses" : "For infusions"} the sum has no short closed form, so it's added up dose by dose${trough ? "" : " and the last interval searched for its highest point"}: ${n2(value)} ${cu}.`));
        }
        if(hdOn(p)) steps.push(t(`Dialysis sessions don't repeat with the doses, so there is no steady state to compare with.`));
        else if(trough) steps.push(t(`Given forever, the trough would settle at ${n2(ss)} ${cu}; this regimen has reached ${nf(Math.min(100,100*value/ss),0)}% of it.`));
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
      case "aucWin": { const g=p.events.filter(e=>e.status==="given"), inf=Sf*g.reduce((s,e)=>s+(e.route==="oral" ? fOf(p) : 1)*e.mg,0)/CL;
        return {title:`Exposure in the window (AUC 0–${nf(ws.T,2)} h)`, value:ws.auc, steps:[
          m(`Area under the curve from 0 to ${nf(ws.T,2)} h = ${n1(ws.auc)} ${U.auc}`),
          t(`It's added up in 600 slices (trapezoids). Out to infinity it would be Σ(F·${Sf===1 ? "" : "S·"}dose) / CL = ${n1(inf)} ${U.auc}, with F for oral doses and 1 for IV doses.`)]}; }
    }
    return null;
  }

  return metricMath;
});
