/* DoseCurve hemodialysis
   Dialysis sessions add the dialyzer's clearance CLd to the patient's own while they run: the elimination rate is
   kₑ + CLd / V during a session and kₑ between them (one compartment, first-order elimination). Between any two
   events (a dose, the end of an infusion, the start or end of a session) the rates are constant, so the gut and body
   amounts and the area under the body amount have closed forms, and the state is carried exactly from one event to
   the next. The amount a session removes is CLd times the area under the concentration during it. Drug that moves
   back from the tissues after a session (rebound) isn't modelled: one compartment has nowhere for it to come from.
   The page loads this file when a scenario has dialysis on (it registers itself as PK.hdModule); in Node the engine
   requires it on first use of PK.hd. Educational model, not for clinical dosing. */
(function(root, factory){
  if(typeof module==="object" && module.exports) module.exports=factory(require("./pk-engine.js"));
  else if(root && root.PK) root.PK.hdModule=factory(root.PK);
})(typeof self!=="undefined" ? self : this, function(PK){
  "use strict";
  const {doseEvents, keOf, vOf, saltOf, fOf, encodeScenario}=PK;
  const em1=x=> -Math.expm1(-x);   // 1 − e^(−x), accurate for small x

  // Session start and end times, from the first session's start, every hdevery hours, up to time H.
  function sessions(p, H){
    const out=[];
    for(let j=0;j<5000;j++){ const a=p.hdstart+j*p.hdevery; if(a>=H) break; out.push({n:j+1, start:a, end:a+p.hddur}); }
    return out;
  }
  // From state {g, a} (gut and body amounts) with elimination k, infusion input R and absorption ka, after τ hours:
  // the new amounts and the area under the body amount.
  function step(s, k, R, ka, tau){
    const ek=Math.exp(-k*tau), ea=Math.exp(-ka*tau), Ik=em1(k*tau)/k;   // ∫₀^τ e^(−ks) ds
    let a=s.a*ek+R*Ik, area=s.a*Ik+R*(tau-Ik)/k;
    if(s.g>0){
      if(Math.abs(ka-k)<1e-9*Math.max(ka,k)){
        a+=ka*s.g*tau*ek;
        area+=ka*s.g*(1-ek*(1+k*tau))/(k*k);
      } else {
        a+=ka*s.g/(ka-k)*(ek-ea);
        area+=ka*s.g/(ka-k)*(Ik-em1(ka*tau)/ka);
      }
    }
    return {g:s.g*ea, a, area};
  }

  // The scenario's course: each event time with the state just after it and the rates that hold until the next. It
  // runs until 40 half-lives (between sessions) after the last input, so the area to infinity is complete.
  const cache=new Map();
  function course(p){
    const key=encodeScenario(p);
    if(cache.has(key)) return cache.get(key);
    const ev=doseEvents(p), k0=keOf(p), V=vOf(p), kd=p.hdcl/V, S=saltOf(p), F=fOf(p), ka=p.ka;
    const lastIn=ev.reduce((m,e)=> Math.max(m, e.t+(e.route==="inf" ? e.dur : 0)), 0);
    const H=Math.min(20000, lastIn+40*Math.LN2/k0+p.hdevery), ss=sessions(p, H);
    const times=new Set([0, H]);
    ev.forEach(e=>{ times.add(e.t); if(e.route==="inf") times.add(e.t+e.dur); });
    ss.forEach(s=>{ times.add(s.start); if(s.end<H) times.add(s.end); });
    const ts=[...times].filter(t=>t>=0 && t<=H).sort((a,b)=>a-b);
    const on=t=> ss.some(s=> t>=s.start && t<s.end), rateAt=t=> ev.reduce((r,e)=> r+(e.route==="inf" && t>=e.t && t<e.t+e.dur ? S*e.mg/e.dur : 0), 0);
    const nodes=[];
    let s={g:0, a:0}, area=0, removed=0;
    for(let i=0;i<ts.length;i++){
      const t=ts[i];
      ev.forEach(e=>{ if(e.t===t){ if(e.route==="oral") s.g+=F*S*e.mg; else if(e.route==="iv") s.a+=S*e.mg; } });
      const k=k0+(on(t) ? kd : 0), R=rateAt(t);
      nodes.push({t, g:s.g, a:s.a, area, removed, k, R, dial:on(t)});
      if(i<ts.length-1){
        const r=step(s, k, R, ka, ts[i+1]-t);
        area+=r.area; if(on(t)) removed+=kd*r.area;
        s={g:r.g, a:r.a};
      }
    }
    const out={nodes, V, k0, kd, ka, H, sessions:ss, aucInf:area/V};
    if(cache.size>40) cache.delete(cache.keys().next().value);
    cache.set(key, out);
    return out;
  }
  // The node at or before t (the state just after any dose at t)
  function nodeAt(cr, t){
    const n=cr.nodes;
    let lo=0, hi=n.length-1;
    if(t>=n[hi].t) return n[hi];
    while(hi-lo>1){ const m=(lo+hi)>>1; if(n[m].t<=t) lo=m; else hi=m; }
    return n[lo];
  }
  // body amount and area under it from 0 to t
  function stateAt(p, t){
    const cr=course(p);
    if(t<=0) return {a:t<0 ? 0 : cr.nodes[0].a, area:0, removed:0, cr};
    const nd=nodeAt(cr, t), r=step(nd, nd.k, nd.R, cr.ka, t-nd.t);
    return {a:r.a, area:nd.area+r.area, removed:nd.removed+(nd.dial ? cr.kd*r.area : 0), cr};
  }
  const conc=(p, t)=> t<0 ? 0 : stateAt(p, t).a/course(p).V;

  // Each session that starts within [0, T]: the level as it starts and as it ends (before any dose at its end), the
  // fall, the amount removed (CLd × the area under the concentration during it), and the IV dose given right after
  // it that would bring the level back to where the session found it.
  function sessionTable(p, T){
    const cr=course(p), V=cr.V, S=saltOf(p);
    return cr.sessions.filter(s=> s.start<=T).map(s=>{
      const pre=conc(p, s.start), post=conc(p, s.end-1e-9), r0=stateAt(p, s.start).removed, r1=stateAt(p, s.end-1e-9).removed;
      return {n:s.n, start:s.start, end:s.end, pre, post, fall:pre>0 ? 1-post/pre : 0, removed:r1-r0, supplement:Math.max(0, (pre-post)*V/S)};
    });
  }
  // The fraction a session removes on its own, with no drug given during it: 1 − e^(−(kₑ + CLd/V)·duration) of what
  // the body holds as it starts, of which the dialyzer takes the share CLd / (CL + CLd).
  function sessionFraction(p){
    const V=vOf(p), k0=keOf(p), kd=p.hdcl/V, k=k0+kd, f=em1(k*p.hddur);
    return {fall:f, byDialysis:f*kd/k, byBody:f*k0/k, kd, k0};
  }
  // the dialyzer clearance that makes a session of length dur lower the level by `fall` (as a label states it)
  const clForFall=(p, fall, dur)=> Math.max(0, (-Math.log(1-fall)/dur-keOf(p))*vOf(p));
  return {sessions, course, conc, stateAt, sessionTable, sessionFraction, clForFall};
});
