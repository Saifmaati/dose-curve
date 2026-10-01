/* DoseCurve hemodialysis
   Dialysis sessions add the dialyzer's clearance CLd to the patient's own while they run: the elimination rate is
   kₑ + CLd / V during a session and kₑ between them (one compartment, first-order elimination). Between any two
   events (a dose, the end of an infusion, the start or end of a session) the rates are constant, so the gut and body
   amounts and the area under the body amount have closed forms, and the state is carried exactly from one event to
   the next. The amount a session removes is CLd times the area under the concentration during it.
   With two compartments (2.6) the dialyzer clears the central compartment, and the central and peripheral amounts
   follow a linear system with constant rates between events, solved exactly through its two eigenvalues. Drug then
   moves back from the tissues once a session ends, so the level rebounds: sessionTable gives how far and when.
   The page loads this file when a scenario has dialysis on (it registers itself as PK.hdModule); in Node the engine
   requires it on first use of PK.hd. Educational model, not for clinical dosing. */
(function(root, factory){
  if(typeof module==="object" && module.exports) module.exports=factory(require("./pk-engine.js"));
  else if(root && root.PK) root.PK.hdModule=factory(root.PK);
})(typeof self!=="undefined" ? self : this, function(PK){
  "use strict";
  const {doseEvents, keOf, vOf, saltOf, fOf, encodeScenario, PK_KEYS, eventsKey}=PK;
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

  // Two compartments: dX/dt = −M·X + u, X = (central, peripheral), M = [[K, −k21], [−k12, k21]], K = k10 + kd + k12,
  // input u = (R + kₐ·g, 0). A function f of M, applied to v, through M's eigenvalues α > β:
  // f(M)·v = (f(α)·(M − βI)·v − f(β)·(M − αI)·v) / (α − β).
  function fM(K, k12, k21, f, v){
    const tr=K+k21, det=(K-k12)*k21, root=Math.sqrt(Math.max(0, tr*tr-4*det)), al=(tr+root)/2, be=(tr-root)/2;
    const Mv=[K*v[0]-k21*v[1], -k12*v[0]+k21*v[1]], fa=f(al), fb=f(be), d=al-be;
    return [(fa*(Mv[0]-be*v[0])-fb*(Mv[0]-al*v[0]))/d, (fa*(Mv[1]-be*v[1])-fb*(Mv[1]-al*v[1]))/d];
  }
  // From state {g, a, q} (gut, central, peripheral) with central elimination k (k10, plus kd in a session), after τ:
  // the new amounts and the area under the central amount. The scalar functions, each the integral it stands for:
  // E = e^(−xτ); G = ∫₀^τ e^(−xs) ds; Hk = ∫₀^τ e^(−x(τ−s))·e^(−kₐs) ds; and their integrals over t ∈ [0, τ].
  function step2(s, k, k12, k21, R, ka, tau){
    const K=k+k12, G=x=> x*tau<1e-9 ? tau : em1(x*tau)/x;
    const E=x=> Math.exp(-x*tau), AG=x=> x*tau<1e-6 ? tau*tau/2-x*tau*tau*tau/6 : (tau-G(x))/x;
    const near=x=> Math.abs(x-ka)<1e-9*Math.max(x,ka);
    const H=x=> near(x) ? tau*Math.exp(-x*tau) : (Math.exp(-ka*tau)-Math.exp(-x*tau))/(x-ka);
    const AH=x=> near(x) ? (1-Math.exp(-x*tau)*(1+x*tau))/(x*x) : (G(ka)-G(x))/(x-ka);
    const X0=[s.a, s.q], e1=[1, 0];
    const xe=fM(K,k12,k21,E,X0), area=fM(K,k12,k21,G,X0)[0];
    let a=xe[0], q=xe[1], ar=area;
    if(R>0){ const r=fM(K,k12,k21,G,e1), ra=fM(K,k12,k21,AG,e1); a+=R*r[0]; q+=R*r[1]; ar+=R*ra[0]; }
    if(s.g>0){ const h=fM(K,k12,k21,H,e1), ha=fM(K,k12,k21,AH,e1), u=ka*s.g; a+=u*h[0]; q+=u*h[1]; ar+=u*ha[0]; }
    return {g:s.g*Math.exp(-ka*tau), a, q, area:ar};
  }
  const twoOf=p=> p.cmt===2;

  // The scenario's course: each event time with the state just after it and the rates that hold until the next. It
  // runs until 40 half-lives (between sessions) after the last input, so the area to infinity is complete.
  // A chart or a window statistic asks for thousands of levels of one scenario object: each object remembers its
  // course with the values it had, and it is reused only while every setting (and a custom schedule) still matches,
  // so changing an object in place can't return a stale course. Otherwise the course is found by the scenario's link.
  const cache=new Map(), byObject=new WeakMap();
  const sameAs=(p, m)=> PK_KEYS.every((k,i)=> p[k]===m.vals[i]) && (p.dosing!=="custom" || eventsKey(p.events)===m.ev);
  function course(p){
    const m=byObject.get(p);
    if(m && sameAs(p, m)) return m.cr;
    const cr=courseByKey(p);
    byObject.set(p, {vals:PK_KEYS.map(k=>p[k]), ev:p.dosing==="custom" ? eventsKey(p.events) : null, cr});
    return cr;
  }
  function courseByKey(p){
    const key=encodeScenario(p);
    if(cache.has(key)) return cache.get(key);
    const ev=doseEvents(p), k0=keOf(p), V=vOf(p), kd=p.hdcl/V, S=saltOf(p), F=fOf(p), ka=p.ka, two=twoOf(p);
    const lastIn=ev.reduce((m,e)=> Math.max(m, e.t+(e.route==="inf" ? e.dur : 0)), 0);
    // the slowest rate between sessions sets how long the course runs: kₑ, or with two compartments β
    const kT=two ? (()=>{ const tr=k0+p.k12+p.k21, det=k0*p.k21; return (tr-Math.sqrt(tr*tr-4*det))/2; })() : k0;
    const H=Math.min(20000, lastIn+40*Math.LN2/kT+p.hdevery), ss=sessions(p, H);
    const times=new Set([0, H]);
    ev.forEach(e=>{ times.add(e.t); if(e.route==="inf") times.add(e.t+e.dur); });
    ss.forEach(s=>{ times.add(s.start); if(s.end<H) times.add(s.end); });
    const ts=[...times].filter(t=>t>=0 && t<=H).sort((a,b)=>a-b);
    const on=t=> ss.some(s=> t>=s.start && t<s.end), rateAt=t=> ev.reduce((r,e)=> r+(e.route==="inf" && t>=e.t && t<e.t+e.dur ? S*e.mg/e.dur : 0), 0);
    const nodes=[];
    let s={g:0, a:0, q:0}, area=0, removed=0;
    for(let i=0;i<ts.length;i++){
      const t=ts[i];
      ev.forEach(e=>{ if(e.t===t){ if(e.route==="oral") s.g+=F*S*e.mg; else if(e.route==="iv") s.a+=S*e.mg; } });
      const k=k0+(on(t) ? kd : 0), R=rateAt(t);
      nodes.push({t, g:s.g, a:s.a, q:s.q, area, removed, k, R, dial:on(t)});
      if(i<ts.length-1){
        const r=two ? step2(s, k, p.k12, p.k21, R, ka, ts[i+1]-t) : step(s, k, R, ka, ts[i+1]-t);
        area+=r.area; if(on(t)) removed+=kd*r.area;
        s={g:r.g, a:r.a, q:two ? r.q : 0};
      }
    }
    const out={nodes, V, k0, kd, ka, H, sessions:ss, aucInf:area/V, two, k12:p.k12, k21:p.k21};
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
  // body (central) amount, the peripheral and gut amounts, and the area under the body amount from 0 to t
  function stateAt(p, t){
    const cr=course(p);
    if(t<=0) return {a:t<0 ? 0 : cr.nodes[0].a, q:0, g:t<0 ? 0 : cr.nodes[0].g, area:0, removed:0, cr};
    const nd=nodeAt(cr, t), r=cr.two ? step2(nd, nd.k, cr.k12, cr.k21, nd.R, cr.ka, t-nd.t) : step(nd, nd.k, nd.R, cr.ka, t-nd.t);
    return {a:r.a, q:cr.two ? r.q : 0, g:r.g, area:nd.area+r.area, removed:nd.removed+(nd.dial ? cr.kd*r.area : 0), cr};
  }
  const conc=(p, t)=>{ if(t<0) return 0; const s=stateAt(p, t); return s.a/s.cr.V; };

  // Each session that starts within [0, T]: the level as it starts and as it ends (before any dose at its end), the
  // fall, the amount removed (CLd × the area under the concentration during it), and the IV dose given right after
  // it that would bring the level back to where the session found it. With two compartments, the rebound: the highest
  // level before the next dose or session (or 12 h), when it comes, and how much of the fall it gives back.
  function sessionTable(p, T){
    const cr=course(p), V=cr.V, S=saltOf(p), ev=doseEvents(p);
    return cr.sessions.filter(s=> s.start<=T).map(s=>{
      const pre=conc(p, s.start), post=conc(p, s.end-1e-9), r0=stateAt(p, s.start).removed, r1=stateAt(p, s.end-1e-9).removed;
      const row={n:s.n, start:s.start, end:s.end, pre, post, fall:pre>0 ? 1-post/pre : 0, removed:r1-r0, supplement:Math.max(0, (pre-post)*V/S), rebound:null};
      if(cr.two){
        const next=Math.min(s.end+12, s.start+p.hdevery, ...ev.filter(e=> e.t>=s.end-1e-9).map(e=>e.t));
        if(next>s.end+1e-6){
          const c=t=> conc(p, t);
          let best=s.end, cb=post;
          for(let i=1;i<=240;i++){ const t=s.end+(next-1e-9-s.end)*i/240, v=c(t); if(v>cb){ cb=v; best=t; } }
          if(cb>post*(1+1e-6)){
            const w=(next-s.end)/240; let lo=Math.max(s.end, best-w), hi=Math.min(next-1e-9, best+w);
            for(let k=0;k<60;k++){ const a=hi-(hi-lo)*0.6180339887, b=lo+(hi-lo)*0.6180339887; if(c(a)<c(b)) lo=a; else hi=b; }
            const tm=(lo+hi)/2, cm=Math.max(c(tm), cb);
            row.rebound={level:cm, after:tm-s.end, share:pre>post ? (cm-post)/(pre-post) : 0};
          }
        }
      }
      return row;
    });
  }
  // The fraction a session removes on its own, with no drug given during it: 1 − e^(−(kₑ + CLd/V)·duration) of what
  // the body holds as it starts, of which the dialyzer takes the share CLd / (CL + CLd).
  // With two compartments the fall depends on where the drug is as the session starts: it is taken from the terminal
  // phase (the two compartments in the proportion they keep once distribution is over), and the dialyzer's share is
  // of the drug eliminated during it, kd / (k10 + kd).
  function sessionFraction(p, dur){
    const V=vOf(p), k0=keOf(p), kd=p.hdcl/V, k=k0+kd, D=dur===undefined ? p.hddur : dur;
    if(!twoOf(p)){ const f=em1(k*D); return {fall:f, byDialysis:f*kd/k, byBody:f*k0/k, kd, k0}; }
    const tr=k0+p.k12+p.k21, be=(tr-Math.sqrt(tr*tr-4*k0*p.k21))/2, x=step2({g:0, a:1, q:p.k12/(p.k21-be)}, k, p.k12, p.k21, 0, 1, D);
    const f=1-x.a;
    return {fall:f, byDialysis:f*kd/k, byBody:f*k0/k, kd, k0};
  }
  // the dialyzer clearance that makes a session of length dur lower the level by `fall` (as a label states it); with
  // two compartments, found by bisection (the fall rises with the clearance)
  function clForFall(p, fall, dur){
    if(!twoOf(p)) return Math.max(0, (-Math.log(1-fall)/dur-keOf(p))*vOf(p));
    const at=cl=> sessionFraction(Object.assign({}, p, {hdcl:cl}), dur).fall;
    if(at(0)>=fall) return 0;
    let lo=0, hi=1; while(at(hi)<fall && hi<1e6) hi*=2;
    for(let i=0;i<100;i++){ const m=(lo+hi)/2; if(at(m)<fall) lo=m; else hi=m; }
    return (lo+hi)/2;
  }
  return {sessions, course, conc, stateAt, sessionTable, sessionFraction, clForFall};
});
