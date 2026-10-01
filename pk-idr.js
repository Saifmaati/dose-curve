/* DoseCurve indirect response models
   The four basic models of Dayneka, Garg and Jusko (J Pharmacokinet Biopharm 1993;21(4):457–478): the drug inhibits
   or stimulates the production (kin) or the loss (kout) of a response R, which before the drug is at its baseline
   R0 = kin / kout. DoseCurve shows R as a percentage of R0 (so R0 = 100), and adds a maximum (Imax ≤ 1 for
   inhibition, Smax for stimulation) and a Hill slope n to the paper's drug function; with Imax = 1 and n = 1 it is
   the paper's form. The drug acts on plasma concentration directly:
     f(C) = Cⁿ / (EC50ⁿ + Cⁿ)
     type 1  dR/dt = kin·(1 − Imax·f) − kout·R        inhibits production
     type 2  dR/dt = kin − kout·(1 − Imax·f)·R        inhibits loss
     type 3  dR/dt = kin·(1 + Smax·f) − kout·R        stimulates production
     type 4  dR/dt = kin − kout·(1 + Smax·f)·R        stimulates loss
   with kout = ln 2 / t½ of the response's turnover. R is integrated by the classical Runge–Kutta method on steps that
   meet every dose and infusion end, so a bolus never falls inside a step. The page loads this file when a scenario
   uses an indirect response (it registers itself as PK.idrModule); in Node the engine requires it on first use of
   PK.idr. Educational model, not for clinical dosing. */
(function(root, factory){
  if(typeof module==="object" && module.exports) module.exports=factory(require("./pk-engine.js"));
  else if(root && root.PK) root.PK.idrModule=factory(root.PK);
})(typeof self!=="undefined" ? self : this, function(PK){
  "use strict";
  const {conc, doseEvents, windowStats, encodeScenario}=PK;
  const R0=100;
  const TYPES=[null,
    {id:1, name:"Inhibits production", what:"production (kin)", sign:-1, inhib:true},
    {id:2, name:"Inhibits loss", what:"loss (kout)", sign:1, inhib:true},
    {id:3, name:"Stimulates production", what:"production (kin)", sign:1, inhib:false},
    {id:4, name:"Stimulates loss", what:"loss (kout)", sign:-1, inhib:false}];
  const koutOf=p=> Math.LN2/p.tout;
  // the drug's fractional action at concentration c (0 to 1)
  const frac=(p,c)=> c>0 ? (p.hill===1 ? c/(p.ec50+c) : 1/(1+Math.pow(p.ec50/c, p.hill))) : 0;
  function rate(p, R, c){
    const k=koutOf(p), f=frac(p,c);
    return p.idr===1 ? k*R0*(1-p.imax*f)-k*R : p.idr===2 ? k*R0-k*(1-p.imax*f)*R : p.idr===3 ? k*R0*(1+p.smax*f)-k*R : k*R0-k*(1+p.smax*f)*R;
  }
  // Where R settles if the level is held at c (production equals loss), and the rate constant of its approach:
  // types 1 and 3 always approach at kout; types 2 and 4 at kout times the factor the drug puts on loss.
  function plateau(p, c){
    const f=frac(p,c);
    return p.idr===1 ? R0*(1-p.imax*f) : p.idr===2 ? (p.imax*f<1 ? R0/(1-p.imax*f) : Infinity) : p.idr===3 ? R0*(1+p.smax*f) : R0/(1+p.smax*f);
  }
  function approach(p, c){
    const k=koutOf(p), f=frac(p,c);
    return p.idr===2 ? k*(1-p.imax*f) : p.idr===4 ? k*(1+p.smax*f) : k;
  }

  // The response over [0, T] at RK4 nodes, with its rate of change at each (for cubic Hermite interpolation). `level`
  // replaces the scenario's concentration with any function of time (the tests use a constant).
  const cache=new Map(), MAX_STEPS=40000;
  function course(p, T, level){
    const key=level ? null : encodeScenario(p)+"|"+T;
    if(key && cache.has(key)) return cache.get(key);
    const ev=level ? [] : doseEvents(p), cOf=level || (t=> conc(p, t, ev));
    const cuts=new Set([0, T]);
    ev.forEach(e=>{ [e.t, e.route==="inf" ? e.t+e.dur : null].forEach(t=>{ if(t!==null && t>0 && t<T) cuts.add(t); }); });
    if(!level && PK.hdOn(p) && PK.hd) PK.hd.sessions(p, T).forEach(s=>{ [s.start, s.end].forEach(t=>{ if(t>0 && t<T) cuts.add(t); }); });   // dialysis: kinks too
    const bp=[...cuts].sort((a,b)=>a-b);
    // the step resolves the response's fastest rate and the plasma curve's
    const fastest=koutOf(p)*(p.idr===4 ? 1+p.smax : 1), pkScale=Math.min(p.thalf||1, p.route==="oral" && p.ka ? 1/p.ka : Infinity, p.cmt===2 ? 1/(p.k12+p.k21) : Infinity);
    const H=Math.max(T/MAX_STEPS, Math.min(0.025, 0.02/fastest, pkScale/60));
    const ts=[0], rs=[R0], ds=[rate(p, R0, cOf(0))];
    let R=R0;
    for(let s=0;s<bp.length-1;s++){
      const a=bp[s], b=bp[s+1], n=Math.max(1, Math.ceil((b-a)/H-1e-9)), h=(b-a)/n;
      // within a step the level is read up to just before b: a bolus at b belongs to the next step
      const c=t=> cOf(Math.min(t, b-1e-9));
      if(s>0){ ts.push(a); rs.push(R); ds.push(rate(p, R, cOf(a))); }   // the same moment, after a dose: its new rate
      for(let i=0;i<n;i++){
        const t=a+i*h, k1=rate(p, R, c(t)), k2=rate(p, R+h/2*k1, c(t+h/2)), k3=rate(p, R+h/2*k2, c(t+h/2)), k4=rate(p, R+h*k3, c(t+h));
        R+=h/6*(k1+2*k2+2*k3+k4);
        const tn=i===n-1 ? b : a+(i+1)*h;
        ts.push(tn); rs.push(R); ds.push(rate(p, R, c(tn)));
      }
    }
    const out={ts, rs, ds, T};
    if(key){ if(cache.size>40) cache.delete(cache.keys().next().value); cache.set(key, out); }
    return out;
  }
  // R at time t from a course: the cubic Hermite through the nodes on either side
  function interp(cr, t){
    const {ts, rs, ds}=cr;
    if(t<=0) return rs[0];
    if(t>=cr.T) return rs[rs.length-1];
    let lo=0, hi=ts.length-1;
    while(hi-lo>1){ const m=(lo+hi)>>1; if(ts[m]<=t) lo=m; else hi=m; }
    while(lo+1<ts.length-1 && ts[lo+1]===ts[lo]) lo++;   // past a duplicated node at a dose
    const h=ts[lo+1]-ts[lo];
    if(!(h>0)) return rs[lo];
    const u=(t-ts[lo])/h, u2=u*u, u3=u2*u;
    return (2*u3-3*u2+1)*rs[lo]+(u3-2*u2+u)*h*ds[lo]+(-2*u3+3*u2)*rs[lo+1]+(u3-u2)*h*ds[lo+1];
  }
  const at=(p, T, t)=> interp(course(p, T), t);

  // The largest change from baseline over the window, when it comes, the plasma peak it follows, and when the
  // response is back within 10% of that change.
  function stats(p, T){
    const cr=course(p, T), {ts, rs}=cr, dev=t=> Math.abs(interp(cr, t)-R0);
    let im=0; for(let i=1;i<rs.length;i++) if(Math.abs(rs[i]-R0)>Math.abs(rs[im]-R0)) im=i;
    let lo=ts[Math.max(0, im-1)], hi=ts[Math.min(ts.length-1, im+1)];
    for(let k=0;k<60;k++){ const a=hi-(hi-lo)*0.6180339887, b=lo+(hi-lo)*0.6180339887; if(dev(a)<dev(b)) lo=a; else hi=b; }
    let tExt=(lo+hi)/2; if(dev(ts[im])>dev(tExt)) tExt=ts[im];
    const ext=interp(cr, tExt), change=ext-R0, w=windowStats(p, T, 0, Infinity);
    // back within 10% of the change: the first node after the extreme that is, then bisection on the interpolant
    let back=null;
    if(Math.abs(change)>1e-9){
      const lim=0.1*Math.abs(change), j=ts.findIndex((t,i)=> t>tExt && Math.abs(rs[i]-R0)<=lim);
      if(j>0){ let a=ts[j-1], b=ts[j]; for(let k=0;k<60;k++){ const m=(a+b)/2; if(dev(m)<=lim) b=m; else a=m; } back=(a+b)/2; }
    }
    return {ext, change, tExt, tCmax:w.tmax, lag:tExt-w.tmax, back, end:rs[rs.length-1]};
  }
  // the sigmoid the response tends to at each level, for the concentration–response chart
  return {R0, TYPES, frac, rate, plateau, approach, course, interp, at, stats, koutOf};
});
