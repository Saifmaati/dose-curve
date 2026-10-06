/* DoseCurve population mode
   n virtual patients around the scenario's typical patient, with log-normal between-patient variability on
   clearance and volume: CLᵢ = CL·e^ηCL and Vᵢ = V·e^ηV, η ~ N(0, ω²), ω² = ln(1 + CV²), so the scenario's values
   are the medians. With saturable (Michaelis–Menten) elimination the first variability is on Vmax instead:
   Vmaxᵢ = Vmax·e^ηCL, with Km fixed. A seeded generator makes a link reproduce the same patients.
   With the effect charts on (o.pd), the same patients' effect (direct Emax, through the effect site when there is
   a delay) or indirect response gets its own band: PK variability only, with each patient's EC50, Emax and
   turnover the scenario's, so the band shows how the spread in level carries through to the effect.
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
          importScripts(m.engine);
          // the dialysis model, when the page passes its own stamped address: without it, sessions would be ignored
          if(typeof m.hd==="string" && /^pk-hd\.js\?v=[0-9a-f]{10}$/.test(m.hd)) importScripts(m.hd);
          // and the indirect-response model, for the response band
          if(typeof m.idr==="string" && /^pk-idr\.js\?v=[0-9a-f]{10}$/.test(m.idr)) importScripts(m.idr);
          ready=true;
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
  // clearance is CL·e^ηCL and its volume V·e^ηV (saturable: its own Vmax·e^ηCL and volume).
  function patients(PK, p, o){
    const n=Math.round(Math.min(LIMITS.n[1], Math.max(LIMITS.n[0], o.n))), z=normals(PK.seededRandom(o.seed>>>0));
    const wCL=omega(o.cvCL), wV=omega(o.cvV), mm=p.kin==="mm", out=[];
    for(let i=0;i<n;i++){
      const eCL=wCL*z(), eV=wV*z();
      out.push(Object.assign({}, p, mm ? {V:p.V*Math.exp(eV), vmax:p.vmax*Math.exp(eCL), eCL, eV}
        : {V:p.V*Math.exp(eV), thalf:p.thalf*Math.exp(eV-eCL), eCL, eV}));
    }
    return out;
  }
  const quantile=(sorted,q)=>{ const x=(sorted.length-1)*q, i=Math.floor(x), f=x-i; return i+1<sorted.length ? sorted[i]*(1-f)+sorted[i+1]*f : sorted[i]; };
  // The band (5th, 50th and 95th percentiles at each time on a capped grid) and, for a regular regimen, the
  // probability of target attainment at steady state: the share of patients whose trough is at or above MEC
  // and whose peak is at or below MTC (and, given an AUC24 range, whose AUC24 falls in it). A saturable patient
  // whose input exceeds their Vmax has no steady state: the level keeps rising, so they miss every target, and
  // their share is reported (noSS); the percentiles are over the patients who do settle.
  function population(PK, p, o){
    const T=o.T, G=LIMITS.grid, ev=PK.doseEvents(p), list=patients(PK, p, o), n=list.length;
    const t=Array.from({length:G},(_,i)=>T*i/(G-1)), cols=t.map(()=>new Float64Array(n));
    // a saturable patient is integrated once over the window and read from that solution, which is then let
    // go (the engine's own cache would keep every patient's solution alive until the population is done)
    list.forEach((q,j)=>{
      if(p.kin==="mm"){ const st=PK.hdOn(q) && PK.hd ? PK.hd.mmSteps(q, T+PK.MM_STEP) : PK.mmIntegrate(q, ev, T+PK.MM_STEP), V=PK.vOf(q); for(let i=0;i<G;i++) cols[i][j]=PK.mmAmount(st, t[i])/V; }
      else for(let i=0;i<G;i++) cols[i][j]=PK.conc(q, t[i], ev);
    });
    // the 5th, 25th, 50th, 75th and 95th percentiles (the chart layers the middle 90% and the middle 50%, 2.13)
    const q05=[], q25=[], q50=[], q75=[], q95=[];
    cols.forEach(c=>{ const s=Array.from(c).sort((a,b)=>a-b); q05.push(quantile(s,0.05)); q25.push(quantile(s,0.25)); q50.push(quantile(s,0.5)); q75.push(quantile(s,0.75)); q95.push(quantile(s,0.95)); });
    const out={n, t, q05, q25, q50, q75, q95, cvCL:o.cvCL, cvV:o.cvV, seed:o.seed};
    if(o.pd) Object.assign(out, effectBand(PK, p, list, ev, t, cols));
    // attainment is read at steady state: with dialysis (sessions that don't repeat with the doses) there is none
    if(p.dosing==="repeated" && !PK.hdOn(p)){
      let hit=0, hitAuc=0, noSS=0, troughs=[], peaks=[];
      const F=p.route==="oral" ? p.F : 1, S=PK.saltOf(p), mm=p.kin==="mm";
      list.forEach(q=>{
        let s, auc24;
        if(mm){
          const m=PK.mmSteady(q);
          if(m.none){ noSS++; return; }
          s={peak:m.peak, trough:m.trough}; auc24=m.avg*24;   // at steady state the average level over τ, per 24 h
        } else { s=PK.ssPeakTrough(q); auc24=F*S*p.D/PK.derived(q).CL*24/p.tau; }
        troughs.push(s.trough); peaks.push(s.peak);
        if(s.trough>=o.mec && s.peak<=o.mtc) hit++;
        if(o.auc && auc24>=o.auc[0] && auc24<=o.auc[1]) hitAuc++;
      });
      troughs.sort((a,b)=>a-b); peaks.sort((a,b)=>a-b);
      out.pta=hit/n; out.ptaAuc=o.auc ? hitAuc/n : null; out.noSS=noSS/n;
      out.trough=troughs.length ? [quantile(troughs,0.05), quantile(troughs,0.5), quantile(troughs,0.95)] : null;
      out.peak=peaks.length ? [quantile(peaks,0.05), quantile(peaks,0.5), quantile(peaks,0.95)] : null;
    }
    return out;
  }
  // The effect's band, and where the median moves furthest from its baseline: the effect's and the level's spread
  // there (5th, 50th, 95th percentiles). An indirect response needs pk-idr.js; without it there is no band.
  function effectBand(PK, p, list, ev, t, cols){
    const idr=p.idr>0, n=list.length, G=t.length;
    if(idr && !PK.idrModule && !PK.idr) return {};
    const ecols=t.map(()=>new Float64Array(n));
    list.forEach((q,j)=>{
      if(idr){ const cr=PK.idr.course(q, t[G-1], null, 2000); for(let i=0;i<G;i++) ecols[i][j]=PK.idr.interp(cr, t[i]); }
      else if(p.kin==="mm") for(let i=0;i<G;i++) ecols[i][j]=PK.effectOf(q, cols[i][j]);
      else for(let i=0;i<G;i++) ecols[i][j]=PK.effectOf(q, PK.ceConc(q, t[i], ev));
    });
    const e05=[], e50=[], e95=[];
    ecols.forEach(c=>{ const s=Array.from(c).sort((a,b)=>a-b); e05.push(quantile(s,0.05)); e50.push(quantile(s,0.5)); e95.push(quantile(s,0.95)); });
    const base=idr ? PK.idr.R0 : p.e0;
    let im=0; e50.forEach((e,i)=>{ if(Math.abs(e-base)>Math.abs(e50[im]-base)) im=i; });
    const lv=Array.from(cols[im]).sort((a,b)=>a-b);
    return {e05, e50, e95, eAt:{t:t[im], e:[e05[im], e50[im], e95[im]], c:[quantile(lv,0.05), quantile(lv,0.5), quantile(lv,0.95)], base}};
  }
  return {LIMITS, omega, normals, patients, quantile, population, effectBand};
});
