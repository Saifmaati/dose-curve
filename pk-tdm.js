/* MaatiRX: when to sample (2.4)
   The model's sampling times for a regular regimen: the dose from which its interval's peak and trough are within
   10% (and 3%) of their steady-state values, the trough at the end of that interval, and the peak (the end of an
   infusion, the oral Tmax, straight after a bolus, or with two compartments, once distribution is 90% complete). The
   page loads this file when "When to sample" opens (it registers itself as PK.tdmModule); in Node the engine
   requires it on first use of PK.tdm. The model's times, not a protocol's. Educational model, not for clinical dosing. */
(function(root, factory){
  if(typeof module==="object" && module.exports) module.exports=factory(require("./pk-engine.js"));
  else if(root && root.PK) root.PK.tdmModule=factory(root.PK);
})(typeof self!=="undefined" ? self : this, function(PK){
  "use strict";
  const {ssProfile, ssConc, disposition, singleConc, saltOf, hdOn}=PK;

  // Steady state: the first dose whose interval has its peak and trough within the share of their steady-state values
  // and keeps them there, on the regimen as planned (a loading dose counts; a missed dose is left out). The peak's
  // time s into the interval: with two compartments after an IV dose, the moment the fast term A·e^(−αu) is a ninth
  // of the slow one B·e^(−βu), u = ln(9A/B) / (α − β) after the dose or the infusion's end, so the distribution phase
  // is 10% or less of the level and the level is on its terminal slope.
  function sampling(p){
    if(p.dosing!=="repeated" || p.kin==="mm" || hdOn(p)) return null;
    const S=ssProfile(p), tau=p.tau, terms=disposition(p), D=p.D*saltOf(p), two=terms.length>1;
    let s, kind, u=null;
    if(p.route==="oral"){
      // the steady-state Tmax: a grid over the interval, then a golden-section search around its best point
      let best=0, cb=-1;
      for(let j=0;j<=200;j++){ const t=tau*j/200, c=ssConc(p,t); if(c>cb){ cb=c; best=t; } }
      let lo=Math.max(0,best-tau/200), hi=Math.min(tau,best+tau/200);
      for(let k=0;k<60;k++){ const a=hi-(hi-lo)*0.6180339887, b=lo+(hi-lo)*0.6180339887; if(ssConc(p,a)<ssConc(p,b)) lo=a; else hi=b; }
      s=(lo+hi)/2; kind="tmax";
    } else {
      const Ti=p.route==="inf" ? p.tinf : 0;
      s=Ti; kind=p.route==="inf" ? "end" : "bolus";
      if(two){
        // each term's amplitude at the dose's end, at steady state
        const geo=l=>1/(1-Math.exp(-l*tau));
        const [A,B]=terms.map(x=> Ti>0 ? (D/Ti)*x.c*(1-Math.exp(-x.k*Ti))/x.k*geo(x.k) : D*x.c*geo(x.k));
        u=9*A>B ? Math.log(9*A/B)/(terms[0].k-terms[1].k) : 0;
        s=Ti+u; kind="dist";
      }
    }
    const late=s>=tau-1e-9;   // distribution isn't over before the next dose
    // dose i's interval in closed form: the steady state less the doses before the first that never came,
    // Σ_{j≥i} C₁(s + jτ) = ssConc(s + iτ), plus a loading dose's extra on the first
    const need=Math.min(20000, Math.max(p.nDoses, 4*S.dosesTo90+4)), L=p.loadMult-1;
    const pkSS=late ? null : ssConc(p,s), trSS=S.ssTrough;
    const at=(x,i)=> ssConc(p,x)-ssConc(p,x+i*tau)+(L ? L*singleConc(p,(i-1)*tau+x,p.D,null,terms) : 0);
    const off=[];
    for(let i=1;i<=need;i++){
      const tr=at(tau-1e-9,i), pk=late ? null : at(s,i);
      off.push(Math.max(Math.abs(tr-trSS)/trSS, late ? 0 : Math.abs(pk-pkSS)/pkSS));
    }
    // the first dose from which every later interval stays within the share
    const from=share=>{ let n=null; for(let i=need;i>=1;i--){ if(off[i-1]<=share) n=i; else break; } return n; };
    const n90=from(0.1), n97=from(0.03);
    if(n90===null) return null;
    return {n90, n97, beyond:n90>p.nDoses, clears:S.clears, late,
      peak: late ? null : {s, t:(n90-1)*tau+s, c:pkSS, kind, u},
      trough:{t:n90*tau, c:trSS}};
  }

  // The section's markup. f: {num(v, dp), dp (the level's decimals), unit, drug, maxT (the longest chart window)}
  function html(p, w, f){
    const h=t=>`${+t.toFixed(1)} h`, c=v=>`${f.num(v,f.dp)} ${f.unit}`, N=w.n90, pk=w.peak;
    const btn=(t,what)=> `<button type="button" class="abtn" data-jump="${t}"${!w.beyond && t<=f.maxT ? "" : " disabled"} aria-label="Show the ${what} time, ${h(t)}, on the chart">Show</button>`;
    const after=p.route==="inf" ? "its infusion ends" : "the dose";
    const why=!pk ? "" : pk.kind==="end" ? `when dose ${N}'s infusion ends`
      : pk.kind==="tmax" ? `dose ${N}'s Tmax, ${h(pk.s)} after it`
      : pk.kind==="bolus" ? `straight after dose ${N}`
      : pk.u>0.05 ? `${h(pk.u)} after ${after}, once distribution is 90% complete` : `when ${after}: distribution is already 90% complete`;
    const cards=[
      ["Steady state", `dose ${N}`, `peak and trough within 10% of steady state from this dose on${w.n97>N ? `, within 3% from dose ${w.n97}` : ""}`+
        (p.loadMult>1 ? ", with the loading dose" : "")+(w.beyond ? `. This regimen stops at dose ${p.nDoses}` : ""), ""],
      pk ? ["Peak", h(pk.t), `${why}: ${c(pk.c)}`, btn(pk.t,"peak")] : ["Peak", "—", "distribution isn't over before the next dose", ""],
      ["Trough", h(w.trough.t), `just before dose ${N+1}: ${c(w.trough.c)}`+(w.clears ? ", near zero: the drug clears between doses" : ""), btn(w.trough.t,"trough")]
    ];
    return `<div class="ssw-grid">${cards.map(k=>`<div class="ssw"><div class="k">${k[0]}</div><div class="v">${k[1]}</div><div class="s">${k[2]}</div>${k[3]}</div>`).join("")}</div>`+
      `<p class="ssw-note">Times are from the first dose. Before steady state a level is ${p.loadMult>1 ? "not yet" : "lower than"} what it settles to. `+
      (pk && pk.kind==="dist" ? "During distribution a level is higher than the one that follows, so the peak time waits for it. "
        : p.route!=="oral" ? "A one-compartment model has no distribution phase, so its peak is the end of the dose; with two compartments, the peak time waits for distribution. " : "")+
      `A protocol sets the times levels are actually drawn`+(f.drug==="vanc" ? `; the vancomycin guideline's two-level approach takes a post-distribution peak 1–2 hours after the infusion and a trough, near steady state (Rybak et al., 2020)` : "")+`.</p>`;
  }
  return {sampling, html};
});
