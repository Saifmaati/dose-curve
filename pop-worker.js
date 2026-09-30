/* DoseCurve population mode
   n virtual patients around the scenario's typical patient, with log-normal between-patient variability on
   clearance and volume: CLᵢ = CL·e^ηCL and Vᵢ = V·e^ηV, η ~ N(0, ω²), ω² = ln(1 + CV²), so the scenario's values
   are the medians. A seeded generator makes a link reproduce the same patients. For first-order scenarios only.
   The page runs this as a Web Worker (it passes the engine's address in its first message); the tests require()
   it. The CVs are teaching assumptions, not drug-specific claims. Educational model, not for clinical dosing. */
(function(root, factory){
  const api=factory();
  if(typeof module==="object" && module.exports) module.exports=api;
  else {
    root.DCPop=api;
    // as a worker: {engine, job} messages; the engine address must be this site's own stamped engine
    if(typeof importScripts==="function" && typeof document==="undefined"){
      let ready=false;
      root.onmessage=e=>{
        const m=e.data||{};
        if(!ready){
          if(typeof m.engine!=="string" || !/^pk-engine\.js\?v=[0-9a-f]{10}$/.test(m.engine)) return;
          importScripts(m.engine); ready=true;
        }
        if(m.job){
          try{ root.postMessage({id:m.job.id, result:m.job.list.map(p=>api.population(root.PK, p, m.job.opts))}); }
          catch(err){ root.postMessage({id:m.job.id, error:String(err && err.message || err)}); }
        }
      };
    }
  }
})(typeof self!=="undefined" ? self : this, function(){
  "use strict";
  const LIMITS={n:[50,1000], cv:[0,100], grid:241};
  const omega=cv=> Math.sqrt(Math.log(1+(cv/100)*(cv/100)));
  // Standard normal pairs from a uniform generator (Box–Muller).
  function normals(rand){
    let spare=null;
    return ()=>{
      if(spare!==null){ const s=spare; spare=null; return s; }
      let u=0; while(u<=1e-300) u=rand();
      const v=rand(), r=Math.sqrt(-2*Math.log(u));
      spare=r*Math.sin(2*Math.PI*v);
      return r*Math.cos(2*Math.PI*v);
    };
  }
  // The virtual patients' scenarios: each keeps the regimen, with its own volume and half-life so that its
  // clearance is CL·e^ηCL and its volume V·e^ηV.
  function patients(PK, p, o){
    const n=Math.round(Math.min(LIMITS.n[1], Math.max(LIMITS.n[0], o.n))), z=normals(PK.seededRandom(o.seed>>>0));
    const wCL=omega(o.cvCL), wV=omega(o.cvV), out=[];
    for(let i=0;i<n;i++){
      const eCL=wCL*z(), eV=wV*z();
      out.push(Object.assign({}, p, {V:p.V*Math.exp(eV), thalf:p.thalf*Math.exp(eV-eCL), eCL, eV}));
    }
    return out;
  }
  const quantile=(sorted,q)=>{ const x=(sorted.length-1)*q, i=Math.floor(x), f=x-i; return i+1<sorted.length ? sorted[i]*(1-f)+sorted[i+1]*f : sorted[i]; };
  // The band (5th, 50th and 95th percentiles at each time on a capped grid) and, for a regular regimen, the
  // probability of target attainment at steady state: the share of patients whose trough is at or above MEC
  // and whose peak is at or below MTC (and, given an AUC24 range, whose AUC24 falls in it).
  function population(PK, p, o){
    if(p.kin==="mm") return {unsupported:"saturable"};
    const T=o.T, G=LIMITS.grid, ev=PK.doseEvents(p), list=patients(PK, p, o), n=list.length;
    const t=Array.from({length:G},(_,i)=>T*i/(G-1)), cols=t.map(()=>new Float64Array(n));
    list.forEach((q,j)=>{ for(let i=0;i<G;i++) cols[i][j]=PK.conc(q, t[i], ev); });
    const q05=[], q50=[], q95=[];
    cols.forEach(c=>{ const s=Array.from(c).sort((a,b)=>a-b); q05.push(quantile(s,0.05)); q50.push(quantile(s,0.5)); q95.push(quantile(s,0.95)); });
    const out={n, t, q05, q50, q95, cvCL:o.cvCL, cvV:o.cvV, seed:o.seed};
    if(p.dosing==="repeated"){
      let hit=0, hitAuc=0, troughs=[], peaks=[];
      const F=p.route==="oral" ? p.F : 1, S=PK.saltOf(p);
      list.forEach(q=>{
        const s=PK.ssPeakTrough(q), CL=PK.derived(q).CL, auc24=F*S*p.D/CL*24/p.tau;
        troughs.push(s.trough); peaks.push(s.peak);
        if(s.trough>=o.mec && s.peak<=o.mtc) hit++;
        if(o.auc && auc24>=o.auc[0] && auc24<=o.auc[1]) hitAuc++;
      });
      troughs.sort((a,b)=>a-b); peaks.sort((a,b)=>a-b);
      out.pta=hit/n; out.ptaAuc=o.auc ? hitAuc/n : null;
      out.trough=[quantile(troughs,0.05), quantile(troughs,0.5), quantile(troughs,0.95)];
      out.peak=[quantile(peaks,0.05), quantile(peaks,0.5), quantile(peaks,0.95)];
    }
    return out;
  }
  return {LIMITS, omega, normals, patients, quantile, population};
});
