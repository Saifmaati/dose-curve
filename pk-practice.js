/* MaatiRx practice problems
   The generated problems (each kind draws its numbers from a seed, states the question, works the solution and
   says how the simulation checks the answer), a problem from a seed, worksheets, and answer checking. The page
   loads this file with the Practice tab or a practice link (it registers itself as PK.practiceModule); in Node the
   engine requires it on first use. The tests check every kind's answer against the model. Educational model, not
   for clinical dosing. */
(function(root, factory){
  if(typeof module==="object" && module.exports) module.exports=factory(require("./pk-engine.js"));
  else root.PK.practiceModule=factory(root.PK);
})(typeof self!=="undefined" ? self : this, function(PK){
  "use strict";
  const {PRACTICE_TOPICS, VIEW_DEFAULTS, WORKSHEET_SIZES, WS_VERSION, conc, derived, disposition, doseEvents, effectOf, effectStats, keOf,
    mmCss, mmSteady, normalizeScenario, scenario, seededRandom, ssConc, ssPeakTrough, twoLevelAUC, crclCG, renalFactor, vOf, fOf, micStats,
    cmToIn, ibwDevine, adjBW, patientOf}=PK;
  const {drawFrom, evenUp, nf, sig4, until}=PK.practiceHelpers;

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
    {id:"cl2", topic:"single", since:2, gen(d){
      const set=until(()=>({V:d(10,40,1), thalf:d(1,6,0.5), k12:d(0.3,1.5,0.05), k21:d(0.15,1,0.05)}),
        x=>{ const q=disposition(scenario(Object.assign({route:"iv", cmt:2}, x))); return q[0].k>=4*q[1].k; });
      const D=d(200,1000,100), q=disposition(scenario(Object.assign({route:"iv", D, cmt:2}, set)));
      const A=sig4(D*q[0].c), a=sig4(q[0].k), B=sig4(D*q[1].c), b=sig4(q[1].k), auc=A/a+B/b, CL=D/auc;
      return {type:"Two compartments · clearance", unit:"L/h", dp:2, ans:CL,
        q:`After a <b>${D} mg</b> IV bolus, the concentration follows <b>C = ${A}·e^(−${a}·t) + ${B}·e^(−${b}·t)</b> (mg/L, t in hours). What is the clearance?`,
        sol:[step(`The area under a sum of exponentials is the sum of their areas: <b>AUC = A/α + B/β</b>.`),
          step(`AUC = ${A} / ${a} + ${B} / ${b} = ${nf(A/a,1)} + ${nf(B/b,1)} = <b>${nf(auc,1)} mg·h/L</b>`),
          step(`CL = D / AUC = ${D} / ${nf(auc,1)} = <b>${nf(CL,2)} L/h</b>. However the drug distributes, clearance is the dose over the area.`)],
        viz:Object.assign({route:"iv", D, cmt:2}, set), view:{duration:evenUp(5*Math.LN2/q[1].k)}, check:p=> derived(p).CL};
    }},
    /* ----- repeated dosing ----- */
    {id:"hdfall", topic:"single", since:8, gen(d){
      // one IV dose, then a dialysis session: how far it lowers the level (no dose during it)
      const D=d(100,1000,50), V=d(15,60,1), th=d(4,40,1), CLd=d(1,10,0.5), T=d(3,8,0.5), start=d(2,12,1);
      const k=Math.LN2/th, kd=CLd/V, f=1-Math.exp(-(k+kd)*T), dur=evenUp(start+T+12);
      return {type:"Hemodialysis · fall over a session", unit:"%", dp:1, ans:100*f,
        q:`After a <b>${D} mg</b> IV bolus (V = <b>${V} L</b>, t½ = <b>${th} h</b> between sessions), a hemodialysis session with a dialysis clearance of <b>${CLd} L/h</b> runs for <b>${T} h</b>. By what percentage does the level fall over the session?`,
        sol:[step(`During the session the clearances add, so the rate constants do: kₑ = ${LN2} / ${th} = ${nf(k,4)} h⁻¹ and CLd / V = ${CLd} / ${V} = ${nf(kd,4)} h⁻¹`),
          step(`<b>Fall = 1 − e^(−(kₑ + CLd/V)·T)</b> = 1 − e^(−${nf(k+kd,4)} × ${T}) = <b>${nf(100*f,1)}%</b>`),
          step(`Of that, the dialyzer accounts for CLd / (CL + CLd) = ${nf(100*kd/(k+kd),0)}%, and the body the rest. The dose and when the session starts don't change the fraction.`)],
        viz:{route:"iv", dosing:"single", D, V, thalf:th, hd:1, hdcl:CLd, hdstart:start, hddur:T, hdevery:48}, view:{duration:dur}, at:start+T,
        check:p=> 100*(1-PK.conc(p, start+T-1e-9)/PK.conc(p, start))};
    }},
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
    {id:"renaladj", topic:"rep", since:3, gen(d){
      const x=until(()=>{ const fe=d(0.5,0.95,0.05), age=d(40,85,1), wt=d(50,100,1), scr=d(1.2,3,0.1), sex=d(0,1,1) ? "F" : "M";
        return {fe, age, wt, scr, sex, crcl:crclCG(age,wt,scr,sex)}; }, x=> x.crcl>=15 && x.crcl<=90);
      const {fe, age, wt, scr, sex, crcl}=x, tau=[8,12,24][d(0,2,1)], Dref=d(200,1000,50), th=d(2,10,0.5), V=d(20,60,5);
      const f=renalFactor(fe, crcl), D=Dref*f, n=mostDoses(tau);
      return {type:"Renal dose adjustment", unit:"mg", dp:0, ans:D,
        q:`A drug is <b>${nf(100*fe,0)}%</b> excreted unchanged in the urine (fe = <b>${fe}</b>). With normal kidney function (creatinine clearance <b>120 mL/min</b>) the regimen is <b>${Dref} mg every ${tau} h</b>. What dose every ${tau} h gives a <b>${age}-year-old ${sex==="F" ? "woman" : "man"}</b> weighing <b>${wt} kg</b>, with serum creatinine <b>${scr} mg/dL</b>, the same average steady-state level?`,
        sol:[step(`Cockcroft–Gault: CrCl = (140 − ${age}) × ${wt} / (72 × ${scr})${sex==="F" ? " × 0.85" : ""} = <b>${nf(crcl,1)} mL/min</b>`),
          step(`Only the renal part of clearance falls: CL / CL<sub>normal</sub> = (1 − fe) + fe × CrCl / 120 = (1 − ${fe}) + ${fe} × ${nf(crcl,1)} / 120 = <b>${nf(f,3)}</b>`),
          step(`The same average level needs the dose in the same proportion: ${Dref} × ${nf(f,3)} = <b>${nf(D,0)} mg</b> every ${tau} h. (Keeping the dose and lengthening the interval by the same factor gives the same average.)`)],
        viz:{route:"iv", dosing:"repeated", D:+D.toFixed(1), tau, nDoses:n, thalf:th, V, pm:"clinical", age, sex, wt, ht:170, scr, fe, wtm:"actual"},
        view:{duration:evenUp(n*tau), zoom:"last"},
        check:p=> Dref*derived(p).CL/(Math.LN2/p.thalf*vOf(p))};
    }},
    {id:"crclwt", topic:"rep", since:9, gen(d){
      // Cockcroft–Gault with the weight it is asked for: ideal (Devine), adjusted (ideal + 0.4 × the excess) or actual,
      // in a heavy adult, where the three differ most
      const x=until(()=>{ const sex=d(0,1,1) ? "F" : "M", ht=d(152,190,1), age=d(25,80,1), scr=d(0.6,2,0.1), ibw=ibwDevine(sex, cmToIn(ht));
        const wt=d(Math.ceil(1.3*ibw), Math.min(200, Math.ceil(2.2*ibw)), 1), wtm=["ibw","adj","actual"][d(0,2,1)], adj=adjBW(ibw, wt);
        const used=wtm==="ibw" ? ibw : wtm==="adj" ? adj : wt;
        return {sex, ht, age, scr, ibw, wt, wtm, adj, used, crcl:crclCG(age, used, scr, sex)}; }, x=> x.ibw>=40 && x.wt>=1.3*x.ibw && x.crcl>=20 && x.crcl<=180);
      const {sex, ht, age, scr, ibw, wt, wtm, adj, used, crcl}=x, inch=cmToIn(ht), they=sex==="F" ? "her" : "his";
      const name={ibw:"<b>ideal body weight</b> (Devine)", adj:"<b>adjusted body weight</b> (ideal + 0.4 × the excess)", actual:"<b>actual body weight</b>"}[wtm];
      const other=wtm==="actual" ? crclCG(age, ibw, scr, sex) : crclCG(age, wt, scr, sex);
      return {type:"Creatinine clearance and body weight", unit:"mL/min", dp:0, ans:crcl,
        q:`A <b>${age}-year-old ${sex==="F" ? "woman" : "man"}</b>, <b>${ht} cm</b> tall and weighing <b>${wt} kg</b>, has a serum creatinine of <b>${scr} mg/dL</b>. With ${they} ${name} in the Cockcroft–Gault equation, what is ${they} estimated creatinine clearance?`,
        sol:[...(wtm==="actual" ? [] : [step(`Height ${ht} / 2.54 = ${nf(inch,1)} in, so the ideal body weight is ${sex==="F" ? "45.5" : "50"} + 2.3 × (${nf(inch,1)} − 60) = <b>${nf(ibw,1)} kg</b>`)]),
          ...(wtm==="adj" ? [step(`Adjusted body weight = ${nf(ibw,1)} + 0.4 × (${wt} − ${nf(ibw,1)}) = <b>${nf(adj,1)} kg</b>`)] : []),
          step(`<b>CrCl = (140 − age) × weight / (72 × SCr)</b>${sex==="F" ? " × 0.85" : ""} = (140 − ${age}) × ${nf(used,1)} / (72 × ${scr})${sex==="F" ? " × 0.85" : ""} = <b>${nf(crcl,0)} mL/min</b>`),
          step(`With ${wtm==="actual" ? "the ideal weight" : "the actual weight"} instead it would be ${nf(other,0)} mL/min: the weight chosen moves the estimate ${nf(Math.max(other,crcl)/Math.min(other,crcl),1)}-fold, which is why dosing references say which weight they used.`)],
        viz:{route:"iv", dosing:"single", D:500, V:30, thalf:4, pm:"clinical", age, sex, wt, ht, scr, fe:0.9, wtm}, view:{duration:24},
        check:p=> patientOf(p).crcl};
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
    {id:"auc2", topic:"inf", since:2, gen(d){
      const {V,th,T,tau,D}=until(()=>({V:d(30,80,5), th:d(4,12,1), T:d(1,2,0.5), tau:d(8,24,4), D:d(500,2000,250)}), x=> x.tau>=x.T+3 && x.tau<=3*x.th);
      const n=Math.min(20, Math.max(4, Math.ceil(6*th/tau)+1)), viz={route:"inf", dosing:"repeated", D, tinf:T, tau, nDoses:n, V, thalf:th};
      const p=normalizeScenario(scenario(viz)), Cp=sig4(ssConc(p,T+1)), Ct=sig4(ssConc(p,tau-1e-9)), e=twoLevelAUC(Cp,Ct,T,1,tau);
      return {type:"AUC from two levels", unit:"mg·h/L", dp:0, ans:e.auc24,
        q:`A drug is infused at <b>${D} mg</b> over <b>${T} h</b> every <b>${tau} h</b>. At steady state, a level drawn <b>1 h</b> after an infusion ends is <b>${Cp} mg/L</b>, and the trough just before the next dose is <b>${Ct} mg/L</b>. Estimate the AUC over 24 h with first-order equations.`,
        sol:[step(`k from the fall between the levels, ${nf(e.dt,2)} h apart: k = ln(${Cp} / ${Ct}) / ${nf(e.dt,2)} = <b>${nf(e.k,4)} h⁻¹</b>`),
          step(`Back to the end of the infusion: C<sub>max</sub> = ${Cp} × e^(${nf(e.k,4)} × 1) = <b>${nf(e.Cmax,2)} mg/L</b>. At steady state the level when the infusion starts is the trough, ${Ct} mg/L.`),
          step(`The infusion phase as a straight line: ${T} × (${Ct} + ${nf(e.Cmax,2)}) / 2 = <b>${nf(e.aInf,1)}</b>; the decline: (${nf(e.Cmax,2)} − ${Ct}) / ${nf(e.k,4)} = <b>${nf(e.aDecl,1)}</b> mg·h/L`),
          step(`Over one interval ${nf(e.aInf+e.aDecl,1)} mg·h/L, so AUC24 = ${nf(e.aInf+e.aDecl,1)} × 24 / ${tau} = <b>${nf(e.auc24,0)} mg·h/L</b>. The model's exact value, daily dose / CL, is ${nf(D*24/tau/(Math.LN2/th*V),0)}.`)],
        viz, view:{duration:evenUp(n*tau), zoom:"last"},
        check:p=> twoLevelAUC(sig4(ssConc(p,p.tinf+1)), sig4(ssConc(p,p.tau-1e-9)), p.tinf, 1, p.tau).auc24};
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
    }},
    {id:"effpk", topic:"pd", since:4, gen(d){
      const x=until(()=>({D:d(200,1000,100), V:d(20,50,5), th:d(2,8,1), teq:d(0.5,4,0.5)}), x=> x.teq!==x.th);
      const {D, V, th, teq}=x, k=Math.LN2/th, k0=Math.LN2/teq, t=Math.log(k0/k)/(k0-k), dur=evenUp(Math.max(t+4, 3*th));
      const cePk=D/V*Math.pow(k/k0, k/(k0-k)), ec50=Math.max(0.5, Math.round(cePk)/2);
      return {type:"Effect delay · time of peak effect", unit:"h", dp:2, ans:t,
        q:`After a <b>${D} mg</b> IV bolus (V = <b>${V} L</b>, t½ = <b>${th} h</b>), the effect lags the plasma level: it follows an effect site that equilibrates with plasma with a half-life of <b>${teq} h</b>. When is the effect at its peak?`,
        sol:[step(`The rate constants: kₑ = ${LN2} / ${th} = <b>${nf(k,4)} h⁻¹</b>, and ke0 = ${LN2} / ${teq} = <b>${nf(k0,4)} h⁻¹</b>`),
          step(`After a bolus the effect-site level is Ce = C₀·ke0 / (ke0 − kₑ)·(e^(−kₑt) − e^(−ke0·t)). It peaks where dCe/dt = 0, which is where it meets the plasma level.`),
          step(`<b>t = ln(ke0 / kₑ) / (ke0 − kₑ)</b> = ln(${nf(k0,4)} / ${nf(k,4)}) / (${nf(k0,4)} − ${nf(k,4)}) = <b>${nf(t,2)} h</b>`),
          step(`The time doesn't depend on the dose or the volume. With no delay the effect would peak at once, with the injection.`)],
        viz:{route:"iv", D, V, thalf:th, teq, e0:0, emax:100, ec50, hill:1}, view:{duration:dur, pd:true}, at:t,
        check:p=> effectStats(p, dur, 50).tPeak};
    }},
    {id:"idrss", topic:"pd", since:7, gen(d){
      // an infusion long enough for both the level and the response to settle (14 half-lives of the slower)
      const x=until(()=>({R:d(10,100,5), V:d(20,60,5), th:d(2,8,1), tout:d(2,12,1), ic50:d(1,10,0.5), imax:d(0.5,1,0.1)}), x=> 14*Math.max(x.th,x.tout)<=168);
      const {R, V, th, tout, ic50, imax}=x, CL=Math.LN2*V/th, css=R/CL, f=css/(ic50+css), r=100*(1-imax*f);
      return {type:"Indirect response · steady state", unit:"% of baseline", dp:1, ans:r,
        q:`A drug is infused at a constant <b>${R} mg/h</b> (V = <b>${V} L</b>, t½ = <b>${th} h</b>). It inhibits the production of a response (an indirect response of type 1) with <b>Imax = ${imax}</b> and <b>IC50 = ${ic50} mg/L</b> (Hill slope 1). The response turns over with a half-life of <b>${tout} h</b>. Where does the response settle, as a percentage of its baseline?`,
        sol:[step(`The level settles at <b>Css = R / CL</b>, with CL = ${LN2} × ${V} / ${th} = ${nf(CL,3)} L/h: Css = ${R} / ${nf(CL,3)} = <b>${nf(css,3)} mg/L</b>`),
          step(`The drug's action there: f = Css / (IC50 + Css) = ${nf(css,3)} / (${ic50} + ${nf(css,3)}) = <b>${nf(f,4)}</b>`),
          step(`At steady state production equals loss: kin·(1 − Imax·f) = kout·R, and R₀ = kin / kout, so <b>R = R₀·(1 − Imax·f)</b> = 100 × (1 − ${imax} × ${nf(f,4)}) = <b>${nf(r,1)}%</b>`),
          step(`The turnover half-life (${tout} h) sets how long it takes to get there, not where it settles.`)],
        // back-to-back 24-hour infusions: the same constant rate for the whole week
        viz:{route:"inf", dosing:"repeated", D:R*24, tinf:24, tau:24, nDoses:7, V, thalf:th, idr:1, imax, ec50:ic50, hill:1, tout}, view:{duration:168, pd:true, mec:0, mtc:0}, at:168,
        check:p=> PK.idr.at(p, 168, 168)};
    }},
    /* ----- saturable (Michaelis–Menten) elimination ----- */
    // Each scenario runs as back-to-back 24 h infusions, a constant input, which is what Css = Km·R / (Vmax − R)
    // and the t90 formula assume. Vmax is for 70 kg.
    {id:"mmcss", topic:"nl", gen(d){
      const x=until(()=>{ const vk=d(5,10,0.5), km=d(2,8,0.5), salt=d(0,1,1)===1, D=d(150,500,25), S=salt ? 0.92 : 1, Vm=vk*70, R=S*D;
        return {vk,km,salt,D,S,Vm,R,css:km*R/(Vm-R)}; }, x=> x.R>=0.3*x.Vm && x.R<=0.92*x.Vm);
      const {vk,km,salt,D,S,Vm,R,css}=x;
      return {type:"Steady state with saturable elimination", unit:"mg/L", dp:2, ans:css,
        q:`A drug is eliminated by saturable (Michaelis–Menten) metabolism with <b>Vmax = ${nf(Vm,0)} mg/day</b> and <b>Km = ${km} mg/L</b>.${salt ? ` It is given as a sodium salt with <b>S = 0.92</b>.` : ""} What steady-state concentration does <b>${D} mg a day</b> reach?`,
        sol:[step(`The daily input is R = ${salt ? `S·D = 0.92 × ${D}` : `D = ${D}`} = <b>${nf(R,1)} mg/day</b>, below Vmax, so a steady state exists.`),
          step(`At steady state input equals elimination, R = Vmax·C / (Km + C), so <b>Css = Km·R / (Vmax − R)</b>.`),
          step(`Css = ${km} × ${nf(R,1)} / (${nf(Vm,0)} − ${nf(R,1)}) = <b>${nf(css,2)} mg/L</b>`)],
        viz:{kin:"mm", route:"inf", dosing:"repeated", tinf:24, tau:24, nDoses:14, D, S, vmax:vk, km, V:49}, view:{duration:336, mec:0, mtc:Math.ceil(css*1.5)},
        check:p=> mmSteady(p).avg};
    }},
    {id:"mmdose", topic:"nl", gen(d){
      const vk=d(5,10,0.5), km=d(2,8,0.5), c=d(8,20,1), Vm=vk*70, R=Vm*c/(km+c), D=R/0.92;
      return {type:"Dose for a saturable drug", unit:"mg/day", dp:0, ans:D,
        q:`A drug given as a sodium salt (<b>S = 0.92</b>) is eliminated with <b>Vmax = ${nf(Vm,0)} mg/day</b> and <b>Km = ${km} mg/L</b>. Which daily dose of the salt gives a steady-state concentration of <b>${c} mg/L</b>?`,
        sol:[step(`At steady state the input matches elimination: <b>R = Vmax·Css / (Km + Css)</b>.`),
          step(`R = ${nf(Vm,0)} × ${c} / (${km} + ${c}) = <b>${nf(R,1)} mg/day</b> of the drug`),
          step(`Of the salt: D = R / S = ${nf(R,1)} / 0.92 = <b>${nf(D,0)} mg/day</b>`)],
        viz:{kin:"mm", route:"inf", dosing:"repeated", tinf:24, tau:24, nDoses:14, D, S:0.92, vmax:vk, km, V:49}, view:{duration:336, mec:0, mtc:Math.ceil(c*1.5)},
        // the dose that gives c: at the answer dose the simulated steady state is c
        check:p=> p.D*mmSteady(p).avg/c};
    }},
    {id:"mmt90", topic:"nl", gen(d){
      const x=until(()=>{ const vk=d(5,10,0.5), km=d(2,8,0.5), V=d(35,70,5), D=d(150,450,25), Vm=vk*70, R=D, t90=V*km*(Math.LN10*Vm-0.9*R)/((Vm-R)*(Vm-R));
        return {vk,km,V,D,Vm,R,t90}; }, x=> x.R<=0.85*x.Vm && x.R>=0.3*x.Vm && x.t90*24<=300);
      const {vk,km,V,D,Vm,R,t90}=x;
      return {type:"Time to steady state, saturable", unit:"days", dp:1, ans:t90,
        q:`A drug with <b>V = ${V} L</b>, <b>Vmax = ${nf(Vm,0)} mg/day</b> and <b>Km = ${km} mg/L</b> is started at a steady <b>${D} mg/day</b>. How many days until it reaches 90% of its steady-state level?`,
        sol:[step(`With saturable elimination the approach to steady state depends on the dose. Integrating the model at a constant input gives <b>t₉₀ = V·Km·(2.303·Vmax − 0.9·R) / (Vmax − R)²</b>.`),
          step(`t₉₀ = ${V} × ${km} × (2.303 × ${nf(Vm,0)} − 0.9 × ${R}) / (${nf(Vm,0)} − ${R})² = <b>${nf(t90,1)} days</b>`),
          step(`A linear drug's 3.32 half-lives would not change with the dose; here a higher dose means a longer wait.`)],
        viz:{kin:"mm", route:"inf", dosing:"repeated", tinf:24, tau:24, nDoses:14, D, vmax:vk, km, V}, view:{duration:336, mec:0, mtc:0}, at:t90*24,
        check:p=>{ const css=mmCss(p).css; return solveUp(x=> conc(p,x), 0.9*css, 0, 336)/24; }};
    }},
    {id:"mmhalf", topic:"nl", gen(d){
      const vk=d(5,10,0.5), km=d(2,8,0.5), V=d(35,70,5), C=d(2,25,1), Vm=vk*70, th=Math.LN2*V*(km+C)/(Vm/24);
      return {type:"Half-life at a concentration", unit:"h", dp:1, ans:th,
        q:`A drug with <b>V = ${V} L</b>, <b>Vmax = ${nf(Vm,0)} mg/day</b> and <b>Km = ${km} mg/L</b> has a level of <b>${C} mg/L</b>. What is its half-life at that level?`,
        sol:[step(`Elimination is Vmax·C / (Km + C), so the clearance at C is Vmax / (Km + C) and <b>t½ = 0.693·V·(Km + C) / Vmax</b>, with Vmax per hour.`),
          step(`Vmax = ${nf(Vm,0)} / 24 = ${nf(Vm/24,2)} mg/h`),
          step(`t½ = ${LN2} × ${V} × (${km} + ${C}) / ${nf(Vm/24,2)} = <b>${nf(th,1)} h</b>`),
          step(`At a higher level the half-life is longer: the enzymes are closer to saturation.`)],
        viz:{kin:"mm", route:"iv", dosing:"single", D:C*V, vmax:vk, km, V}, view:{duration:evenUp(3*th), mec:0, mtc:0}, at:0,
        // the instantaneous half-life at t = 0: 0.693·C / (−dC/dt)
        check:p=>{ const c0=conc(p,0), h=1e-4; return Math.LN2*c0/((c0-conc(p,h))/h); }};
    }},
    /* ----- liver (well-stirred model) ----- */
    // Blood flow, unbound fraction and intrinsic clearance are for 70 kg; blood and plasma concentrations are equal.
    {id:"hepcl", topic:"liver", since:5, gen(d){
      const Q=d(60,120,10), fu=d(0.05,0.9,0.05), CLint=[10,20,50,100,200,500,1000,2000,5000][Math.floor(d(0,8,1))];
      const fc=fu*CLint, E=fc/(Q+fc), CL=Q*E;
      return {type:"Hepatic clearance", unit:"L/h", dp:1, ans:CL,
        q:`A drug is cleared only by the liver. Liver blood flow is <b>${Q} L/h</b>, the unbound fraction in blood is <b>${fu}</b>, and the intrinsic clearance is <b>${CLint} L/h</b>. What is its hepatic clearance (well-stirred model)?`,
        sol:[step(`fu·CLint = ${fu} × ${CLint} = <b>${nf(fc,2)} L/h</b>`),
          step(`Extraction ratio: <b>E = fu·CLint / (Q + fu·CLint)</b> = ${nf(fc,2)} / (${Q} + ${nf(fc,2)}) = <b>${nf(E,3)}</b>`),
          step(`<b>CL = Q·E</b> = ${Q} × ${nf(E,3)} = <b>${nf(CL,1)} L/h</b>`),
          step(E>0.7 ? `E is close to 1, so clearance is limited by blood flow: it can't pass ${Q} L/h.` : E<0.3 ? `E is small, so clearance is close to fu·CLint and follows the liver's capacity.` : `E is intermediate: both blood flow and the liver's capacity matter.`)],
        viz:{route:"iv", D:500, V:50, hep:1, qh:Q, fub:fu, clint:CLint}, view:{duration:24}, at:0,
        check:p=> derived(p).CL};
    }},
    {id:"hepf", topic:"liver", since:5, gen(d){
      const Q=90, fu=d(0.1,0.9,0.1), CLint=[100,200,400,800,1600,3200][Math.floor(d(0,5,1))], fabs=d(0.6,1,0.1);
      const fc=fu*CLint, E=fc/(Q+fc), F=fabs*(1-E);
      return {type:"Oral bioavailability after first pass", unit:"%", dp:1, ans:100*F,
        q:`A drug is cleared only by the liver (blood flow <b>${Q} L/h</b>, unbound fraction <b>${fu}</b>, intrinsic clearance <b>${CLint} L/h</b>), and <b>${Math.round(fabs*100)}%</b> of an oral dose is absorbed. What is its oral bioavailability F, in %?`,
        sol:[step(`E = fu·CLint / (Q + fu·CLint) = ${nf(fc,1)} / (${Q} + ${nf(fc,1)}) = <b>${nf(E,4)}</b>`),
          step(`The fraction of the absorbed drug that escapes the liver on its first pass: <b>1 − E = ${nf(1-E,4)}</b>`),
          step(`<b>F = fabs·(1 − E)</b> = ${fabs} × ${nf(1-E,4)} = <b>${nf(100*F,1)}%</b>`),
          step(`The simulation checks it as the ratio of the oral AUC to the IV AUC of the same dose.`)],
        viz:{route:"oral", D:500, V:100, ka:1.5, hep:1, qh:Q, fub:fu, clint:CLint, fabs}, view:{duration:24}, at:0,
        check:p=> 100*derived(p).auc/derived(Object.assign({}, p, {route:"iv"})).auc};
    }},
    {id:"hepiv", topic:"liver", since:5, gen(d){
      const Q=90, fu=d(0.1,0.9,0.1), c0=[20,50,100,200,400,800,1200][Math.floor(d(0,6,1))], m=d(2,4,1), c1=c0*m;
      const cl=ci=>{ const fc=fu*ci; return Q*fc/(Q+fc); }, CL0=cl(c0), CL1=cl(c1), r=CL0/CL1;
      return {type:"Induction: IV exposure", unit:"×", dp:3, ans:r,
        q:`Enzyme induction raises a drug's intrinsic clearance <b>${m}-fold</b>, from <b>${c0}</b> to <b>${c1} L/h</b> (liver blood flow <b>${Q} L/h</b>, unbound fraction <b>${fu}</b>; cleared only by the liver). By what factor does the AUC of an IV dose change (new AUC ÷ old)?`,
        sol:[step(`Before: CL = Q·fu·CLint / (Q + fu·CLint) = ${Q} × ${nf(fu*c0,1)} / (${Q} + ${nf(fu*c0,1)}) = <b>${nf(CL0,2)} L/h</b>`),
          step(`After: CL = ${Q} × ${nf(fu*c1,1)} / (${Q} + ${nf(fu*c1,1)}) = <b>${nf(CL1,2)} L/h</b>`),
          step(`IV AUC = D / CL, so the ratio is ${nf(CL0,2)} / ${nf(CL1,2)} = <b>${nf(r,3)}</b>`),
          step(`By mouth the AUC would change by exactly 1/${m} = ${nf(1/m,3)} whatever the extraction, because oral AUC = fabs·D / (fu·CLint).`)],
        viz:{route:"iv", D:500, V:100, hep:1, qh:Q, fub:fu, clint:c1}, view:{duration:24}, at:0,
        check:p=> derived(p).auc/derived(Object.assign({}, p, {clint:c0})).auc};
    }},
    /* ----- antimicrobial PK/PD ----- */
    // Each reads one interval at steady state (the regimen is charted to within 0.1% of it), with the MIC line on.
    {id:"ftmic", topic:"abx", since:6, gen(d){
      const pick=(list)=> list[Math.round(d(0,list.length-1,1))];
      const x=until(()=>{ const D=d(250,2000,250), V=d(10,40,1), th=d(0.5,3,0.25), tau=pick([4,6,8,12]), fu=d(0.5,1,0.05), mic=pick([0.5,1,2,4,8,16]);
        const k=Math.LN2/th, c0=D/V/(1-Math.exp(-k*tau)), thr=mic/fu;
        return {D,V,th,tau,fu,mic,k,c0,thr,tr:c0*Math.exp(-k*tau),t:Math.log(c0/thr)/k}; }, x=> x.thr<0.8*x.c0 && x.thr>1.5*x.tr && ssFits(x.th,x.tau));
      const {D,V,th,tau,fu,mic,k,c0,thr,tr,t}=x, n=Math.max(2, ssDoses(th,tau)), ft=100*t/tau, dur=evenUp(n*tau);
      return {type:"Time above the MIC (fT>MIC)", unit:"%", dp:1, ans:ft,
        q:`An antibiotic is given as a <b>${D} mg</b> IV bolus every <b>${tau} h</b> (V = <b>${V} L</b>, t½ = <b>${th} h</b>, unbound fraction fu = <b>${fu}</b>). The organism's MIC is <b>${mic} mg/L</b>. At steady state, for what percentage of each dosing interval is the unbound level above the MIC?`,
        sol:[step(`kₑ = ${LN2} / ${th} = <b>${nf(k,4)} h⁻¹</b>`),
          step(`The steady-state peak, just after a dose: <b>C₀,ss = (D / V) / (1 − e^(−kₑτ))</b> = (${D} / ${V}) / (1 − e^(−${nf(k,4)} × ${tau})) = <b>${nf(c0,2)} mg/L</b>. It falls to ${nf(tr,2)} mg/L before the next dose.`),
          step(`The unbound level is fu × the total, so it is above the MIC while the total is above MIC / fu = ${mic} / ${fu} = <b>${nf(thr,3)} mg/L</b>.`),
          step(`The total level falls to that point after <b>t = ln(C₀,ss / (MIC / fu)) / kₑ</b> = ln(${nf(c0,2)} / ${nf(thr,3)}) / ${nf(k,4)} = <b>${nf(t,3)} h</b>`),
          step(`fT>MIC = t / τ = ${nf(t,3)} / ${tau} = <b>${nf(ft,1)}%</b>`)],
        viz:{route:"iv", dosing:"repeated", D, V, thalf:th, tau, nDoses:n, fu}, view:{duration:dur, mec:0, mtc:0, mic}, at:(n-1)*tau+t,
        check:p=> micStats(p, mic, dur).ft};
    }},
    {id:"cmaxmic", topic:"abx", since:6, gen(d){
      const pick=(list)=> list[Math.round(d(0,list.length-1,1))];
      const x=until(()=>{ const D=d(80,600,20), V=d(12,30,1), th=d(1.5,4,0.5), tau=pick([8,12,24]), tinf=pick([0.5,1]), mic=pick([0.25,0.5,1,2]);
        const k=Math.LN2/th, CL=k*V, cmax=D/tinf/CL*(1-Math.exp(-k*tinf))/(1-Math.exp(-k*tau));
        return {D,V,th,tau,tinf,mic,k,CL,cmax}; }, x=> ssFits(x.th,x.tau) && x.cmax/x.mic>=2 && x.cmax/x.mic<=60);
      const {D,V,th,tau,tinf,mic,k,CL,cmax}=x, n=Math.max(2, ssDoses(th,tau)), r=cmax/mic, dur=evenUp(n*tau);
      return {type:"Peak over MIC (Cmax/MIC)", unit:"×", dp:1, ans:r,
        q:`An antibiotic is given as <b>${D} mg</b> infused over <b>${tinf} h</b> every <b>${tau} h</b> (V = <b>${V} L</b>, t½ = <b>${th} h</b>). The organism's MIC is <b>${mic} mg/L</b>. What is Cmax/MIC at steady state, using the total peak level?`,
        sol:[step(`kₑ = ${LN2} / ${th} = <b>${nf(k,4)} h⁻¹</b>, and CL = kₑ·V = <b>${nf(CL,3)} L/h</b>. The infusion runs at R = ${D} / ${tinf} = <b>${nf(D/tinf,1)} mg/h</b>.`),
          step(`The peak comes as each infusion ends: <b>Cmax,ss = (R / CL)·(1 − e^(−kₑ·T)) / (1 − e^(−kₑτ))</b> = (${nf(D/tinf,1)} / ${nf(CL,3)}) × (1 − e^(−${nf(k,4)} × ${tinf})) / (1 − e^(−${nf(k,4)} × ${tau})) = <b>${nf(cmax,2)} mg/L</b>`),
          step(`Cmax/MIC = ${nf(cmax,2)} / ${mic} = <b>${nf(r,1)}</b>`)],
        viz:{route:"inf", dosing:"repeated", D, V, thalf:th, tau, tinf, nDoses:n}, view:{duration:dur, mec:0, mtc:0, mic}, at:(n-1)*tau+tinf,
        check:p=> micStats(p, mic, dur).cmaxMic};
    }},
    {id:"aucmic", topic:"abx", since:6, gen(d){
      const pick=(list)=> list[Math.round(d(0,list.length-1,1))];
      const D=d(500,2000,250), tau=pick([8,12,24]), V=d(30,80,5), th=d(4,12,1), mic=pick([0.5,1,2]);
      const k=Math.LN2/th, CL=k*V, daily=D*24/tau, auc=daily/CL, r=auc/mic, n=Math.max(2, ssDoses(th,tau)), dur=evenUp(n*tau);
      return {type:"Exposure over MIC (AUC24/MIC)", unit:"h", dp:0, ans:r,
        q:`An antibiotic is given as <b>${D} mg</b> infused over 1 h every <b>${tau} h</b> (V = <b>${V} L</b>, t½ = <b>${th} h</b>). The organism's MIC is <b>${mic} mg/L</b>. What is AUC24/MIC at steady state (AUC24 in mg·h/L, divided by the MIC in mg/L)?`,
        sol:[step(`CL = ${LN2} × V / t½ = ${LN2} × ${V} / ${th} = <b>${nf(CL,3)} L/h</b>`),
          step(`The daily dose is ${D} × 24 / ${tau} = <b>${nf(daily,0)} mg</b>, and at steady state <b>AUC24 = daily dose / CL</b> = ${nf(daily,0)} / ${nf(CL,3)} = <b>${nf(auc,1)} mg·h/L</b>`),
          step(`AUC24/MIC = ${nf(auc,1)} / ${mic} = <b>${nf(r,0)}</b>`),
          step(`The infusion time and the interval don't matter here: only the daily dose and the clearance do.`)],
        viz:{route:"inf", dosing:"repeated", D, V, thalf:th, tau, tinf:1, nDoses:n}, view:{duration:dur, mec:0, mtc:0, mic},
        check:p=> micStats(p, mic, dur).aucMic};
    }},
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
  function makeWorksheet(o){
    o=o||{};
    const topic=PRACTICE_TOPICS.some(t=>t.id===o.topic) ? o.topic : "";
    const count=WORKSHEET_SIZES.includes(o.count) ? o.count : 10;
    const seed=o.seed===undefined ? Math.floor(Math.random()*4294967296) : o.seed>>>0;
    const v=Number.isInteger(o.v) && o.v>=1 && o.v<=WS_VERSION ? o.v : WS_VERSION;
    const rnd=seededRandom(seed), pool=PRACTICE.filter(g=> (!topic || g.topic===topic) && (g.since||1)<=v).map(g=>g.id);
    const kinds=[];
    while(kinds.length<count){
      const round=pool.slice();
      for(let i=round.length-1;i>0;i--){ const j=Math.floor(rnd()*(i+1)); [round[i],round[j]]=[round[j],round[i]]; }
      if(kinds.length && round[0]===kinds[kinds.length-1]) round.push(round.shift());   // never the same kind twice running
      kinds.push(...round);
    }
    const problems=kinds.slice(0,count).map(id=> makeProblem({id, seed:Math.floor(rnd()*4294967296)}));
    return {topic, count, seed, v, problems};
  }
  // An answer within 2% (or half a unit in the last decimal shown) counts: working with ln2 = 0.693 or
  // rounded intermediate values still lands inside it.
  const practiceCorrect=(pr,v)=> typeof v==="number" && isFinite(v) && Math.abs(v-pr.ans)<=Math.max(Math.abs(pr.ans)*0.02, Math.pow(10,-pr.dp)/2);

  return {PRACTICE, makeProblem, practiceScenario, makeWorksheet, practiceCorrect};
});
