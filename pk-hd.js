/* DoseCurve hemodialysis
   Dialysis sessions add the dialyzer's clearance CLd to the patient's own while they run: the elimination rate is
   kₑ + CLd / V during a session and kₑ between them (one compartment, first-order elimination). Between any two
   events (a dose, the end of an infusion, the start or end of a session) the rates are constant, so the gut and body
   amounts and the area under the body amount have closed forms, and the state is carried exactly from one event to
   the next. The amount a session removes is CLd times the area under the concentration during it.
   With two compartments (2.6) the dialyzer clears the central compartment, and the central and peripheral amounts
   follow a linear system with constant rates between events, solved exactly through its two eigenvalues. Drug then
   moves back from the tissues once a session ends, so the level rebounds: sessionTable gives how far and when.
   With saturable elimination (2.19) there is no closed form: the engine's own Runge–Kutta integrator runs piecewise
   between session edges with the dialyzer's loss CLd·C added during each session, dA/dt = input − Vmax·C/(Km + C)
   − CLd·C. The step shortens where the rates are fast; the amount a session removes is CLd times the exact area under
   each step's cubic. A session's fall then depends on the level it starts from, and every figure says which.
   The page loads this file when a scenario has dialysis on (it registers itself as PK.hdModule); in Node the engine
   requires it on first use of PK.hd. Educational model, not for clinical dosing. */
(function(root, factory){
  if(typeof module==="object" && module.exports) module.exports=factory(require("./pk-engine.js"));
  else if(root && root.PK) root.PK.hdModule=factory(root.PK);
})(typeof self!=="undefined" ? self : this, function(PK){
  "use strict";
  const {doseEvents, keOf, vOf, saltOf, fOf, encodeScenario, PK_KEYS, eventsKey, vmaxOf, mmIntegrate, mmAmount, MM_STEP}=PK;
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
  const twoOf=p=> p.cmt===2 && p.kin!=="mm";   // a leftover cmt:2 on a saturable scenario means nothing
  const mmOf=p=> p.kin==="mm";

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
    const cr=mmOf(p) ? mmCourse(p) : courseByKey(p);
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
  /* ---------- saturable elimination (2.19) ---------- */
  // The engine's integrator (mmIntegrate) run from one session edge to the next, with the dialyzer's rate kd = CLd/V
  // inside sessions. The step keeps λh ≤ 0.5 (Runge–Kutta stays stable), which at usual settings is the engine's
  // 0.05 h. Each step is {t0, t1, g0, g1, a0, a1, f0, f1, kd}, read as the engine reads its own (cubic Hermite).
  function mmSteps(p, T, st){
    const V=vOf(p), kd=p.hdcl/V, k0=vmaxOf(p)/(p.km*V), ev=doseEvents(p), t0=st ? st.t : 0, ss=sessions(p, T);
    const cuts=new Set([t0, T]);
    ss.forEach(x=>{ [x.start, x.end].forEach(t=>{ if(t>t0 && t<T) cuts.add(t); }); });
    const bs=[...cuts].sort((a,b)=>a-b), on=t=> ss.some(x=> t>=x.start && t<x.end), out=[];
    let s=st || null;
    for(let i=0;i<bs.length-1;i++){
      const kx=on(bs[i]) ? kd : 0, h=Math.min(MM_STEP, 0.5/(k0+kx+(p.ka||0)));
      const part=mmIntegrate(p, ev, bs[i+1], s, h, kx);
      for(const x of part){ x.kd=kx; out.push(x); }
      const last=part[part.length-1]; s={t:bs[i+1], ag:last.g1, a:last.a1};
    }
    return out;
  }
  // a step's area under the body amount from its start to the fraction x of it (exact for the cubic), and the amount
  // the body eliminated over the same span (3-point Gauss–Legendre on Vmax·C/(Km + C))
  const areaTo=(x0, x)=>{ const h=x0.t1-x0.t0, x2=x*x, x3=x2*x, x4=x3*x;
    return h*((x4/2-x3+x)*x0.a0+(x4/4-2*x3/3+x2/2)*h*x0.f0+(x3-x4/2)*x0.a1+(x4/4-x3/3)*h*x0.f1); };
  const aHermite=(x0, x)=>{ const h=x0.t1-x0.t0, x2=x*x, x3=x2*x; return (2*x3-3*x2+1)*x0.a0+(x3-2*x2+x)*h*x0.f0+(-2*x3+3*x2)*x0.a1+(x3-x2)*h*x0.f1; };
  const GL=[[.5, 8/18], [.5-Math.sqrt(.6)/2, 5/18], [.5+Math.sqrt(.6)/2, 5/18]];
  const bodyTo=(cr, x0, x)=>{ const h=x0.t1-x0.t0; let s=0; for(const [u,w] of GL){ const C=Math.max(0, aHermite(x0, u*x))/cr.V; s+=w*cr.Vm*C/(cr.Km+C); } return s*h*x; };
  // The course: the steps, and before each the area under the amount, the amount removed and the amount the body
  // eliminated since 0. It grows in place as later times are read, like the engine's own saturable solution.
  const mmCache=new Map();
  function mmCourse(p){
    const key=encodeScenario(p);
    if(mmCache.has(key)) return mmCache.get(key);
    const V=vOf(p), cr={mm:true, two:false, V, kd:p.hdcl/V, Vm:vmaxOf(p), Km:p.km, k0:vmaxOf(p)/(p.km*V), ka:p.ka, T:0, steps:[], A:[], R:[], M:[], sums:{A:0, R:0, M:0}, inf:null};
    if(mmCache.size>24) mmCache.delete(mmCache.keys().next().value);
    mmCache.set(key, cr);
    return reach(p, cr, 48);
  }
  function reach(p, cr, t){
    if(cr.steps.length && t<=cr.T) return cr;
    const end=Math.max(t, 2*cr.T, 48)+MM_STEP, last=cr.steps[cr.steps.length-1];
    const add=mmSteps(p, end, last ? {t:last.t1, ag:last.g1, a:last.a1} : null), S=cr.sums;
    for(const x of add){ cr.steps.push(x); cr.A.push(S.A); cr.R.push(S.R); cr.M.push(S.M); const ar=areaTo(x, 1); S.A+=ar; S.R+=x.kd*ar; S.M+=bodyTo(cr, x, 1); }
    cr.T=end-MM_STEP;   // a dose exactly at the new end lands in the next extension
    return cr;
  }
  function mmStateAt(p, t){
    const cr=reach(p, course(p), Math.max(t, 0)), st=cr.steps;
    if(t<=0) return {a:t<0 ? 0 : st[0].a0, g:t<0 ? 0 : st[0].g0, q:0, area:0, removed:0, body:0, cr};
    let lo=0, hi=st.length-1;
    while(lo<hi){ const m=(lo+hi+1)>>1; if(st[m].t0<=t) lo=m; else hi=m-1; }
    const x0=st[lo], x=Math.min(1, (t-x0.t0)/(x0.t1-x0.t0)), ar=areaTo(x0, x);
    return {a:aHermite(x0, x), g:x0.g0*Math.exp(-cr.ka*(t-x0.t0)), q:0, area:cr.A[lo]+ar, removed:cr.R[lo]+x0.kd*ar, body:cr.M[lo]+bodyTo(cr, x0, x), cr};
  }
  // the area under the concentration to infinity, with the amounts the dialyzer and the body take over it: the curve
  // is followed until the amount is under 1e-3 of its highest, then the remaining low-level tail (C far below Km, so
  // first order at Vmax/(Km·V), plus the dialyzer in each session) is summed exactly session by session
  function mmInf(p){
    const cr=course(p);
    if(cr.inf) return cr.inf;
    const ev=doseEvents(p), lastIn=ev.reduce((m,e)=> Math.max(m, e.t+(e.route==="inf" ? e.dur : 0)), 0);
    let T=lastIn+24, top=0;
    // (the gut counts: drug still to be absorbed would push the level back above Km, beyond the linear tail's reach)
    for(let i=0;i<30;i++){ reach(p, cr, T); top=cr.steps.reduce((m,x)=> Math.max(m, x.a1), top); const s=mmStateAt(p, T); if(s.a+s.g<=1e-3*top) break; T*=2; }
    const s0=mmStateAt(p, T);
    let area=s0.area, removed=s0.removed, body=s0.body, s={g:s0.g, a:s0.a}, t=T;
    const ss=sessions(p, T+20000), on=x=> ss.some(z=> x>=z.start && x<z.end);
    for(let i=0;i<20000 && s.a+s.g>1e-12*top && t<T+20000;i++){
      const next=Math.min(...ss.map(z=> z.start>t+1e-12 ? z.start : z.end>t+1e-12 ? z.end : Infinity), t+1000), kd=on(t) ? cr.kd : 0, r=step(s, cr.k0+kd, 0, cr.ka, next-t);
      area+=r.area; removed+=kd*r.area; body+=cr.k0*r.area; s={g:r.g, a:r.a}; t=next;
    }
    return cr.inf={auc:area/cr.V, removed, body};
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
    if(mmOf(p)) return mmStateAt(p, t);
    const cr=course(p);
    if(t<=0) return {a:t<0 ? 0 : cr.nodes[0].a, q:0, g:t<0 ? 0 : cr.nodes[0].g, area:0, removed:0, cr};
    const nd=nodeAt(cr, t), r=cr.two ? step2(nd, nd.k, cr.k12, cr.k21, nd.R, cr.ka, t-nd.t) : step(nd, nd.k, nd.R, cr.ka, t-nd.t);
    return {a:r.a, q:cr.two ? r.q : 0, g:r.g, area:nd.area+r.area, removed:nd.removed+(nd.dial ? cr.kd*r.area : 0), cr};
  }
  const conc=(p, t)=>{ if(t<0) return 0; if(mmOf(p)){ const cr=reach(p, course(p), t); return mmAmount(cr.steps, t)/cr.V; } const s=stateAt(p, t); return s.a/s.cr.V; };
  // the area under the concentration to infinity (AUC∞), with the sessions as they keep running
  const aucInf=p=> mmOf(p) ? mmInf(p).auc : course(p).aucInf;

  // Each session that starts within [0, T]: the level as it starts and as it ends (before any dose at its end), the
  // fall, the amount removed (CLd × the area under the concentration during it), and the IV dose given right after
  // it that would bring the level back to where the session found it. With two compartments, the rebound: the highest
  // level before the next dose or session (or 12 h), when it comes, and how much of the fall it gives back.
  function sessionTable(p, T){
    if(mmOf(p)){
      // saturable (2.19): each session's own levels, what the dialyzer and the body each took, and the IV dose that
      // restores the level the session found at the moment it ends (in one compartment a bolus adds S·dose at once,
      // whatever the elimination does next)
      const V=vOf(p), S=saltOf(p);
      return sessions(p, T+p.hdevery).filter(s=> s.start<=T).map(s=>{
        const a=stateAt(p, s.start), b=stateAt(p, s.end-1e-9), pre=conc(p, s.start), post=conc(p, s.end-1e-9);
        return {n:s.n, start:s.start, end:s.end, pre, post, fall:pre>0 ? 1-post/pre : 0, removed:b.removed-a.removed, body:b.body-a.body, supplement:Math.max(0, (pre-post)*V/S), rebound:null};
      });
    }
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
  // Saturable (2.19): with no dose during it, dA/dt = −Vmax·A/(K + A) − kd·A (K = Km·V) integrates in closed form,
  // D = (K/c)·ln(A0/A1) + (Vmax/(c·kd))·ln((c + kd·A0)/(c + kd·A1)), c = Vmax + kd·K, solved for A1 by bisection.
  // The fall depends on the starting level c0: by default the level the readouts' half-life and clearance are read at.
  // limits: the fall from a level far above Km (the body's clearance negligible) and from one far below (first order).
  function mmFraction(p, D, c0){
    const V=vOf(p), Vm=vmaxOf(p), K=p.km*V, k0=Vm/K, kd=p.hdcl/V, C0=c0===undefined ? PK.derived(p).cAt : c0, A0=C0*V;
    const limits={high:-Math.expm1(-kd*D), low:-Math.expm1(-(kd+k0)*D)};
    if(!(A0>0)) return {fall:limits.low, byDialysis:limits.low*kd/(kd+k0), byBody:limits.low*k0/(kd+k0), kd, k0, at:0, cl:Vm/p.km, limits};
    const c=Vm+kd*K, time=kd>0 ? A1=> (K/c)*Math.log(A0/A1)+(Vm/(c*kd))*Math.log((c+kd*A0)/(c+kd*A1)) : A1=> (K/Vm)*Math.log(A0/A1)+(A0-A1)/Vm;
    let lo=Math.log(A0)-(kd+k0)*D, hi=Math.log(A0)-kd*D;
    for(let i=0;i<100;i++){ const m=(lo+hi)/2; if(time(Math.exp(m))>D) lo=m; else hi=m; }
    const A1=Math.exp((lo+hi)/2), removed=kd>0 ? (A0-A1)-(Vm/kd)*Math.log((c+kd*A0)/(c+kd*A1)) : 0;
    return {fall:1-A1/A0, byDialysis:removed/A0, byBody:(A0-A1-removed)/A0, kd, k0, at:C0, cl:Vm/(p.km+C0), limits};
  }
  function sessionFraction(p, dur, c0){
    if(mmOf(p)) return mmFraction(p, dur===undefined ? p.hddur : dur, c0);
    const V=vOf(p), k0=keOf(p), kd=p.hdcl/V, k=k0+kd, D=dur===undefined ? p.hddur : dur;
    if(!twoOf(p)){ const f=em1(k*D); return {fall:f, byDialysis:f*kd/k, byBody:f*k0/k, kd, k0}; }
    const tr=k0+p.k12+p.k21, be=(tr-Math.sqrt(tr*tr-4*k0*p.k21))/2, x=step2({g:0, a:1, q:p.k12/(p.k21-be)}, k, p.k12, p.k21, 0, 1, D);
    const f=1-x.a;
    return {fall:f, byDialysis:f*kd/k, byBody:f*k0/k, kd, k0};
  }
  // the dialyzer clearance that makes a session of length dur lower the level by `fall` (as a label states it); with
  // two compartments, found by bisection (the fall rises with the clearance)
  function clForFall(p, fall, dur, c0){
    if(!twoOf(p) && !mmOf(p)) return Math.max(0, (-Math.log(1-fall)/dur-keOf(p))*vOf(p));
    // two compartments, or saturable from a fixed starting level (a regimen's own level would move with the clearance)
    const C0=mmOf(p) ? (c0===undefined ? PK.derived(p).cAt : c0) : undefined, at=cl=> sessionFraction(Object.assign({}, p, {hdcl:cl}), dur, C0).fall;
    if(at(0)>=fall) return 0;
    let lo=0, hi=1; while(at(hi)<fall && hi<1e6) hi*=2;
    for(let i=0;i<100;i++){ const m=(lo+hi)/2; if(at(m)<fall) lo=m; else hi=m; }
    return (lo+hi)/2;
  }
  return {sessions, course, conc, stateAt, sessionTable, sessionFraction, clForFall, aucInf, mmSteps};
});
