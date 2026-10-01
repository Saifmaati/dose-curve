/* DoseCurve Bayesian individualization (maximum a posteriori, MAP)
   Measured levels are weighed against what the patient model predicts before any level is known (the prior), each
   by its own uncertainty: the approach of Sheiner, Beal, Rosenberg and Marathe, "Forecasting individual
   pharmacokinetics", Clin Pharmacol Ther 1979;26(3):294-305 (doi:10.1002/cpt1979263294). One compartment and
   first-order elimination, any route; two compartments and saturable elimination are left out and say so.

   - Parameters: this patient's clearance CL and volume V. Their prior is log-normal, centred on the patient
     model's own values (Cockcroft-Gault-adjusted clearance in clinical mode), with the population mode's CVs
     (30% on CL, 20% on V by default): ω = √ln(1 + CV²).
   - Levels: each measured c, with a combined error SD σ = √((0.10·c)² + a²), a = one tenth of the window's lower
     bound (MEC). Both are teaching assumptions, stated in the panel.
   - Objective (OFV): Σ ((c − prediction) / σ)² + (η_CL / ω_CL)² + (η_V / ω_V)², η = ln(value / prior mean).
   - Search: a grid over ±3 prior SDs in log space, then Nelder-Mead from its best point.
   - Uncertainty: the Laplace approximation, from a numerical Hessian of OFV / 2 at the estimate.

   The page loads this file with the "Individualize from levels" panel or a case that uses it (it registers itself
   as PK.bayesModule); in Node the engine requires it on first use of PK.bayes. Educational model, not for
   clinical dosing. */
(function(root, factory){
  if(typeof module==="object" && module.exports) module.exports=factory(require("./pk-engine.js"));
  else if(root && root.PK) root.PK.bayesModule=factory(root.PK);
})(typeof self!=="undefined" ? self : this, function(PK){
  "use strict";
  const {derived, vOf, conc, doseEvents, clFactor, normalizeScenario, cloneScenario, ssConc, fOf, hepOn, saltOf}=PK;

  const DEFAULT_OPTS={cvCL:30, cvV:20, prop:0.10};
  const omega=cv=> Math.sqrt(Math.log(1+(cv/100)*(cv/100)));

  // Whether the method applies to scenario p, and why not when it doesn't.
  function applicable(p){
    if(p.kin==="mm") return {ok:false, why:"Saturable (Michaelis–Menten) elimination isn't covered: the method here assumes first-order elimination."};
    if(p.cmt===2) return {ok:false, why:"Two compartments aren't covered: the method here fits one compartment (CL and V)."};
    if(PK.hdOn(p)) return {ok:false, why:"Dialysis sessions aren't covered: the estimate assumes the clearance stays the same between the levels."};
    return {ok:true};
  }

  // The prior: this patient's model clearance and volume, and the log-normal SDs around them.
  function priorOf(p, opts){
    const o=Object.assign({}, DEFAULT_OPTS, opts), d=derived(p);
    // wCL and wV (log-scale SDs) can be given directly, for example to make the prior as wide as wanted
    return {CL:d.CL, V:vOf(p), wCL:o.wCL>0 ? o.wCL : omega(o.cvCL), wV:o.wV>0 ? o.wV : omega(o.cvV), cvCL:o.cvCL, cvV:o.cvV};
  }

  // Scenario p with this patient's clearance CL (L/h) and volume V (L) instead of the model's, everything else kept.
  function individual(p, CL, V){
    const q=cloneScenario(p);
    if(hepOn(p)){ q.F=fOf(p); q.hep=0; }
    q.V=V*70/p.wt;
    q.thalf=Math.LN2*V/CL*clFactor(q);   // so that kₑ = CL / V exactly, whatever the patient mode
    return q;
  }

  // Each level on the schedule: its time (h from the first dose), measured value and error SD. Levels tied to a
  // dose that isn't given are left out (their index is kept in `skipped`).
  function observations(p, levels, opts){
    const o=Object.assign({}, DEFAULT_OPTS, opts, {add:addOf(opts)}), ev=doseEvents(p), out=[], skipped=[];
    (levels||p.lv||[]).forEach((l,i)=>{
      const e=ev[l.n-1];
      if(!e){ skipped.push(i); return; }
      const sd=Math.sqrt((o.prop*l.c)*(o.prop*l.c)+o.add*o.add);
      out.push({t:e.t+l.dt, y:l.c, sd, n:l.n, dt:l.dt});
    });
    return {obs:out, skipped, add:o.add, prop:o.prop};
  }
  // The additive error SD: given, or a tenth of the window's lower bound (opts.mec, the page's MEC; 2 by default),
  // with a floor of 0.01 in the concentration unit when there's no lower bound.
  function addOf(opts){
    const o=opts||{};
    if(typeof o.add==="number" && o.add>0) return o.add;
    const mec=typeof o.mec==="number" ? o.mec : PK.VIEW_DEFAULTS.mec;
    return mec>0 ? mec/10 : 0.01;
  }

  // Predictions at the observation times for clearance CL and volume V.
  function predict(p, CL, V, obs){
    const q=individual(p, CL, V), ev=doseEvents(q);
    return obs.map(x=> conc(q, x.t, ev));
  }

  function problem(p, levels, opts){
    const pr=priorOf(p, opts), ob=observations(p, levels, opts), mCL=Math.log(pr.CL), mV=Math.log(pr.V);
    // a private working copy, updated in place: this runs thousands of times per estimate
    const q=individual(p, pr.CL, pr.V), ev=doseEvents(q), cf=clFactor(q), wt=p.wt;
    const pred=(lnCL, lnV)=>{ const CL=Math.exp(lnCL), V=Math.exp(lnV); q.V=V*70/wt; q.thalf=Math.LN2*V/CL*cf; return ob.obs.map(x=>conc(q,x.t,ev)); };
    const ofv=x=>{
      const f=pred(x[0], x[1]);
      let s=((x[0]-mCL)/pr.wCL)**2+((x[1]-mV)/pr.wV)**2;
      ob.obs.forEach((o,i)=>{ const r=(o.y-f[i])/o.sd; s+=r*r; });
      return s;
    };
    return {pr, ob, mCL, mV, ofv, pred};
  }

  // A square grid over ±span prior SDs around the prior mean in log space: its best point and value.
  function gridSearch(P, n, span){
    n=n||25; span=span||3;
    let best=null;
    for(let i=0;i<n;i++) for(let j=0;j<n;j++){
      const x=[P.mCL+span*P.pr.wCL*(2*i/(n-1)-1), P.mV+span*P.pr.wV*(2*j/(n-1)-1)], f=P.ofv(x);
      if(!best || f<best.f) best={x, f};
    }
    return best;
  }
  // Nelder-Mead in two dimensions.
  function nelderMead(f, x0, step, tol){
    let pts=[x0, [x0[0]+step[0], x0[1]], [x0[0], x0[1]+step[1]]].map(x=>({x, f:f(x)}));
    for(let it=0; it<2000; it++){
      pts.sort((a,b)=>a.f-b.f);
      const [b, g, w]=pts;
      if(Math.abs(w.f-b.f)<=tol*(1+Math.abs(b.f)) && Math.hypot(w.x[0]-b.x[0], w.x[1]-b.x[1])<1e-10) break;
      const c=[(b.x[0]+g.x[0])/2, (b.x[1]+g.x[1])/2], at=s=>{ const x=[c[0]+s*(w.x[0]-c[0]), c[1]+s*(w.x[1]-c[1])]; return {x, f:f(x)}; };
      const r=at(-1);
      if(r.f<b.f){ const e=at(-2); pts[2]= e.f<r.f ? e : r; }
      else if(r.f<g.f) pts[2]=r;
      else {
        const k= r.f<w.f ? at(-0.5) : at(0.5);
        if(k.f<Math.min(r.f, w.f)) pts[2]=k;
        else pts=[b, {x:[(b.x[0]+g.x[0])/2, (b.x[1]+g.x[1])/2]}, {x:[(b.x[0]+w.x[0])/2, (b.x[1]+w.x[1])/2]}].map(q=>({x:q.x, f:q.f!==undefined ? q.f : f(q.x)}));
      }
    }
    pts.sort((a,b)=>a.f-b.f);
    return pts[0];
  }
  // The Hessian of g = OFV / 2 at x, by central differences, and its inverse (the Laplace covariance of ln CL, ln V).
  function laplace(ofv, x){
    const h=1e-4, g=y=> ofv(y)/2, f0=g(x);
    const e=(i,j,si,sj)=>{ const y=x.slice(); y[i]+=si*h; y[j]+=sj*h; return g(y); };
    const H=[[0,0],[0,0]];
    for(let i=0;i<2;i++){
      const y1=x.slice(), y2=x.slice(); y1[i]+=h; y2[i]-=h;
      H[i][i]=(g(y1)-2*f0+g(y2))/(h*h);
    }
    H[0][1]=H[1][0]=(e(0,1,1,1)-e(0,1,1,-1)-e(0,1,-1,1)+e(0,1,-1,-1))/(4*h*h);
    const det=H[0][0]*H[1][1]-H[0][1]*H[1][0];
    if(!(det>0) || !(H[0][0]>0)) return null;
    return [[H[1][1]/det, -H[0][1]/det], [-H[1][0]/det, H[0][0]/det]];
  }

  // The estimate. levels default to p.lv; opts: cvCL, cvV (%), prop (proportional error), add (additive SD).
  function estimate(p, levels, opts){
    const app=applicable(p);
    if(!app.ok) return {ok:false, why:app.why};
    const P=problem(p, levels, opts), {pr, ob}=P;
    let x, f, grid=null;
    if(!ob.obs.length){ x=[P.mCL, P.mV]; f=0; }
    else {
      grid=gridSearch(P);
      const nm=nelderMead(P.ofv, grid.x, [0.2*pr.wCL, 0.2*pr.wV], 1e-14);
      x=nm.x; f=nm.f;
    }
    const cov=laplace(P.ofv, x) || [[pr.wCL*pr.wCL, 0], [0, pr.wV*pr.wV]];
    const sdCL=Math.sqrt(cov[0][0]), sdV=Math.sqrt(cov[1][1]), sdT=Math.sqrt(Math.max(0, cov[0][0]+cov[1][1]-2*cov[0][1]));
    const CL=Math.exp(x[0]), V=Math.exp(x[1]), thalf=Math.LN2*V/CL, z=1.959963984540054;
    const ci=(v,sd)=>[v*Math.exp(-z*sd), v*Math.exp(z*sd)];
    const pred=P.pred(x[0], x[1]);
    return {ok:true, CL, V, thalf, ke:CL/V, ofv:f,
      ci:{CL:ci(CL,sdCL), V:ci(V,sdV), thalf:ci(thalf,sdT)}, sd:{lnCL:sdCL, lnV:sdV, lnThalf:sdT, corr:cov[0][1]/(sdCL*sdV)},
      // how much of the prior's uncertainty is left (1: the levels told nothing; near 0: the levels decide)
      shrink:{CL:sdCL/pr.wCL, V:sdV/pr.wV},
      prior:pr, obs:ob.obs.map((o,i)=>Object.assign({pred:pred[i], z:(o.y-pred[i])/o.sd}, o)), skipped:ob.skipped,
      add:ob.add, prop:ob.prop, grid:grid && {CL:Math.exp(grid.x[0]), V:Math.exp(grid.x[1])},
      scenario:individual(p, CL, V)};
  }

  // The two-level estimate, without a prior: kₑ from the log-linear slope between the last two levels after the
  // same IV dose (after an infusion has stopped), then V from those two levels given kₑ (superposition carries
  // earlier doses), and CL = kₑ·V. null when the levels don't allow it.
  function twoLevel(p, levels, opts){
    if(!applicable(p).ok) return null;
    const {obs}=observations(p, levels, opts), ev=doseEvents(p);
    for(let n=ev.length; n>=1; n--){
      const e=ev[n-1], after=obs.filter(o=> o.n===n && (e.route==="iv" ? o.dt>0 : e.route==="inf" ? o.dt>=e.dur : false));
      if(after.length<2) continue;
      const [a,b]=after.slice(-2);
      if(!(b.t>a.t) || !(a.y>0) || !(b.y>0) || !(a.y>b.y)) return null;
      const k=Math.log(a.y/b.y)/(b.t-a.t), q=individual(p, k, 1), ev1=doseEvents(q);
      const u=[a,b].map(o=>conc(q, o.t, ev1)), V=(u[0]*u[0]+u[1]*u[1])/(u[0]*a.y+u[1]*b.y);
      return {k, V, CL:k*V, thalf:Math.LN2/k, n, levels:[a,b]};
    }
    return null;
  }

  // Scenario q at steady state on its interval τ (a repeated regimen): AUC24, peak and trough.
  function steadyState(q){
    const r=q.dosing==="repeated" ? q : Object.assign(cloneScenario(q), {dosing:"repeated", nDoses:20, missed:1, loadMult:1});
    const d=derived(r), per=d.auc/r.tau, peakTrough=ssPeak(r);
    return {auc24:24*per, trough:ssConc(r, r.tau-1e-9), peak:peakTrough, tau:r.tau, D:r.D};
  }
  function ssPeak(r){
    let m=0; for(let i=0;i<=400;i++){ const c=ssConc(r, r.tau*i/400*(1-1e-9)); if(c>m) m=c; } return m;
  }
  // The dose, at q's interval, that gives a target AUC24 or trough at steady state (exact: both scale with the dose).
  function doseFor(q, target){
    const ss=steadyState(q), x=target.kind==="trough" ? ss.trough : ss.auc24;
    return x>0 ? q.D*target.value/x : null;
  }

  return {DEFAULT_OPTS, omega, addOf, applicable, priorOf, individual, observations, predict, problem, gridSearch, nelderMead,
    laplace, estimate, twoLevel, steadyState, doseFor};
});
